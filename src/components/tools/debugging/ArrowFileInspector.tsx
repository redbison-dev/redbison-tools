/**
 * Arrow File Inspector: drop an Apache Arrow IPC file (.arrow / Feather v2)
 * or stream and read the schema, batch structure and sizes. All parsing is
 * src/lib/tools/arrow-inspect.ts (pinned in
 * src/test/tools/tier-analyzers.test.ts against a real pyarrow-written
 * file): the ARROW1 magic, the 0xFFFFFFFF continuation marker and the
 * flatbuffer message framing per the Arrow Columnar IPC specification.
 * Honest scope on the page: the columnar data stays encoded; this answers
 * "what is in this file and how big", and pyarrow or polars read the values.
 * The sample is the same pyarrow file the test suite pins, served from
 * /samples/sample.arrow.
 */
import React, { useState } from 'react';
import { Table2, FileText, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inspectArrow, renderArrowSummary, type ArrowSummary } from '@/lib/tools/arrow-inspect';
import { reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { DebugPage, DebugHeader, Panel, Notice, Stat, Chip, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';

const ArrowFileInspector = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('arrow-file-inspector');
  const [summary, setSummary] = useState<ArrowSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [loadingSample, setLoadingSample] = useState(false);

  const inspect = (bytes: Uint8Array, name: string, source: string) => {
    setError('');
    setSummary(null);
    try {
      setSummary(inspectArrow(bytes));
      setFileName(name);
      track('inspect', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    inspect(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
  };

  // Replaces only a parsed summary of a file still on disk, never typed work,
  // which is why this matches the other inspectors' unguarded sample buttons.
  const fetchSampleFile = async () => {
    setLoadingSample(true);
    try {
      const res = await fetch('/samples/sample.arrow');
      if (!res.ok) throw new Error(t('Could not load the sample file from this site.'));
      inspect(new Uint8Array(await res.arrayBuffer()), 'sample.arrow', 'sample');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSample(false);
    }
  };

  const text = summary ? renderArrowSummary(summary) : '';

  return (
    <DebugPage>
      <DebugHeader
        h1={t('Arrow File Inspector')}
        tagline={t('Schema, record batches, row counts and compression from an Arrow IPC or Feather v2 file, read in your browser')}
        icon={Table2}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Arrow file')} icon={FileText}>
          <Notice
            tone="info"
            title={t('This reads the file\'s own framing: schema, batch structure, row counts and sizes. The columnar data stays encoded, so the answer here is what the file holds and how big it is; reading the values is a pyarrow or polars job.')}
          />
          <FileDrop
            id="arrow-file"
            label={fileName || t('Drop a .arrow, .feather or Arrow IPC stream file here')}
            hint={t('Or click to choose one. Parsed in this tab; the data never leaves your browser.')}
            accept=".arrow,.arrows,.feather,.ipc"
            onFile={onFile}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={loadingSample} onClick={fetchSampleFile}>
              {loadingSample ? t('Loading the sample…') : t('Load a sample (1,200 rows from pyarrow)')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('The file at a glance')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="arrow-stats">
                <Stat label={t('Layout')} value={summary.layout === 'file' ? t('IPC file') : t('IPC stream')} sub={summary.layout === 'file' ? t('ARROW1 magic, footer at the end') : t('frames only, no footer')} />
                <Stat label={t('Rows')} value={fmt.number(summary.totalRows)} sub={t('exact, from the batch headers')} />
                <Stat label={t('Record batches')} value={fmt.number(summary.recordBatches)} sub={summary.dictionaryBatches ? t('{n} dictionary batches', { n: summary.dictionaryBatches }) : undefined} />
                <Stat label={t('Body bytes')} value={iecBytes(summary.totalBodyBytes)} sub={summary.compression ?? t('uncompressed')} />
              </div>
              <div className="flex flex-wrap gap-2" {...reportInput(t('Arrow file'), `${fileName} · ${summary.totalRows} rows`)}>
                <Chip label={t('Fields')} value={fmt.number(summary.fields.length)} />
                <Chip label={t('File size')} value={iecBytes(summary.fileBytes)} />
              </div>
              {summary.layout === 'stream' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('A stream has no footer, so these counts come from walking every message frame to the end-of-stream marker.')}
                </p>
              )}
            </Panel>

            <Panel title={t('Schema')} icon={ListTree}>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('Field names, types and nullability from the schema message, the first frame of every Arrow IPC file and stream.')}
              </p>
              <table className="w-full text-sm max-w-xl" data-testid="arrow-schema">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-1.5 pr-3 font-medium">{t('Field')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('Type')}</th>
                    <th className="py-1.5 font-medium">{t('Nullable')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {summary.fields.map((f) => (
                    <tr key={f.name}>
                      <td className="py-1.5 pr-3 font-mono text-xs break-all">{f.name}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{f.type}</td>
                      <td className="py-1.5 text-xs">{f.nullable ? t('yes') : 'NOT NULL'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="arrow-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="arrow-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default ArrowFileInspector;
