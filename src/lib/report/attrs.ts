/**
 * Markers a tool puts on its rendered output so the calculation report
 * (src/lib/report/collect.ts) can read it. Spread them onto elements:
 *
 *   <div {...reportResult('Max deflection')}><span {...REPORT_VALUE}>12.4 mm</span><span {...REPORT_NOTE}>span / 484</span></div>
 *   <ul {...REPORT_FORMULAS}><li>δmax = 5 w L⁴ / (384 E I)</li></ul>
 *   <div {...reportChart('Deflected shape', { head: ['x (m)', 'δ (mm)'], rows })}>...recharts...</div>
 *
 * Inputs need no marker when they have a <label for> (or aria-label); steps
 * come from <CalculationSteps>. See docs/calculation-standard.md.
 */
export const ATTR = {
  result: 'data-report-result',
  value: 'data-report-value',
  note: 'data-report-note',
  input: 'data-report-input',
  formulas: 'data-report-formula',
  steps: 'data-report-steps',
  /** Lines of working with the visitor's numbers in (kit "How this was calculated" panels); each <li>, <p> or <pre> is one line. */
  working: 'data-report-working',
  step: 'data-report-step',
  stepLabel: 'data-step-label',
  stepFormula: 'data-step-formula',
  stepWorking: 'data-step-working',
  stepResult: 'data-step-result',
  chart: 'data-report-chart',
  chartData: 'data-report-data',
  ignore: 'data-report-ignore',
} as const;

/** A headline result. Its value is the text of the REPORT_VALUE child, or of the element minus the label. */
export const reportResult = (label: string) => ({ [ATTR.result]: label });
export const REPORT_VALUE = { [ATTR.value]: '' };
export const REPORT_NOTE = { [ATTR.note]: '' };
/** An input the generic label scan cannot see (a custom control). `value` is the value as shown, with its unit. */
export const reportInput = (label: string, value: string) => ({ [ATTR.input]: label, [ATTR.value]: value });
/** A list of equations or method lines; each <li> (or the whole text) is one line. */
export const REPORT_FORMULAS = { [ATTR.formulas]: '' };
/** A chart. Pass the plotted data so CSV exports carry the numbers, not just the picture. */
export const reportChart = (title: string, data?: { head: string[]; rows: (string | number | null)[][] }) => ({
  [ATTR.chart]: title,
  ...(data ? { [ATTR.chartData]: JSON.stringify(data) } : {}),
});
/** Keeps a subtree (buttons, a duplicate mobile view) out of the report. */
export const REPORT_IGNORE = { [ATTR.ignore]: '' };
