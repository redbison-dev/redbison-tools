/**
 * The PDF section chooser. Inputs and results are not optional: a report
 * without what went in and what came out is not a report.
 */
import { describe, it, expect } from 'vitest';
import { applyReportSections, availableReportSections, REPORT_SECTIONS, type ReportSectionKey, type ToolReport } from '@/lib/report/model';

const full: ToolReport = {
  toolId: 'demo', title: 'Demo', url: 'https://x/y', generatedAt: '2026-11-18T00:00:00.000Z',
  inputs: [{ label: 'Span', value: '6 m' }],
  results: [{ label: 'Deflection', value: '5 mm' }],
  steps: [{ label: 'Step', formula: 'a=b', working: '1', result: '2' }],
  formulas: ['EI = E x I'],
  tables: [{ title: 'T', head: ['a'], rows: [['1']] }],
  charts: [{ title: 'C', table: { title: 'C', head: ['x'], rows: [['1']] } }],
  sources: [{ title: 'S', publisher: 'P', url: 'https://s' }],
} as unknown as ToolReport;

const all = new Set<ReportSectionKey>(REPORT_SECTIONS.map((s) => s.key));

describe('report sections', () => {
  it('keeps inputs and results whatever is deselected', () => {
    const none = applyReportSections(full, new Set());
    expect(none.inputs).toEqual(full.inputs);
    expect(none.results).toEqual(full.results);
  });

  it('drops only what was deselected', () => {
    const r = applyReportSections(full, new Set<ReportSectionKey>(['steps', 'sources']));
    expect(r.steps).toHaveLength(1);
    expect(r.sources).toHaveLength(1);
    expect(r.formulas).toHaveLength(0);
    expect(r.tables).toHaveLength(0);
    expect(r.charts).toHaveLength(0);
  });

  it('everything selected is the report unchanged', () => {
    expect(applyReportSections(full, all)).toEqual(full);
  });

  it('takes the chart data tables out with the charts', () => {
    // They are written as "Chart data: <title>" and hang off r.charts.
    expect(applyReportSections(full, new Set()).charts).toHaveLength(0);
  });

  it('offers only sections the report actually has', () => {
    expect(availableReportSections(full).sort()).toEqual([...all].sort());
    const bare = { ...full, steps: [], formulas: [], tables: [], charts: [], sources: [] };
    expect(availableReportSections(bare)).toEqual([]);
  });

  it('never offers inputs or results as optional', () => {
    const keys = REPORT_SECTIONS.map((s) => s.key) as string[];
    expect(keys).not.toContain('inputs');
    expect(keys).not.toContain('results');
  });
});
