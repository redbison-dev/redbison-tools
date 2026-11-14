/**
 * Markdown (GitHub Flavored Markdown) tables: build from a grid, convert from
 * CSV/TSV (spreadsheet paste) and parse existing Markdown tables back into a grid.
 *
 * Follows the GFM spec's table extension: a header row, a delimiter row of
 * hyphens with optional colons for alignment, pipes escaped as \| inside cells.
 *
 * No React, no "@/" imports: this file is also bundled into the MCP server.
 */
import Papa from 'papaparse';

export type Align = 'none' | 'left' | 'center' | 'right';

export interface TableData {
  /** First row is the header. */
  rows: string[][];
  align: Align[];
}

export interface MarkdownOptions {
  /** Pad cells so the pipes line up in a monospaced editor. */
  pretty?: boolean;
  /** Write the outer | at the start and end of each row. */
  outerPipes?: boolean;
  /** Turn line breaks inside a cell into <br> (GFM cells cannot contain a newline). */
  brForNewlines?: boolean;
  /** Bold the header text. */
  boldHeader?: boolean;
}

/**
 * Terminal-style display width: East Asian wide and fullwidth characters and
 * most emoji take two columns, combining marks and zero-width characters none.
 */
const ZERO_WIDTH: [number, number][] = [
  [0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x0610, 0x061a], [0x064b, 0x065f], [0x0e31, 0x0e31], [0x0e34, 0x0e3a], [0x0e47, 0x0e4e],
  [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], [0x200b, 0x200f], [0x20d0, 0x20ff], [0xfe00, 0xfe0f], [0xfe20, 0xfe2f],
];

export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ZERO_WIDTH.some(([a, b]) => cp >= a && cp <= b)) continue;
    if (cp >= 0xe0100 && cp <= 0xe01ef) continue;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0x303e) ||
      (cp >= 0x3041 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0xa000 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x1f680 && cp <= 0x1f6ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    w += wide ? 2 : 1;
  }
  return w;
}

/** Escapes a cell for a GFM table: pipes become \|, line breaks become <br> or a space. */
export function escapeCell(text: string, brForNewlines = true): string {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\|/g, '\\|')
    .replace(/\n/g, brForNewlines ? '<br>' : ' ');
}

/** Pads rows to the same column count and fills missing alignments. */
export function normalizeTable(t: TableData): TableData {
  const cols = Math.max(1, ...t.rows.map((r) => r.length));
  const rows = (t.rows.length ? t.rows : [['']]).map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
  const align = Array.from({ length: cols }, (_, i) => t.align[i] ?? 'none');
  return { rows, align };
}

function delimiter(a: Align, width: number): string {
  const w = Math.max(3, width);
  switch (a) {
    case 'left':
      return ':' + '-'.repeat(w - 1);
    case 'right':
      return '-'.repeat(w - 1) + ':';
    case 'center':
      return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
    default:
      return '-'.repeat(w);
  }
}

function pad(text: string, width: number, a: Align): string {
  const gap = width - displayWidth(text);
  if (gap <= 0) return text;
  if (a === 'right') return ' '.repeat(gap) + text;
  if (a === 'center') return ' '.repeat(Math.floor(gap / 2)) + text + ' '.repeat(Math.ceil(gap / 2));
  return text + ' '.repeat(gap);
}

/** Renders a table as GitHub Flavored Markdown. */
export function toMarkdown(table: TableData, opts: MarkdownOptions = {}): string {
  const { rows, align } = normalizeTable(table);
  const pretty = opts.pretty ?? true;
  const outer = opts.outerPipes ?? true;
  const cells = rows.map((r, ri) =>
    r.map((c) => {
      const e = escapeCell(c, opts.brForNewlines ?? true);
      return ri === 0 && opts.boldHeader && e ? `**${e}**` : e;
    }),
  );
  const widths = align.map((a, ci) => (pretty ? Math.max(a === 'center' ? 5 : 3, ...cells.map((r) => displayWidth(r[ci]))) : 3));
  const line = (parts: string[]) => (outer ? `| ${parts.join(' | ')} |` : parts.join(' | '));
  const out: string[] = [];
  const row = (r: string[]) => line(r.map((c, ci) => (pretty ? pad(c, widths[ci], align[ci]) : c)));
  out.push(row(cells[0]));
  out.push(line(align.map((a, ci) => delimiter(a, pretty ? widths[ci] : 3))));
  for (const r of cells.slice(1)) out.push(row(r));
  // Without outer pipes an empty first cell would start the line with " | ", which is still valid GFM.
  return out.map((l) => l.replace(/\s+$/, '')).join('\n') + '\n';
}

