import React, { useState } from 'react';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { Button } from '@/components/ui/button';
import { Check, Copy, Download, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useT } from '@/i18n';

/** Shared layout pieces for the Web & DevOps tools. */
export { GeoPage as WebPage, Panel, PickField, Segmented, Stat, ErrorNote } from '@/components/tools/calculators/geometryShared';

export function WebHeader({ h1, tagline, icon: Icon }: { h1: string; tagline: string; icon: React.ComponentType<{ className?: string }> }) {
  const { t } = useT();
  return (
    <>
      <ToolBreadcrumb
        category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
        subcategory={{ label: t('Web & DevOps'), href: '/category/development-tech/web-devops' }}
        toolName={h1}
      />
      <div className="tool-header mt-6">
        <h1 className="tool-title text-black dark:text-white text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
          <Icon className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600 shrink-0" />
          {h1}
        </h1>
        <p className="tool-description text-gray-600 dark:text-gray-300 text-sm sm:text-base mt-2">{tagline}</p>
      </div>
    </>
  );
}

/** "Runs in your browser" note. */
export function LocalNote({ children }: { children?: React.ReactNode }) {
  const { t } = useT();
  return (
    <p className="flex gap-2 items-start text-xs text-gray-600 dark:text-gray-300">
      <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
      <span>{children ?? t('Runs entirely in your browser. Nothing you type is uploaded.')}</span>
    </p>
  );
}

export function CopyButton({ text, label, onCopied, size = 'sm' }: { text: string; label?: string; onCopied?: () => void; size?: 'sm' | 'default' }) {
  const { t } = useT();
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
          onCopied?.();
        } catch {
          toast({ title: t('Could not copy'), description: t('Your browser blocked clipboard access.') });
        }
      }}
    >
      {done ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
      {done ? t('Copied') : label ?? t('Copy')}
    </Button>
  );
}

export function DownloadButton({ text, filename, mime = 'text/plain', label, onDone }: { text: string; filename: string; mime?: string; label?: string; onDone?: () => void }) {
  const { t } = useT();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        onDone?.();
      }}
    >
      <Download className="h-4 w-4 mr-1" /> {label ?? t('Download')}
    </Button>
  );
}

/** Monospace output block that wraps on small screens instead of scrolling the page. */
export function CodeOut({ value, label, maxH = 'max-h-[28rem]' }: { value: string; label?: string; maxH?: string }) {
  return (
    <pre aria-label={label} className={`rounded-xl bg-gray-900 text-gray-100 text-xs sm:text-sm p-3 sm:p-4 overflow-auto ${maxH} whitespace-pre-wrap break-all font-mono`}>
      {value}
    </pre>
  );
}

export function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs sm:text-sm border transition-colors ${active ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500'}`}
    >
      {children}
    </button>
  );
}

/** Track a named action for the tool. */
export function useWebAnalytics(toolName: string) {
  const { trackAction } = useToolAnalytics();
  return (action: string, params?: Record<string, unknown>) => trackAction(action, { toolName, ...params });
}
