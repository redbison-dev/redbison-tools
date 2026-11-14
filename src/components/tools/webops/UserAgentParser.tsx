import React, { useEffect, useMemo, useState } from 'react';
import { Fingerprint, ListTree, Bot, Info } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { WebPage, WebHeader, Panel, Stat, Segmented, PickField, CopyButton, LocalNote, useWebAnalytics } from './webopsShared';
import { parseUserAgent, SAMPLE_USER_AGENTS, WINDOWS_10_OR_11, type BotCategory, type DeviceKind, type ParsedUA } from '@/lib/tools/w500/webops-ua';
import { msg, useT } from '@/i18n';

/** Device types and bot categories as the parser names them, for display. */
const DEVICE_LABEL: Record<DeviceKind, string> = {
  desktop: msg('desktop'), mobile: msg('mobile'), tablet: msg('tablet'), smarttv: msg('smarttv'), console: msg('console'),
  wearable: msg('wearable'), embedded: msg('embedded'), xr: msg('xr'), bot: msg('bot'), unknown: msg('unknown'),
};
const BOT_CATEGORY_LABEL: Record<BotCategory, string> = {
  search: msg('search'), ai: msg('ai'), social: msg('social'), seo: msg('seo'), monitoring: msg('monitoring'),
  library: msg('library'), headless: msg('headless'), other: msg('other'),
};

type Hints = Record<string, unknown> | null;

