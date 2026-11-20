/**
 * The calculation report every calculator can export (docs/calculation-standard.md).
 *
 * A report is collected from the rendered tool (src/lib/report/collect.ts),
 * enriched with the write-up's sources, then written as CSV (here, pure and
 * tested) or PDF (src/lib/report/pdf.ts). Values are kept as the page shows
 * them, with units, so an exported number always matches the screen.
 */
import { msg, plainText } from '../msg';
import { formatDateParts } from '../dateText';

export type ReportField = { label: string; value: string; note?: string };

/** One line of working: what is computed, the equation, the equation with numbers in, and the result. */
export type ReportStep = {
  label: string;
  formula?: string;
  working?: string;
  result: string;
  /** The result as a message for t() when it carries words ("{count} bags"); `result` stays the US English text. */
  resultMsg?: StepMsg;
  /** Label, formula and working as messages with values filled in ("Year {n} depreciation"), for text built at run time; the plain fields stay the US English text. */
  labelMsg?: StepMsg;
  formulaMsg?: StepMsg;
  workingMsg?: StepMsg;
};

/**
 * A msg()-marked template and the values for its {placeholders}. `vars` holds
 * every value as US English text, so interpolating `vars` always gives the
 * plain field. Values that must change with the page's language say so too:
 * - `dates`: a calendar day, as its ISO date and the Intl options it prints
 *   with; CalculationSteps formats it for the page's locale.
 * - `msgs`: a phrase that is itself a message ("2 years 4 months").
 * - `lists`: a list, one message per item, joined at render by
 *   Intl.ListFormat (type unit, style short: "a, b, c" in US English) or by
 *   the symbol in `join` ("; ", " + "; a msg()-marked word such as " and "
 *   is translated).
 * Build these with stepMsg() and stepDate() / stepList() / stepPart().
 */
export type StepMsg = { text: string; vars: Record<string, string | number>; dates?: Record<string, StepDate>; msgs?: Record<string, StepMsg>; lists?: Record<string, StepList> };
export type StepDate = { iso: string; opts: Intl.DateTimeFormatOptions };
export type StepList = { items: StepMsg[]; join?: string };

/** A value for a stepMsg() placeholder that changes with the page's language. */
export type StepValue = { stepDate: StepDate } | { stepMsg: StepMsg } | { stepList: StepList };
/** A calendar day (YYYY-MM-DD) printed with `opts`: US English through Intl here, the page's locale in CalculationSteps. */
export const stepDate = (iso: string, opts: Intl.DateTimeFormatOptions): StepValue => ({ stepDate: { iso, opts } });
/** A phrase that is its own message. */
export const stepPart = (text: string, vars: Record<string, unknown> = {}): StepValue => ({ stepMsg: stepMsg(text, vars) });
/** A list of messages ([text, vars] pairs or built StepMsgs), joined by Intl.ListFormat or by `join`. */
export const stepList = (items: (StepMsg | [string, Record<string, unknown>?])[], join?: string): StepValue => ({
  stepList: { items: items.map((x) => (Array.isArray(x) ? stepMsg(x[0], x[1] ?? {}) : x)), ...(join === undefined ? {} : { join }) },
});

/** A step label with a context (msg.ctx, src/lib/msg.ts): the English text as `label`, the context key in `labelMsg` for CalculationSteps. */
export const ctxLabel = (key: string): Pick<ReportStep, 'label' | 'labelMsg'> => ({ label: plainText(key), labelMsg: { text: key, vars: {} } });

