/**
 * Numbers, money, percentages and dates per locale, through Intl (CLDR data),
 * so a German page prints 1.234,5 and a Japanese one 2024/11/23.
 * Tools adopt these in phase 2 of
 * docs/seo/i18n-plan.md in place of hard-coded toLocaleString('en-US').
 * en-US (null) formats as en-US.
 */
import { getLocale } from '@/config/locales';
import { PSEUDO_LOCALE } from './core';
import { formatDateParts } from '@/lib/dateText';

/**
 * The BCP 47 tag Intl should format for. The pseudo locale formats as ja-JP,
 * so a date that went through these functions reads visibly non-English
 * (2024年11月23日) in the pseudo-locale check (src/test/i18n.test.tsx).
 */
export const intlTag = (locale: string | null | undefined): string => (locale === PSEUDO_LOCALE ? 'ja-JP' : locale && getLocale(locale) ? getLocale(locale)!.code : 'en-US');

/**
 * Japanese writes yen after the amount with no space, "1,234円", never "￥1,234"
 * (docs/seo/i18n/ja-JP.md, 通貨); Intl's ja-JP currency style gives the
 * fullwidth ￥ prefix, its `currencyDisplay: 'name'` gives the 円 suffix. Only
 * yen in ja-JP changes; every other locale and currency keeps its options.
 */
export function yenOptions(tag: string, opts: Intl.NumberFormatOptions): Intl.NumberFormatOptions {
  return tag === 'ja-JP' && opts.style === 'currency' && opts.currency === 'JPY' && opts.currencyDisplay !== 'code' ? { ...opts, currencyDisplay: 'name' } : opts;
}

/**
 * Market money styles Intl has no option for, applied when a page formats
 * its own market's currency (a currency code display is left alone):
 * - Chinese and Korean write the currency as a word after the amount with no
 *   space: "1,234.56元" (docs/seo/i18n/zh-CN.md, 金额), "1,234,568원"
 *   (docs/seo/i18n/ko-KR.md §4). Intl's symbol style gives "¥1,234.56" /
 *   "₩1,234,568" and its name style "1,234.56人民币" / "1,234,568 대한민국 원",
 *   so the amount is formatted as currency and the symbol replaced by the word.
 * - Indonesian writes "Rp1.234.567": no space after Rp and whole rupiah
 *   (docs/seo/i18n/id-ID.md §4, Bank Indonesia's usage); Intl gives
 *   "Rp 1.234.567,00". Decimals show only when the caller asks for fraction
 *   digits and the amount has a non-zero fraction ("Rp1.444,70/kWh").
 * Yen on ja-JP goes through yenOptions. Every other locale and currency,
 * English pages included, is plain Intl.
 */
const MARKET_MONEY: Record<string, { currency: string; suffix?: string; tight?: boolean; whole?: boolean }> = {
  'zh-CN': { currency: 'CNY', suffix: '元' },
  'ko-KR': { currency: 'KRW', suffix: '원' },
  'id-ID': { currency: 'IDR', tight: true, whole: true },
};

const marketMoney = (tag: string, opts: Intl.NumberFormatOptions) => {
  const rule = MARKET_MONEY[tag];
  return rule && opts.style === 'currency' && opts.currency === rule.currency && opts.currencyDisplay !== 'code' ? rule : undefined;
};

/** The word written after the amount for this locale and currency format ('元', '원'), if any. */
export const currencySuffix = (tag: string, opts: Intl.NumberFormatOptions): string | undefined => marketMoney(tag, opts)?.suffix;

/** Options for the market's money style: whole rupiah on id-ID unless the caller set fraction digits. */
function marketOptions(tag: string, opts: Intl.NumberFormatOptions): Intl.NumberFormatOptions {
  const rule = marketMoney(tag, opts);
  return rule?.whole && opts.minimumFractionDigits === undefined && opts.maximumFractionDigits === undefined ? { ...opts, minimumFractionDigits: 0, maximumFractionDigits: 0 } : opts;
}

/** `f` with its currency symbol replaced by `suffix` after the amount, or (`tight`) the space between symbol and amount dropped; `whole` drops a zero fraction. */
function marketFormat(f: Intl.NumberFormat, rule: { suffix?: string; tight?: boolean; whole?: boolean }): Intl.NumberFormat {
  const parts = (n: number | bigint): Intl.NumberFormatPart[] => {
    let all = f.formatToParts(n);
    // Whole rupiah show no ",00" even when the caller asked for two decimals; "Rp1.444,70" keeps them.
    if (rule.whole && all.some((p) => p.type === 'fraction') && all.every((p) => p.type !== 'fraction' || /^0+$/.test(p.value))) all = all.filter((p) => p.type !== 'fraction' && p.type !== 'decimal');
    const at = all.findIndex((p) => p.type === 'currency');
    if (at < 0) return all;
    const out = all.filter((p, i) => !(rule.suffix && i === at) && !(p.type === 'literal' && /^\s+$/.test(p.value) && Math.abs(i - at) === 1));
    if (rule.suffix) {
      // The word goes right after the number (and a compact 万), before a trailing literal such as an accounting ")".
      let last = -1;
      out.forEach((p, i) => { if (p.type !== 'literal' && p.type !== 'minusSign' && p.type !== 'plusSign') last = i; });
      out.splice(last + 1, 0, { type: 'currency', value: rule.suffix });
    }
    return out;
  };
  return {
    format: (n: number | bigint) => parts(n).map((p) => p.value).join(''),
    formatToParts: parts,
    resolvedOptions: () => f.resolvedOptions(),
  } as unknown as Intl.NumberFormat;
}

