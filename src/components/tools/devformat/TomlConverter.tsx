import React, { useDeferredValue, useMemo, useState } from 'react';
import { FileCode, ArrowLeftRight, Settings2, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { convertData, type DataFormat } from '@/lib/tools/w500/dev-format-toml';
import { DevPage, DevHeader, Panel, PickField, CodeArea, CopyDownload, Notice, CheckField, useDevActions, PRIVACY_NOTE } from './shared';
import { useT } from '@/i18n';

const H1 = 'TOML to JSON and YAML Converter';

const SAMPLES: Record<DataFormat, string> = {
  toml: `# Cargo.toml style sample
[package]
name = "redbison-demo"
version = "0.3.1"
edition = "2021"
authors = ["Ada Lovelace <ada@example.com>"]
released = 2026-10-29T09:30:00Z

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }

[profile.release]
lto = true
opt-level = 3

[[bin]]
name = "server"
path = "src/main.rs"
`,
  json: `{
  "tool": {
    "poetry": {
      "name": "demo",
      "version": "0.1.0",
      "dependencies": { "python": "^3.12", "requests": "^2.32" }
    }
  }
}
`,
  yaml: `server:
  host: 0.0.0.0
  port: 8080
  timeouts: [5, 30]
database:
  url: postgres://localhost/app
  pool: 10
`,
};

const LABEL: Record<DataFormat, string> = { toml: 'TOML', json: 'JSON', yaml: 'YAML' };
const MIME: Record<DataFormat, string> = { toml: 'application/toml', json: 'application/json', yaml: 'application/yaml' };
const FORMAT_OPTIONS = (['toml', 'json', 'yaml'] as DataFormat[]).map((f) => ({ value: f, label: LABEL[f] }));

const TomlConverter = () => {
  const { t } = useT();
  const [from, setFrom] = useState<DataFormat>('toml');
  const [to, setTo] = useState<DataFormat>('json');
  const [input, setInput] = useState(SAMPLES.toml);
  const [indent, setIndent] = useState('2');
  const [dates, setDates] = useState(false);
  const [sortKeys, setSortKeys] = useState(false);
  const { copy, download, track } = useDevActions(H1);
  const deferred = useDeferredValue(input);

  const result = useMemo(() => {
    if (!deferred.trim()) return null;
    return convertData(deferred, from, to, { indent: Number(indent), detectDates: dates, sortKeys });
  }, [deferred, from, to, indent, dates, sortKeys]);

  const swap = () => {
    if (result?.ok) setInput(result.output);
    setFrom(to);
    setTo(from);
    track('swap');
  };

  const changeFrom = (f: DataFormat) => {
    setFrom(f);
    if (Object.values(SAMPLES).includes(input) || !input.trim()) setInput(SAMPLES[f]);
    if (f === to) setTo(f === 'toml' ? 'json' : 'toml');
  };

  return (
    <DevPage>
      <DevHeader h1={t(H1)} sub="data-conversion" icon={FileCode} tagline={t('Convert TOML to JSON or YAML and back, with TOML 1.0 validation that points at the line with the problem. Handy for Cargo.toml, pyproject.toml, Hugo and Netlify config.')} />
      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="space-y-6 min-w-0">
          <Panel title={t('Conversion')} icon={Settings2}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <PickField id="toml-from" label={t('From')} value={from} onChange={(v) => changeFrom(v as DataFormat)} options={FORMAT_OPTIONS} />
              <Button type="button" variant="outline" size="icon" onClick={swap} aria-label={t('Swap input and output formats')} className="mb-0.5">
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
              <PickField id="toml-to" label={t('To')} value={to} onChange={(v) => setTo(v as DataFormat)} options={FORMAT_OPTIONS} />
            </div>
            {to !== 'toml' && (
              <PickField
                id="toml-indent"
                label={t('Indent')}
                value={indent}
                onChange={setIndent}
                options={[
                  { value: '2', label: t('2 spaces') },
                  { value: '4', label: t('4 spaces') },
                ]}
              />
            )}
            {to === 'toml' && from !== 'toml' && <CheckField id="toml-dates" label={t('Turn ISO 8601 date strings into TOML dates')} checked={dates} onChange={setDates} />}
            <CheckField id="toml-sort" label={t('Sort keys alphabetically')} checked={sortKeys} onChange={setSortKeys} />
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('{PRIVACY_NOTE} Pick TOML in both boxes to validate and tidy a TOML file.', { PRIVACY_NOTE: t(PRIVACY_NOTE) })}</p>
          </Panel>
        </div>
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <Panel title={t('{value} to {value2}', { value: LABEL[from], value2: LABEL[to] })} icon={FileCode}>
            <CodeArea
              id="toml-input"
              label={t('{value} input', { value: LABEL[from] })}
              value={input}
              onChange={setInput}
              rows={12}
              invalid={result ? !result.ok : false}
              actions={
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setInput(SAMPLES[from])}>
                    {t('Sample')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setInput('')}>
                    <Eraser className="h-4 w-4 mr-1" />{' '}{t('Clear')}
                  </Button>
                </>
              }
            />
            {result && !result.ok ? (
              <Notice tone="error" title={result.error.line ? t('Invalid {value} at line {line}, column {column}', { value: LABEL[from], line: result.error.line, column: result.error.column ?? '' }) : t('Invalid {value}', { value: LABEL[from] })} items={[result.error.message]} />
            ) : (
              <>
                <CodeArea
                  id="toml-output"
                  label={t('{value} output', { value: LABEL[to] })}
                  value={result?.ok ? result.output : ''}
                  readOnly
                  rows={14}
                  actions={<CopyDownload text={result?.ok ? result.output : ''} filename={`converted.${to === 'yaml' ? 'yaml' : to}`} mime={MIME[to]} onCopy={copy} onDownload={download} />}
                />
                {result?.ok && <Notice tone="ok" title={t('Valid {value}', { value: LABEL[from] })} />}
                {result?.ok && result.warnings.length > 0 && <Notice tone="warn" title={t('Values that changed in conversion')} items={result.warnings} />}
              </>
            )}
          </Panel>
        </div>
      </div>
    </DevPage>
  );
};

export default TomlConverter;
