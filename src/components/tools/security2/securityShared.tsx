import React from 'react';
import { Copy, Download, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useToast } from '@/hooks/use-toast';
import { useT } from '@/i18n';

/** Shared layout pieces for the security tools in this folder. */

export function SecurityShell({ h1, toolName, subtitle, icon: Icon, children, privacyNote }: {
  privacyNote?: string;
  h1: string;
  toolName: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="tool-page bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto px-0 sm:px-4 -mt-5 pb-4">
        <ToolBreadcrumb
          category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
          subcategory={{ label: t('Security Tools'), href: '/category/development-tech/security-tools' }}
          toolName={toolName}
        />
        <div className="tool-header mt-6 space-y-2">
          <h1 className="tool-title text-black dark:text-white text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
            <Icon className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-red-600 shrink-0" />
            {h1}
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base">{subtitle}</p>
          <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> {privacyNote ?? t('Runs entirely in your browser with Web Crypto. Nothing you type is uploaded or stored.')}
          </p>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function Panel({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-6 ${className}`}>
      {title && <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>}
      {children}
    </section>
  );
}

export function Pills<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; disabled?: boolean }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-full text-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${value === o.id
            ? 'bg-red-600 border-red-600 text-white'
            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-red-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</Label>
      {children}
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

export const inputClass = 'bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 text-black dark:text-white focus:border-red-500';
export const selectClass = 'w-full h-10 rounded-md px-3 text-sm bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 text-black dark:text-white focus:border-red-500 focus:outline-none';

/** Copies text with a toast; `what` is the (already translated) name of the thing copied. */
export function useCopy() {
  const { toast } = useToast();
  const { t } = useT();
  return async (text: string, what?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: what === undefined ? t('Value copied') : t('{what} copied', { what }), description: t('Copied to the clipboard.') });
    } catch {
      toast({ title: t('Copy failed'), description: t('Your browser blocked clipboard access.'), variant: 'destructive' });
    }
  };
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A labelled monospace output with copy and optional download buttons. */
export function OutputBlock({ label, value, filename, rows, onCopy, testId }: {
  label: string;
  value: string;
  filename?: string;
  rows?: number;
  onCopy?: () => void;
  testId?: string;
}) {
  const { t } = useT();
  const copy = useCopy();
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => { copy(value, label); onCopy?.(); }} aria-label={t('Copy {label}', { label })}>
            <Copy className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{t('Copy')}</span>
          </Button>
          {filename && (
            <Button type="button" variant="outline" size="sm" onClick={() => downloadText(filename, value)} aria-label={t('Download {label}', { label })}>
              <Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{t('Download')}</span>
            </Button>
          )}
        </div>
      </div>
      <pre
        data-testid={testId}
        className="font-mono text-xs sm:text-sm whitespace-pre-wrap break-all rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 text-gray-900 dark:text-gray-100 p-3 overflow-auto"
        style={rows ? { maxHeight: `${rows * 1.5}rem` } : undefined}
      >
        {value}
      </pre>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: React.ReactNode }) {
  const tones = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100',
    warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100',
    ok: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
  };
  return <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-lg border p-3 text-sm ${tones[tone]}`}>{children}</div>;
}
