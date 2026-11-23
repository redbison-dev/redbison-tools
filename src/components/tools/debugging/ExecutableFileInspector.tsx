/**
 * Executable File Inspector: drop an ELF, Mach-O (universal included) or PE
 * binary and read format, architecture, bit width, endianness, file type,
 * linked libraries, segments and entry point. All parsing is
 * src/lib/tools/binary-headers.ts (pinned in
 * src/test/tools/tier-analyzers.test.ts): headers only, per the SysV gABI,
 * Apple's mach-o/loader.h and the Microsoft PE spec. Nothing is executed,
 * disassembled or uploaded.
 */
import React, { useState } from 'react';
import { Cpu, FileText, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inspectBinary, renderBinarySummary, type BinarySummary } from '@/lib/tools/binary-headers';
import { reportInput } from '@/lib/report/attrs';
import { useT } from '@/i18n';
import { DebugPage, DebugHeader, Panel, Notice, Stat, Chip, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';

/**
 * The minimal ELF64 from the test suite (tier-analyzers.test.ts): x86_64
 * executable, entry 0x401000, one LOAD and one DYNAMIC segment, DT_NEEDED
 * libc.so.6. Figures pinned in
 * src/test/tools/wk20261122-inspectors.render.test.tsx.
 */
const SAMPLE_BASE64 =
  'f0VMRgIBAQAAAAAAAAAAAAIAPgAAAAAAABBAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAACAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAAAAAAAFAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGxpYmMuc28uNgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function sampleBytes(): Uint8Array {
  const bin = atob(SAMPLE_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const ExecutableFileInspector = () => {
  const { t } = useT();
  const { copy, download, track } = useDevActions('executable-file-inspector');
  const [summary, setSummary] = useState<BinarySummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const inspect = (bytes: Uint8Array, name: string, source: string) => {
    setError('');
    setSummary(null);
    try {
      setSummary(inspectBinary(bytes));
      setFileName(name);
      track('inspect', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    inspect(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
  };

  const text = summary ? renderBinarySummary(summary) : '';

  return (
    <DebugPage>
      <DebugHeader
        h1={t('Executable File Inspector')}
        tagline={t('Format, architecture, linked libraries, segments and entry point from an ELF, Mach-O or PE binary, read from the headers with nothing executed')}
        icon={Cpu}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Binary')} icon={FileText}>
          <Notice
            tone="info"
            title={t('Headers only, by design: the first kilobytes carry format, architecture and the loader\'s inputs, and reading them runs nothing. No disassembly, no symbol dump, no signature check, and the file never leaves this tab.')}
          />
          <FileDrop
            id="exe-file"
            label={fileName || t('Drop an executable or library here (ELF, Mach-O or PE)')}
            hint={t('Or click to choose one. Files with no extension are normal for ELF and Mach-O.')}
            accept=""
            onFile={onFile}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inspect(sampleBytes(), 'sample-elf', 'sample')}>
              {t('Load a sample')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('Identity')}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="exe-stats">
                <Stat label={t('Format')} value={summary.kind} sub={iecBytes(summary.fileBytes)} />
                <Stat label={t('Architectures')} value={summary.slices.map((s) => s.arch).join(', ')} sub={summary.slices.length > 1 ? t('universal binary: one slice each') : undefined} />
                <Stat label={t('File type')} value={summary.slices[0].fileType} sub={`${summary.slices[0].bits}-bit, ${summary.slices[0].endian}-endian`} />
              </div>
              <div className="flex flex-wrap gap-2" {...reportInput(t('Binary'), `${fileName} · ${summary.kind}`)} />
            </Panel>

            {summary.slices.map((sl, i) => {
              const segs = sl.segments.filter((x) => x.bytes > 0).sort((a, b) => b.bytes - a.bytes);
              return (
                <Panel key={`${sl.arch}-${i}`} title={summary.slices.length > 1 ? t('Slice: {arch}', { arch: sl.arch }) : t('Headers: {arch}', { arch: sl.arch })} icon={Library}>
                  <div className="flex flex-wrap gap-2" data-testid={`exe-slice-${i}`}>
                    <Chip label={t('Type')} value={sl.fileType} />
                    <Chip label={t('Bits')} value={`${sl.bits}-bit ${sl.endian}-endian`} />
                    {sl.entryPoint && <Chip label={t('Entry point')} value={sl.entryPoint} />}
                    {sl.interpreter && <Chip label={t('Interpreter')} value={sl.interpreter} />}
                    {sl.minOsVersion && <Chip label={t('Minimum OS')} value={sl.minOsVersion} />}
                    {sl.stripped !== undefined && <Chip label={t('Symbols')} value={sl.stripped ? t('stripped (no .symtab)') : t('has .symtab')} />}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-black dark:text-white mb-1">{t('Linked libraries ({n})', { n: sl.libraries.length })}</h3>
                      {sl.libraries.length === 0 ? (
                        <p className="text-sm text-gray-600 dark:text-gray-300">{t('None recorded in the headers. Static binaries and libraries loaded at runtime (dlopen, LoadLibrary) both look like this.')}</p>
                      ) : (
                        <ul className="font-mono text-xs space-y-1 break-all" data-testid={`exe-libs-${i}`}>
                          {sl.libraries.map((l, k) => (
                            <li key={`${l}-${k}`}>{l}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-black dark:text-white mb-1">{t('Segments and sections')}</h3>
                      <table className="w-full text-sm" data-testid={`exe-segments-${i}`}>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {segs.slice(0, 12).map((seg, k) => (
                            <tr key={`${seg.name}-${k}`}>
                              <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{iecBytes(seg.bytes)}</td>
                              <td className="py-1.5 font-mono text-xs break-all">{seg.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Panel>
              );
            })}

            <Panel title={t('Text summary')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="binary-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="exe-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default ExecutableFileInspector;
