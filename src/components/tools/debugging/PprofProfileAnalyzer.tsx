/**
 * pprof Profile Analyzer: drop a profile.pb.gz (or raw profile.proto) and
 * read sample types, duration and the top functions by flat and cumulative
 * value — the `go tool pprof top` view. All parsing is
 * src/lib/tools/pprof-inspect.ts (pinned in
 * src/test/tools/tier-analyzers.test.ts): the gzip wrapper is inflated by
 * the shared RFC 1951 inflate, the protobuf decoded field by field per
 * profile.proto. Flame graphs are deliberately out of scope; the page
 * points at `go tool pprof -http`. The file never leaves the tab.
 */
import React, { useState } from 'react';
import { Flame, FileText, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parsePprof, renderPprofSummary, type PprofFunc, type PprofSummary } from '@/lib/tools/pprof-inspect';
import { reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { DebugPage, DebugHeader, Panel, Notice, Stat, Chip, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';

/**
 * The synthetic two-function CPU profile from the test suite
 * (tier-analyzers.test.ts), gzipped so the sample exercises the in-browser
 * gunzip: cpu/nanoseconds, 2 samples, 10s duration, main.hot 10ms flat,
 * main.caller 3ms cum. Figures pinned in
 * src/test/tools/wk20261122-inspectors.render.test.tsx.
 */
const SAMPLE_BASE64 =
  'H4sIAAAAAAAAE+Ni4WAUYBLi5GJkFGI5MH81sxAXFxMjE5Ddu51RiY2DUYmJA0QzAWkmLZBiZiDJJMBixGDEnFxQasSdl5iXX5yanJ+XUmzEkZuYmaeXkV9ixA1mJSfm5KQWBTScWL9AFQCbxwWgagAAAA==';

function sampleBytes(): Uint8Array {
  const bin = atob(SAMPLE_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** "10.0ms", "1.2 KiB", or a localized count — matches the lib's own units. */
function human(v: number, unit: string, localize: (n: number) => string): string {
  if (unit === 'nanoseconds') return v >= 1e9 ? `${(v / 1e9).toFixed(2)}s` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}ms` : `${(v / 1e3).toFixed(0)}µs`;
  if (unit === 'bytes') return iecBytes(v);
  return localize(v);
}

const PprofProfileAnalyzer = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('pprof-profile-analyzer');
  const [summary, setSummary] = useState<PprofSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const inspect = (bytes: Uint8Array, name: string, source: string) => {
    setError('');
    setSummary(null);
    try {
      setSummary(parsePprof(bytes));
      setFileName(name);
      track('inspect', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    inspect(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
  };

  const text = summary ? renderPprofSummary(summary) : '';
  const vi = summary ? summary.sampleTypes.length - 1 : 0;
  const unit = summary ? summary.sampleTypes[vi].unit : '';
  const h = (v: number) => human(v, unit, fmt.number);

  const FuncTable = ({ rows, testid }: { rows: PprofFunc[]; testid: string }) => (
    <table className="w-full text-sm" data-testid={testid}>
      <thead>
        <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
          <th className="py-1.5 pr-3 font-medium text-right">{t('Flat')}</th>
          <th className="py-1.5 pr-3 font-medium text-right">{t('Cum')}</th>
          <th className="py-1.5 font-medium">{t('Function')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map((f, i) => (
          <tr key={`${f.name}-${i}`}>
            <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{h(f.flat)}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{h(f.cum)}</td>
            <td className="py-1.5 font-mono text-xs break-all">{f.name}{f.file ? <span className="text-gray-400"> · {f.file}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <DebugPage>
      <DebugHeader
        h1={t('pprof Profile Analyzer')}
        tagline={t('Sample types, duration and the top functions by flat and cumulative value from a pprof file, the go tool pprof top view, in your browser')}
        icon={Flame}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Profile')} icon={FileText}>
          <Notice
            tone="info"
            title={t('The gzip wrapper is inflated locally and the profile.proto decoded in this tab, so production profiles never leave your machine. For flame graphs, call graphs and source views, run go tool pprof -http on the same file.')}
          />
          <FileDrop
            id="pprof-file"
            label={fileName || t('Drop a pprof file here (profile.pb.gz, .pprof or raw proto)')}
            hint={t('Or click to choose one. Decoded on this page; never uploaded.')}
            accept=".gz,.pprof,.pb,.prof,application/octet-stream,application/gzip"
            onFile={onFile}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inspect(sampleBytes(), 'sample.pb.gz', 'sample')}>
              {t('Load a sample')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('The profile at a glance')} icon={Timer}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="pprof-stats">
                <Stat label={t('Samples')} value={fmt.number(summary.sampleCount)} sub={t('{n} functions', { n: fmt.number(summary.functionCount) })} />
                <Stat label={t('Duration')} value={summary.durationSeconds ? `${summary.durationSeconds.toFixed(1)}s` : '—'} sub={summary.timestamp ? summary.timestamp.toISOString().replace('T', ' ').slice(0, 16) : t('no capture time recorded')} />
                <Stat label={t('Sample types')} value={fmt.number(summary.sampleTypes.length)} sub={summary.sampleTypes.map((s) => s.type).join(', ')} />
                <Stat label={t('Total {type}', { type: summary.sampleTypes[vi].type })} value={h(summary.top.totals[vi] ?? 0)} sub={t('ranking value: the last sample type')} />
              </div>
              <div className="flex flex-wrap gap-2" {...reportInput(t('Profile'), `${fileName} · ${fmt.number(summary.sampleCount)} samples`)}>
                {summary.sampleTypes.map((s, i) => (
                  <Chip key={`${s.type}-${i}`} label={`${s.type}/${s.unit}`} value={human(summary.top.totals[i] ?? 0, s.unit, fmt.number)} />
                ))}
                {summary.mappingNames.length > 0 && <Chip label={t('Binary')} value={summary.mappingNames.join(', ')} />}
                {summary.periodType && summary.period !== undefined && <Chip label={t('Period')} value={`${human(summary.period, summary.periodType.unit, fmt.number)} ${summary.periodType.type}`} />}
              </div>
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title={t('Top by flat: where the value is burned')}>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('Flat is the value attributed to the function itself, at the leaf of the stack.')}</p>
                <FuncTable rows={summary.top.byFlat.slice(0, 10)} testid="pprof-flat" />
              </Panel>
              <Panel title={t('Top by cumulative: who owns the cost')}>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('Cum counts the function and everything it calls, so high cum with low flat marks a dispatcher.')}</p>
                <FuncTable rows={summary.top.byCum.slice(0, 10)} testid="pprof-cum" />
              </Panel>
            </div>

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="pprof-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="pprof-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default PprofProfileAnalyzer;
