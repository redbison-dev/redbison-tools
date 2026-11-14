import React, { useMemo, useState } from 'react';
import { FileType2, Search, FileCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WebPage, WebHeader, Panel, PickField, Segmented, CopyButton, CodeOut, LocalNote, useWebAnalytics } from './webopsShared';
import { MIME_TYPES, searchMime, lookupExtension, contentTypeHeader, serverConfigSnippet, type MimeEntry, type MimeCategory } from '@/lib/tools/w500/webops-mime';
import { msg, useFormat, useT } from '@/i18n';

const CATS: { value: MimeCategory | 'all'; label: string }[] = [
  { value: 'all', label: msg('All categories') },
  { value: 'web', label: msg('Web') },
  { value: 'text', label: msg('Text') },
  { value: 'data', label: msg('Data') },
  { value: 'code', label: msg('Code') },
  { value: 'image', label: msg('Images') },
  { value: 'audio', label: msg('Audio') },
  { value: 'video', label: msg('Video') },
  { value: 'font', label: msg('Fonts') },
  { value: 'document', label: msg('Documents') },
  { value: 'archive', label: msg('Archives') },
  { value: 'application', label: msg('Apps and binaries') },
];

const key = (m: MimeEntry) => `${m.mime}|${m.ext.join(',')}`;

