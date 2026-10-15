import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { me, requireAdmin } from '../lib/auth.js';
import { normalizePhone, formatPhone } from '../lib/phone.js';
import { dateOnly, todayIST } from '../lib/time.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';
import { MAX_ROWS, readRows, sheetUpload } from '../lib/sheets.js';
import { board } from './assign.js';

/**
 * Import a sheet of students (.xlsx or .csv) as leads. Admin only.
 * Send commit=false first to get a preview, then commit=true with the same file to save.
 * Each row becomes a "New" lead with a follow-up today, so it shows in the BDE's call list,
 * and the whole import is kept as one batch the admin can follow on the Leads page.
 */
export const leadImport = Router();
leadImport.use(requireAdmin);

/** Finds the name, phone, course and BDE columns from a header row, or by looking at the data. */
function findColumns(rows: string[][]) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const h = rows[i].map(c => c.toLowerCase());
    const phone = h.findIndex(c => /phone|mobile|contact|whats ?app|number|cell/.test(c));
    if (phone < 0) continue;
    const bde = h.findIndex((c, j) => j !== phone && /bde|employee|emp\.? ?id|assigned|owner/.test(c));
    const name = h.findIndex((c, j) => j !== phone && j !== bde && /name|candidate|student/.test(c));
    const course = h.findIndex((c, j) => j !== phone && j !== bde && /course|internship|program|interest/.test(c));
    return { start: i + 1, phone, name, course, bde };
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
  return { start: 0, phone, name, course: -1, bde: -1 };
}

/**
 * Who gets each row:
 *  - a "BDE ID" column in the file (e.g. BDE-014) names the BDE for that row;
 *  - otherwise assign = "one" gives every row to ownerId, "share" deals the rows
 *    out equally between all active BDEs in turn, and "available" deals them only to BDEs
 *    not on leave today, the one with the fewest open leads first.
 */
