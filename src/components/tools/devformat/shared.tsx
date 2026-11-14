import React from 'react';
import { Copy, Download, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { msg, useT } from '@/i18n';
import { localizeDecimal } from '@/i18n/ambient';

export { ConPage as DevPage, Panel, PickField, Segmented } from '@/components/tools/calculators/constructionShared';

/** Breadcrumb, the page's only H1 and a one-line tagline. */
export function DevHeader({ h1, tagline, icon: Icon, sub }: { h1: string; tagline: string; icon: React.ComponentType<{ className?: string }>; sub: 'code-formatters' | 'data-conversion' }) {
  const { t } = useT();
  return (
    <>
      <ToolBreadcrumb
        category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
        subcategory={{ label: sub === 'code-formatters' ? t('Code Formatters') : t('Data Conversion'), href: `/category/development-tech/${sub}` }}
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

export function useDevActions(toolName: string) {
  const { t } = useT();
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const track = (action: string, params?: Record<string, unknown>) => trackAction(action, { toolName, ...params });
  /** `what` is the caller's own (translated) name for the copied text. */
  const copy = async (text: string, what?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: what === undefined ? t('Output copied') : t('{what} copied', { what }) });
      track('copy');
    } catch {
      toast({ title: t('Could not copy'), description: t('Your browser blocked clipboard access.') });
    }
  };
  const download = (text: string, filename: string, mime = 'text/plain') => {
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    track('download', { filename });
  };
  return { copy, download, track };
}

/** A labelled monospace editor. */
export function CodeArea({
  id,
  label,
  value,
  onChange,
  readOnly,
  rows = 14,
  placeholder,
  actions,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  rows?: number;
  placeholder?: string;
  actions?: React.ReactNode;
  invalid?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <Label htmlFor={id} className="text-sm font-medium text-black dark:text-white">
          {label}
        </Label>
        {actions && <div className="flex flex-wrap gap-1">{actions}</div>}
      </div>
      <Textarea
        id={id}
        value={value}
        readOnly={readOnly}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={placeholder}
        aria-invalid={invalid}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={`font-mono text-xs sm:text-sm leading-relaxed bg-white dark:bg-gray-900 border-2 ${invalid ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'} whitespace-pre overflow-auto`}
        style={{ tabSize: 4 }}
      />
    </div>
  );
}

export function CopyDownload({ text, filename, mime, onCopy, onDownload }: { text: string; filename: string; mime?: string; onCopy: (t: string) => void; onDownload: (t: string, f: string, m?: string) => void }) {
  const { t: tx } = useT();
  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={!text} onClick={() => onCopy(text)}>
        <Copy className="h-4 w-4 mr-1" />{' '}{tx('Copy')}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={!text} onClick={() => onDownload(text, filename, mime)}>
        <Download className="h-4 w-4 mr-1" />{' '}{tx('Download')}
      </Button>
    </>
  );
}

export function Notice({ tone, title, items }: { tone: 'error' | 'warn' | 'ok' | 'info'; title: string; items?: string[] }) {
  const styles = {
    error: 'border-red-300 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800',
    warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800',
    ok: 'border-green-300 bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800',
    info: 'border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800',
  }[tone];
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2 items-start rounded-lg border p-3 text-sm ${styles}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="min-w-0 break-words">
        <div className="font-medium">{title}</div>
        {items && items.length > 0 && (
          <ul className="list-disc pl-4 mt-1 space-y-0.5">
            {items.map((m, k) => (
              <li key={k}>{m}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-1.5 text-xs">
      <span className="text-gray-500 dark:text-gray-400">{label} </span>
      <span className="font-semibold text-black dark:text-white">{value}</span>
    </div>
  );
}

/** "1.5 KB" (the page's decimal mark on a language page: "1,5 KB"). */
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${localizeDecimal((n / 1024).toFixed(1))} KB` : `${localizeDecimal((n / 1024 / 1024).toFixed(2))} MB`);

export function CheckField({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-black dark:text-white cursor-pointer select-none">
      <input id={id} type="checkbox" className="h-4 w-4 accent-red-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Marked for translation here; pages show it through t(PRIVACY_NOTE). */
export const PRIVACY_NOTE = msg('Runs entirely in your browser. Nothing you paste is uploaded.');
