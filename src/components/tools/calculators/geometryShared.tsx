import React, { useEffect, useRef } from 'react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { Copy, Share2, RotateCcw, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { REPORT_FORMULAS, REPORT_NOTE, REPORT_VALUE, reportResult } from '@/lib/report/attrs';
import { msg, useT, type TFunction } from '@/i18n';
import { groupMark, localeNumber, localizeDecimal, parseLocal, usFormat } from '@/i18n/ambient';

/** Shared layout and inputs for the geometry calculators (triangle, area, volume, slope, matrix). */

export function GeoPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="tool-page bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-4">{children}</div>
    </div>
  );
}

export function GeoHeader({ h1, tagline, icon: Icon }: { h1: string; tagline: string; icon: React.ComponentType<{ className?: string }> }) {
  const { t } = useT();
  return (
    <>
      <ToolBreadcrumb
        category={{ label: t('Calculators'), href: '/category/calculators' }}
        subcategory={{ label: t('Geometry Calculators'), href: '/category/calculators/geometry-calculators' }}
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

export function Panel({ title, icon: Icon, children, className = '' }: { title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm min-w-0 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-black dark:text-white text-lg flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-blue-600" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function NumField({
  id,
  label,
  value,
  onChange,
  suffix,
  hint,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: string;
  error?: string | null;
  placeholder?: string;
}) {
  const { t } = useT();
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="text-sm font-medium text-black dark:text-white">
        {label}
      </Label>
      <div className="relative mt-1">
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={`bg-white dark:bg-gray-700 border-2 ${error ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'} ${suffix ? 'pr-12' : ''}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${id}-err`} className="text-xs text-red-600 mt-1">
          {fieldErrorText(error, t)}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PickField({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="text-sm font-medium text-black dark:text-white">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="mt-1" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Segmented button group (mode switches). */
export function Segmented({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-xl bg-gray-100 dark:bg-gray-900/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${value === o.value ? 'bg-white dark:bg-gray-700 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'accent' }) {
  const toneCls = tone === 'accent' ? 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800' : 'border-gray-200 bg-gray-50 dark:bg-gray-900/40 dark:border-gray-700';
  return (
    <div className={`rounded-xl border p-3 min-w-0 ${toneCls}`} {...reportResult(label)}>
      <div className="text-xs text-gray-600 dark:text-gray-300">{label}</div>
      <div className="text-lg sm:text-xl font-bold text-black dark:text-white break-words" {...REPORT_VALUE} data-testid={`stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5" {...REPORT_NOTE}>{sub}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex gap-2 items-start rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function FormulaBox({ title, lines }: { title?: string; lines: string[] }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
      <div className="flex items-center gap-2 font-semibold text-sm text-black dark:text-white mb-2">
        <Info className="h-4 w-4 text-blue-600" />
        {title ?? t('How this was calculated')}
      </div>
      <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 font-mono break-words" {...REPORT_FORMULAS}>
        {lines.map((l, k) => (
          <li key={k}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

export function ActionRow({ summary, shareUrl, onReset, onAction }: { summary: () => string; shareUrl: () => string; onReset: () => void; onAction?: (a: string) => void }) {
  const { t } = useT();
  const { toast } = useToast();
  const copy = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title });
    } catch {
      toast({ title: t('Could not copy'), description: t('Your browser blocked clipboard access.') });
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onAction?.('copy_results');
          copy(summary(), t('Results copied'));
        }}
      >
        <Copy className="h-4 w-4 mr-1" />{' '}{t('Copy results')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onAction?.('share_link');
          copy(shareUrl(), t('Link copied'));
        }}
      >
        <Share2 className="h-4 w-4 mr-1" />{' '}{t('Share link')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onAction?.('reset');
          onReset();
        }}
      >
        <RotateCcw className="h-4 w-4 mr-1" />{' '}{t('Reset')}
      </Button>
    </div>
  );
}

/** One debounced "calculate" event after inputs settle, plus explicit actions. */
export function useGeoAnalytics(toolName: string, key: string) {
  const { trackAction } = useToolAnalytics();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => trackAction('calculate', { toolName }), 1500);
    return () => clearTimeout(t);
  }, [key, toolName, trackAction]);
  return (action: string, params?: Record<string, unknown>) => trackAction(action, { toolName, ...params });
}

/** Validation messages of the science helpers' fieldError(), marked for translation where they are defined. */
export const FIELD_ERRORS = {
  required: msg('Required.'),
  number: msg('Enter a number.'),
  negative: msg('Cannot be negative.'),
  zero: msg('Must be greater than zero.'),
} as const;
const FIELD_ERROR_SET = new Set<string>(Object.values(FIELD_ERRORS));

/** A field error in the page's language: fieldError()'s own messages are translated, a caller's message shows as given. */
export function fieldErrorText(error: string, t: TFunction): string {
  return FIELD_ERROR_SET.has(error) ? t(error) : error;
}

/**
 * Parse an input string: '' -> undefined, bad -> NaN. On a language page the
 * locale's decimal comma and grouping are read too (src/i18n/ambient.ts).
 */
export function parseInput(s: string): number | undefined {
  if (!usFormat()) return s.trim() === '' ? undefined : parseLocal(s);
  const t = s.trim().replace(/,/g, '');
  if (t === '') return undefined;
  return Number(t);
}

/** Up to `sig` significant digits, thousands separators, no trailing zeros; tiny/huge values in scientific notation. In the page's number format. */
export function fmt(x: number | null | undefined, sig = 6): string {
  if (x === null || x === undefined || Number.isNaN(x)) return 'n/a';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e15 || ax < 1e-6) return localizeDecimal(x.toExponential(sig - 1).replace(/\.?0+e/, 'e'));
  const r = Number(x.toPrecision(sig));
  return localeNumber(r, { maximumFractionDigits: 12 });
}

/**
 * fmt() as text for an input box: no digit grouping, the page's decimal mark
 * ("1234.5" on English pages, "1234,5" on a German one), so parseInput reads
 * it back. Use this instead of fmt(x).replace(/,/g, ''), which breaks on
 * comma-decimal pages.
 */
export function fieldText(x: number | null | undefined, sig = 6): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '';
  if (usFormat()) return fmt(x, sig).replace(/,/g, '');
  return fmt(x, sig).split(groupMark()).join('');
}