/** The US English text of a step date (as formatDate prints it on an en-US page). */
export const stepDateText = (d: StepDate, tag = 'en-US'): string => formatDateParts(new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...d.opts }), new Date(`${d.iso}T00:00:00Z`));
/** Joins list items the way CalculationSteps does for `tag`. */
export const stepListJoin = (items: string[], tag = 'en-US', join?: string): string => (join === undefined ? new ListFormat(tag, { type: 'unit', style: 'short' }).format(items) : items.join(join));
// Intl.ListFormat (ES2021) is in every supported browser, Node and Deno; the app's TypeScript lib predates it.
const ListFormat = (Intl as unknown as { ListFormat: new (tag: string, o: { type: string; style: string }) => { format: (items: string[]) => string } }).ListFormat;
/** The US English text of a step message. */
export const stepMsgText = (m: StepMsg): string => plainText(m.text).replace(/\{(\w+)\}/g, (all, k: string) => (m.vars[k] === undefined ? all : String(m.vars[k])));

/** A step message from a template and its values; numbers stay numbers, StepValues fill `dates`, `msgs` and `lists`, anything else becomes text. */
export function stepMsg(text: string, v: Record<string, unknown> = {}): StepMsg {
  const m: StepMsg = { text, vars: {} };
  for (const [k, x] of Object.entries(v)) {
    if (x && typeof x === 'object' && 'stepDate' in x) {
      (m.dates ??= {})[k] = x.stepDate as StepDate;
      m.vars[k] = stepDateText(x.stepDate as StepDate);
    } else if (x && typeof x === 'object' && 'stepMsg' in x) {
      (m.msgs ??= {})[k] = x.stepMsg as StepMsg;
      m.vars[k] = stepMsgText(x.stepMsg as StepMsg);
    } else if (x && typeof x === 'object' && 'stepList' in x) {
      const l = x.stepList as StepList;
      (m.lists ??= {})[k] = l;
      m.vars[k] = stepListJoin(l.items.map(stepMsgText), 'en-US', l.join);
    } else m.vars[k] = typeof x === 'number' ? x : String(x);
  }
  return m;
}

export type ReportTable = { title: string; head: string[]; rows: string[][] };

export type ReportChart = {
  title: string;
  /** Serialized SVG of the chart as drawn, for the PDF. */
  svg?: string;
  /** The plotted data, when the chart declares it (data-report-data). */
  table?: ReportTable;
};

export type ReportSource = { title: string; publisher: string; url: string };

export type ToolReport = {
  toolId: string;
  title: string;
  /** Page URL with the inputs in the query string where the tool supports it, so the report can be recalculated. */
  url: string;
  /** ISO timestamp of the export, shown on the report. Never used as a page date. */
  generatedAt: string;
  inputs: ReportField[];
  results: ReportField[];
  steps: ReportStep[];
  /** The equations and method lines the tool shows ("How this was calculated"). */
  formulas: string[];
  tables: ReportTable[];
  charts: ReportChart[];
  /** Standards and references from the tool's write-up. */
  sources: ReportSource[];
};

export const REPORT_DISCLAIMER = msg(
  'Calculated in the browser by RedBison from the inputs above. Check the result against the governing code, standard or professional advice before relying on it.',
);

/** Spreadsheet-safe CSV cell (RFC 4180 quoting). Text that a spreadsheet would run as a formula is prefixed with an apostrophe; plain numbers such as -12.5 are left alone. */
export function csvCell(value: string): string {
  let v = value.replace(/\r\n?/g, '\n');
  if (/^[=+\-@\t\r]/.test(v) && !/^[-+]?\d[\d,]*(\.\d+)?([eE][-+]?\d+)?(\s.*)?$/.test(v)) v = `'${v}`;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const row = (cells: string[]) => cells.map(csvCell).join(',');

/** Translates a report heading (t() on a language page); identity by default. */
export type ReportTranslate = (source: string, vars?: Record<string, string | number>) => string;
const same: ReportTranslate = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : s);

