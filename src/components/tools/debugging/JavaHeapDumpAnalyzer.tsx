/**
 * Java Heap Dump Analyzer: drop an .hprof file. The file is streamed
 * through src/lib/tools/hprof-summary.ts in 8 MiB slices read with
 * File.slice(), so a dump far larger than browser memory still summarises
 * — only aggregates are kept, never the object graph. Parsing happens
 * here in the tab; the dump never leaves the machine.
 */
import React, { useRef, useState } from 'react';
import { MemoryStick, FileText, Copy as CopyIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { HprofParser, renderHprofSummary, type HprofSummary } from '@/lib/tools/hprof-summary';
import { reportChart, reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { DebugPage, DebugHeader, Panel, Notice, Stat, FileDrop, ParseProgress, CopyDownload, useDevActions, iecBytes, isGzip } from './shared';

const SLICE = 8 * 1024 * 1024;

const JavaHeapDumpAnalyzer = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('java-heap-dump-analyzer');
  const [summary, setSummary] = useState<HprofSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** Bumped when a new file starts, so an abandoned parse stops writing state. */
  const run = useRef(0);

  const onFile = async (f: File) => {
    const mine = ++run.current;
    setSummary(null);
    setError('');
    setFileName(f.name);
    setProgress({ done: 0, total: f.size });
    track('parse_hprof', { sizeMiB: Math.round(f.size / 1024 / 1024) });
    try {
      const parser = new HprofParser();
      for (let off = 0; off < f.size; off += SLICE) {
        const bytes = new Uint8Array(await f.slice(off, off + SLICE).arrayBuffer());
        if (run.current !== mine) return;
        if (off === 0 && isGzip(bytes)) {
          throw new Error(t('This file is gzip-compressed (jcmd GC.heap_dump -gz writes these). Decompress it first: gunzip {name}', { name: f.name }));
        }
        parser.push(bytes);
        setProgress({ done: Math.min(off + SLICE, f.size), total: f.size });
        // Yield so the progress bar paints between slices.
        await new Promise((r) => setTimeout(r, 0));
      }
      if (run.current !== mine) return;
      setSummary(parser.finish());
    } catch (e) {
      if (run.current === mine) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (run.current === mine) setProgress(null);
    }
  };

  const text = summary ? renderHprofSummary(summary) : '';
  const chartData = (summary?.classes ?? []).slice(0, 10).map((c) => ({ name: c.name, bytes: c.bytes, count: c.count }));

  return (
    <DebugPage>
      <DebugHeader
        h1={t('Java Heap Dump Analyzer')}
        tagline={t('Class histogram, biggest objects and duplicate-array waste from an .hprof file, streamed in your browser')}
        icon={MemoryStick}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Heap dump file')} icon={FileText}>
          <FileDrop
            id="hprof-file"
            label={fileName || t('Drop an .hprof heap dump here')}
            hint={t('From jcmd <pid> GC.heap_dump, jmap -dump or HeapDumpOnOutOfMemoryError. Multi-GB dumps work: the file is read in 8 MiB slices and never loaded whole. It is parsed on this page and not uploaded.')}
            accept=".hprof,.bin,application/octet-stream"
            onFile={onFile}
            disabled={progress !== null}
          />
          {progress && <ParseProgress done={progress.done} total={progress.total} label={t('Reading the dump')} />}
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('Heap at a glance')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="hp-stats">
                <Stat label={t('Objects')} value={fmt.number(summary.totalObjects)} />
                <Stat label={t('Shallow bytes')} value={iecBytes(summary.totalBytes)} sub={t('data bytes only, no object headers')} tone="accent" />
                <Stat label={t('Loaded classes')} value={fmt.number(summary.classCount)} />
                <Stat label={t('GC roots')} value={fmt.number(summary.gcRoots)} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400" {...reportInput(t('File'), `${fileName} (${summary.format})`)}>
                {summary.format}
                {summary.timestamp ? ` · ${t('dumped {date}', { date: summary.timestamp.toISOString().replace('T', ' ').slice(0, 19) })}` : ''}
                {' · '}
                {t('{n}-byte identifiers', { n: summary.identifierSize })}
              </p>
              <Notice
                tone="info"
                title={t('Sizes are shallow: the field or element bytes the dump records, the figure jmap -histo prints. The HPROF format carries no per-object header, and this summary builds no dominator tree, so there are no retained sizes. When you need to know what a single object keeps alive, open the dump in Eclipse MAT or VisualVM.')}
              />
            </Panel>

            <Panel title={t('Top classes by shallow bytes')}>
              <div {...reportChart(t('Top classes by shallow bytes'), { head: [t('Class'), t('Bytes'), t('Instances')], rows: chartData.map((c) => [c.name, c.bytes, c.count]) })}>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <XAxis type="number" tickFormatter={(v: number) => iecBytes(v)} stroke="#6b7280" fontSize={11} />
                      <YAxis type="category" dataKey="name" width={190} stroke="#6b7280" fontSize={11} tickFormatter={(v: string) => (v.length > 28 ? `…${v.slice(-27)}` : v)} />
                      <Tooltip formatter={(v: number) => iecBytes(v)} labelStyle={{ color: '#111827' }} />
                      <Bar dataKey="bytes" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="hp-classes">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Class')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Instances')}</th>
                      <th className="py-1.5 font-medium text-right">{t('Shallow bytes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.classes.slice(0, 25).map((c) => (
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

            <Panel title={t('Duplicate primitive arrays')} icon={CopyIcon}>
              {summary.duplicates.length > 0 ? (
                <>
                  <div className="text-lg font-bold text-black dark:text-white" data-testid="hp-dupes">
                    {t('{bytes} spent on repeat content', { bytes: iecBytes(summary.duplicateWastedBytes) })}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('Arrays of 64 bytes or more whose content is byte-for-byte identical, the signature of caches that re-read the same data and of strings built repeatedly. The waste counts every copy beyond the first.')}
                  </p>
                  <ul className="text-sm space-y-1">
                    {summary.duplicates.map((d, i) => (
                      <li key={i} className="font-mono text-xs text-gray-700 dark:text-gray-300">
                        {t('{copies} copies of a {type} of {len} elements ({bytes} beyond the first)', { copies: fmt.number(d.copies), type: d.type, len: fmt.number(d.length), bytes: iecBytes(d.wastedBytes) })}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300" data-testid="hp-dupes">{t('No duplicated primitive arrays of 64 bytes or more. Smaller arrays are not hashed; deduplicating them rarely pays.')}</p>
              )}
            </Panel>

            <Panel title={t('Biggest single objects')}>
              <table className="w-full text-sm max-w-xl" data-testid="hp-biggest">
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {summary.biggest.map((b, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 font-mono text-xs break-all">{b.className}</td>
                      <td className="py-1.5 text-right tabular-nums">{iecBytes(b.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="heap-dump-summary.txt" onCopy={copy} onDownload={download} />
                <Button type="button" variant="outline" size="sm" onClick={() => { setSummary(null); setFileName(''); }}>
                  {t('Clear')}
                </Button>
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="hp-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default JavaHeapDumpAnalyzer;
