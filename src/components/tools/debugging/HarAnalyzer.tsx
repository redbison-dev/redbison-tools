/**
 * HAR File Analyzer: drop or paste a DevTools network export. All parsing
 * is src/lib/tools/har-analyzer.ts (tested in
 * src/test/tools/wk20261122-analyzers.test.ts); this component renders the
 * summary: totals and third-party share first, then types, phases, hosts,
 * slowest, heaviest and the findings (errors, redirects, uncompressed
 * text, cache hits). A HAR carries cookies, auth headers and full URLs,
 * so nothing here is uploaded; the file is read and discarded in the tab.
 */
import React, { useMemo, useState } from 'react';
import { Globe, FileText, TriangleAlert, ArrowRightLeft, Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { parseHar, renderHarSummary, type HarSummary } from '@/lib/tools/har-analyzer';
import { reportChart, reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { CodeArea } from '@/components/tools/devformat/shared';
import { DebugPage, DebugHeader, Panel, Notice, Stat, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';

/** A small spec-shaped HAR: one page, six requests, the usual findings. */
const SAMPLE = JSON.stringify({
  log: {
    version: '1.2',
    creator: { name: 'WebInspector', version: '537.36' },
    pages: [{ startedDateTime: '2026-11-18T09:14:03.123Z', id: 'page_1', title: 'https://news.example.org/', pageTimings: { onContentLoad: 390, onLoad: 980 } }],
    entries: [
      {
        startedDateTime: '2026-11-18T09:14:03.123Z', time: 240,
        request: { method: 'GET', url: 'https://news.example.org/', headers: [], headersSize: -1, bodySize: 0 },
        response: { status: 200, headers: [], content: { size: 42000, mimeType: 'text/html' }, headersSize: -1, bodySize: 12400, _transferSize: 12800 },
        timings: { blocked: 3, dns: 14, ssl: 24, connect: 38, send: 1, wait: 160, receive: 24 },
      },
      {
        startedDateTime: '2026-11-18T09:14:03.400Z', time: 48,
        request: { method: 'GET', url: 'https://news.example.org/styles/site.css', headers: [], headersSize: -1, bodySize: 0 },
        response: { status: 200, headers: [], content: { size: 16400, mimeType: 'text/css' }, headersSize: -1, bodySize: 16400, _transferSize: 16620 },
        timings: { blocked: 1, dns: -1, ssl: -1, connect: -1, send: 0, wait: 36, receive: 11 },
      },
      {
        startedDateTime: '2026-11-18T09:14:03.420Z', time: 180,
        request: { method: 'GET', url: 'https://news.example.org/scripts/app.js', headers: [], headersSize: -1, bodySize: 0 },
        response: { status: 200, headers: [], content: { size: 280000, mimeType: 'application/javascript' }, headersSize: -1, bodySize: 78000, _transferSize: 78350 },
        timings: { blocked: 1, dns: -1, ssl: -1, connect: -1, send: 0, wait: 70, receive: 109 },
      },
      {
        startedDateTime: '2026-11-18T09:14:03.600Z', time: 150,
        request: { method: 'GET', url: 'https://cdn.imagehost-example.net/hero.jpg', headers: [], headersSize: -1, bodySize: 0 },
        response: { status: 200, headers: [], content: { size: 152000, mimeType: 'image/jpeg' }, headersSize: -1, bodySize: 152000, _transferSize: 152300 },
        timings: { blocked: 2, dns: 28, ssl: 22, connect: 41, send: 0, wait: 45, receive: 34 },
      },
      {
        startedDateTime: '2026-11-18T09:14:03.700Z', time: 95,
        request: { method: 'GET', url: 'https://news.example.org/feed-old', headers: [], headersSize: -1, bodySize: 0 },
        response: { status: 301, headers: [{ name: 'location', value: 'https://news.example.org/feed' }], content: { size: 0, mimeType: '' }, redirectURL: 'https://news.example.org/feed', headersSize: 170, bodySize: 0, _transferSize: 170 },
        timings: { blocked: 1, dns: -1, ssl: -1, connect: -1, send: 0, wait: 94, receive: 0 },
      },
      {
        startedDateTime: '2026-11-18T09:14:03.850Z', time: 310,
        request: { method: 'GET', url: 'https://news.example.org/api/comments', headers: [], headersSize: -1, bodySize: 0 },
        response: { status: 503, headers: [], content: { size: 90, mimeType: 'application/json' }, headersSize: -1, bodySize: 90, _transferSize: 210 },
        timings: { blocked: 1, dns: -1, ssl: -1, connect: -1, send: 0, wait: 308, receive: 1 },
      },
    ],
  },
});

const HarAnalyzer = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('har-analyzer');
  const [input, setInput] = useState('');
  const [summary, setSummary] = useState<HarSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const analyze = (text: string, source: string) => {
    setError('');
    setSummary(null);
    if (!text.trim()) {
      setError(t('Paste the HAR JSON first, or drop the .har file DevTools saved.'));
      return;
    }
    try {
      setSummary(parseHar(text));
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

  const text = useMemo(() => (summary ? renderHarSummary(summary) : ''), [summary]);
  const thirdPct = summary && summary.totalTransferBytes > 0
    ? Math.round((100 * summary.thirdPartyShare.transferBytes) / summary.totalTransferBytes)
    : 0;
  const typeRows = (summary?.byType ?? []).map((x) => ({ name: x.type, bytes: x.transferBytes, count: x.count }));
  const phaseRows = summary
    ? (Object.entries(summary.phaseTotals) as [string, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    : [];
  const page = summary?.pages[0];

  return (
    <DebugPage>
      <DebugHeader
        h1={t('HAR File Analyzer')}
        tagline={t('Totals, third-party share, slow and heavy requests from a DevTools network export, parsed in your browser')}
        icon={Globe}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('HAR file')} icon={FileText}>
          <Notice
            tone="info"
            title={t('A HAR records cookies, auth headers, full URLs and often request bodies. This page parses it locally and uploads nothing; close the tab and it is gone. Prefer the "sanitized" HAR export, which Chrome strips of Cookie, Set-Cookie and Authorization headers.')}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CodeArea
              id="har-input"
              label={t('Paste the HAR JSON')}
              value={input}
              onChange={setInput}
              rows={10}
              placeholder={t('DevTools → Network → Export HAR. The file is one JSON document.')}
            />
            <div className="flex flex-col gap-3">
              <FileDrop
                id="har-file"
                label={fileName || t('Drop a .har file here')}
                hint={t('Or click to choose one. Parsed on this page; never uploaded.')}
                accept=".har,application/json"
                onFile={onFile}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="tool-button" onClick={() => analyze(input, 'paste')}>
                  {t('Analyze HAR')}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setInput(SAMPLE); setFileName(''); analyze(SAMPLE, 'sample'); }}>
                  {t('Load a sample')}
                </Button>
              </div>
            </div>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('The page at a glance')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="har-stats">
                <Stat label={t('Requests')} value={fmt.number(summary.requestCount)} sub={summary.cacheHits ? t('{n} from cache', { n: summary.cacheHits }) : t('none from cache')} />
                <Stat label={t('Transferred')} value={iecBytes(summary.totalTransferBytes)} sub={t('{n} decoded', { n: iecBytes(summary.totalContentBytes) })} />
                <Stat label={t('Third-party')} value={`${thirdPct}%`} sub={t('{n} requests', { n: summary.thirdPartyShare.requests })} tone={thirdPct >= 40 ? 'accent' : 'default'} />
                <Stat label={t('Span')} value={`${(summary.spanMs / 1000).toFixed(1)} s`} sub={page?.onLoadMs ? t('load {n} s', { n: (page.onLoadMs / 1000).toFixed(2) }) : t('first request to last byte')} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400" {...reportInput(t('Capture'), `${page?.title ?? ''} · ${fileName || t('pasted')}`)}>
                {summary.firstPartyHost
                  ? t('First party: {host} (same base domain). Everything else counts as third-party.', { host: summary.firstPartyHost })
                  : t('No document request found; the first entry sets the first party.')}
                {page?.onContentLoadMs ? ` · ${t('DOMContentLoaded {n} s', { n: (page.onContentLoadMs / 1000).toFixed(2) })}` : ''}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700 dark:text-gray-300" data-testid="har-status">
                {Object.entries(summary.byStatusClass).sort().map(([cls, n]) => (
                  <span key={cls} className="font-mono">{n} × {cls}</span>
                ))}
              </div>
            </Panel>

            <Panel title={t('Transfer by type')}>
              <div {...reportChart(t('Transfer by type'), { head: [t('Type'), t('Bytes'), t('Requests')], rows: typeRows.map((r) => [r.name, r.bytes, r.count]) })}>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeRows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <XAxis type="number" tickFormatter={(v: number) => iecBytes(v)} stroke="#6b7280" fontSize={11} />
                      <YAxis type="category" dataKey="name" width={90} stroke="#6b7280" fontSize={11} />
                      <Tooltip formatter={(v: number) => iecBytes(v)} labelStyle={{ color: '#111827' }} />
                      <Bar dataKey="bytes" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Panel>

            <Panel title={t('Where the time went')} icon={Timer}>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('Each request\'s phases, summed over all requests. Requests overlap, so these sums exceed the wall-clock span; they say where the milliseconds pile up, not how long the page took. A timing of -1 in the file means the phase did not apply (a reused connection has no DNS or connect) and is left out rather than counted as zero.')}
              </p>
              <div {...reportChart(t('Phase totals'), { head: [t('Phase'), t('Milliseconds')], rows: phaseRows })}>
                <table className="w-full text-sm max-w-md" data-testid="har-phases">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {phaseRows.map(([ph, v]) => (
                      <tr key={ph}>
                        <td className="py-1.5 pr-3 font-mono text-xs">{ph}</td>
                        <td className="py-1.5 text-right tabular-nums">{(v / 1000).toFixed(2)} s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('Per the HAR spec, ssl time is also included in connect, so those two rows overlap instead of adding.')}
              </p>
            </Panel>

            <Panel title={t('Hosts')}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="har-hosts">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Host')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Requests')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Transfer')}</th>
                      <th className="py-1.5 font-medium">{t('Party')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.hosts.map((x) => (
                      <tr key={x.host}>
                        <td className="py-1.5 pr-3 font-mono text-xs break-all">{x.host}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{x.count}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{iecBytes(x.transferBytes)}</td>
                        <td className="py-1.5 text-xs">{x.thirdParty ? t('third-party') : t('first party')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title={t('Slowest requests')}>
                <table className="w-full text-sm" data-testid="har-slowest">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.slowest.map((r) => (
                      <tr key={r.url + r.timeMs}>
                        <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{r.timeMs.toFixed(0)} ms</td>
                        <td className="py-1.5 pr-3 tabular-nums">{r.status || t('failed')}</td>
                        <td className="py-1.5 font-mono text-xs break-all">{r.url}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
              <Panel title={t('Heaviest requests')}>
                <table className="w-full text-sm" data-testid="har-biggest">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.biggest.map((r) => (
                      <tr key={r.url + r.transferBytes}>
                        <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{iecBytes(r.transferBytes)}</td>
                        <td className="py-1.5 font-mono text-xs break-all">{r.url}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>

            {(summary.errors.length > 0 || summary.redirects.length > 0 || summary.uncompressedText.length > 0) && (
              <Panel title={t('Findings')} icon={TriangleAlert}>
                {summary.errors.length > 0 && (
                  <div data-testid="har-errors">
                    <Notice tone="error" title={t('{n} failed or error responses', { n: summary.errors.length })} items={summary.errors.slice(0, 8).map((e) => `${e.status || t('failed')}  ${e.url}`)} />
                  </div>
                )}
                {summary.redirects.length > 0 && (
                  <div data-testid="har-redirects" className="mt-3">
                    <Notice tone="warn" title={t('{n} redirects: each costs a round trip before the real request starts', { n: summary.redirects.length })} items={summary.redirects.slice(0, 8).map((r) => `${r.status}  ${r.from} → ${r.to}`)} />
                  </div>
                )}
                {summary.uncompressedText.length > 0 && (
                  <div data-testid="har-uncompressed" className="mt-3">
                    <Notice
                      tone="warn"
                      title={t('Text served without compression (transfer about equals decoded size over 10 KB)')}
                      items={summary.uncompressedText.map((u) => `${iecBytes(u.contentBytes)}  ${u.url}`)}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  {t('Compression is judged from sizes, not headers: a recorder that drops header detail still gets the right verdict.')}
                </div>
              </Panel>
            )}

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="har-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="har-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default HarAnalyzer;