/** The whole report as one CSV file: labelled sections separated by blank lines, readable in any spreadsheet. */
export function reportToCsv(r: ToolReport, t: ReportTranslate = same): string {
  const out: string[] = [row([t(msg('Report')), r.title]), row(['URL', r.url]), row([t(msg('Generated')), r.generatedAt])];
  const section = (name: string, head: string[], rows: string[][]) => {
    if (!rows.length) return;
    out.push('', row([name]), row(head), ...rows.map(row));
  };
  section(t(msg('Inputs')), [t(msg('Input')), t(msg('Value'))], r.inputs.map((f) => [f.label, f.value]));
  section(t(msg('Results')), [t(msg('Result')), t(msg('Value')), t(msg('Note'))], r.results.map((f) => [f.label, f.value, f.note ?? '']));
  section(t(msg('Working')), [t(msg('Step')), t(msg('Formula')), t(msg('With values')), t(msg('Result'))], r.steps.map((s) => [s.label, s.formula ?? '', s.working ?? '', s.result]));
  section(t(msg('Formulas and method')), [t(msg('Line'))], r.formulas.map((l) => [l]));
  for (const tb of r.tables) section(tb.title, tb.head, tb.rows);
  for (const c of r.charts) if (c.table) section(t(msg('Chart data: {title}'), { title: c.table.title || c.title }), c.table.head, c.table.rows);
  section(t(msg('Standards and references')), [t(msg('Title')), t(msg('Publisher')), 'URL'], r.sources.map((s) => [s.title, s.publisher, s.url]));
  out.push('', row([t(msg('Note')), t(REPORT_DISCLAIMER)]));
  // A BOM so Excel opens UTF-8 symbols (°, ², δ) correctly.
  return `﻿${out.join('\r\n')}\r\n`;
}

/** "beam-deflection-calculator-2026-11-06.csv" */
export function reportFileName(r: Pick<ToolReport, 'toolId' | 'generatedAt'>, ext: 'csv' | 'pdf'): string {
  return `${r.toolId}-${r.generatedAt.slice(0, 10)}.${ext}`;
}

/** True when the report holds a calculation worth exporting. */
export function hasReportContent(r: Pick<ToolReport, 'results' | 'steps' | 'tables'>): boolean {
  return r.results.length + r.steps.length + r.tables.length > 0;
}

/**
 * The parts of a PDF report a reader can leave out.
 *
 * Inputs and results are not here on purpose: a report without what went in
 * and what came out is not a report, so they are always written. Everything
 * else is optional, and each entry knows whether this report has any of it,
 * so the chooser only ever offers sections that would actually appear.
 *
 * Nothing new is needed in pdf.ts to honour a choice: it already skips a
 * section whose array is empty, so emptying the array is the whole mechanism.
 * Dropping charts here also means their PNGs are never rendered, which is the
 * slowest part of building a report.
 */
export type ReportSectionKey = 'steps' | 'formulas' | 'tables' | 'charts' | 'sources';

export const REPORT_SECTIONS: {
  key: ReportSectionKey;
  /** The heading this section carries in the report, so the two read alike. */
  label: string;
  has: (r: ToolReport) => boolean;
}[] = [
  { key: 'steps', label: msg('Working'), has: (r) => r.steps.length > 0 },
  { key: 'formulas', label: msg('Formulas and method'), has: (r) => r.formulas.length > 0 },
  { key: 'tables', label: msg('Tables'), has: (r) => r.tables.length > 0 },
  { key: 'charts', label: msg('Charts'), has: (r) => r.charts.length > 0 },
  { key: 'sources', label: msg('Standards and references'), has: (r) => r.sources.length > 0 },
];

/** The optional sections this particular report could show. */
export function availableReportSections(r: ToolReport): ReportSectionKey[] {
  return REPORT_SECTIONS.filter((s) => s.has(r)).map((s) => s.key);
}

/** A copy of the report carrying only the optional sections asked for. */
export function applyReportSections(r: ToolReport, include: ReadonlySet<ReportSectionKey>): ToolReport {
  return {
    ...r,
    steps: include.has('steps') ? r.steps : [],
    formulas: include.has('formulas') ? r.formulas : [],
    tables: include.has('tables') ? r.tables : [],
    // Chart data tables hang off the charts, so they go with them.
    charts: include.has('charts') ? r.charts : [],
    sources: include.has('sources') ? r.sources : [],
  };
}
