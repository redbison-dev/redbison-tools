/**
 * Open-source build: English-only i18n. The pure string layer (msg, translate,
 * plural handling) is the main repo's own core, so tool components behave
 * identically; only the catalog loading and locale switching are gone — every
 * hook below is pinned to US English.
 */
import React, { Fragment, useMemo } from 'react';
import { translate, type UiLocale } from './core';
import { formatCurrency, formatDate, formatNumber, formatPercent, parseNumber } from './format';

export { msg, translate, PSEUDO_LOCALE, type UiLocale } from './core';
export { renderLocale, setRenderLocale, resetRenderLocale, withRenderLocale, formatLocaleFor } from './ambient';

type Vars = Record<string, string | number>;

export function I18nProvider({ children }: { locale?: UiLocale; overrides?: Record<string, string>; children: React.ReactNode }) {
  return <>{children}</>;
}

export function I18nGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useUiLocale(): UiLocale {
  return null as UiLocale; // null is US English, same convention as the main repo
}

export type TFunction = (source: string, vars?: Vars) => string;

function rich(text: string, vars: Record<string, React.ReactNode>): React.ReactNode {
  const parts = text.split(/\{(\w+)\}/);
  return parts.map((p, i) => (i % 2 ? <Fragment key={i}>{vars[p] ?? `{${p}}`}</Fragment> : p));
}

export function useT(): { t: TFunction; tr: (source: string, vars: Record<string, React.ReactNode>) => React.ReactNode; locale: UiLocale } {
  return useMemo(() => {
    const t: TFunction = (source, vars) => translate(null, source, vars);
    const tr = (source: string, vars: Record<string, React.ReactNode>) => {
      const strings: Vars = {};
      for (const [k, v] of Object.entries(vars)) if (typeof v === 'string' || typeof v === 'number') strings[k] = v;
      const nodes = Object.fromEntries(Object.entries(vars).filter(([k]) => !(k in strings)));
      return rich(translate(null, source, strings), nodes);
    };
    return { t, tr, locale: null as UiLocale };
  }, []);
}

export function useFormat() {
  return useMemo(
    () => ({
      locale: null as UiLocale,
      number: (n: number, opts?: Intl.NumberFormatOptions) => formatNumber(null, n, opts),
      currency: (n: number, currency?: string, opts?: Intl.NumberFormatOptions) => formatCurrency(null, n, currency, opts),
      percent: (fraction: number, opts?: Intl.NumberFormatOptions) => formatPercent(null, fraction, opts),
      date: (d: string | Date, opts?: Intl.DateTimeFormatOptions) => formatDate(null, d, opts),
      parse: (text: string) => parseNumber(null, text),
    }),
    [],
  );
}

export function useLongDate(): (iso: string) => string {
  return (iso) => formatDate(null, iso);
}
