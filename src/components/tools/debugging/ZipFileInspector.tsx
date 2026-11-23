/**
 * ZIP File Inspector: drop a .zip, .jar, .war, .apk, .docx or .xlsx. All
 * parsing is src/lib/tools/zip-inspect.ts (pinned in
 * src/test/tools/tier-analyzers.test.ts): the central directory at the end
 * of the file is read as the authoritative index (APPNOTE.TXT 4.3.12 and
 * 4.3.16), nothing is extracted, and only the JAR manifest is inflated,
 * by the built-in RFC 1951 inflate. Warnings cover path-traversal names,
 * absolute paths and zip-bomb ratios. The file never leaves the tab.
 */
import React, { useState } from 'react';
import { FolderArchive, FileText, TriangleAlert, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inspectZip, renderZipSummary, type ZipSummary } from '@/lib/tools/zip-inspect';
import { reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { DebugPage, DebugHeader, Panel, Notice, Stat, Chip, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';

/**
 * The JDK-built sample.jar from the test suite: 6 entries, Main-Class A,
 * manifest deflated so the built-in inflate is exercised. Figures pinned
 * in src/test/tools/wk20261122-binary.render.test.tsx.
 */
const SAMPLE_BASE64 =
  'UEsDBBQACAgIAOt8dl0AAAAAAAAAAAAAAAAJAAQATUVUQS1JTkYv/soAAAMAUEsHCAAAAAACAAAAAAAAAFBLAwQUAAgICADrfHZd' +
  'AAAAAAAAAAAAAAAAFAAAAE1FVEEtSU5GL01BTklGRVNULk1G803My0xLLS7RDUstKs7Mz7NSMNQz4OVyLkpNLElN0XWqBAqY6xno' +
  'GRnqGSpoeOTnpiYVpZZr8nL5Jmbm6TrnJBYXWyk48nLxcgEAUEsHCBc1Z5tLAAAASgAAAFBLAwQUAAgICADrfHZdAAAAAAAAAAAA' +
  'AAAABwAAAEEuY2xhc3M79W/XPgYGBlsGXi4GJgZmdgYWHgZWBjZGBoGsxLJE/ZzEvHR9/6Ss1OQSRgY2m8y8zBI7RgZmDc0wdgYO' +
  'RgZGR0YGFuf8lFRGBn6fzLxUv9LcpNSikMSkHKAIV3B+aVFyqlsmiMPmqAcykEGRgR1oDwgAdYNsApKcQJ4smM/AwKq1nYFxI1ia' +
  'C0iygQVBUtxAmomBBwBQSwcIRwTEZJYAAACwAAAAUEsDBBQACAgIAOt8dl0AAAAAAAAAAAAAAAAGAAAAQS5qYXZhKyhNyslMVkjO' +
  'SSwuVnBUqK7lAgBQSwcIGE+HWBQAAAASAAAAUEsDBAoAAAgAAOt8dl0AAAAAAAAAAAAAAAAEAAAAY29tL1BLAwQKAAAIAADrfHZd' +
  'AAAAAAAAAAAAAAAACQAAAGNvbS9hY21lL1BLAQIUABQACAgIAOt8dl0AAAAAAgAAAAAAAAAJAAQAAAAAAAAAAAAAAAAAAABNRVRB' +
  'LUlORi/+ygAAUEsBAhQAFAAICAgA63x2XRc1Z5tLAAAASgAAABQAAAAAAAAAAAAAAAAAPQAAAE1FVEEtSU5GL01BTklGRVNULk1G' +
  'UEsBAhQAFAAICAgA63x2XUcExGSWAAAAsAAAAAcAAAAAAAAAAAAAAAAAygAAAEEuY2xhc3NQSwECFAAUAAgICADrfHZdGE+HWBQA' +
  'AAASAAAABgAAAAAAAAAAAAAAAACVAQAAQS5qYXZhUEsBAgoACgAACAAA63x2XQAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAA3QEA' +
  'AGNvbS9QSwECCgAKAAAIAADrfHZdAAAAAAAAAAAAAAAACQAAAAAAAAAAAAAAAAD/AQAAY29tL2FjbWUvUEsFBgAAAAAGAAYATwEA' +
  'ACYCAAAAAA==';

function sampleBytes(): Uint8Array {
  const bin = atob(SAMPLE_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const KIND_LABELS: Record<ZipSummary['kind'], string> = {
  zip: 'ZIP',
  jar: 'JAR',
  apk: 'APK',
  docx: 'DOCX',
  xlsx: 'XLSX',
  pptx: 'PPTX',
};

const MANIFEST_KEYS = ['Manifest-Version', 'Main-Class', 'Implementation-Title', 'Implementation-Version', 'Built-By', 'Build-Jdk', 'Created-By'];

const ZipFileInspector = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('zip-file-inspector');
  const [summary, setSummary] = useState<ZipSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const inspect = (bytes: Uint8Array, name: string, source: string) => {
    setError('');
    setSummary(null);
    try {
      setSummary(inspectZip(bytes));
      setFileName(name);
      track('inspect', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    inspect(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
  };

  const text = summary ? renderZipSummary(summary) : '';
  const ratio = summary && summary.totalCompressed > 0 ? (summary.totalUncompressed / summary.totalCompressed).toFixed(1) : null;
  const biggest = summary
    ? [...summary.entries].filter((e) => !e.name.endsWith('/')).sort((a, b) => b.uncompressedBytes - a.uncompressedBytes).slice(0, 12)
    : [];
  const encryptedCount = summary ? summary.entries.filter((e) => e.encrypted).length : 0;

  return (
    <DebugPage>
      <DebugHeader
        h1={t('ZIP File Inspector')}
        tagline={t('List what a ZIP, JAR, APK, DOCX or XLSX holds from its central directory, without extracting a single file, in your browser')}
        icon={FolderArchive}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Archive')} icon={FileText}>
          <Notice
            tone="info"
            title={t('The listing comes from the central directory, the index at the end of the file, so nothing is decompressed except a JAR manifest. The file is read in this tab and never uploaded; suspicious archives stay safely unopened.')}
          />
          <FileDrop
            id="zip-file"
            label={fileName || t('Drop a .zip, .jar, .war, .apk, .docx or .xlsx here')}
            hint={t('Or click to choose one. Listed on this page; never uploaded, never extracted.')}
            accept=".zip,.jar,.war,.ear,.aar,.apk,.docx,.xlsx,.pptx,application/zip,application/java-archive"
            onFile={onFile}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inspect(sampleBytes(), 'sample.jar', 'sample')}>
              {t('Load a sample')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('The archive at a glance')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="zip-stats">
                <Stat label={t('Kind')} value={KIND_LABELS[summary.kind]} sub={summary.zip64 ? t('ZIP64 format') : undefined} />
                <Stat label={t('Entries')} value={fmt.number(summary.entryCount)} sub={encryptedCount ? t('{n} encrypted', { n: encryptedCount }) : undefined} />
                <Stat label={t('Packed')} value={iecBytes(summary.totalCompressed)} sub={t('{n} unpacked', { n: iecBytes(summary.totalUncompressed) })} />
                <Stat label={t('Ratio')} value={ratio ? `${ratio}:1` : '—'} sub={t('unpacked to packed')} />
              </div>
              <div className="flex flex-wrap gap-2" {...reportInput(t('Archive'), `${fileName} · ${summary.entryCount} entries`)}>
                {summary.comment && <Chip label={t('Comment')} value={summary.comment.slice(0, 60)} />}
                {summary.zip64 && <Chip label={t('Format')} value="ZIP64" />}
              </div>
            </Panel>

            {summary.warnings.length > 0 && (
              <div data-testid="zip-warnings">
                <Notice tone="warn" title={t('Warnings worth reading before anything extracts this archive')} items={summary.warnings} />
              </div>
            )}

            {summary.manifest && (
              <Panel title={t('JAR manifest')} icon={ListTree}>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {t('META-INF/MANIFEST.MF, decoded by the built-in RFC 1951 inflate and parsed per the JAR spec: continuation lines start with one space.')}
                </p>
                <table className="w-full text-sm max-w-xl" data-testid="zip-manifest">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {MANIFEST_KEYS.filter((k) => summary.manifest?.[k]).map((k) => (
                      <tr key={k}>
                        <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{k}</td>
                        <td className="py-1.5 font-mono text-xs break-all">{summary.manifest?.[k]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title={t('By top-level folder')}>
                <table className="w-full text-sm" data-testid="zip-folders">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Folder')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Files')}</th>
                      <th className="py-1.5 font-medium text-right">{t('Unpacked')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.directories.slice(0, 12).map((d) => (
                      <tr key={d.prefix}>
                        <td className="py-1.5 pr-3 font-mono text-xs break-all">{d.prefix}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmt.number(d.count)}</td>
                        <td className="py-1.5 text-right tabular-nums">{iecBytes(d.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
              <Panel title={t('Largest entries')}>
                <table className="w-full text-sm" data-testid="zip-biggest">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Unpacked')}</th>
                      <th className="py-1.5 pr-3 font-medium">{t('Method')}</th>
                      <th className="py-1.5 font-medium">{t('Name')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {biggest.map((e) => (
                      <tr key={e.name}>
                        <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{iecBytes(e.uncompressedBytes)}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{e.method}{e.encrypted ? ` · ${t('encrypted')}` : ''}</td>
                        <td className="py-1.5 font-mono text-xs break-all">{e.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>

            <Panel title={t('Every entry')} icon={TriangleAlert}>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('Modified times are the DOS timestamps from the central directory; ZIP stores them without a time zone, so read them as the packing machine\'s local clock.')}
              </p>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm" data-testid="zip-entries">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Name')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Packed')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Unpacked')}</th>
                      <th className="py-1.5 pr-3 font-medium">{t('Method')}</th>
                      <th className="py-1.5 font-medium">{t('Modified')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.entries.map((e) => (
                      <tr key={e.name}>
                        <td className="py-1.5 pr-3 font-mono text-xs break-all">{e.name}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{iecBytes(e.compressedBytes)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{iecBytes(e.uncompressedBytes)}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{e.method}</td>
                        <td className="py-1.5 font-mono text-xs whitespace-nowrap">{e.modified ? e.modified.replace('T', ' ').replace('Z', '') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="zip-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="zip-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default ZipFileInspector;
