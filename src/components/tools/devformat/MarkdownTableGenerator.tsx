import React, { useMemo, useRef, useState } from 'react';
import { Table as TableIcon, Plus, Minus, Upload, ClipboardPaste, Settings2, Eye, AlignLeft, AlignCenter, AlignRight, AlignJustify, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toMarkdown, toCsv, importText, normalizeTable, type Align, type TableData } from '@/lib/tools/w500/dev-format-mdtable';
import { DevPage, DevHeader, Panel, CodeArea, CopyDownload, Notice, CheckField, useDevActions, PRIVACY_NOTE } from './shared';
import { msg, useT, type TFunction } from '@/i18n';

const H1 = 'Markdown Table Generator';

const START: TableData = {
  rows: [
    [msg('Tool'), msg('Language'), msg('License'), msg('Notes')],
    ['ripgrep', 'Rust', msg('MIT or Unlicense'), msg('Fast recursive grep')],
    ['jq', 'C', 'MIT', msg('JSON on the command line')],
    ['fzf', 'Go', 'MIT', msg('Fuzzy finder | pipes are escaped')],
  ],
  align: ['left', 'none', 'center', 'none'],
};

const ALIGNS: { value: Align; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'none', label: msg('Default'), icon: AlignJustify },
  { value: 'left', label: msg('Left'), icon: AlignLeft },
  { value: 'center', label: msg('Center'), icon: AlignCenter },
  { value: 'right', label: msg('Right'), icon: AlignRight },
];

/** The sample table in the page's language (tool names and licence ids stay as they are). */
const SAMPLE_TEXT = new Set<string>(['Tool', 'Language', 'License', 'Notes', 'MIT or Unlicense', 'Fast recursive grep', 'JSON on the command line', 'Fuzzy finder | pipes are escaped']);
const localStart = (t: TFunction): TableData => ({ ...START, rows: START.rows.map((row) => row.map((c) => (SAMPLE_TEXT.has(c) ? t(c) : c))) });

