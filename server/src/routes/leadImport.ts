import { Router } from 'express';
import { Readable } from 'node:stream';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { me, requireAdmin } from '../lib/auth.js';
import { normalizePhone, formatPhone } from '../lib/phone.js';
import { dateOnly, todayIST } from '../lib/time.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';

/**
 * Import a sheet of candidates (.xlsx or .csv) as leads for one BDE. Admin only.
 * Send commit=false first to get a preview, then commit=true with the same file to save.
 * Each row becomes a "New" lead with a follow-up today, so it shows in the BDE's "Call today" list.
 */
export const leadImport = Router();
leadImport.use(requireAdmin);

const MAX_ROWS = 2000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|csv)$/i.test(file.originalname)) return cb(null, true);
    cb(new HttpError(400, /\.xls$/i.test(file.originalname) ? 'Old .xls files are not supported. In Excel or WPS use "Save as" .xlsx' : 'Choose an .xlsx or .csv file'));
  }
});

/** Text of any cell: numbers, formulas, links and rich text all become plain text. */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ('richText' in v) return v.richText.map(t => t.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    return '';
  }
  return String(v).trim();
}

async function readRows(file: Express.Multer.File): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet | undefined;
  try {
    if (/\.csv$/i.test(file.originalname)) ws = await wb.csv.read(Readable.from(file.buffer));
    else { await wb.xlsx.load(file.buffer as unknown as ArrayBuffer); ws = wb.worksheets[0]; }
  } catch {
    throw new HttpError(400, "This file couldn't be read. Open it in Excel or WPS and save it again as .xlsx");
  }
  if (!ws) throw new HttpError(400, 'The file has no sheets');
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, row => {
    const vals = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
    if (vals.some(Boolean)) rows.push(vals);
  });
  return rows;
}

/** Finds the name, phone and course columns from a header row, or by looking at the data. */
function findColumns(rows: string[][]) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const h = rows[i].map(c => c.toLowerCase());
    const phone = h.findIndex(c => /phone|mobile|contact|whats ?app|number|cell/.test(c));
    if (phone < 0) continue;
    const name = h.findIndex((c, j) => j !== phone && /name|candidate|student/.test(c));
    const course = h.findIndex((c, j) => j !== phone && /course|internship|program|interest/.test(c));
    return { start: i + 1, phone, name, course };
  }
  // No header: the phone column is the one where most cells are mobile numbers
  const sample = rows.slice(0, 50);
  const width = Math.max(...sample.map(r => r.length));
  let phone = -1, best = 0;
  for (let j = 0; j < width; j++) {
    const hits = sample.filter(r => normalizePhone(r[j] ?? '')).length;
    if (hits > best) { best = hits; phone = j; }
  }
  if (phone < 0) throw new HttpError(400, 'No column of mobile numbers was found. Add a header row with "Name" and "Phone".');
  let name = -1;
  for (let j = 0; j < width && name < 0; j++) if (j !== phone && sample.filter(r => /[a-z]{2}/i.test(r[j] ?? '')).length > sample.length / 2) name = j;
  return { start: 0, phone, name, course: -1 };
}

leadImport.post('/', upload.single('file'), async (req, res) => {
  const b = z.object({
    ownerId: z.coerce.number({ invalid_type_error: 'Choose a BDE' }).int(),
    courseId: z.coerce.number({ invalid_type_error: 'Choose a course' }).int(),
    commit: z.enum(['true', 'false']).default('false')
  }).parse(req.body);
  if (!req.file) throw new HttpError(400, 'Choose the file to import');
  const [owner, course, courses] = await Promise.all([
    db.user.findUnique({ where: { id: b.ownerId } }),
    db.course.findUnique({ where: { id: b.courseId } }),
    db.course.findMany({ where: { active: true } })
  ]);
  if (!owner || owner.role !== 'BDE' || !owner.active) throw new HttpError(400, 'Choose an active BDE');
  if (!course || !course.active) throw new HttpError(400, 'Choose a course');

  const rows = await readRows(req.file);
  if (!rows.length) throw new HttpError(400, 'The file is empty');
  const cols = findColumns(rows);
  const data = rows.slice(cols.start);
  if (data.length > MAX_ROWS) throw new HttpError(400, `The file has ${data.length} rows. Import at most ${MAX_ROWS} at a time.`);

  const parsed = data.map((r, i) => {
    const rawPhone = r[cols.phone] ?? '';
    const courseText = cols.course >= 0 ? (r[cols.course] ?? '').toLowerCase() : '';
    const match = courseText ? courses.find(c => c.name.toLowerCase().includes(courseText) || courseText.includes(c.name.toLowerCase().replace(/ (course|internship)$/, ''))) : undefined;
    return {
      row: cols.start + i + 1,
      name: (cols.name >= 0 ? r[cols.name] : '')?.replace(/\s+/g, ' ').slice(0, 100) || 'No name',
      rawPhone,
      phone: normalizePhone(rawPhone),
      course: match ?? course
    };
  });

  const phones = parsed.flatMap(p => (p.phone ? [p.phone] : []));
  const existing = await db.lead.findMany({ where: { phone: { in: phones } }, include: { owner: true } });
  const taken = new Map(existing.map(l => [l.phone, l.owner.name]));

  const seen = new Set<string>();
  const ready: typeof parsed = [];
  const skipped: { row: number; name: string; phone: string; reason: string }[] = [];
  for (const p of parsed) {
    const skip = (reason: string) => skipped.push({ row: p.row, name: p.name, phone: p.rawPhone, reason });
    if (!p.phone) skip(p.rawPhone ? 'Not a valid mobile number' : 'No phone number');
    else if (taken.has(p.phone)) skip(`Already a lead for ${taken.get(p.phone)}`);
    else if (seen.has(p.phone)) skip('Same number appears earlier in this file');
    else { seen.add(p.phone); ready.push(p); }
  }

  let created = 0;
  if (b.commit === 'true' && ready.length) {
    const today = dateOnly(todayIST());
    const result = await db.lead.createMany({
      data: ready.map(p => ({ name: p.name, phone: p.phone!, courseId: p.course.id, ownerId: owner.id, stage: 'NEW', followUpOn: today, nextAction: 'First call' })),
      skipDuplicates: true
    });
    created = result.count;
    const made = await db.lead.findMany({ where: { phone: { in: ready.map(p => p.phone!) }, ownerId: owner.id, stage: 'NEW' }, select: { id: true } });
    await db.leadNote.createMany({ data: made.map(l => ({ leadId: l.id, authorId: me(req).id, text: `Imported from ${req.file!.originalname.slice(0, 120)}` })) });
    logActivity(me(req).id, 'LEADS_IMPORTED', `${created} leads from ${req.file.originalname} for ${owner.name}`);
    if (created) notify([owner.id], 'LEADS_GIVEN', `${created} new lead${created === 1 ? '' : 's'} added to your Call today list`, '/bde/leads?view=due');
  }

  res.json({
    file: req.file.originalname,
    owner: { id: owner.id, name: owner.name },
    columns: { name: cols.name >= 0, course: cols.course >= 0 },
    rows: parsed.length,
    ready: ready.length,
    preview: ready.slice(0, 8).map(p => ({ row: p.row, name: p.name, phone: formatPhone(p.phone!), course: p.course.name })),
    skipped: skipped.slice(0, 100),
    skippedCount: skipped.length,
    created
  });
});
