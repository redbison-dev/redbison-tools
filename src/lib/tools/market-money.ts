/**
 * Currency display for the interest, investment, EMI and retirement
 * calculators, so a market version (/en-in/emi-calculator) can show its own
 * currency with its own digit grouping (₹12,34,567 in India).
 *
 * USD keeps exactly the strings these pages printed before (`$` + toFixed(2),
 * `$` + toLocaleString(), whole dollars), so the US pages and their working
 * steps are unchanged.
 */
import type { ReportStep } from '@/lib/report/model';
import { msg } from '../msg';

export type MoneyCode = 'USD' | 'GBP' | 'INR' | 'CAD' | 'AUD' | 'EUR' | 'NZD' | 'SGD' | 'ZAR' | 'PHP' | 'NGN' | 'PKR' | 'AED' | 'JPY';

export const MONEY_CURRENCIES: readonly { code: MoneyCode; symbol: string; locale: string; label: string }[] = [
  { code: 'USD', symbol: '$', locale: 'en-US', label: msg('$ US dollar') },
  { code: 'GBP', symbol: '£', locale: 'en-GB', label: msg('£ Pound sterling') },
  { code: 'INR', symbol: '₹', locale: 'en-IN', label: msg('₹ Indian rupee') },
  { code: 'CAD', symbol: '$', locale: 'en-CA', label: msg('$ Canadian dollar') },
  { code: 'AUD', symbol: '$', locale: 'en-AU', label: msg('$ Australian dollar') },
  { code: 'EUR', symbol: '€', locale: 'en-IE', label: msg('€ Euro') },
  { code: 'NZD', symbol: '$', locale: 'en-NZ', label: msg('$ New Zealand dollar') },
  { code: 'SGD', symbol: 'S$', locale: 'en-SG', label: msg('S$ Singapore dollar') },
  // CLDR en-ZA: space thousands and a decimal comma (R 1 234 567,50).
  { code: 'ZAR', symbol: 'R\u00a0', locale: 'en-ZA', label: msg('R South African rand') },
  { code: 'PHP', symbol: '₱', locale: 'en-PH', label: msg('₱ Philippine peso') },
  { code: 'NGN', symbol: '₦', locale: 'en-NG', label: msg('₦ Nigerian naira') },
  { code: 'PKR', symbol: 'Rs\u00a0', locale: 'en-PK', label: msg('Rs Pakistani rupee') },
  { code: 'AED', symbol: 'AED\u00a0', locale: 'en-AE', label: msg('AED UAE dirham') },
  // Yen has no minor unit (ISO 4217 exponent 0): always whole yen.
  { code: 'JPY', symbol: '¥', locale: 'ja-JP', label: msg('¥ Japanese yen') },
];

/** Currencies with no minor unit, shown without decimals whatever style the page asks for. */
const WHOLE_UNITS = new Set(['JPY']);

const info = (code: string) => MONEY_CURRENCIES.find((c) => c.code === code) ?? MONEY_CURRENCIES[0];

export const moneySymbol = (code: string) => info(code).symbol;

/** How a page printed USD before: 'fixed' = `$` + toFixed(2), 'locale' = `$` + toLocaleString(), 'whole' = whole dollars with grouping. */
export type MoneyStyle = 'fixed' | 'locale' | 'whole';

/** A number grouped for the currency's market (Indian grouping for INR). */
export function groupForCurrency(v: number, code: string, minDigits: number, maxDigits: number): string {
  return Math.abs(v).toLocaleString(info(code).locale, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
}

/** Money as the page shows it: unchanged for USD, the market's symbol and grouping otherwise. */
export function formatMoneyIn(v: number, code: string = 'USD', style: MoneyStyle = 'fixed'): string {
  if (!Number.isFinite(v)) return '–';
  if (code === 'USD' || !MONEY_CURRENCIES.some((c) => c.code === code)) {
    if (style === 'fixed') return `$${v.toFixed(2)}`;
    if (style === 'locale') return `$${v.toLocaleString()}`;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  }
  const sign = v < 0 ? '-' : '';
  const digits = style === 'whole' || WHOLE_UNITS.has(code) ? [0, 0] : style === 'fixed' ? [2, 2] : [0, 2];
  return `${sign}${moneySymbol(code)}${groupForCurrency(v, code, digits[0], digits[1])}`;
}

/** Compact chart-axis money: $12k / $1.2M, or ₹50K / ₹12L / ₹1.2Cr for rupees. */
export function axisMoneyIn(code: string = 'USD') {
  const sym = moneySymbol(code);
  return (v: number) => {
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (code === 'INR') {
      const s = a >= 1e7 ? `${+(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${+(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${+(a / 1e3).toFixed(0)}K` : a.toFixed(0);
      return `${sign}${sym}${s}`;
    }
    if (code === 'USD') return `${sign}$${a.toLocaleString()}`;
    const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${+(a / 1e3).toFixed(0)}k` : a.toFixed(0);
    return `${sign}${sym}${s}`;
  };
}

/** Rewrites `$1,234.56` / `$500000.00` in a line of working into the currency, keeping its decimals. */
export function localizeMoneyText(text: string, code: string = 'USD'): string {
  if (code === 'USD' || !text) return text;
  return text.replace(/\$(\d[\d,]*(?:\.\d+)?)/g, (_m, num: string) => {
    const decimals = num.includes('.') && !WHOLE_UNITS.has(code) ? num.split('.')[1].length : 0;
    const v = Number(num.replace(/,/g, ''));
    return Number.isFinite(v) ? `${moneySymbol(code)}${groupForCurrency(v, code, decimals, decimals)}` : _m;
  });
}

/** The working steps in the page's currency (unchanged for USD). */
export function localizeSteps(steps: ReportStep[], code: string = 'USD'): ReportStep[] {
  if (code === 'USD') return steps;
  return steps.map((s) => ({
    ...s,
    formula: s.formula && localizeMoneyText(s.formula, code),
    working: s.working && localizeMoneyText(s.working, code),
    result: localizeMoneyText(s.result, code),
  }));
}