function tally(values: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

export default function UserAgentParser() {
  const { t } = useT();
  const track = useWebAnalytics('user-agent-parser');
  const [mode, setMode] = useState('single');
  const [ua, setUa] = useState(SAMPLE_USER_AGENTS[0].ua);
  const [isMine, setIsMine] = useState(false);
  const [hints, setHints] = useState<Hints>(null);
  const [bulk, setBulk] = useState(SAMPLE_USER_AGENTS.map((s) => s.ua).join('\n'));

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      setUa(navigator.userAgent);
      setIsMine(true);
    }
    const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<Record<string, unknown>> } }).userAgentData;
    uad?.getHighEntropyValues?.(['platform', 'platformVersion', 'architecture', 'model', 'fullVersionList'])
      .then((h) => setHints(h))
      .catch(() => setHints(null));
  }, []);

  const parsed = useMemo(() => parseUserAgent(ua), [ua]);
  const device = (k: DeviceKind) => t(DEVICE_LABEL[k]);
  const botCategory = (c: BotCategory) => t(BOT_CATEGORY_LABEL[c]);
  const osVersion = (v?: string) => (v === WINDOWS_10_OR_11 ? t(v) : v);
  /** The lib's one-line summary, built in the page's language. */
  const summaryOf = (p: ParsedUA) => {
    let out = p.bot
      ? t('{name} ({category} bot, {owner})', { name: p.bot.name, category: botCategory(p.bot.category), owner: p.bot.owner })
      : p.browser.name ? [p.browser.name, p.browser.major].filter(Boolean).join(' ') : t('Unknown client');
    const os = p.os.name ? [p.os.name, osVersion(p.os.version)].filter(Boolean).join(' ') : '';
    if (os) out = t('{client} on {os}', { client: out, os });
    const dev = [p.device.vendor, p.device.model].filter(Boolean).join(' ');
    if (dev) out = t('{summary} ({device})', { summary: out, device: dev });
    if (!p.bot && p.device.type !== 'unknown') out = t('{summary} · {type}', { summary: out, type: device(p.device.type) });
    return out;
  };
  const notesOf = (p: ParsedUA) => p.notesMsg.map((n) => t(n.text, Object.fromEntries(Object.entries(n.vars).map(([k, v]) => [k, k === 'hint' ? t(String(v)) : v]))));
  /** uaReport (lib, also used over MCP) in the page's language. */
  const reportOf = (p: ParsedUA) => {
    const rows: [string, string | undefined][] = [
      [t('Summary'), summaryOf(p)],
      [t('Browser'), p.browser.name && `${p.browser.name} ${p.browser.version ?? ''}`.trim()],
      [t('Engine'), p.engine.name && `${p.engine.name} ${p.engine.version ?? ''}`.trim()],
      [t('OS'), p.os.name && `${p.os.name} ${osVersion(p.os.version) ?? ''}`.trim()],
      [t('Device'), [device(p.device.type), p.device.vendor, p.device.model].filter(Boolean).join(', ')],
      ['CPU', p.cpu.architecture],
      [t('Bot'), p.bot ? t('{name} ({category}, {owner})', { name: p.bot.name, category: botCategory(p.bot.category), owner: p.bot.owner }) : t('No')],
    ];
    return [...rows.filter((r) => r[1]).map((r) => t('{label}: {value}', { label: r[0], value: r[1]! })), ...notesOf(p).map((n) => t('Note: {note}', { note: n }))].join('\n');
  };
  const bulkRows = useMemo(
    () =>
      bulk
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 1000)
        .map((l) => parseUserAgent(l)),
    [bulk],
  );

  const fullVersions = hints && Array.isArray(hints.fullVersionList) ? (hints.fullVersionList as { brand: string; version: string }[]).filter((b) => !/Not.?A.?Brand/i.test(b.brand)) : [];

  return (
    <WebPage>
      <WebHeader h1={t('User Agent Parser')} icon={Fingerprint} tagline={t('Read the browser, engine, operating system, device and CPU from a User-Agent string, spot search, AI and SEO bots, and see what User-Agent reduction hides.')} />
      <div className="mt-6 mb-4">
        <Segmented label={t('Mode')} value={mode} onChange={setMode} options={[{ value: 'single', label: t('One user agent') }, { value: 'bulk', label: t('Many (one per line)') }]} />
      </div>
      {mode === 'single' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={t('User-Agent string')} icon={Fingerprint}>
            <div>
              <Label htmlFor="ua-in" className="text-sm font-medium text-black dark:text-white">
                {isMine && ua === (typeof navigator !== 'undefined' ? navigator.userAgent : '') ? t("Your browser's User-Agent (edit or paste another)") : t('User-Agent header value')}
              </Label>
              <Textarea id="ua-in" value={ua} onChange={(e) => setUa(e.target.value)} rows={4} className="mt-1 font-mono text-xs sm:text-sm bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setUa(navigator.userAgent);
                  track('use_mine');
                }}
              >
                {t('Use my browser')}
              </Button>
              <div className="w-full sm:w-64">
                <PickField
                  id="ua-sample"
                  label={t('Or load a sample')}
                  value=""
                  onChange={(v) => {
                    setUa(v);
                    track('load_sample');
                  }}
                  options={SAMPLE_USER_AGENTS.map((s) => ({ value: s.ua, label: t(s.label) }))}
                />
              </div>
            </div>
            <LocalNote>{t('Parsed in your browser with ua-parser-js. The string is not sent anywhere.')}</LocalNote>
          </Panel>
          <Panel title={t('Result')} icon={ListTree}>
            <p className="text-base font-semibold text-black dark:text-white" data-testid="ua-summary">
              {summaryOf(parsed)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t('Browser')} value={parsed.browser.name ?? t('Unknown')} sub={parsed.browser.version} tone="accent" />
              <Stat label={t('Engine')} value={parsed.engine.name ?? t('Unknown')} sub={parsed.engine.version} />
              <Stat label={t('Operating system')} value={parsed.os.name ?? t('Unknown')} sub={osVersion(parsed.os.version)} />
              <Stat label={t('Device type')} value={device(parsed.device.type)} sub={[parsed.device.vendor, parsed.device.model].filter(Boolean).join(' ') || undefined} />
              <Stat label="CPU" value={parsed.cpu.architecture ?? t('Not stated')} />
              <Stat label={t('Bot')} value={parsed.bot ? parsed.bot.name : t('No')} sub={parsed.bot ? `${botCategory(parsed.bot.category)} · ${parsed.bot.owner}` : undefined} />
            </div>
            {parsed.notesMsg.length > 0 && (
              <ul className="space-y-2">
                {notesOf(parsed).map((n) => (
                  <li key={n} className="flex gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
            <CopyButton text={reportOf(parsed)} label={t('Copy report')} onCopied={() => track('copy_report')} />
            {hints && isMine && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-1">
                <div className="font-semibold text-black dark:text-white">{t('Your browser\'s Client Hints')}</div>
                <p className="text-gray-700 dark:text-gray-200">
                  {hints.platform === 'Windows' && typeof hints.platformVersion === 'string'
                    ? t('Platform: {platform} {version} ({windows})', { platform: String(hints.platform ?? ''), version: String(hints.platformVersion ?? ''), windows: Number(hints.platformVersion.split('.')[0]) >= 13 ? 'Windows 11' : t('Windows 10 or earlier') })
                    : t('Platform: {platform} {version}', { platform: String(hints.platform ?? ''), version: String(hints.platformVersion ?? '') })}
                </p>
                {hints.architecture ? <p className="text-gray-700 dark:text-gray-200">{t('Architecture: {value}', { value: String(hints.architecture) })}</p> : null}
                {hints.model ? <p className="text-gray-700 dark:text-gray-200">{t('Model: {value}', { value: String(hints.model) })}</p> : null}
                {fullVersions.length > 0 && <p className="text-gray-700 dark:text-gray-200 break-words">{t('Full versions: {value}', { value: fullVersions.map((b) => `${b.brand} ${b.version}`).join(', ') })}</p>}
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('Read locally with navigator.userAgentData (Chromium browsers only).')}</p>
              </div>
            )}
          </Panel>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={t('User agents, one per line')} icon={ListTree}>
            <Textarea aria-label={t('User agents, one per line')} value={bulk} onChange={(e) => setBulk(e.target.value)} rows={12} className="font-mono text-xs bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('Paste a column from an access log or analytics export. Up to 1,000 lines are parsed.')}</p>
            <LocalNote />
          </Panel>
          <Panel title={t('{length} parsed', { length: bulkRows.length })} icon={Bot}>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              {(
                [
                  [t('Browsers'), tally(bulkRows.filter((r) => !r.bot).map((r) => r.browser.name ?? t('Unknown')))],
                  [t('Operating systems'), tally(bulkRows.filter((r) => !r.bot).map((r) => r.os.name ?? t('Unknown')))],
                  [t('Device types'), tally(bulkRows.map((r) => device(r.device.type)))],
                  [t('Bots'), tally(bulkRows.filter((r) => r.bot).map((r) => `${r.bot!.name} (${botCategory(r.bot!.category)})`))],
                ] as [string, [string, number][]][]
              ).map(([title, rows]) => (
                <div key={title}>
                  <div className="font-semibold text-black dark:text-white mb-1">{title}</div>
                  {rows.length ? (
                    <ul className="space-y-0.5">
                      {rows.map(([k, n]) => (
                        <li key={k} className="flex justify-between gap-2 text-gray-700 dark:text-gray-200">
                          <span className="break-words min-w-0">{k}</span>
                          <span className="font-mono">{n}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500">{t('None')}</p>
                  )}
                </div>
              ))}
            </div>
            <CopyButton
              text={[[t('summary'), t('browser'), t('os'), t('device'), t('bot')].join('\t'), ...bulkRows.map((r) => [summaryOf(r), r.browser.name ?? '', r.os.name ?? '', device(r.device.type), r.bot?.name ?? ''].join('\t'))].join('\n')}
              label={t('Copy as TSV')}
              onCopied={() => track('copy_bulk')}
            />
          </Panel>
        </div>
      )}
    </WebPage>
  );
}
