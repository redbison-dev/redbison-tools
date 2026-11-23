/**
 * SQLite File Inspector: drop a .sqlite/.db file. All parsing is
 * src/lib/tools/sqlite-inspect.ts (tested in
 * src/test/tools/wk20261122-analyzers.test.ts): the 100-byte header, the
 * schema from the sqlite_schema B-tree, and exact per-table row counts
 * from walking each table's B-tree. WAL mode and WITHOUT ROWID tables are
 * reported with their caveats rather than silently wrong numbers. The file
 * is read in this tab and never uploaded.
 */
import React, { useState } from 'react';
import { Database, FileText, HardDrive, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { inspectSqlite, renderSqliteSummary, type SqliteSummary } from '@/lib/tools/sqlite-inspect';
import { reportInput } from '@/lib/report/attrs';
import { msg, useFormat, useT } from '@/i18n';
import { DebugPage, Panel, Notice, Stat, Chip, FileDrop, CopyDownload, useDevActions, iecBytes, isGzip } from '@/components/tools/debugging/shared';

/**
 * A 2 KiB database written by sqlite3 3.51.0 (page_size 512): notes (12
 * rows), tags (4 rows), one index, one view. The figures it shows are
 * pinned in src/test/tools/wk20261122-analyzers.render.test.tsx.
 */
const SAMPLE_BASE64 =
  'U1FMaXRlIGZvcm1hdCAzAAIAAQEMQCAgAAAABgAAAAQAAAAAAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAGAC6N+A0AAAAEAKMAAZkBWgEQAKMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAGsEBxUlJQiBHXZpZXdyZWNlbnRfbm90ZXNyZWNlbnRfbm90ZXNDUkVBVEUgVklFVyByZWNlbnRfbm90ZXMg' +
  'QVMgU0VMRUNUICogRlJPTSBub3RlcyBPUkRFUiBCWSBpZCBERVNDIExJTUlUIDVIAwYXJxUBY2luZGV4aWR4X3RhZ3Nfbm90ZXRh' +
  'Z3MEQ1JFQVRFIElOREVYIGlkeF90YWdzX25vdGUgT04gdGFncyhub3RlX2lkKT0CBhcVFQFfdGFibGV0YWdzdGFncwNDUkVBVEUg' +
  'VEFCTEUgdGFncyAobm90ZV9pZCBJTlQsIHRhZyBURVhUKVkBBxcXFwGBEXRhYmxlbm90ZXNub3RlcwJDUkVBVEUgVEFCTEUgbm90' +
  'ZXMgKGlkIElOVEVHRVIgUFJJTUFSWSBLRVksIHRpdGxlIFRFWFQsIGJvZHkgVEVYVCkAAAAAAAAAAAAAAAANAAAADAC2AAHaAcAB' +
  'pgGMAXIBWAE+ASQBCgDuANIAtgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAABoMBAAbK05vdGUgMTJCb2R5IG9mIG5vdGUgMTIaCwQAGytOb3RlIDExQm9keSBvZiBub3RlIDEx' +
  'GgoEABsrTm90ZSAxMEJvZHkgb2Ygbm90ZSAxMBgJBAAZKU5vdGUgOUJvZHkgb2Ygbm90ZSA5GAgEABkpTm90ZSA4Qm9keSBvZiBu' +
  'b3RlIDgYBwQAGSlOb3RlIDdCb2R5IG9mIG5vdGUgNxgGBAAZKU5vdGUgNkJvZHkgb2Ygbm90ZSA2GAUEABkpTm90ZSA1Qm9keSBv' +
  'ZiBub3RlIDUYBAQAGSlOb3RlIDRCb2R5IG9mIG5vdGUgNBgDBAAZKU5vdGUgM0JvZHkgb2Ygbm90ZSAzGAIEABkpTm90ZSAyQm9k' +
  'eSBvZiBub3RlIDIYAQQAGSlOb3RlIDFCb2R5IG9mIG5vdGUgMQAAAAAAAAAAAAAAAA0AAAAEAcoAAesB4QHXAcoAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwQDARsFYXJjaGl2ZQgDAwEV' +
  'A3RvZG8IAgMBFQJpZGVhBwEDCRV0b2RvAAAAAAAAAAAAAAAACgAAAAQB3gAB8AHqAeQB3gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUDAQEFBAUDAQED' +
  'AwUDAQECAgMDCQkAAAAAAAAAAAAAAAA=';

function sampleBytes(): Uint8Array {
  const bin = atob(SAMPLE_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The -wal sidecar starts 0x377f0682 or 0x377f0683 (big/little endian). */
const isWalSidecar = (b: Uint8Array) =>
  b.length >= 4 && b[0] === 0x37 && b[1] === 0x7f && b[2] === 0x06 && (b[3] === 0x82 || b[3] === 0x83);

const SQL_TYPES = [
  { type: 'index' as const, heading: msg('Indexes') },
  { type: 'view' as const, heading: msg('Views') },
  { type: 'trigger' as const, heading: msg('Triggers') },
];

const SqliteFileInspector = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('sqlite-file-inspector');
  const [summary, setSummary] = useState<SqliteSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const inspect = (bytes: Uint8Array, name: string, source: string) => {
    setError('');
    setSummary(null);
    setFileName(name);
    try {
      if (isGzip(bytes)) throw new Error(t('This file is gzip-compressed. Decompress it first: gunzip {name}', { name }));
      if (isWalSidecar(bytes)) throw new Error(t('This is the -wal sidecar, not the database. Drop the main .db or .sqlite file; its row counts will exclude whatever is still in this WAL.'));
      setSummary(inspectSqlite(bytes));
      track('inspect', { source, sizeKiB: Math.round(bytes.length / 1024) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    inspect(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
  };

  const text = summary ? renderSqliteSummary(summary) : '';

  return (
    <DebugPage>
      <ToolBreadcrumb
        category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
        subcategory={{ label: t('Database Tools'), href: '/category/development-tech/database-tools' }}
        toolName={t('SQLite File Inspector')}
      />
      <div className="tool-header mt-6">
        <h1 className="tool-title text-black dark:text-white text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
          <Database className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-red-600 shrink-0" />
          {t('SQLite File Inspector')}
        </h1>
        <p className="tool-description text-gray-600 dark:text-gray-300 text-sm sm:text-base mt-2">
          {t('Header facts, schema and exact row counts from a .sqlite or .db file, read in your browser')}
        </p>
      </div>
      <div className="space-y-6 mt-6">
        <Panel title={t('Database file')} icon={FileText}>
          <FileDrop
            id="sqlite-file"
            label={fileName || t('Drop a .sqlite or .db file here')}
            hint={t('Or click to choose one. The file is read on this page and never uploaded; your data stays on this machine.')}
            accept=".sqlite,.sqlite3,.db,.db3,application/x-sqlite3,application/vnd.sqlite3"
            onFile={onFile}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inspect(sampleBytes(), 'sample.sqlite', 'sample')}>
              {t('Load a sample')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('Header facts')} icon={HardDrive}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="sq-stats">
                <Stat label={t('Tables')} value={fmt.number(summary.tables.length)} sub={t('{n} objects in the schema', { n: summary.objects.length })} />
                <Stat label={t('Rows counted')} value={fmt.number(summary.totalRows)} sub={t('from walking the B-trees')} tone="accent" />
                <Stat label={t('File size')} value={iecBytes(summary.fileBytes)} sub={t('{n} pages of {size}', { n: fmt.number(summary.pageCount), size: iecBytes(summary.pageSize) })} />
                <Stat label={t('Encoding')} value={summary.encoding} sub={summary.walMode ? t('WAL journal mode') : t('rollback journal mode')} />
              </div>
              <div className="flex flex-wrap gap-2" {...reportInput(t('File'), `${fileName} · SQLite ${summary.sqliteVersion}`)}>
                <Chip label={t('Written by SQLite')} value={summary.sqliteVersion} />
                <Chip label={t('Schema format')} value={String(summary.schemaFormat)} />
                {summary.userVersion !== 0 && <Chip label={t('user_version')} value={String(summary.userVersion)} />}
                {summary.applicationId !== 0 && <Chip label={t('application_id')} value={`0x${summary.applicationId.toString(16)}`} />}
              </div>
              {summary.walMode && (
                <Notice
                  tone="warn"
                  title={t('WAL mode: committed changes can still sit in the -wal sidecar file. The counts below cover the main file only, so they exclude anything not yet checkpointed. For the current truth, checkpoint first or query the database with sqlite3.')}
                />
              )}
              {summary.freelistPages > 0 && (
                <Notice
                  tone="info"
                  title={t('{pages} freelist pages ({bytes}) hold no data but still take disk: space from deleted rows that SQLite will reuse. VACUUM rebuilds the file and returns it to the filesystem.', {
                    pages: fmt.number(summary.freelistPages),
                    bytes: iecBytes(summary.freelistBytes),
                  })}
                />
              )}
            </Panel>

            <Panel title={t('Tables and row counts')} icon={ListTree}>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('Counts come from walking every page of each table\'s B-tree, so they are exact for this file, not estimates. WITHOUT ROWID tables store their rows in an index B-tree this walk does not cover; they are listed as not counted rather than shown as zero.')}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="sq-tables">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Table')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Rows')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Pages')}</th>
                      <th className="py-1.5 font-medium">{t('SQL')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {[...summary.tables].sort((a, b) => (b.rowCount ?? -1) - (a.rowCount ?? -1)).map((tb) => (
                      <tr key={tb.name}>
                        <td className="py-1.5 pr-3 font-mono text-xs break-all">{tb.name}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">
                          {tb.rowCount === undefined ? t('not counted (WITHOUT ROWID)') : fmt.number(tb.rowCount)}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{tb.pageCount ?? '-'}</td>
                        <td className="py-1.5 font-mono text-[11px] text-gray-600 dark:text-gray-400 break-all max-w-md">{tb.sql}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {SQL_TYPES.map(({ type, heading }) => {
              const rows = summary.objects.filter((o) => o.type === type);
              if (!rows.length) return null;
              return (
                <Panel key={type} title={t(heading)}>
                  <div className="space-y-2" data-testid={`sq-${type}`}>
                    {rows.map((o) => (
                      <div key={o.name} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                        <div className="text-sm font-semibold text-black dark:text-white font-mono break-all">
                          {o.name}
                          {o.tableName && o.tableName !== o.name && (
                            <span className="font-sans font-normal text-xs text-gray-500 dark:text-gray-400 ml-2">{t('on {table}', { table: o.tableName })}</span>
                          )}
                        </div>
                        {o.sql && <pre className="font-mono text-xs mt-1 overflow-x-auto text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">{o.sql}</pre>}
                      </div>
                    ))}
                  </div>
                </Panel>
              );
            })}

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="sqlite-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="sq-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default SqliteFileInspector;
