/**
 * TSV parsing for the TSV Parser. Plain IANA text/tab-separated-values has no
 * quoting: a tab ends a field and a line break ends a record. Spreadsheet
 * exports (Excel, Google Sheets) add CSV-style quotes around fields that
 * contain tabs, line breaks or quotes, so quote handling is on by default and
 * can be switched off for strict IANA input. Parsing uses papaparse.
 */
import Papa from 'papaparse';
import { msg } from '../msg';

export type TsvParseOptions = {
  /** Treat "..." as a quoted field (spreadsheet style). Default true. */
  quotes?: boolean;
  /** Trim spaces around each cell. Default false: TSV cells keep their spaces. */
  trimCells?: boolean;
};

export type TsvParseResult = {
  headers: string[];
  rows: string[][];
  records: Record<string, string>[];
  warnings: string[];
  /** The message form of each warning, for translation where it renders. */
  warningMsgs?: { text: string; vars: Record<string, string | number> }[];
};

/** Makes header names unique ("Name", "Name_2") and names blank ones ("column_3"). */
export function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() || `column_${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

export function parseTsv(text: string, options: TsvParseOptions = {}): TsvParseResult {
  const { quotes = true, trimCells = false } = options;
  const input = text.replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(input, {
    delimiter: '\t',
    // A quote character that can never appear disables quote handling.
    quoteChar: quotes ? '"' : '\u0000',
    skipEmptyLines: true,
    header: false,
  });
  const warnings: string[] = [];
  const warningMsgs: { text: string; vars: Record<string, string | number> }[] = [];
  const warn = (text: string, vars: Record<string, string | number> = {}) => {
    warnings.push(text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))));
    warningMsgs.push({ text, vars });
  };
  for (const err of parsed.errors) {
    if (err.code === 'UndetectableDelimiter') continue;
    warn(msg('Row {row}: {message}'), { row: (err.row ?? 0) + 1, message: err.message });
  }
  const data = parsed.data.map((r) => (trimCells ? r.map((c) => c.trim()) : r));
  if (data.length === 0) return { headers: [], rows: [], records: [], warnings, warningMsgs };

  const headers = uniqueHeaders(data[0]);
  if (headers.some((h, i) => h !== data[0][i].trim())) {
    warn(msg('Some header names were blank or repeated and were renamed so no column is lost.'));
  }
  const rows = data.slice(1);
  rows.forEach((row, i) => {
    if (row.length !== headers.length) {
      const vars = { line: i + 2, n: row.length, header: headers.length };
      if (row.length > headers.length) warn(msg.plural(row.length, { one: 'Line {line} has {n} field, the header has {header}. Extra fields are kept as extra_N keys.', other: 'Line {line} has {n} fields, the header has {header}. Extra fields are kept as extra_N keys.' }), vars);
      else warn(msg.plural(row.length, { one: 'Line {line} has {n} field, the header has {header}. Missing fields are empty strings.', other: 'Line {line} has {n} fields, the header has {header}. Missing fields are empty strings.' }), vars);
    }
  });
  const records = rows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    for (let extra = headers.length; extra < row.length; extra++) obj[`extra_${extra - headers.length + 1}`] = row[extra];
    return obj;
  });
  return { headers, rows, records, warnings, warningMsgs };
}
