import React, { useDeferredValue, useMemo, useState } from 'react';
import { Terminal, Code2, ListChecks, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { convertCurl, CURL_TARGETS, type CurlTarget } from '@/lib/tools/w500/dev-format-curl';
import { DevPage, DevHeader, Panel, Segmented, CodeArea, CopyDownload, Notice, Chip, useDevActions } from './shared';
import { useT } from '@/i18n';

const H1 = 'cURL to Code Converter';

const SAMPLE = `curl -X POST 'https://api.example.com/v1/orders?expand=items' \\
  -H 'Authorization: Bearer sk_test_123' \\
  -H 'Content-Type: application/json' \\
  -d '{"customer":"cus_42","items":[{"sku":"ABC-1234","qty":2}],"gift":false}' \\
  --max-time 10`;

const CurlConverter = () => {
  const { t: tx } = useT();
  const [command, setCommand] = useState(SAMPLE);
  const [target, setTarget] = useState<CurlTarget>('python');
  const { copy, download, track } = useDevActions(H1);
  const deferred = useDeferredValue(command);
  const result = useMemo(() => (deferred.trim() ? convertCurl(deferred, target) : null), [deferred, target]);
  const meta = CURL_TARGETS.find((t) => t.id === target)!;

  return (
    <DevPage>
      <DevHeader h1={tx(H1)} sub="data-conversion" icon={Terminal} tagline={tx("Paste a curl command from API docs or your browser's Copy as cURL and get the same request as JavaScript fetch, Axios, Python requests, Go or PHP. Conversion happens in your browser; no request is sent.")} />
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Panel title={tx('curl command')} icon={Terminal} className="min-w-0">
          <CodeArea
            id="curl-input"
            label={tx('Command (bash, zsh or Windows cmd quoting)')}
            value={command}
            onChange={setCommand}
            rows={9}
            invalid={result ? !result.ok : false}
            placeholder="curl https://api.example.com -H 'Accept: application/json'"
            actions={
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCommand(SAMPLE)}>
                  {tx('Sample')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCommand('')}>
                  <Eraser className="h-4 w-4 mr-1" />{' '}{tx('Clear')}
                </Button>
              </>
            }
          />
          {result && !result.ok && <Notice tone="error" title={tx('Could not read the command')} items={[tx(result.error)]} />}
          {result?.ok && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Chip label={tx('Method')} value={result.parsed.method} />
                <Chip label={tx('Headers')} value={String(result.parsed.headers.length)} />
                <Chip label={tx('Body')} value={result.parsed.form.length ? tx('multipart form') : result.parsed.bodyFile ? tx('from file') : result.parsed.body !== undefined ? (result.parsed.bodyIsJson ? 'JSON' : tx('text / form')) : tx('none')} />
                {result.parsed.auth && <Chip label={tx('Auth')} value="Basic" />}
              </div>
              <div className="text-xs font-mono break-all text-gray-700 dark:text-gray-300">{result.parsed.url}</div>
              {result.parsed.headers.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tx('Header')}</TableHead>
                        <TableHead>{tx('Value')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.parsed.headers.map(([k, v], i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{k}</TableCell>
                          <TableCell className="font-mono text-xs break-all">{v}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </Panel>
        <Panel title={tx('Generated code')} icon={Code2} className="min-w-0">
          <Segmented
            label={tx('Target language')}
            value={target}
            onChange={(v) => {
              setTarget(v as CurlTarget);
              track('target', { target: v });
            }}
            options={CURL_TARGETS.map((t) => ({ value: t.id, label: t.label }))}
          />
          <CodeArea id="curl-output" label={meta.label} value={result?.ok ? result.code : ''} readOnly rows={18} actions={<CopyDownload text={result?.ok ? result.code : ''} filename={`request.${meta.ext}`} onCopy={copy} onDownload={download} />} />
          {result?.ok && result.warnings.length > 0 && (
            <div className="flex gap-2 items-start">
              <ListChecks className="h-4 w-4 mt-3 text-amber-600 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <Notice tone="warn" title={tx('Notes on the translation')} items={result.warnings} />
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">{tx('Tokens and passwords in the command stay in this tab. Replace secrets with environment variables before you commit the code.')}</p>
        </Panel>
      </div>
    </DevPage>
  );
};

export default CurlConverter;
