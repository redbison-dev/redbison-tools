/**
 * Heap Snapshot Analyzer: drop a V8 .heapsnapshot (Chrome DevTools, node
 * --heapsnapshot-signal, v8.writeHeapSnapshot()). Parsing is
 * src/lib/tools/v8-heap-snapshot.ts, which reads the row layout from
 * snapshot.meta instead of assuming one. The snapshot is JSON, so it is
 * read as one string (unlike the streaming HPROF tool); a spinner covers
 * the read and parse. Nothing leaves the browser.
 */
import React, { useRef, useState } from 'react';
import { Camera, FileText, Copy as CopyIcon, Unlink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { parseV8HeapSnapshot, renderV8HeapSummary, type V8HeapSummary } from '@/lib/tools/v8-heap-snapshot';
import { reportChart, reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { DebugPage, DebugHeader, Panel, Notice, Stat, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';

const NodeHeapSnapshotAnalyzer = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('node-heap-snapshot-analyzer');
  const [summary, setSummary] = useState<V8HeapSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  const onFile = async (f: File) => {
    const mine = ++run.current;
    setSummary(null);
    setError('');
    setFileName(f.name);
    setBusy(true);
    track('parse_snapshot', { sizeMiB: Math.round(f.size / 1024 / 1024) });
    try {
      const json = await f.text();
      // Let the "reading" state paint before the synchronous parse blocks.
      await new Promise((r) => setTimeout(r, 0));
      if (run.current !== mine) return;
      setSummary(parseV8HeapSnapshot(json));
    } catch (e) {
      if (run.current === mine) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (run.current === mine) setBusy(false);
    }
  };

  const text = summary ? renderV8HeapSummary(summary) : '';
  const ctorData = (summary?.constructors ?? []).slice(0, 10).map((c) => ({ name: c.name, bytes: c.bytes, count: c.count }));

  return (
    <DebugPage>
      <DebugHeader
        h1={t('Heap Snapshot Analyzer for Node and Chrome')}
        tagline={t('Constructor and node-type histograms, duplicate strings and detached DOM nodes from a .heapsnapshot file, parsed in your browser')}
        icon={Camera}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Snapshot file')} icon={FileText}>
          <FileDrop
            id="heapsnapshot-file"
            label={fileName || t('Drop a .heapsnapshot file here')}
            hint={t('From the Chrome DevTools Memory panel, node --heapsnapshot-signal or v8.writeHeapSnapshot(). The file is parsed on this page and not uploaded.')}
            accept=".heapsnapshot,.json,application/json"
            onFile={onFile}
            disabled={busy}
          />
          {busy && <Notice tone="info" title={t('Reading and parsing the snapshot. A snapshot is one large JSON document, so a very big file takes a few seconds.')} />}
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('Snapshot at a glance')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="v8-stats">
                <Stat label={t('Heap nodes')} value={fmt.number(summary.nodeCount)} />
                <Stat label={t('Edges')} value={fmt.number(summary.edgeCount)} sub={t('references between nodes')} />
                <Stat label={t('Shallow bytes')} value={iecBytes(summary.totalBytes)} sub={t('self_size, as DevTools shows it')} tone="accent" />
                <Stat label={t('Detached DOM nodes')} value={fmt.number(summary.detachedNodes)} tone={summary.detachedNodes > 0 ? 'accent' : 'default'} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400" {...reportInput(t('File'), fileName)}>{fileName}</p>
              <Notice
                tone="info"
                title={t('Sizes are shallow (V8 self_size). Retained sizes need the dominator tree over every edge, which this summary leaves out on purpose; open the snapshot in the DevTools Memory panel when you need what a node keeps alive.')}
              />
            </Panel>

            {summary.detachedNodes > 0 && (
              <div role="status" data-testid="v8-detached" className="rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-start gap-3">
                <Unlink className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-lg font-bold text-amber-800 dark:text-amber-200">
                    {t('{n} detached DOM nodes', { n: fmt.number(summary.detachedNodes) })}
                  </div>
                  <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                    {t('Elements removed from the page that JavaScript still references, the classic browser leak. Look for listeners, caches or closures that keep old elements; DevTools filters them under "Detached".')}
                  </p>
                </div>
              </div>
            )}

            <Panel title={t('Top constructors by shallow bytes')}>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('Objects, closures and regexps grouped by constructor name. A constructor whose count only grows between two snapshots is where the leak hunt starts.')}
              </p>
              <div {...reportChart(t('Top constructors by shallow bytes'), { head: [t('Constructor'), t('Bytes'), t('Count')], rows: ctorData.map((c) => [c.name, c.bytes, c.count]) })}>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ctorData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <XAxis type="number" tickFormatter={(v: number) => iecBytes(v)} stroke="#6b7280" fontSize={11} />
                      <YAxis type="category" dataKey="name" width={190} stroke="#6b7280" fontSize={11} tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 27)}…` : v)} />
                      <Tooltip formatter={(v: number) => iecBytes(v)} labelStyle={{ color: '#111827' }} />
                      <Bar dataKey="bytes" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="v8-ctors">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Constructor')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Count')}</th>
                      <th className="py-1.5 font-medium text-right">{t('Shallow bytes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.constructors.map((c) => (
                      <tr key={c.name}>
                        <td className="py-1.5 pr-3 font-mono text-xs break-all">{c.name}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmt.number(c.count)}</td>
                        <td className="py-1.5 text-right tabular-nums">{iecBytes(c.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title={t('By node type')}>
              <table className="w-full text-sm max-w-xl" data-testid="v8-types">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-1.5 pr-3 font-medium">{t('Type')}</th>
                    <th className="py-1.5 pr-3 font-medium text-right">{t('Count')}</th>
                    <th className="py-1.5 font-medium text-right">{t('Shallow bytes')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {summary.types.map((x) => (
                    <tr key={x.type}>
                      <td className="py-1.5 pr-3 font-mono text-xs">{x.type}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmt.number(x.count)}</td>
                      <td className="py-1.5 text-right tabular-nums">{iecBytes(x.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title={t('Duplicate strings')} icon={CopyIcon}>
              {summary.duplicateStrings.length > 0 ? (
                <>
                  <div className="text-lg font-bold text-black dark:text-white" data-testid="v8-dupes">
                    {t('{bytes} spent on repeat content', { bytes: iecBytes(summary.duplicateStringWastedBytes) })}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('Strings of 16 characters or more stored more than once, usually JSON parsed repeatedly or keys rebuilt per request. The waste counts every copy beyond the first.')}
                  </p>
                  <ul className="text-sm space-y-1">
                    {summary.duplicateStrings.map((d, i) => (
                      <li key={i} className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                        {t('{copies} copies of "{preview}" ({len} chars, {bytes} beyond the first)', { copies: fmt.number(d.copies), preview: d.preview, len: fmt.number(d.length), bytes: iecBytes(d.wastedBytes) })}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300" data-testid="v8-dupes">{t('No string of 16 characters or more is stored twice. Shorter strings are not checked; V8 often internalises them anyway.')}</p>
              )}
            </Panel>

            <Panel title={t('Biggest single nodes')}>
              <table className="w-full text-sm max-w-xl" data-testid="v8-biggest">
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {summary.biggest.map((b, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 font-mono text-xs">{b.type}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs break-all">{b.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{iecBytes(b.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="heap-snapshot-summary.txt" onCopy={copy} onDownload={download} />
                <Button type="button" variant="outline" size="sm" onClick={() => { setSummary(null); setFileName(''); }}>
                  {t('Clear')}
                </Button>
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="v8-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default NodeHeapSnapshotAnalyzer;
