import * as XLSX from 'xlsx';

export type ExcelToJsonOptions = {
  /** Object mode: first row supplies the keys. Array mode: keep the first row. */
  includeHeaders: boolean;
  outputFormat: 'array' | 'object';
};

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * Turns an Excel date serial into an ISO 8601 string without going through a
 * JavaScript Date, so the result does not depend on the viewer's time zone.
 * Whole days give "YYYY-MM-DD"; values with a time give "YYYY-MM-DDTHH:MM:SS";
 * pure times (serial below 1) give "HH:MM:SS".
 */
export function excelSerialToIso(serial: number, date1904 = false): string {
  const p = XLSX.SSF.parse_date_code(serial, { date1904 });
  const time = `${pad(p.H)}:${pad(p.M)}:${pad(p.S)}`;
  if (serial >= 0 && serial < 1 && !date1904) return time;
  const day = `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`;
  return p.H || p.M || p.S ? `${day}T${time}` : day;
}

const isBinarySpreadsheet = (b: Uint8Array) =>
  (b[0] === 0x50 && b[1] === 0x4b) || // PK: .xlsx/.xlsm zip container
  (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0); // OLE2: .xls

// Plain decimal numbers without a significant leading zero ("00123" stays text).
const CSV_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?$/;

/**
 * CSV has no types. SheetJS's own guessing drops leading zeros and parses ISO
 * dates as UTC midnight, which shifts them by a day west of UTC. So CSV is
 * read as text and only unambiguous numbers and TRUE/FALSE are converted.
 */
function typeCsvCells(sheet: XLSX.WorkSheet): void {
  for (const addr of Object.keys(sheet)) {
    if (addr[0] === '!') continue;
    const cell = sheet[addr] as XLSX.CellObject;
    if (cell.t !== 's' || typeof cell.v !== 'string') continue;
    const v = cell.v.trim();
    if (CSV_NUMBER.test(v)) sheet[addr] = { t: 'n', v: Number(v) };
    else if (/^(true|false)$/i.test(v)) sheet[addr] = { t: 'b', v: v.toLowerCase() === 'true' };
  }
}

export function readWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (!isBinarySpreadsheet(bytes)) {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    const wb = XLSX.read(text, { type: 'string', raw: true });
    wb.SheetNames.forEach((name) => typeCsvCells(wb.Sheets[name]));
    return wb;
  }
  // cellNF keeps each cell's number format so date cells can be recognised.
  return XLSX.read(bytes, { type: 'array', cellNF: true, cellDates: false });
}

/** Rewrites date-formatted numeric cells as ISO strings in place. */
function convertDateCells(sheet: XLSX.WorkSheet, date1904: boolean): void {
  for (const addr of Object.keys(sheet)) {
    if (addr[0] === '!') continue;
    const cell = sheet[addr] as XLSX.CellObject;
    if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && XLSX.SSF.is_date(String(cell.z))) {
      const iso = excelSerialToIso(cell.v, date1904);
      sheet[addr] = { t: 's', v: iso, w: iso };
    } else if (cell.t === 'd' && cell.v instanceof Date) {
      const iso = cell.v.toISOString();
      sheet[addr] = { t: 's', v: iso, w: iso };
    }
  }
}

export function sheetToJson(workbook: XLSX.WorkBook, sheetName: string, options: ExcelToJsonOptions): unknown[] {
  const source = workbook.Sheets[sheetName];
  if (!source) throw new Error(`Sheet "${sheetName}" not found`);
  const sheet: XLSX.WorkSheet = { ...source };
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  convertDateCells(sheet, date1904);

  if (options.outputFormat === 'object') {
    // Without a header row, keys are the column letters (A, B, C ...).
    return XLSX.utils.sheet_to_json(sheet, { header: options.includeHeaders ? undefined : 'A', defval: null });
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  return options.includeHeaders ? rows : rows.slice(1);
}
