/**
 * Shared pieces for the debugging-dump analyzers (thread dumps, HPROF heap
 * dumps, V8 heap snapshots). Same shape as devformat/shared.tsx: one
 * breadcrumb + H1 header, a drop zone that takes the dump file, and the
 * copy/download actions. All parsing happens in the caller; nothing here
 * touches the network, which is the point of these tools.
 */
import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useT } from '@/i18n';
import { localizeDecimal } from '@/i18n/ambient';

export { DevPage as DebugPage, Panel } from '@/components/tools/devformat/shared';
export { Notice, Chip, useDevActions, CopyDownload } from '@/components/tools/devformat/shared';
export { Stat } from '@/components/tools/calculators/constructionShared';

/** Breadcrumb, the page's only H1 and a one-line tagline. */
export function DebugHeader({ h1, tagline, icon: Icon }: { h1: string; tagline: string; icon: React.ComponentType<{ className?: string }> }) {
  const { t } = useT();
  return (
    <>
      <ToolBreadcrumb
        category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
        subcategory={{ label: t('Debugging'), href: '/category/development-tech/debugging' }}
        toolName={h1}
      />
      <div className="tool-header mt-6">
        <h1 className="tool-title text-black dark:text-white text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
          <Icon className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-red-600 shrink-0" />
          {h1}
        </h1>
        <p className="tool-description text-gray-600 dark:text-gray-300 text-sm sm:text-base mt-2">{tagline}</p>
      </div>
    </>
  );
}

/** "512 B", "1.0 KiB", "3.4 MiB" — the same IEC units the lib renders. */
export function iecBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let v = n;
  let u = -1;
  do { v /= 1024; u += 1; } while (v >= 1024 && u < units.length - 1);
  return `${localizeDecimal(v >= 100 ? String(Math.round(v)) : v.toFixed(1))} ${units[u]}`;
}

/**
 * A drag-and-drop target wrapping a hidden file input. The file is handed
 * to the caller as-is; it is never read here and never leaves the browser.
 */
export function FileDrop({
  id,
  label,
  hint,
  accept,
  onFile,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  onFile: (f: File) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const take = (files: FileList | null) => {
    const f = files?.[0];
    if (f && !disabled) onFile(f);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition-colors min-w-0 ${over ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-gray-300 dark:border-gray-600 hover:border-red-400 hover:bg-gray-50 dark:hover:bg-gray-800/60'} ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <Upload className="h-6 w-6 text-red-600" />
      <div className="font-medium text-black dark:text-white">{label}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{hint}</div>
      <input ref={inputRef} id={id} type="file" accept={accept} className="hidden" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

/** Determinate progress while a dump streams through the parser. */
export function ParseProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
        <span>{label}</span>
        <span>{iecBytes(done)} / {iecBytes(total)} ({localizeDecimal(String(pct))}%)</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className="h-full bg-red-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Gzip magic: jcmd GC.heap_dump -gz and gzipped snapshot exports start 1f 8b. */
export const isGzip = (bytes: Uint8Array) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
