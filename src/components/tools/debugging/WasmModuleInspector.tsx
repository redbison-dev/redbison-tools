/**
 * WASM Module Inspector: drop a .wasm and read sections, imports, exports,
 * memory and counts. All parsing is src/lib/tools/wasm-inspect.ts (pinned in
 * src/test/tools/tier-analyzers.test.ts): the binary format per the
 * WebAssembly Core Specification, with component-model binaries named by
 * their layer field instead of misread. Nothing is instantiated and the
 * file never leaves the tab.
 */
import React, { useState } from 'react';
import { Box, FileText, ListTree, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inspectWasm, renderWasmSummary, type WasmSummary } from '@/lib/tools/wasm-inspect';
import { reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { DebugPage, DebugHeader, Panel, Notice, Stat, Chip, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';

/**
 * The V8-validated module from the test suite (tier-analyzers.test.ts) plus
 * a name section calling the module "demo": one env.log import, an exported
 * add, memory 1 page min / 4 pages max. Figures pinned in
 * src/test/tools/wk20261122-inspectors.render.test.tsx.
 */
const SAMPLE_BASE64 = 'AGFzbQEAAAABCgJgAABgAn9/AX8CCwEDZW52A2xvZwAAAwIBAQUEAQEBBAcHAQNhZGQAAQoJAQcAIAAgAWoLAAwEbmFtZQAFBGRlbW8=';

function sampleBytes(): Uint8Array {
  const bin = atob(SAMPLE_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const WasmModuleInspector = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('wasm-module-inspector');
  const [summary, setSummary] = useState<WasmSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const inspect = (bytes: Uint8Array, name: string, source: string) => {
    setError('');
    setSummary(null);
    try {
      setSummary(inspectWasm(bytes));
      setFileName(name);
      track('inspect', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    inspect(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
  };

  const text = summary ? renderWasmSummary(summary) : '';
  const totalFunctions = summary ? summary.functionCount + summary.imports.filter((i) => i.kind === 'function').length : 0;
  const sections = summary ? [...summary.sections].sort((a, b) => b.bytes - a.bytes) : [];

  return (
    <DebugPage>
      <DebugHeader
        h1={t('WASM Module Inspector')}
        tagline={t('Sections with sizes, imports and exports by kind, memory pages and counts from a .wasm file, read in your browser per the WebAssembly spec')}
        icon={Box}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Module')} icon={FileText}>
          <Notice
            tone="info"
            title={t('The binary is decoded structurally: nothing is compiled or instantiated, so no code in the module can run, and the file is never uploaded.')}
          />
          <FileDrop
            id="wasm-file"
            label={fileName || t('Drop a .wasm file here')}
            hint={t('Or click to choose one. Read on this page; never uploaded, never executed.')}
            accept=".wasm,application/wasm"
            onFile={onFile}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inspect(sampleBytes(), 'demo.wasm', 'sample')}>
              {t('Load a sample')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('The module at a glance')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="wasm-stats">
                <Stat label={t('Binary version')} value={`v${summary.version}`} sub={iecBytes(summary.fileBytes)} />
                <Stat label={t('Functions')} value={fmt.number(totalFunctions)} sub={t('{n} imported', { n: summary.importCount })} />
                <Stat label={t('Exports')} value={fmt.number(summary.exportCount)} sub={t('{n} tables, {m} globals', { n: summary.tables, m: summary.globals })} />
                <Stat
                  label={t('Memory')}
                  value={summary.memories.length ? t('{n} pages', { n: summary.memories[0].initialPages }) : '—'}
                  sub={summary.memories.length ? iecBytes(summary.memories[0].bytesMin) : t('none declared')}
                />
              </div>
              <div className="flex flex-wrap gap-2" {...reportInput(t('Module'), `${fileName} · ${iecBytes(summary.fileBytes)}`)}>
                {summary.moduleName && <Chip label={t('Module name')} value={summary.moduleName} />}
                {summary.hasStart && <Chip label={t('Start section')} value={t('runs at instantiation')} />}
                {summary.customSections.length > 0 && <Chip label={t('Custom sections')} value={summary.customSections.join(', ')} />}
              </div>
              {summary.memories.map((m, i) => (
                <p key={i} className="text-sm text-gray-600 dark:text-gray-300">
                  {m.maxPages !== undefined
                    ? t('Memory: {n} pages ({a}) now, growable to {m} pages ({b}). A page is 65536 bytes by definition.', { n: m.initialPages, a: iecBytes(m.bytesMin), m: m.maxPages, b: iecBytes(m.maxPages * 65536) })
                    : t('Memory: {n} pages ({a}) with no declared maximum, so memory.grow may keep asking the embedder. A page is 65536 bytes by definition.', { n: m.initialPages, a: iecBytes(m.bytesMin) })}
                </p>
              ))}
            </Panel>

            <Panel title={t('Sections by size')} icon={ListTree}>
              <table className="w-full text-sm max-w-xl" data-testid="wasm-sections">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-1.5 pr-3 font-medium text-right">{t('Bytes')}</th>
                    <th className="py-1.5 font-medium">{t('Section')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sections.map((s, i) => (
                    <tr key={`${s.name}-${i}`}>
                      <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{iecBytes(s.bytes)}</td>
                      <td className="py-1.5 font-mono text-xs break-all">{s.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title={t('Imports: what the host must provide')} icon={PlugZap}>
                {summary.imports.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">{t('No imports: the module instantiates with an empty import object.')}</p>
                ) : (
                  <table className="w-full text-sm" data-testid="wasm-imports">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1.5 pr-3 font-medium">{t('Kind')}</th>
                        <th className="py-1.5 font-medium">{t('Import')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {summary.imports.map((im, i) => (
                        <tr key={`${im.module}.${im.name}-${i}`}>
                          <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{im.kind}</td>
                          <td className="py-1.5 font-mono text-xs break-all">{im.module}.{im.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
              <Panel title={t('Exports')}>
                {summary.exports.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">{t('No exports: nothing in this module is callable from outside.')}</p>
                ) : (
                  <table className="w-full text-sm" data-testid="wasm-exports">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-1.5 pr-3 font-medium">{t('Kind')}</th>
                        <th className="py-1.5 font-medium">{t('Name')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {summary.exports.map((ex, i) => (
                        <tr key={`${ex.name}-${i}`}>
                          <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{ex.kind}</td>
                          <td className="py-1.5 font-mono text-xs break-all">{ex.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="wasm-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="wasm-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default WasmModuleInspector;
