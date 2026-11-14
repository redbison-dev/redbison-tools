import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, FileCode2, AlertTriangle, Globe } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { WebPage, WebHeader, Panel, Segmented, PickField, CopyButton, DownloadButton, CodeOut, LocalNote, useWebAnalytics } from './webopsShared';
import { generateRedirects, issueMessage, PLATFORMS, type Platform, type RedirectCode } from '@/lib/tools/w500/webops-redirect';
import { msg, useT } from '@/i18n';

const SAMPLE = `/old-page /new-page
/about-us /about 301
/blog/* /news/:splat
/summer-sale /sale 302
/api/v1/upload /api/v2/upload 308
/docs/getting-started https://docs.example.com/start`;

const FILENAMES: Record<Platform, { name: string; mime: string }> = {
  apache: { name: '.htaccess', mime: 'text/plain' },
  nginx: { name: 'redirects.conf', mime: 'text/plain' },
  netlify: { name: '_redirects', mime: 'text/plain' },
  vercel: { name: 'vercel.json', mime: 'application/json' },
};

export default function RedirectGenerator() {
  const { t } = useT();
  const track = useWebAnalytics('redirect-generator');
  const [text, setText] = useState(SAMPLE);
  const [platform, setPlatform] = useState<Platform>('apache');
  const [code, setCode] = useState<RedirectCode>(301);
  const [keepQuery, setKeepQuery] = useState(true);
  const [forceHttps, setForceHttps] = useState(false);
  const [host, setHost] = useState<'none' | 'www' | 'apex'>('none');
  const [domain, setDomain] = useState('example.com');

  const out = useMemo(() => generateRedirects(text, platform, { defaultCode: code, keepQuery, site: { forceHttps, host, domain } }), [text, platform, code, keepQuery, forceHttps, host, domain]);
  const errors = out.issues.filter((i) => i.level === 'error').length;
  const issueText = (i: (typeof out.issues)[number]) => {
    const m = issueMessage(i);
    return m ? t(m.text, m.vars) : i.message;
  };
  const ruleSummary = (n: number, file: string, skipped: number) => {
    const rules = t(msg.plural(n, { one: '{n} rule for {file}', other: '{n} rules for {file}' }), { n, file });
    if (!skipped) return rules;
    return t(msg.plural(skipped, { one: '{rules}, {skipped} line skipped', other: '{rules}, {skipped} lines skipped' }, 'skipped'), { rules, skipped });
  };

  return (
    <WebPage>
      <WebHeader h1={t('Redirect Rules Generator')} icon={ArrowRightLeft} tagline={t('Turn a list of old and new URLs into 301, 302, 307 or 308 rules for Apache .htaccess, Nginx, Netlify _redirects and vercel.json, with checks for loops and redirect chains.')} />
      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <div className="space-y-4 min-w-0">
          <Panel title={t('Redirects')} icon={FileCode2}>
            <div>
              <Label htmlFor="rules" className="text-sm font-medium text-black dark:text-white">
                {t('One per line: source destination [code]')}
              </Label>
              <Textarea id="rules" value={text} onChange={(e) => setText(e.target.value)} rows={9} className="mt-1 font-mono text-xs sm:text-sm bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('End a source with /* to move a whole folder; the rest of the path is carried over. Spaces, tabs or commas separate the columns, so a two-column spreadsheet paste works.')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PickField
                id="def-code"
                label={t('Default status')}
                value={String(code)}
                onChange={(v) => setCode(Number(v) as RedirectCode)}
                options={[
                  { value: '301', label: t('301 permanent') },
                  { value: '308', label: t('308 permanent, keep method') },
                  { value: '302', label: t('302 temporary') },
                  { value: '307', label: t('307 temporary, keep method') },
                ]}
              />
              <div className="flex items-end gap-2 pb-2">
                <Switch id="keepq" checked={keepQuery} onCheckedChange={setKeepQuery} />
                <Label htmlFor="keepq" className="text-sm text-gray-700 dark:text-gray-200">
                  {t('Keep query string')}
                </Label>
              </div>
            </div>
          </Panel>
          <Panel title={t('Site-wide rules')} icon={Globe}>
            <div className="flex items-center gap-2">
              <Switch id="https" checked={forceHttps} onCheckedChange={setForceHttps} />
              <Label htmlFor="https" className="text-sm text-gray-700 dark:text-gray-200">
                {t('Redirect HTTP to HTTPS')}
              </Label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <PickField
                id="host"
                label={t('Canonical host')}
                value={host}
                onChange={(v) => setHost(v as 'none' | 'www' | 'apex')}
                options={[
                  { value: 'none', label: t('Leave hosts alone') },
                  { value: 'apex', label: t('www to bare domain') },
                  { value: 'www', label: t('Bare domain to www') },
                ]}
              />
              <div>
                <Label htmlFor="domain" className="text-sm font-medium text-black dark:text-white">
                  {t('Domain')}
                </Label>
                <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} className="mt-1 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              </div>
            </div>
            <LocalNote />
          </Panel>
        </div>
        <div className="space-y-4 min-w-0">
          <Panel title={t('Generated rules')}>
            <Segmented label={t('Platform')} value={platform} onChange={(v) => setPlatform(v as Platform)} options={PLATFORMS.map((p) => ({ value: p.id, label: t(p.name) }))} />
            <p className="text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
              {ruleSummary(out.rules.length, t(PLATFORMS.find((p) => p.id === platform)!.file), errors)}
            </p>
            <CodeOut value={out.output} label={t('Generated configuration')} />
            <div className="flex flex-wrap gap-2">
              <CopyButton text={out.output} label={t('Copy rules')} onCopied={() => track('copy', { platform })} />
              <DownloadButton text={out.output} filename={FILENAMES[platform].name} mime={FILENAMES[platform].mime} label={t('Download {name}', { name: FILENAMES[platform].name })} onDone={() => track('download', { platform })} />
            </div>
            <ul className="text-xs text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-1">
              {out.notes.map((n) => (
                <li key={n}>{t(n)}</li>
              ))}
            </ul>
          </Panel>
          {out.issues.length > 0 && (
            <Panel title={t('Checks ({length})', { length: out.issues.length })} icon={AlertTriangle}>
              <ul className="space-y-2 text-sm" data-testid="redirect-issues">
                {out.issues.map((i, k) => (
                  <li key={k} className={i.level === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-200'}>
                    {t('Line {line}: {message}', { line: i.line, message: issueText(i) })}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </WebPage>
  );
}
