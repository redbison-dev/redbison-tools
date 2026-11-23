/**
 * Java GC Log Analyzer: paste or drop a -Xlog:gc* (JDK 9+) or JDK 8
 * PrintGC/PrintGCDetails log. All parsing is src/lib/tools/gc-log-analyzer.ts
 * (tested in src/test/tools/wk20261122-analyzers.test.ts); this component
 * renders warnings first, then pauses, throughput (only when the log spans
 * 5 seconds or more, same guard as the renderer), the heap-over-time chart
 * and the by-pause-type table. Nothing is uploaded.
 */
import React, { useMemo, useState } from 'react';
import { Gauge, FileText, TriangleAlert } from 'lucide-react';
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { parseGcLog, renderGcLogSummary, type GcLogSummary } from '@/lib/tools/gc-log-analyzer';
import { reportChart, reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { CodeArea, PRIVACY_NOTE } from '@/components/tools/devformat/shared';
import { DebugPage, DebugHeader, Panel, Notice, Stat, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';

/** A short unified G1 log (the -Xlog:gc default output shape, JDK 17). */
const SAMPLE = `[0.005s][info][gc] Using G1
[0.512s][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 24M->4M(64M) 2.133ms
[1.218s][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 28M->6M(64M) 2.410ms
[2.004s][info][gc] GC(2) Pause Young (Normal) (G1 Evacuation Pause) 30M->7M(64M) 3.002ms
[2.812s][info][gc] GC(3) Pause Young (Concurrent Start) (Metadata GC Threshold) 33M->8M(64M) 3.310ms
[2.950s][info][gc] GC(4) Pause Remark 9M->9M(64M) 1.102ms
[3.120s][info][gc] GC(5) Pause Cleanup 10M->10M(64M) 0.044ms
[3.804s][info][gc] GC(6) Pause Young (Prepare Mixed) (G1 Evacuation Pause) 36M->9M(64M) 2.900ms
[4.502s][info][gc] GC(7) Pause Young (Mixed) (G1 Evacuation Pause) 32M->8M(64M) 3.514ms
[5.210s][info][gc] GC(8) Pause Full (System.gc()) 30M->6M(64M) 15.220ms
[6.120s][info][gc] GC(9) Pause Young (Normal) (G1 Evacuation Pause) 25M->5M(64M) 2.330ms
`;

const GcLogAnalyzer = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('gc-log-analyzer');
  const [input, setInput] = useState('');
  const [summary, setSummary] = useState<GcLogSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const analyze = (text: string, source: string) => {
    setError('');
    setSummary(null);
    if (!text.trim()) {
      setError(t('Paste a GC log first, or drop the file -Xlog:gc wrote.'));
      return;
    }
    try {
      setSummary(parseGcLog(text));
      track('analyze', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    setFileName(f.name);
    const text = await f.text();
    setInput(text);
    analyze(text, 'file');
  };

  const text = useMemo(() => (summary ? renderGcLogSummary(summary) : ''), [summary]);
  // Sawtooth: each collection contributes (at, before) then (at, after), so
  // the line drops exactly where the pause reclaimed memory.
  const trend = useMemo(
    () =>
      (summary?.events ?? []).flatMap((e) => [
        { t: e.at, used: e.beforeBytes, committed: e.totalBytes > 0 ? e.totalBytes : undefined },
        { t: e.at, used: e.afterBytes, committed: e.totalBytes > 0 ? e.totalBytes : undefined },
      ]),
    [summary],
  );
  const longEnough = (summary?.spanSeconds ?? 0) >= 5;
  const p = summary?.pausePercentiles;

  return (
    <DebugPage>
      <DebugHeader
        h1={t('Java GC Log Analyzer')}
        tagline={t('Pause percentiles, throughput, allocation rate and the heap trend from a JVM GC log, parsed in your browser')}
        icon={Gauge}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('GC log')} icon={FileText}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CodeArea
              id="gc-log-input"
              label={t('Paste the log')}
              value={input}
              onChange={setInput}
              rows={10}
              placeholder={t('JDK 9+ unified lines (-Xlog:gc*) or JDK 8 [GC (cause) ...K->...K(...K), secs] lines')}
            />
            <div className="flex flex-col gap-3">
              <FileDrop
                id="gc-log-file"
                label={fileName || t('Drop a GC log file here')}
                hint={t('Or click to choose one. Text files of any size; nothing is uploaded.')}
                accept=".log,.txt,text/plain"
                onFile={onFile}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="tool-button" onClick={() => analyze(input, 'paste')}>
                  {t('Analyze log')}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setInput(SAMPLE); setFileName(''); analyze(SAMPLE, 'sample'); }}>
                  {t('Load a sample')}
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t(PRIVACY_NOTE)}</p>
            </div>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            {summary.warnings.length > 0 ? (
              <div data-testid="gc-warnings" className="space-y-2">
                {summary.warnings.map((w, i) => (
                  <Notice key={i} tone="warn" title={w} />
                ))}
              </div>
            ) : (
              <Notice tone="ok" title={t('No warning signs: no frequent Full GCs, evacuation failures, Metaspace-forced collections or second-long pauses in this log.')} />
            )}

            <Panel title={t('Collections and pauses')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="gc-stats">
                <Stat label={t('Collections')} value={fmt.number(summary.events.length)} sub={t('{n} full', { n: summary.fullGcCount })} tone={summary.fullGcCount > 0 ? 'accent' : 'default'} />
                <Stat label={t('Pause p50 / p99')} value={p ? `${p.p50.toFixed(1)} / ${p.p99.toFixed(1)} ms` : ''} sub={p ? t('max {n} ms', { n: p.max.toFixed(1) }) : ''} />
                {longEnough ? (
                  <Stat label={t('Throughput')} value={`${(summary.throughput * 100).toFixed(2)}%`} sub={t('time not spent paused')} />
                ) : (
                  <Stat label={t('Throughput')} value={t('n/a')} sub={t('log spans under 5 s; too short for an honest figure')} />
                )}
                <Stat
                  label={t('Allocation rate')}
                  value={summary.allocationRateBytesPerSec ? `${iecBytes(summary.allocationRateBytesPerSec)}/s` : t('n/a')}
                  sub={t('mean heap growth between collections')}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400" {...reportInput(t('Log'), `${fileName || t('pasted')} · ${summary.format}${summary.collector ? ` · ${summary.collector}` : ''}`)}>
                {summary.format === 'unified' ? t('JDK 9+ unified log') : t('JDK 8 PrintGC log')}
                {summary.collector ? ` · ${summary.collector}` : ''}
                {' · '}
                {t('{n} s of log', { n: summary.spanSeconds.toFixed(1) })}
                {' · '}
                {t('total paused {n} s', { n: (summary.totalPauseMs / 1000).toFixed(2) })}
              </p>
            </Panel>

            <Panel title={t('Heap over time')}>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('Used heap at the start and end of every collection. The healthy shape is a sawtooth that returns to the same floor; a floor that climbs collection after collection is a leak or a heap that is too small.')}
              </p>
              <div {...reportChart(t('Heap over time'), { head: [t('Seconds'), t('Before bytes'), t('After bytes'), t('Heap bytes')], rows: summary.events.map((e) => [e.at, e.beforeBytes, e.afterBytes, e.totalBytes]) })}>
                <div className="h-72 w-full" data-testid="gc-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trend} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
                      <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => `${v.toFixed(0)}s`} stroke="#6b7280" fontSize={11} />
                      <YAxis tickFormatter={(v: number) => iecBytes(v)} stroke="#6b7280" fontSize={11} width={70} />
                      <Tooltip
                        formatter={(v: number) => iecBytes(v)}
                        labelFormatter={(v: number) => `${Number(v).toFixed(2)} s`}
                        labelStyle={{ color: '#111827' }}
                      />
                      <Area type="linear" dataKey="used" name={t('used heap')} stroke="#dc2626" fill="#dc2626" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
                      <Line type="stepAfter" dataKey="committed" name={t('committed heap')} stroke="#6b7280" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('Peak used {peak}; {final} left after the last collection; {reclaimed} reclaimed over the whole log.', {
                  peak: iecBytes(summary.peakHeapBytes),
                  final: summary.finalHeapBytes ? iecBytes(summary.finalHeapBytes) : '-',
                  reclaimed: iecBytes(summary.reclaimedBytes),
                })}
              </p>
            </Panel>

            <Panel title={t('By pause type')} icon={TriangleAlert}>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('Young pauses are the routine cost. Watch the Full line: a Full GC compacts the whole heap in one stop-the-world pause, and more than an occasional one means the heap is too small for the live set.')}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="gc-types">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Pause type')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Count')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Total')}</th>
                      <th className="py-1.5 font-medium text-right">{t('Max')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.byType.map((x) => (
                      <tr key={x.type} className={x.type.startsWith('Pause Full') ? 'text-red-700 dark:text-red-300' : ''}>
                        <td className="py-1.5 pr-3 font-mono text-xs break-all">{x.type}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{x.count}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{x.totalMs.toFixed(0)} ms</td>
                        <td className="py-1.5 text-right tabular-nums">{x.maxMs.toFixed(1)} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="gc-log-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="gc-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default GcLogAnalyzer;
