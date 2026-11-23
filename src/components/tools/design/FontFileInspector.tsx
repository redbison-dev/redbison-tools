/**
 * Font File Inspector: drop a .ttf, .otf or .ttc and read the name table
 * strings, glyph count, units per em, weight/width class, the fsType
 * embedding permissions, the mapped-character count from cmap and every
 * table's byte size. All parsing is src/lib/tools/font-inspect.ts (pinned
 * in src/test/tools/tier-analyzers.test.ts against the repo's own DejaVu
 * Sans Bold), per the Microsoft OpenType spec (name, head, maxp, OS/2,
 * cmap). WOFF/WOFF2 are named as compressed wrappers. The font never
 * leaves the tab.
 */
import React, { useState } from 'react';
import { Type, FileText, ShieldCheck, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { inspectFont, renderFontSummary, type FontSummary } from '@/lib/tools/font-inspect';
import { reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { DebugPage, Panel, Notice, Stat, Chip, FileDrop, CopyDownload, useDevActions, iecBytes } from '@/components/tools/debugging/shared';

const FontFileInspector = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('font-file-inspector');
  const [summary, setSummary] = useState<FontSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [loadingSample, setLoadingSample] = useState(false);

  const inspect = (bytes: Uint8Array, name: string, source: string) => {
    setError('');
    setSummary(null);
    try {
      setSummary(inspectFont(bytes));
      setFileName(name);
      track('inspect', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    inspect(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
  };

  /** The site's own PDF-report font, served from this origin: no third party. */
  const loadDemoFont = async () => {
    setLoadingSample(true);
    setError('');
    try {
      const res = await fetch('/fonts/DejaVuSans-Bold.ttf');
      if (!res.ok) throw new Error(t('Could not load the sample font from this site.'));
      inspect(new Uint8Array(await res.arrayBuffer()), 'DejaVuSans-Bold.ttf', 'sample');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSample(false);
    }
  };

  const text = summary ? renderFontSummary(summary) : '';

  return (
    <DebugPage>
      <ToolBreadcrumb
        category={{ label: t('Creative & Design'), href: '/category/creative-design' }}
        subcategory={{ label: t('Design Tools'), href: '/category/creative-design/design-tools' }}
        toolName={t('Font File Inspector')}
      />
      <div className="tool-header mt-6">
        <h1 className="tool-title text-black dark:text-white text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
          <Type className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-red-600 shrink-0" />
          {t('Font File Inspector')}
        </h1>
        <p className="tool-description text-gray-600 dark:text-gray-300 text-sm sm:text-base mt-2">
          {t('Family, version, glyph count, embedding permissions, character coverage and per-table sizes from a TTF, OTF or TTC, read in your browser')}
        </p>
      </div>
      <div className="space-y-6 mt-6">
        <Panel title={t('Font file')} icon={FileText}>
          <Notice
            tone="info"
            title={t('Everything shown comes from the font\'s own tables (name, head, maxp, OS/2, cmap) per the OpenType spec. The file is parsed in this tab and never uploaded.')}
          />
          <FileDrop
            id="font-file"
            label={fileName || t('Drop a .ttf, .otf or .ttc here')}
            hint={t('Or click to choose one. WOFF and WOFF2 are named as compressed wrappers; decompress those first.')}
            accept=".ttf,.otf,.ttc,font/ttf,font/otf,font/collection"
            onFile={onFile}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={loadingSample} onClick={loadDemoFont}>
              {loadingSample ? t('Loading the sample font…') : t('Load the sample font (DejaVu Sans Bold)')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            {summary.kind === 'collection' && (
              <Notice tone="info" title={t('A TrueType collection: {n} faces sharing one file. Each face is listed below with its own names and metrics.', { n: summary.faces.length })} />
            )}
            {summary.faces.map((face, fi) => (
              <React.Fragment key={fi}>
                <Panel title={[face.names.family, face.names.subfamily].filter(Boolean).join(' ') || face.names.fullName || t('Face {n}', { n: fi + 1 })}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid={`font-stats-${fi}`}>
                    <Stat label={t('Glyphs')} value={fmt.number(face.glyphCount)} sub={face.flavor} />
                    <Stat label={t('Maps')} value={face.mappedChars ? fmt.number(face.mappedChars) : '—'} sub={t('characters in cmap')} />
                    <Stat label={t('Units per em')} value={String(face.unitsPerEm)} sub={t('the design grid')} />
                    <Stat label={t('Weight class')} value={face.weightClass ? String(face.weightClass) : '—'} sub={face.weightName} />
                  </div>
                  <div className="flex flex-wrap gap-2" {...reportInput(t('Font'), `${fileName} · ${face.names.fullName ?? ''}`)}>
                    {face.names.version && <Chip label={t('Version')} value={face.names.version} />}
                    {face.bold && <Chip label={t('Style bit')} value={t('bold')} />}
                    {face.italic && <Chip label={t('Style bit')} value={t('italic')} />}
                    {face.modified && <Chip label={t('Modified')} value={face.modified} />}
                    {face.created && <Chip label={t('Created')} value={face.created} />}
                    {(face.names.designer || face.names.manufacturer) && (
                      <Chip label={t('By')} value={[face.names.designer, face.names.manufacturer].filter(Boolean).join(' / ')} />
                    )}
                  </div>
                </Panel>

                <Panel title={t('Embedding permissions')} icon={ShieldCheck}>
                  <div data-testid={`font-embedding-${fi}`}>
                    <p className="text-base font-medium text-black dark:text-white">{face.embedding ?? t('No OS/2 table, so the font states no embedding permission.')}</p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('fsType in the OS/2 table is the license switch the OpenType spec defines. Installable (0) is the most permissive: the font may be embedded and even permanently installed on the receiving system. Restricted (bit 1) means no modifying, embedding or exchanging without the owner\'s permission, and PDF and Office exporters refuse accordingly. Preview-and-print and editable sit between, and separate bits can forbid subsetting or limit embedding to bitmaps.')}
                  </p>
                </Panel>

                <Panel title={t('Tables by size')} icon={Table2}>
                  <table className="w-full text-sm max-w-xl" data-testid={`font-tables-${fi}`}>
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1.5 pr-3 font-medium text-right">{t('Bytes')}</th>
                        <th className="py-1.5 font-medium">{t('Table')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {face.tables.map((tb, k) => (
                        <tr key={`${tb.tag}-${k}`}>
                          <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{iecBytes(tb.bytes)}</td>
                          <td className="py-1.5 font-mono text-xs">{tb.tag}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </React.Fragment>
            ))}

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="font-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="font-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default FontFileInspector;
