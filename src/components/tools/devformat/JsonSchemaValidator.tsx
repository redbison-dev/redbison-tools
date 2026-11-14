import React, { useDeferredValue, useMemo, useState } from 'react';
import { FileJson, ShieldCheck, Wand2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { validateJson, inferSchemaFromText, valueAtPointer, describeError, type SchemaDraft } from '@/lib/tools/w500/dev-format-schema';
import { DevPage, DevHeader, Panel, PickField, CodeArea, CopyDownload, Notice, CheckField, useDevActions, PRIVACY_NOTE } from './shared';
import { msg, useT } from '@/i18n';

const H1 = 'JSON Schema Validator and Generator';

const SAMPLE_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Order",
  "type": "object",
  "required": ["id", "email", "items"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "placed": { "type": "string", "format": "date-time" },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["sku", "qty"],
        "properties": {
          "sku": { "type": "string", "pattern": "^[A-Z]{3}-\\\\d{4}$" },
          "qty": { "type": "integer", "minimum": 1 }
        }
      }
    }
  }
}
`;

const SAMPLE_DATA = `{
  "id": "3f1c9a52-8d2e-4b7a-9c1e-2a6f0e4d7b11",
  "email": "ada@example",
  "placed": "2026-02-30T10:00:00Z",
  "items": [
    { "sku": "ABC-1234", "qty": 2 },
    { "sku": "abc-99", "qty": 0 }
  ],
  "coupon": "SPRING"
}
`;

const SAMPLE_INFER = `[
  { "id": 1, "name": "Ada", "email": "ada@example.com", "joined": "2024-01-15T10:00:00Z", "score": 9.5, "tags": ["admin"] },
  { "id": 2, "name": "Grace", "joined": "2024-02-01T08:30:00Z", "score": 7, "tags": [], "manager": null }
]
`;

const preview = (v: unknown) => {
  if (v === undefined) return '(missing)';
  const s = JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
};

const JsonSchemaValidator = () => {
  const { t, tr } = useT();
  const [tab, setTab] = useState('validate');
  const [schema, setSchema] = useState(SAMPLE_SCHEMA);
  const [data, setData] = useState(SAMPLE_DATA);
  const [draft, setDraft] = useState<SchemaDraft>('auto');
  const [sample, setSample] = useState(SAMPLE_INFER);
  const [inferDraft, setInferDraft] = useState<'2020-12' | 'draft-07'>('2020-12');
  const [required, setRequired] = useState(true);
  const [formats, setFormats] = useState(true);
  const [strict, setStrict] = useState(false);
  const { copy, download, track } = useDevActions(H1);

  const dSchema = useDeferredValue(schema);
  const dData = useDeferredValue(data);
  const dSample = useDeferredValue(sample);

  const result = useMemo(() => validateJson(dSchema, dData, draft), [dSchema, dData, draft]);
  const parsedData = useMemo(() => {
    try {
      return JSON.parse(dData);
    } catch {
      return undefined;
    }
  }, [dData]);

  const inferred = useMemo(() => inferSchemaFromText(dSample, { draft: inferDraft, required: required ? 'all' : 'none', formats, strictObjects: strict }), [dSample, inferDraft, required, formats, strict]);
  const inferredText = inferred.ok ? JSON.stringify(inferred.schema, null, 2) + '\n' : '';

  const where = (e: { line?: number; column?: number }) => (e.line ? t(' at line {line}, column {column}', { line: e.line, column: e.column ?? '' }) : '');

  return (
    <DevPage>
      <DevHeader h1={t(H1)} sub="data-conversion" icon={FileJson} tagline={t('Check a JSON document against a JSON Schema (draft 2020-12, 2019-09, 07 or 06) and see every error with its path, or generate a starter schema from sample JSON.')} />
      <Tabs value={tab} onValueChange={(v) => { setTab(v); track('tab', { tab: v }); }} className="mt-6">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="validate">
            <ShieldCheck className="h-4 w-4 mr-1" />{' '}{t('Validate')}
          </TabsTrigger>
          <TabsTrigger value="infer">
            <Wand2 className="h-4 w-4 mr-1" />{' '}{t('Generate schema')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="validate" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <Panel title={t('JSON Schema')} icon={Settings2}>
              <PickField
                id="js-draft"
                label={t('Draft')}
                value={draft}
                onChange={(v) => setDraft(v as SchemaDraft)}
                options={[
                  { value: 'auto', label: t('Auto (from $schema, else 2020-12)') },
                  { value: '2020-12', label: t('Draft 2020-12') },
                  { value: '2019-09', label: t('Draft 2019-09') },
                  { value: 'draft-07', label: t('Draft-07') },
                  { value: 'draft-06', label: t('Draft-06') },
                ]}
              />
              <CodeArea id="schema-input" label={t('Schema')} value={schema} onChange={setSchema} rows={16} invalid={result.inputError?.where === 'schema'} />
            </Panel>
            <Panel title={t('JSON document')} icon={FileJson}>
              <CodeArea id="data-input" label={t('Data to validate')} value={data} onChange={setData} rows={12} invalid={result.inputError?.where === 'data'} />
              <div aria-live="polite" className="space-y-3">
                {result.inputError ? (
                  <Notice tone="error" title={result.inputError.where === 'schema' ? t('The schema is not usable{where}', { where: where(result.inputError) }) : t('The document is not usable{where}', { where: where(result.inputError) })} items={[result.inputError.message]} />
                ) : result.valid ? (
                  <Notice tone="ok" title={t('Valid against the schema (draft {draft})', { draft: result.draft })} />
                ) : (
                  <>
                    <Notice tone="error" title={t(msg.plural(result.errors.length, { one: '{length} validation error (draft {draft})', other: '{length} validation errors (draft {draft})' }, 'length'), { length: result.errors.length, draft: result.draft })} />
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 text-sm" data-testid="schema-errors">
                      {result.errors.map((e, k) => (
                        <li key={k} className="p-3 space-y-1 min-w-0">
                          <div className="font-mono text-xs text-red-700 dark:text-red-300 break-all">{e.path || t('(root)')}</div>
                          <div className="text-black dark:text-white">{describeError(e).replace(/^[^:]*: /, '')}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 break-all">
                            {tr('Value: {value} · Rule: {rule}', { value: <span className="font-mono">{preview(valueAtPointer(parsedData, e.path))}</span>, rule: <span className="font-mono">{e.schemaPath}</span> })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {result.warnings.length > 0 && <Notice tone="warn" title={t('Schema warnings')} items={result.warnings} />}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={!!result.inputError} onClick={() => copy(result.valid ? t('Valid') : result.errors.map(describeError).join('\n'), t('Result'))}>
                    {t('Copy result')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSchema(SAMPLE_SCHEMA);
                      setData(SAMPLE_DATA);
                    }}
                  >
                    {t('Sample')}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('{PRIVACY_NOTE} Validation uses Ajv with all errors reported.', { PRIVACY_NOTE: t(PRIVACY_NOTE) })}</p>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="infer" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <Panel title={t('Sample JSON')} icon={FileJson}>
              <CodeArea id="sample-input" label={t('One example, or an array of examples')} value={sample} onChange={setSample} rows={14} invalid={!inferred.ok} />
              <div className="grid sm:grid-cols-2 gap-3">
                <PickField
                  id="infer-draft"
                  label={t('Output draft')}
                  value={inferDraft}
                  onChange={(v) => setInferDraft(v as '2020-12' | 'draft-07')}
                  options={[
                    { value: '2020-12', label: t('Draft 2020-12') },
                    { value: 'draft-07', label: t('Draft-07') },
                  ]}
                />
              </div>
              <CheckField id="infer-req" label={t('Mark keys found in every object as required')} checked={required} onChange={setRequired} />
              <CheckField id="infer-fmt" label={t('Detect formats (date-time, email, uuid, uri, ipv4)')} checked={formats} onChange={setFormats} />
              <CheckField id="infer-strict" label={t('Reject unknown keys (additionalProperties: false)')} checked={strict} onChange={setStrict} />
            </Panel>
            <Panel title={t('Generated schema')} icon={Wand2}>
              {!inferred.ok ? (
                <Notice tone="error" title={t('The sample is not valid JSON{value}', { value: where(inferred.error) })} items={[inferred.error.message]} />
              ) : (
                <>
                  <CodeArea id="schema-output" label={t('Schema')} value={inferredText} readOnly rows={18} actions={<CopyDownload text={inferredText} filename="schema.json" mime="application/json" onCopy={copy} onDownload={download} />} />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setSchema(inferredText);
                      setData(sample);
                      setTab('validate');
                      track('use_generated_schema');
                    }}
                  >
                    {t('Validate with this schema')}
                  </Button>
                  <Notice tone="info" title={t('A starting point, not a contract')} items={['The schema only knows what the sample shows. Add enums, minimum and maximum values, string patterns and descriptions before you rely on it.']} />
                </>
              )}
            </Panel>
          </div>
        </TabsContent>
      </Tabs>
    </DevPage>
  );
};

export default JsonSchemaValidator;