export default function MimeTypeLookup() {
  const { t, tr } = useT();
  const format = useFormat();
  const track = useWebAnalytics('mime-type-lookup');
  const cats = CATS.map((c) => ({ value: c.value, label: t(c.label) }));
  const matchSummary = (n: number, by: 'extension' | 'mime' | 'text') => {
    if (by === 'mime') return t(msg.plural(n, { one: '{n} match by MIME type', other: '{n} matches by MIME type' }), { n });
    if (by === 'extension') return t(msg.plural(n, { one: '{n} match by extension', other: '{n} matches by extension' }), { n });
    return t(msg.plural(n, { one: '{n} match by name', other: '{n} matches by name' }), { n });
  };
  const [query, setQuery] = useState('svg');
  const [cat, setCat] = useState<MimeCategory | 'all'>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [server, setServer] = useState<'nginx' | 'apache' | 'iis'>('nginx');
  const [file, setFile] = useState<{ name: string; browserType: string; size: number } | null>(null);

  const { mode, results } = useMemo(() => searchMime(query, cat), [query, cat]);
  const selected = results.find((m) => key(m) === picked) ?? results[0];
  const fileHit = file ? lookupExtension(file.name) : undefined;

  return (
    <WebPage>
      <WebHeader h1={t('MIME Type Lookup')} icon={FileType2} tagline={t('Type a file extension to get its MIME type, or a MIME type to get its extensions, with the Content-Type header and the nginx, Apache or IIS line to serve it.')} />
      <div className="grid gap-6 lg:grid-cols-5 mt-6">
        <div className="lg:col-span-3 space-y-4 min-w-0">
          <Panel title={t('Search')} icon={Search}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2 min-w-0">
                <Label htmlFor="mime-q" className="text-sm font-medium text-black dark:text-white">
                  {t('Extension, file name or MIME type')}
                </Label>
                <Input
                  id="mime-q"
                  value={query}
                  placeholder=".webp, report.docx, application/json"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPicked(null);
                  }}
                  className="mt-1 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600"
                />
              </div>
              <PickField id="mime-cat" label={t('Category')} value={cat} onChange={(v) => setCat(v as MimeCategory | 'all')} options={cats} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
              {results.length ? matchSummary(results.length, mode) : t('No match in the {count}-entry table. Unknown binary files are served as application/octet-stream.', { count: MIME_TYPES.length })}
            </p>
            <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 max-h-[30rem] overflow-auto">
              {results.map((m) => {
                const active = selected && key(m) === key(selected);
                return (
                  <li key={key(m)}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(key(m));
                        track('select_type', { mime: m.mime });
                      }}
                      className={`w-full text-left p-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 ${active ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-900/40'}`}
                    >
                      <span className="font-mono text-sm text-gray-500 dark:text-gray-400 sm:w-28 shrink-0 break-all">{m.ext.length ? m.ext.map((e) => '.' + e).join(' ') : t('(no extension)')}</span>
                      <span className="font-mono text-sm font-semibold text-black dark:text-white break-all">{m.mime}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300 sm:ml-auto">{t(m.name)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {selected && (
            <Panel title={t(selected.name)}>
              <div className="space-y-2 text-sm">
                <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-3">
                  <div className="text-xs text-gray-600 dark:text-gray-300">{t('MIME type')}</div>
                  <div className="font-mono text-lg font-bold text-black dark:text-white break-all" data-testid="mime-result">
                    {selected.mime}
                  </div>
                  <div className="text-xs mt-1 text-gray-600 dark:text-gray-300">{selected.spec
                    ? (selected.registered ? t('Registered with IANA · {spec}', { spec: selected.spec }) : t('Not IANA-registered; the de facto type servers send · {spec}', { spec: selected.spec }))
                    : (selected.registered ? t('Registered with IANA') : t('Not IANA-registered; the de facto type servers send'))}</div>
                </div>
                {selected.ext.length > 0 && (
                  <p className="text-gray-700 dark:text-gray-200">
                    <strong>{t('Extensions:')}</strong> {selected.ext.map((e) => '.' + e).join(', ')}
                  </p>
                )}
                {selected.aliases && (
                  <p className="text-gray-700 dark:text-gray-200">
                    <strong>{t('Also seen as:')}</strong> <span className="font-mono break-all">{selected.aliases.join(', ')}</span>
                  </p>
                )}
                {selected.note && <p className="text-gray-700 dark:text-gray-200">{t(selected.note)}</p>}
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">{t('Response header')}</div>
                  <CodeOut value={`Content-Type: ${contentTypeHeader(selected)}`} label={t('Content-Type header')} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={selected.mime} label={t('Copy type')} onCopied={() => track('copy_mime')} />
                  <CopyButton text={`Content-Type: ${contentTypeHeader(selected)}`} label={t('Copy header')} />
                </div>
                {selected.ext.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <Segmented label={t('Server')} value={server} onChange={(v) => setServer(v as 'nginx' | 'apache' | 'iis')} options={[{ value: 'nginx', label: 'nginx' }, { value: 'apache', label: 'Apache' }, { value: 'iis', label: t('IIS web.config') }]} />
                    <CodeOut value={serverConfigSnippet(selected, server)} label={t('Server configuration')} />
                    <CopyButton text={serverConfigSnippet(selected, server)} label={t('Copy config')} />
                  </div>
                )}
              </div>
            </Panel>
          )}
          <Panel title={t('Check a file')} icon={FileCheck}>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('Pick any file to compare the type your browser guesses with the table. The file is only read for its name and size.')}</p>
            <Input
              type="file"
              aria-label={t('Choose a file')}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile({ name: f.name, browserType: f.type, size: f.size });
                  track('check_file');
                }
              }}
            />
            {file && (
              <div className="text-sm space-y-1" data-testid="file-check">
                <p className="break-all">
                  <strong>{file.name}</strong>{' '}{t('({value} bytes)', { value: format.number(file.size) })}
                </p>
                <p>
                  {tr('Browser says: {type}', { type: <span className="font-mono break-all">{file.browserType || t('(empty: unknown to this browser)')}</span> })}
                </p>
                <p>
                  {tr('Table says: {type}', { type: <span className="font-mono break-all">{fileHit ? fileHit.mime : t('not listed (application/octet-stream)')}</span> })}
                </p>
                {fileHit && file.browserType && fileHit.mime !== file.browserType && !(fileHit.aliases ?? []).includes(file.browserType) && (
                  <p className="text-amber-700 dark:text-amber-300">{t('These differ. Browsers guess from the extension using the operating system’s list, which varies between machines; set the type explicitly when you upload.')}</p>
                )}
              </div>
            )}
            <LocalNote />
          </Panel>
        </div>
      </div>
    </WebPage>
  );
}
