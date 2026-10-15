import { Readable } from 'node:stream';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { HttpError } from './http.js';

/** Reading uploaded spreadsheets (.xlsx or .csv): lead import and bulk updates. */

export const MAX_ROWS = 2000;

/** Upload middleware for one .xlsx or .csv file, up to 5 MB, kept in memory. */
export const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|csv)$/i.test(file.originalname)) return cb(null, true);
    cb(new HttpError(400, /\.xls$/i.test(file.originalname) ? 'Old .xls files are not supported. In Excel or WPS use "Save as" .xlsx' : 'Choose an .xlsx or .csv file'));
  }
});

/** Text of any cell: numbers, formulas, links and rich text all become plain text; dates become YYYY-MM-DD. */
export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    // Excel keeps a time typed alone (11:00) as a time on 30 Dec 1899
    if (v instanceof Date) return v.getUTCFullYear() < 1900 ? v.toISOString().slice(11, 16) : v.toISOString().slice(0, 10);
    if ('richText' in v) return v.richText.map(t => t.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    return '';
  }
  return String(v).trim();
}

/** All non-empty rows of the first sheet, as text. */
/** One row of cells, with its row number in Excel (blank rows are left out, so the index is not the row) */
export type SheetRow = string[] & { row: number };

export async function readRows(file: Express.Multer.File): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  let ws: ExcelJS.Worksheet | undefined;
  try {
    if (/\.csv$/i.test(file.originalname)) ws = await wb.csv.read(Readable.from(file.buffer));
    else { await wb.xlsx.load(file.buffer as unknown as ArrayBuffer); ws = wb.worksheets[0]; }
  } catch {
    throw new HttpError(400, "This file couldn't be read. Open it in Excel or WPS and save it again as .xlsx");
  }
  if (!ws) throw new HttpError(400, 'The file has no sheets');
  const rows: SheetRow[] = [];
  ws.eachRow({ includeEmpty: false }, row => {
    const vals = Object.assign((row.values as ExcelJS.CellValue[]).slice(1).map(cellText), { row: row.number });
    if (vals.some(Boolean)) rows.push(vals);
  });
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A date typed in a sheet, as YYYY-MM-DD, or null if it can't be read.
 * Accepts 2026-10-20, 20-10-2026, 20/10/2026, 20.10.2026 (day first, as in India) and "20 Oct 2026".
 */
export function parseSheetDate(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t))) [d, m, y] = [+r[1], +r[2], +r[3] < 100 ? 2000 + +r[3] : +r[3]];
  else if ((r = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i.exec(t))) [d, m, y] = [+r[1], MONTHS.indexOf(r[2].toLowerCase()) + 1, +r[3]];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!m || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}