const cache = new Map<string, Intl.NumberFormat>();
/**
 * A cached Intl.NumberFormat for `tag` with the market's own money style:
 * yen on ja-JP as "1,234円" (yenOptions), yuan on zh-CN as "1,234.56元" and
 * won on ko-KR as "1,234,568원", rupiah on id-ID as "Rp1.234.567" (MARKET_MONEY). Every other locale and
 * currency is plain Intl with `rawOpts`.
 */
export function moneyFormat(tag: string, rawOpts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const opts = marketOptions(tag, yenOptions(tag, rawOpts));
  const key = `${tag}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    const base = new Intl.NumberFormat(tag, opts);
    const rule = marketMoney(tag, opts);
    cache.set(key, (f = rule ? marketFormat(base, rule) : base));
  }
  return f;
}

const nf = (locale: string | null | undefined, rawOpts: Intl.NumberFormatOptions): Intl.NumberFormat => moneyFormat(intlTag(locale), rawOpts);

export function formatNumber(locale: string | null | undefined, n: number, opts: Intl.NumberFormatOptions = {}): string {
  return nf(locale, { maximumFractionDigits: 2, ...opts }).format(n);
}

/** `currency` defaults to the locale's own (USD on en-US pages); yen on a Japanese page reads "1,234円", yuan on a Chinese one "1,234.56元", won on a Korean one "1,234,568원", rupiah on an Indonesian one "Rp1.234.567" (moneyFormat). */
export function formatCurrency(locale: string | null | undefined, n: number, currency?: string, opts: Intl.NumberFormatOptions = {}): string {
  const cur = currency ?? (locale && getLocale(locale)?.currency) ?? 'USD';
  return nf(locale, { style: 'currency', currency: cur, ...opts }).format(n);
}

/** `fraction` is a ratio: 0.075 -> "7.5%" (en) / "7,5 %" (de). */
export function formatPercent(locale: string | null | undefined, fraction: number, opts: Intl.NumberFormatOptions = {}): string {
  return nf(locale, { style: 'percent', maximumFractionDigits: 2, ...opts }).format(fraction);
}

/**
 * A calendar date (YYYY-MM-DD or a Date) in the locale's order; long month
 * names by default. French writes the first of the month as an ordinal,
 * « 1er novembre 2026 » (docs/seo/i18n/fr-FR.md, Dates), which Intl does not
 * (formatDateParts).
 */
export function formatDate(locale: string | null | undefined, date: string | Date, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }): string {
  const d = typeof date === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date) : date;
  return formatDateParts(new Intl.DateTimeFormat(intlTag(locale), { timeZone: typeof date === 'string' ? 'UTC' : undefined, ...opts }), d);
}

export { formatDateParts } from '@/lib/dateText';

/**
 * Reads a number typed the locale's way: "1.234,5" on a German page, "1 234,5"
 * on a French one, "1,234.5" in English. Returns NaN for anything else.
 *
 * The rule (also documented in ./ambient): spaces of any kind group digits.
 * Where the decimal mark is a comma, a single comma or a single dot is the
 * decimal mark ("1,5" and "1.5" are both 1.5; "1.234" is 1.234, so plain
 * input, code defaults such as '101.325' and type="number" values read the
 * same on every page); with both
 * marks the last one is decimal and the other must group in threes
 * ("1.234,5", "1,234.5"); a repeated mark must group in threes ("1.234.567").
 * Where the decimal mark is a dot, commas group and are dropped, as before.
 */
export function parseNumber(locale: string | null | undefined, text: string): number {
  const l = locale && locale !== PSEUDO_LOCALE ? getLocale(locale) : undefined;
  let s = text.trim().replace(/\s/g, '');
  if ((l?.decimal ?? '.') === ',') {
    const normalized = commaDecimal(s.replace(/^\u2212/, '-'));
    if (normalized === null) return NaN;
    s = normalized;
  } else {
    s = s.split(l?.group && !/\s/.test(l.group) ? l.group : ',').join('');
  }
  return s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? NaN : Number(s);
}

/** "1.234,5" -> "1234.5" for a comma-decimal locale (see parseNumber); null when the marks are not used consistently. */
function commaDecimal(s: string): string | null {
  const m = s.match(/^([-+]?)([\d.,]*)(e[-+]?\d+)?$/i);
  if (!m) return null;
  const [, sign, mantissa, exp = ''] = m;
  const commas = mantissa.split(',').length - 1;
  const dots = mantissa.split('.').length - 1;
  let decimal: string | null = null;
  let group: string | null = null;
  if (commas && dots) {
    decimal = mantissa.lastIndexOf(',') > mantissa.lastIndexOf('.') ? ',' : '.';
    group = decimal === ',' ? '.' : ',';
  } else if (commas || dots) {
    const mark = commas ? ',' : '.';
    if ((commas || dots) === 1) decimal = mark;
    else group = mark;
  }
  let int = mantissa;
  let frac: string | undefined;
  if (decimal) {
    const parts = mantissa.split(decimal);
    if (parts.length !== 2) return null;
    [int, frac] = parts;
  }
  if (group && int.includes(group)) {
    if (!new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(int)) return null;
    int = int.split(group).join('');
  }
  return `${sign}${int}${frac !== undefined ? `.${frac}` : ''}${exp}`;
}