const MarkdownTableGenerator = () => {
  const { t: tx } = useT();
  const [table, setTable] = useState<TableData>(() => localStart(tx));
  const [paste, setPaste] = useState('');
  const [pretty, setPretty] = useState(true);
  const [outer, setOuter] = useState(true);
  const [bold, setBold] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error' | 'warn'; title: string; items?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { copy, download, track } = useDevActions(H1);

  const t = normalizeTable(table);
  const cols = t.rows[0].length;
  const markdown = useMemo(() => toMarkdown(t, { pretty, outerPipes: outer, boldHeader: bold }), [t, pretty, outer, bold]);

  const setCell = (r: number, c: number, v: string) => setTable({ rows: t.rows.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)), align: t.align });
  const addRow = () => setTable({ rows: [...t.rows, Array(cols).fill('')], align: t.align });
  const removeRow = (r: number) => t.rows.length > 1 && setTable({ rows: t.rows.filter((_, i) => i !== r), align: t.align });
  const addCol = () => setTable({ rows: t.rows.map((row, i) => [...row, i === 0 ? tx('Column {n}', { n: cols + 1 }) : '']), align: [...t.align, 'none'] });
  const removeCol = (c: number) => cols > 1 && setTable({ rows: t.rows.map((row) => row.filter((_, i) => i !== c)), align: t.align.filter((_, i) => i !== c) });
  const setAlign = (c: number, a: Align) => setTable({ rows: t.rows, align: t.align.map((x, i) => (i === c ? a : x)) });

  const load = (data: TableData, title: string, errors: string[] = []) => {
    setTable(normalizeTable(data));
    setNote(errors.length ? { tone: 'warn', title, items: errors.slice(0, 5) } : { tone: 'ok', title });
  };

  const importPaste = () => {
    if (!paste.trim()) return;
    const r = importText(paste);
    const n = r.table.rows.length;
    load(r.table, r.source === 'markdown' ? tx('Imported {n} rows from a Markdown table', { n }) : r.source === 'tsv' ? tx('Imported {n} rows from tab-separated text', { n }) : r.source === 'csv' ? tx('Imported {n} rows from CSV', { n }) : tx('Imported {n} rows from delimited text', { n }), r.errors.map((e) => tx(e)));
    track('import_paste', { source: r.source });
  };

  const importFile = async (file: File) => {
    try {
      if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false }).map((r) => r.map((c) => String(c ?? '')));
        if (!rows.length) throw new Error(tx('The first sheet is empty.'));
        load({ rows, align: [] }, tx('Imported {n} rows from sheet "{sheet}"', { n: rows.length, sheet: wb.SheetNames[0] }));
      } else {
        const r = importText(await file.text());
        load(r.table, tx('Imported {n} rows from {name}', { n: r.table.rows.length, name: file.name }), r.errors.map((e) => tx(e)));
      }
      track('import_file');
    } catch (e) {
      setNote({ tone: 'error', title: tx('Could not read {name}', { name: file.name }), items: [(e as Error).message] });
    }
  };

  return (
    <DevPage>
      <DevHeader h1={tx(H1)} sub="data-conversion" icon={TableIcon} tagline={tx('Type into a grid, paste cells from Excel or Google Sheets, or open a CSV or spreadsheet, and get a GitHub-ready Markdown table with alignment and escaped pipes.')} />
      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Panel title={tx('Table')} icon={TableIcon}>
            <div className="overflow-x-auto -mx-1 px-1" data-testid="md-grid">
              <table className="border-separate border-spacing-1">
                <thead>
                  <tr>
                    {t.align.map((a, c) => (
                      <th key={c} className="font-normal">
                        <div className="flex items-center gap-0.5">
                          {ALIGNS.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => setAlign(c, o.value)}
                              aria-pressed={a === o.value}
                              aria-label={tx('Column {value} align {label}', { value: c + 1, label: tx(o.label) })}
                              title={tx('Align {label}', { label: tx(o.label) })}
                              className={`p-1 rounded ${a === o.value ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' : 'text-gray-500 hover:text-black dark:hover:text-white'}`}
                            >
                              <o.icon className="h-3.5 w-3.5" />
                            </button>
                          ))}
                          <button type="button" onClick={() => removeCol(c)} disabled={cols <= 1} aria-label={tx('Delete column {value}', { value: c + 1 })} className="p-1 rounded text-gray-400 hover:text-red-600 disabled:opacity-30">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c}>
                          <input
                            value={cell}
                            onChange={(e) => setCell(r, c, e.target.value)}
                            aria-label={r === 0 ? tx('Header {value}', { value: c + 1 }) : tx('Row {r} column {value}', { r, value: c + 1 })}
                            className={`w-28 sm:w-36 rounded-md border px-2 py-1 text-sm bg-white dark:bg-gray-900 ${r === 0 ? 'font-semibold border-gray-400 dark:border-gray-500' : 'border-gray-200 dark:border-gray-700'}`}
                          />
                        </td>
                      ))}
                      <td>
                        {r > 0 && (
                          <button type="button" onClick={() => removeRow(r)} aria-label={tx('Delete row {r}', { r })} className="p-1 text-gray-400 hover:text-red-600">
                            <Minus className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" />{' '}{tx('Row')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addCol}>
                <Plus className="h-4 w-4 mr-1" />{' '}{tx('Column')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTable({ rows: [[tx('Column {n}', { n: 1 }), tx('Column {n}', { n: 2 })], ['', '']], align: [] })}>
                {tx('New empty table')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTable(localStart(tx))}>
                {tx('Sample')}
              </Button>
            </div>
          </Panel>

          <Panel title={tx('Markdown')} icon={Eye}>
            <CodeArea
              id="md-output"
              label={tx('GitHub Flavored Markdown')}
              value={markdown}
              readOnly
              rows={Math.min(16, t.rows.length + 3)}
              actions={
                <>
                  <CopyDownload text={markdown} filename="table.md" mime="text/markdown" onCopy={copy} onDownload={download} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => copy(toCsv(t), 'CSV')}>
                    {tx('Copy as CSV')}
                  </Button>
                </>
              }
            />
            <div className="overflow-x-auto">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{tx('Preview')}</div>
              <table className="text-sm border-collapse" data-testid="md-preview">
                <thead>
                  <tr>
                    {t.rows[0].map((h, c) => (
                      <th key={c} className="border border-gray-300 dark:border-gray-600 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 whitespace-pre-wrap" style={{ textAlign: t.align[c] === 'none' ? undefined : t.align[c] }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.slice(1).map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className="border border-gray-300 dark:border-gray-600 px-3 py-1.5 whitespace-pre-wrap" style={{ textAlign: t.align[c] === 'none' ? undefined : t.align[c] }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="space-y-6 min-w-0">
          <Panel title={tx('Import')} icon={ClipboardPaste}>
            <div>
              <Label htmlFor="md-paste" className="text-sm font-medium text-black dark:text-white">
                {tx('Paste CSV, cells from a spreadsheet, or a Markdown table')}
              </Label>
              <Textarea id="md-paste" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={tx('Name,Role\nAda,Engineer')} className="mt-1 font-mono text-xs" spellCheck={false} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={importPaste} disabled={!paste.trim()}>
                {tx('Import pasted text')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,.md,.xlsx,.xls,.ods"
                className="sr-only"
                id="md-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = '';
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" />{' '}{tx('Open file')}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{tx('CSV, TSV, Markdown, XLSX, XLS or ODS (first sheet). {PRIVACY_NOTE}', { PRIVACY_NOTE: tx(PRIVACY_NOTE) })}</p>
            {note && <Notice tone={note.tone} title={note.title} items={note.items} />}
          </Panel>
          <Panel title={tx('Output options')} icon={Settings2}>
            <CheckField id="md-pretty" label={tx('Line up the pipes (pad cells)')} checked={pretty} onChange={setPretty} />
            <CheckField id="md-outer" label={tx('Leading and trailing pipes')} checked={outer} onChange={setOuter} />
            <CheckField id="md-bold" label={tx('Bold header text')} checked={bold} onChange={setBold} />
            <p className="text-xs text-gray-500 dark:text-gray-400">{tx('Pipes inside cells are written as \\| and line breaks as <br>, which GitHub, GitLab and most Markdown renderers accept.')}</p>
          </Panel>
        </div>
      </div>
    </DevPage>
  );
};

export default MarkdownTableGenerator;
