import React, { useMemo, useState } from 'react';
import { Globe, Search, ArrowRightLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { WebPage, WebHeader, Panel, Chip, CopyButton, Segmented, LocalNote, useWebAnalytics } from './webopsShared';
import {
  HTTP_STATUSES,
  STATUS_CLASSES,
  searchStatuses,
  statusClass,
  isHeuristicallyCacheable,
  chooseRedirect,
  getStatus,
  type StatusClass,
  type HttpStatus,
} from '@/lib/tools/w500/webops-http';
import { msg, useT } from '@/i18n';

const CLASS_TONE: Record<StatusClass, string> = {
  '1xx': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100',
  '2xx': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  '3xx': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  '4xx': 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  '5xx': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

function StatusCard({ s, open, onToggle }: { s: HttpStatus; open: boolean; onToggle: () => void }) {
  const { t } = useT();
  const cls = statusClass(s.code)!;
  // statusToText (lib, also used over MCP) in the page's language.
  const copyText = () => [
    `${s.code} ${s.name}`,
    s.official
      ? (s.deprecated ? t('Spec: {spec} (deprecated or reserved)', { spec: s.spec }) : t('Spec: {spec}', { spec: s.spec }))
      : (s.deprecated ? t('Spec: {spec} (unofficial) (deprecated or reserved)', { spec: s.spec }) : t('Spec: {spec} (unofficial)', { spec: s.spec })),
    t('Meaning: {summary}', { summary: t(s.summary) }),
    t('When to use: {usage}', { usage: t(s.usage) }),
    ...(s.note ? [t('Note: {note}', { note: t(s.note) })] : []),
    ...(isHeuristicallyCacheable(s.code) ? [t('Cacheable by default (RFC 9110 §15.1).')] : []),
  ].join('\n');
  return (
    <li className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-w-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left p-3 flex gap-3 items-start">
        <span className={`font-mono font-bold text-base rounded-lg px-2 py-1 shrink-0 ${CLASS_TONE[cls]}`}>{s.code}</span>
        <span className="min-w-0">
          <span className="font-semibold text-black dark:text-white break-words">{s.name}</span>
          {!s.official && <span className="ml-2 text-[11px] uppercase tracking-wide text-purple-700 dark:text-purple-300">{t('unofficial')}</span>}
          {s.deprecated && <span className="ml-2 text-[11px] uppercase tracking-wide text-gray-500">{t('deprecated')}</span>}
          <span className="block text-sm text-gray-600 dark:text-gray-300">{t(s.summary)}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
          <p>
            <strong>{t('When to use:')}</strong> {t(s.usage)}
          </p>
          {s.note && (
            <p>
              <strong>{t('Watch out:')}</strong> {t(s.note)}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isHeuristicallyCacheable(s.code)
              ? t('Defined in {spec} · cacheable by default (RFC 9110 §15.1)', { spec: s.spec })
              : t('Defined in {spec}', { spec: s.spec })}
          </p>
          <CopyButton text={copyText()} label={t('Copy details')} />
        </div>
      )}
    </li>
  );
}

export default function HttpStatusCodes() {
  const { t } = useT();
  const track = useWebAnalytics('http-status-codes');
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<StatusClass[]>([]);
  const [unofficial, setUnofficial] = useState(true);
  const [open, setOpen] = useState<number | null>(404);
  const [perm, setPerm] = useState('yes');
  const [keep, setKeep] = useState('no');

  const results = useMemo(() => searchStatuses({ query, classes, includeUnofficial: unofficial }), [query, classes, unofficial]);
  const qNum = /^\d{3}$/.test(query.trim()) ? Number(query.trim()) : null;
  // describeUnknown (lib) in the page's language.
  const unknownBase = qNum !== null && results.length === 0 && statusClass(qNum) ? getStatus(Math.floor(qNum / 100) * 100) : undefined;
  const unknownNote = qNum !== null && results.length === 0 && statusClass(qNum)
    ? t('{code} is not a registered status code. RFC 9110 §15 says a client must treat an unrecognised code as the x00 code of its class, so {code} is handled like {base}.', { code: qNum, base: `${unknownBase?.code} ${unknownBase?.name}` })
    : null;
  const redirect = getStatus(chooseRedirect(perm === 'yes', keep === 'yes'))!;
  const counts = useMemo(() => Object.fromEntries(STATUS_CLASSES.map((c) => [c.id, HTTP_STATUSES.filter((s) => statusClass(s.code) === c.id).length])), []);

  return (
    <WebPage>
      <WebHeader h1={t('HTTP Status Codes')} icon={Globe} tagline={t('Every registered HTTP status code with its meaning, the RFC section that defines it and when to send it, plus the nginx and Cloudflare codes you meet in logs.')} />
      <div className="grid gap-6 lg:grid-cols-3 mt-6">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <Panel title={t('Find a status code')} icon={Search}>
            <div>
              <Label htmlFor="status-q" className="text-sm font-medium text-black dark:text-white">
                {t('Code, class or words')}
              </Label>
              <Input
                id="status-q"
                value={query}
                placeholder={t('404, 5xx, redirect, rate limit...')}
                onChange={(e) => {
                  setQuery(e.target.value);
                  const n = Number(e.target.value.trim());
                  if (/^\d{3}$/.test(e.target.value.trim())) {
                    setOpen(n);
                    track('search_code', { code: n });
                  }
                }}
                className="mt-1 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600"
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('Filter by class')}>
              {STATUS_CLASSES.map((c) => (
                <Chip key={c.id} active={classes.includes(c.id)} title={t(c.desc)} onClick={() => setClasses((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}>
                  {t('{id} {name} ({count})', { id: c.id, name: t(c.name), count: counts[c.id] })}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Switch id="unofficial" checked={unofficial} onCheckedChange={setUnofficial} />
              <Label htmlFor="unofficial" className="text-sm text-gray-700 dark:text-gray-200">
                {t('Include unofficial codes (nginx, Cloudflare, Laravel)')}
              </Label>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
              {t(msg.plural(results.length, { one: '{length} code', other: '{length} codes' }), { length: results.length })}
            </p>
            {unknownNote && <p className="text-sm rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-900 dark:text-amber-200">{unknownNote}</p>}
            <ul className="space-y-2">
              {results.map((s) => (
                <StatusCard key={s.code} s={s} open={open === s.code} onToggle={() => setOpen(open === s.code ? null : s.code)} />
              ))}
            </ul>
          </Panel>
        </div>
        <div className="space-y-4 min-w-0">
          <Panel title={t('Which redirect code?')} icon={ArrowRightLeft}>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-black dark:text-white mb-1">{t('Is the move permanent?')}</p>
                <Segmented label={t('Permanent move')} value={perm} onChange={setPerm} options={[{ value: 'yes', label: t('Permanent') }, { value: 'no', label: t('Temporary') }]} />
              </div>
              <div>
                <p className="text-sm font-medium text-black dark:text-white mb-1">{t('Must POST or PUT stay POST or PUT?')}</p>
                <Segmented label={t('Keep method')} value={keep} onChange={setKeep} options={[{ value: 'no', label: t('No (links, pages)') }, { value: 'yes', label: t('Yes (APIs, forms)') }]} />
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-3">
                <div className="text-2xl font-bold text-black dark:text-white" data-testid="redirect-pick">
                  {redirect.code} {redirect.name}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{t(redirect.usage)}</p>
              </div>
            </div>
          </Panel>
          <Panel title={t('Classes at a glance')}>
            <ul className="space-y-2 text-sm">
              {STATUS_CLASSES.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className={`font-mono font-bold rounded px-1.5 shrink-0 ${CLASS_TONE[c.id]}`}>{c.id}</span>
                  <span className="text-gray-700 dark:text-gray-200">
                    <strong>{t('{name}.', { name: t(c.name) })}</strong> {t(c.desc)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('A client that meets an unknown code treats it as the x00 code of its class (RFC 9110 §15).')}</p>
            <LocalNote>{t('Reference data is built into the page; nothing is fetched.')}</LocalNote>
          </Panel>
        </div>
      </div>
    </WebPage>
  );
}
