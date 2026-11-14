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
import { currencyText, localeFormatter, localeNumber, localizeDecimal, parseLocal, usFormat } from '@/i18n/ambient';

/** Shared layout and inputs for the construction and home calculators (concrete, tile, roofing, stairs, BTU, electricity). */

export function ConPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="tool-page bg-white dark:bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-4">{children}</div>
    </div>
  );
}

export function ConHeader({ h1, tagline, icon: Icon }: { h1: string; tagline: string; icon: React.ComponentType<{ className?: string }> }) {
  const { t } = useT();
  return (
    <>
      <ToolBreadcrumb
        category={{ label: t('Calculators'), href: '/category/calculators' }}
        subcategory={{ label: t('Construction & Home'), href: '/category/calculators/construction-calculators' }}
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
          {checkNumMessage(error, t)}
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
export function useConAnalytics(toolName: string, key: string) {
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

/** Fixed-decimal formatting with thousands separators, in the page's number format. */
export function nf(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return localeNumber(x, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** Validation message for a numeric field ('' when fine). */
export function checkNum(s: string, opts: { allowZero?: boolean; optional?: boolean; max?: number } = {}): string | null {
  const x = parseInput(s);
  if (x === undefined) return opts.optional ? null : msg('Required.');
  if (Number.isNaN(x)) return msg('Enter a number.');
  if (x < 0) return msg('Cannot be negative.');
  if (x === 0 && !opts.allowZero) return msg('Must be greater than zero.');
  if (opts.max !== undefined && x > opts.max) return `Must be ${opts.max} or less.`;
  return null;
}

/** A checkNum() message in the page's language (NumField shows errors through this). */
export function checkNumMessage(error: string, t: TFunction): string {
  const max = error.match(/^Must be (.+) or less\.$/);
  if (max) return t('Must be {max} or less.', { max: max[1] });
  // numErr() in engineering/autoDesignShared, shown through this NumField.
  const min = error.match(/^Must be at least (.+)\.$/);
  return min ? t('Must be at least {min}.', { min: min[1] }) : t(error);
}

/** Parsed value or fallback (for optional fields). */
export const val = (s: string, fallback = 0) => {
  const x = parseInput(s);
  return x === undefined || Number.isNaN(x) ? fallback : x;
};

export const CURRENCY_SYMBOLS = [
  { value: '$', label: '$' },
  { value: '€', label: '€' },
  { value: '£', label: '£' },
  { value: '₹', label: '₹' },
  { value: '¥', label: '¥' },
  { value: 'A$', label: 'A$' },
  { value: 'C$', label: 'C$' },
  // Wave 3 markets (docs/seo/l10n/locale-style-guide.md).
  { value: 'NZ$', label: 'NZ$' },
  { value: 'S$', label: 'S$' },
  { value: 'R', label: 'R' },
  { value: '₱', label: '₱' },
  { value: '₦', label: '₦' },
  { value: 'Rs', label: 'Rs' },
  { value: 'AED', label: 'AED' },
];

/** Digit grouping per symbol: Indian lakh grouping for ₹, CLDR en-ZA (space thousands, decimal comma) for R, US style otherwise. */
const MONEY_LOCALE: Record<string, string> = { '₹': 'en-IN', R: 'en-ZA' };
/** Symbols written with a space before the amount, as market-money.ts does (R 1 250,00, Rs 1,250, AED 1,250). */
const SPACED = new Set(['R', 'Rs', 'AED']);

/** On a language page the amount takes the page's separators and the symbol its side ("1.234,50 \u20ac" in German). */
export const money = (sym: string, x: number | null | undefined, digits = 2) =>
  x === null || x === undefined || !Number.isFinite(x)
    ? 'n/a'
    : currencyText(sym, localeFormatter({ minimumFractionDigits: digits, maximumFractionDigits: digits }, MONEY_LOCALE[sym] ?? 'en-US').format(Math.abs(x)), x < 0, SPACED.has(sym));

export const UNIT_SYSTEMS = [
  { value: 'imperial', label: msg('Imperial (ft, in)') },
  { value: 'metric', label: msg('Metric (m, cm)') },
];

/** Round to `sig` significant figures (for converting inputs between unit systems). */
export const roundSig = (x: number, sig = 4) => (x === 0 ? 0 : Number(x.toPrecision(sig)));