leadImport.post('/', sheetUpload.single('file'), async (req, res) => {
  const b = z.object({
    assign: z.enum(['one', 'share', 'available']).default('one'),
    ownerId: z.coerce.number().int().optional(),
    courseId: z.coerce.number({ invalid_type_error: 'Choose a course' }).int(),
    commit: z.enum(['true', 'false']).default('false')
  }).parse(req.body);
  if (!req.file) throw new HttpError(400, 'Choose the file to import');
  const [bdes, course, courses] = await Promise.all([
    db.user.findMany({ where: { role: 'BDE', active: true }, orderBy: { employeeId: 'asc' } }),
    db.course.findUnique({ where: { id: b.courseId } }),
    db.course.findMany({ where: { active: true } })
  ]);
  if (!course || !course.active) throw new HttpError(400, 'Choose a course');
  if (!bdes.length) throw new HttpError(400, 'There are no active BDEs to give leads to');
  const chosen = b.assign === 'one' ? bdes.find(u => u.id === b.ownerId) : undefined;
  if (b.assign === 'one' && !chosen) throw new HttpError(400, 'Choose which BDE gets these leads');
  const byEmpId = new Map(bdes.map(u => [u.employeeId.toUpperCase(), u]));
  // Who rows without a BDE ID are dealt to, in turn
  let pool = bdes;
  if (b.assign === 'available') {
    const free = (await board()).filter(x => x.today !== 'LEAVE').sort((x, y) => x.load.open - y.load.open);
    pool = free.map(x => bdes.find(u => u.id === x.bde.id)!);
    if (!pool.length) throw new HttpError(400, 'Every BDE is on leave today');
  }

  const rows = await readRows(req.file);
  if (!rows.length) throw new HttpError(400, 'The file is empty');
  const cols = findColumns(rows);
  const data = rows.slice(cols.start);
  if (data.length > MAX_ROWS) throw new HttpError(400, `The file has ${data.length} rows. Import at most ${MAX_ROWS} at a time.`);

  const parsed = data.map((r, i) => {
    const rawPhone = r[cols.phone] ?? '';
    const courseText = cols.course >= 0 ? (r[cols.course] ?? '').toLowerCase() : '';
    const match = courseText ? courses.find(c => c.name.toLowerCase().includes(courseText) || courseText.includes(c.name.toLowerCase().replace(/ (course|internship)$/, ''))) : undefined;
    const bdeText = cols.bde >= 0 ? (r[cols.bde] ?? '').trim().toUpperCase() : '';
    return {
      row: r.row,
      name: (cols.name >= 0 ? r[cols.name] : '')?.replace(/\s+/g, ' ').slice(0, 100) || 'No name',
      rawPhone,
      phone: normalizePhone(rawPhone),
      course: match ?? course,
      bdeText,
      owner: bdeText ? byEmpId.get(bdeText) : undefined
    };
  });

  const phones = parsed.flatMap(p => (p.phone ? [p.phone] : []));
  const existing = await db.lead.findMany({ where: { phone: { in: phones } }, include: { owner: true } });
  const taken = new Map(existing.map(l => [l.phone, l.owner.name]));

  const seen = new Set<string>();
  const ready: ((typeof parsed)[number] & { ownerId: number; ownerName: string })[] = [];
  const skipped: { row: number; name: string; phone: string; reason: string }[] = [];
  let turn = 0;
  for (const p of parsed) {
    const skip = (reason: string) => skipped.push({ row: p.row, name: p.name, phone: p.rawPhone, reason });
    if (!p.phone) skip(p.rawPhone ? 'Not a valid mobile number' : 'No phone number');
    else if (taken.has(p.phone)) skip(`Already a lead for ${taken.get(p.phone)}`);
    else if (seen.has(p.phone)) skip('Same number appears earlier in this file');
    else if (p.bdeText && !p.owner) skip(`No active BDE with ID ${p.bdeText}`);
    else {
      seen.add(p.phone);
      const owner = p.owner ?? chosen ?? pool[turn++ % pool.length];
      ready.push({ ...p, ownerId: owner.id, ownerName: owner.name });
    }
  }
  const counts = new Map<number, { name: string; count: number }>();
  for (const p of ready) counts.set(p.ownerId, { name: p.ownerName, count: (counts.get(p.ownerId)?.count ?? 0) + 1 });
  const perOwner = [...counts].map(([id, v]) => ({ id, ...v })).sort((x, y) => y.count - x.count);

  let created = 0;
  let batchId: number | null = null;
  if (b.commit === 'true' && ready.length) {
    const today = dateOnly(todayIST());
    const fileName = req.file.originalname.slice(0, 200);
    const batch = await db.importBatch.create({ data: { fileName, createdById: me(req).id, count: 0 } });
    batchId = batch.id;
    const result = await db.lead.createMany({
      data: ready.map(p => ({ name: p.name, phone: p.phone!, courseId: p.course.id, ownerId: p.ownerId, stage: 'NEW', followUpOn: today, nextAction: 'First call', batchId: batch.id })),
      skipDuplicates: true
    });
    created = result.count;
    await db.importBatch.update({ where: { id: batch.id }, data: { count: created } });
    const made = await db.lead.findMany({ where: { batchId: batch.id }, select: { id: true } });
    await db.leadNote.createMany({ data: made.map(l => ({ leadId: l.id, authorId: me(req).id, text: `Imported from ${fileName.slice(0, 120)}`, source: 'IMPORT' as const })) });
    logActivity(me(req).id, 'LEADS_IMPORTED', `${created} leads from ${fileName} for ${perOwner.length === 1 ? perOwner[0].name : `${perOwner.length} BDEs`}`);
    for (const o of perOwner) notify([o.id], 'LEADS_GIVEN', `${o.count} new lead${o.count === 1 ? '' : 's'} added to your call list`, '/bde/leads');
  }

  res.json({
    file: req.file.originalname,
    owner: perOwner.length === 1 ? { id: perOwner[0].id, name: perOwner[0].name } : { id: 0, name: `${perOwner.length} BDEs` },
    perOwner,
    columns: { name: cols.name >= 0, course: cols.course >= 0, bde: cols.bde >= 0 },
    rows: parsed.length,
    ready: ready.length,
    preview: ready.slice(0, 8).map(p => ({ row: p.row, name: p.name, phone: formatPhone(p.phone!), course: p.course.name, bde: p.ownerName })),
    skipped: skipped.slice(0, 100),
    skippedCount: skipped.length,
    created,
    batchId
  });
});