/** Parses CSV or TSV (auto-detected unless given). Quoted fields with commas and newlines are handled by Papa Parse. */
export function parseDelimited(text: string, delimiter: 'auto' | ',' | '\t' | ';' | '|' = 'auto'): { rows: string[][]; delimiter: string; errors: string[] } {
  const clean = text.replace(/^\ufeff/, '');
  const res = Papa.parse<string[]>(clean, { delimiter: delimiter === 'auto' ? '' : delimiter, skipEmptyLines: 'greedy', delimitersToGuess: ['\t', ',', ';', '|'] });
  const errors = res.errors.filter((e) => e.code !== 'UndetectableDelimiter').map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
  return { rows: res.data.map((r) => r.map((c) => String(c ?? ''))), delimiter: res.meta.delimiter, errors };
}

/** Splits a Markdown table row on unescaped pipes. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  const cells: string[] = [];
  let cur = '';
  let endedOnPipe = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    endedOnPipe = false;
    if (c === '\\' && i + 1 < s.length) {
      // A backslash escapes the next character, so "\\|" is an escaped backslash followed by a cell break.
      cur += s[i + 1] === '|' ? '|' : c + s[i + 1];
      i++;
      continue;
    }
    if (c === '|') {
      cells.push(cur.trim());
      cur = '';
      endedOnPipe = true;
      continue;
    }
    cur += c;
  }
  if (!endedOnPipe || cells.length === 0) cells.push(cur.trim());
  return cells;
}

/** GFM delimiter cell: optional colon, hyphens, optional colon, surrounded only by spaces or tabs. */
const DELIM_CELL = /^:?-+:?$/;
/** Lines that start another block (quote, heading, list, fence, thematic break, indented code) end a table. */
const BLOCK_START = /^(?: {4}|\t| {0,3}(?:>|#{1,6}(?:[ \t]|$)|[-+*][ \t]|\d{1,9}[.)][ \t]|```|~~~|(?:[-*_][ \t]*){3,}$))/;

/** Reads the first GFM table found in Markdown text. Returns null when there is none. */
export function parseMarkdownTable(md: string): TableData | null {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes('|') || !lines[i + 1].includes('|')) continue;
    const delim = splitRow(lines[i + 1]);
    if (!delim.length || !delim.every((c) => DELIM_CELL.test(c.trim()))) continue;
    const header = splitRow(lines[i]);
    if (header.length !== delim.length) continue;
    const align: Align[] = delim.map((c) => {
      const d = c.trim();
      const l = d.startsWith(':');
      const r = d.endsWith(':');
      return l && r ? 'center' : r ? 'right' : l ? 'left' : 'none';
    });
    const rows = [header];
    // GFM: body rows run until a blank line or another block starts; a row needs no pipe.
    for (let j = i + 2; j < lines.length && lines[j].trim() !== '' && !BLOCK_START.test(lines[j]); j++) {
      const r = splitRow(lines[j]);
      // GFM: extra cells are ignored, missing cells are empty.
      rows.push(Array.from({ length: header.length }, (_, k) => (r[k] ?? '').replace(/<br\s*\/?>/gi, '\n')));
    }
    return { rows: rows.map((r) => r.map((c) => c.replace(/<br\s*\/?>/gi, '\n'))), align };
  }
  return null;
}

/** Detects whether pasted text is a Markdown table, TSV or CSV and converts it to table data. */
export function importText(text: string): { table: TableData; source: 'markdown' | 'tsv' | 'csv' | 'other'; errors: string[] } {
  const md = parseMarkdownTable(text);
  if (md) return { table: md, source: 'markdown', errors: [] };
  const d = parseDelimited(text);
  const source = d.delimiter === '\t' ? 'tsv' : d.delimiter === ',' ? 'csv' : 'other';
  return { table: normalizeTable({ rows: d.rows, align: [] }), source, errors: d.errors };
}

/** Converts table data to CSV (RFC 4180 quoting). */
export function toCsv(t: TableData): string {
  return Papa.unparse(normalizeTable(t).rows, { newline: '\n' }) + '\n';
}

/** Builds a table from CSV/TSV/Markdown text in one call (used by the MCP tool). */
export function textToMarkdown(text: string, opts: MarkdownOptions & { align?: Align[] | Align } = {}): { markdown: string; rows: number; columns: number; source: string; errors: string[] } {
  const { table, source, errors } = importText(text);
  const cols = table.rows[0]?.length ?? 0;
  const align = opts.align === undefined ? table.align : Array.isArray(opts.align) ? opts.align : Array.from({ length: cols }, () => opts.align as Align);
  const markdown = toMarkdown({ rows: table.rows, align }, opts);
  return { markdown, rows: table.rows.length, columns: cols, source, errors };
}
