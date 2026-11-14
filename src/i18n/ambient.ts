/**
 * The render locale: which locale the module-level number and date helpers in
 * src/components/tools (fmt, nf, money, pct, parseInput, num, ...) format and
 * parse for, so hundreds of call sites follow the page's language without
 * each one taking a locale argument (docs/seo/i18n-plan.md, phase 2).
 *
 * Who sets it, and why a module-level value is safe:
 * - In the browser, I18nGate (src/i18n/index.tsx) sets it synchronously while
 *   it renders, from the current URL, before any page component below it
 *   renders, and again on every navigation (it re-renders on each location
 *   change, US routes included, which set it back to null). Only one page is
 *   on screen at a time, so a value that lasts until the next navigation is
 *   exactly the page's locale, also for later re-renders, effects and event
 *   handlers of that page. It is never reset after render on purpose: a
 *   state update deep in a tool re-renders that tool without re-rendering
 *   the gate, and must still see the page's locale.
 * - In prerender and other Node rendering, renderToStaticMarkup is
 *   synchronous and pages are rendered one after another, so
 *   withRenderLocale() sets the page's locale, renders, and restores the
 *   previous value in `finally` (src/lib/seo/staticPage.tsx), so one page's
 *   locale cannot leak into the next page even when a render throws.
 * - An I18nProvider with an explicit `locale` (tests, whole-tree roots) sets
 *   it too. Tests that set it should reset it (resetRenderLocale) afterwards.
 *
 * Only languages other than English set it (formatLocaleFor): US and English
 * market pages keep the en-US formatting they have always had, so their
 * output is byte-identical. Code in src/lib (MCP calculators included) must
 * not read it: MCP output stays US.
 *
 * Parsing rule (parseNumber in ./format, used by the helpers on language
 * pages). Spaces (incl. U+00A0, U+202F, U+2009) are always grouping and are
 * dropped. On a page whose decimal mark is a comma (de, fr, es-ES, pt-BR,
 * ru, id):
 *   - "1.234,5" / "1,234.5": both marks present, the last one is the decimal
 *     mark and the other must group digits in threes.
 *   - "1,5" / "1,234": a single comma is the decimal mark (1.5, 1.234).
 *   - "1.5" / "1.234": a single dot is a decimal point too, on every page
 *     ("1.234" is 1.234, never 1234). This is the ambiguous case, decided
 *     for the dot: browser type="number" values ("1.234"), default field
 *     strings written in code ('101.325' kPa, '1.333') and plain programmer
 *     input keep their value everywhere. A German reader who means 1234
 *     writes "1234" or "1.234,0"; input boxes are filled with ungrouped text
 *     (fieldText in geometryShared), so a page never feeds "1.234" back.
 *   - "1.234.567" / "1,234,567": a repeated mark groups digits in threes.
 *   - anything else (misplaced groups, two decimal marks) is NaN.
 * On a dot-decimal page (en-US, English markets, ja, zh, ko, es-MX) commas are
 * grouping and are dropped, as the US helpers always did.
 */
import { getLocale } from '@/config/locales';
import { needsCatalog, PSEUDO_LOCALE, translate, type UiLocale, type Vars } from './core';
import { intlTag, moneyFormat, parseNumber } from './format';

let current: UiLocale = null;

/** The locale the module-level helpers format for; null is en-US. */
export const renderLocale = (): UiLocale => current;

/** Sets the render locale (I18nGate does this while rendering; null or undefined is en-US). */
export function setRenderLocale(locale: UiLocale | undefined): void {
  current = locale ?? null;
}

export function resetRenderLocale(): void {
  current = null;
}

/**
 * Runs a synchronous render with `locale` as the render locale and restores
 * the previous one afterwards, also when it throws. For Node rendering
 * (prerender, tests): renderToStaticMarkup finishes inside `fn`.
 */
export function withRenderLocale<T>(locale: UiLocale | undefined, fn: () => T): T {
  const previous = current;
  current = locale ?? null;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

/** The render locale for a page whose interface locale is `ui`: languages and the pseudo locale; English pages stay en-US (null). */
export const formatLocaleFor = (ui: UiLocale | undefined): UiLocale => (ui === PSEUDO_LOCALE || needsCatalog(ui) ? ui! : null);

/** True on en-US formatting (every English page): helpers then run their original code unchanged. */
export const usFormat = (): boolean => current === null;

/** BCP 47 tag of the render locale ('en-US' when unset). */
export const renderTag = (): string => intlTag(current);

const formatters = new Map<string, Intl.NumberFormat>();
function cachedFormat(tag: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${tag}|${JSON.stringify(opts)}`;
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = new Intl.NumberFormat(tag, opts)));
  return f;
}

/** `x.toLocaleString(<render locale>, opts)`; exactly `x.toLocaleString('en-US', opts)` on English pages. */
export function localeNumber(x: number, opts: Intl.NumberFormatOptions = {}): string {
  if (current === null) return x.toLocaleString('en-US', opts);
  return moneyFormat(renderTag(), opts).format(x);
}

/** An Intl.NumberFormat for the render locale (`fallbackTag` on English pages, for helpers with their own market rules). */
export function localeFormatter(opts: Intl.NumberFormatOptions, fallbackTag = 'en-US'): Intl.NumberFormat {
  // Yen, yuan and won follow their market's style only on that market's page (1,234円, 1,234.56元, 1,234,568원; moneyFormat); English pages keep their fallback output whatever it is.
  return current === null ? cachedFormat(fallbackTag, opts) : moneyFormat(renderTag(), opts);
}

const marks = new Map<string, { decimal: string; group: string; percent: { before: boolean; gap: string }; currency: { before: boolean; gap: string } }>();
function marksOf(tag: string) {
  let m = marks.get(tag);
  if (m) return m;
  const num = new Intl.NumberFormat(tag).formatToParts(12345.5);
  const pctParts = new Intl.NumberFormat(tag, { style: 'percent' }).formatToParts(0.5);
  // The locale's own currency shows where its symbols go (EUR would read as a code, "EUR 1", in es-MX).
  const curParts = new Intl.NumberFormat(tag, { style: 'currency', currency: getLocale(tag)?.currency ?? 'USD' }).formatToParts(1);
  const numeric = (p: Intl.NumberFormatPart) => p.type === 'integer' || p.type === 'group' || p.type === 'decimal' || p.type === 'fraction';
  const literals = (parts: Intl.NumberFormatPart[]) => parts.filter((p) => p.type === 'literal').map((p) => p.value).join('');
  const affix = (parts: Intl.NumberFormatPart[], type: string) => {
    const at = parts.findIndex((p) => p.type === type);
    const firstNum = parts.findIndex(numeric);
    if (at < firstNum) return { before: true, gap: literals(parts.slice(at + 1, firstNum)) };
    let lastNum = firstNum;
    parts.forEach((p, i) => { if (numeric(p)) lastNum = i; });
    return { before: false, gap: literals(parts.slice(lastNum + 1, at)) };
  };
  m = {
    decimal: num.find((p) => p.type === 'decimal')?.value ?? '.',
    group: num.find((p) => p.type === 'group')?.value ?? ',',
    percent: affix(pctParts, 'percentSign'),
    currency: affix(curParts, 'currency'),
  };
  marks.set(tag, m);
  return m;
}

/** The render locale's decimal mark ('.' on English pages). */
export const decimalMark = (): string => (current === null ? '.' : marksOf(renderTag()).decimal);
/** The render locale's digit-grouping mark (',' on English pages; U+202F in French, '.' in German). */
export const groupMark = (): string => (current === null ? ',' : marksOf(renderTag()).group);

/**
 * A plain machine number ("1.5", "2.50e-7", "1234.56" from toFixed or
 * toExponential) with the render locale's decimal mark; unchanged on English
 * pages. Not for grouped text.
 */
export function localizeDecimal(text: string): string {
  if (current === null) return text;
  const d = decimalMark();
  return d === '.' ? text : text.replace('.', d);
}

/** "12.5" -> "12.5%" on English pages, "12,5 %" on a German one ("12,5 %" with U+202F in French). `numberText` is already localized. */
export function percentText(numberText: string): string {
  if (current === null) return `${numberText}%`;
  const { before, gap } = marksOf(renderTag()).percent;
  return before ? `%${gap}${numberText}` : `${numberText}${gap}%`;
}

/**
 * A symbol and an already formatted amount in the render locale's order:
 * "$1,234.50" on English pages (where `spaced` adds a no-break space after
 * the symbol, as for "R 1 234,50"), "1.234,50 €" on a German page; on a
 * Japanese page a yen sign becomes the 円 suffix ("1,234円"), on a Chinese
 * page a yuan sign the 元 suffix ("1,234.56元"), on a Korean page a won sign
 * the 원 suffix ("1,234,568원"), on an Indonesian page Rp goes first with no
 * space ("Rp1.234.567"), and other symbols go first ("$1,234.50").
 */
export function currencyText(symbol: string, amountText: string, negative: boolean, spaced = false): string {
  const sign = negative ? '-' : '';
  if (current === null) return `${sign}${symbol}${spaced ? '\u00a0' : ''}${amountText}`;
  // A yen sign on a Japanese page is yen (1,234円), a yuan sign on a Chinese page yuan (1,234.56元), a won sign on a Korean page won (1,234,568원), as moneyFormat does for Intl.
  const suffix = SUFFIX_SIGNS[renderTag()];
  if (suffix?.signs.has(symbol)) return `${sign}${amountText}${suffix.word}`;
  const { before, gap: cldrGap } = marksOf(renderTag()).currency;
  // Indonesian writes "Rp1.234.567" with no space (docs/seo/i18n/id-ID.md), as moneyFormat does for Intl.
  const gap = renderTag() === 'id-ID' && symbol === 'Rp' ? '' : cldrGap;
  const space = gap || (spaced && !(renderTag() === 'id-ID' && symbol === 'Rp') ? '\u00a0' : '');
  return before ? `${sign}${symbol}${space}${amountText}` : `${sign}${amountText}${gap || '\u00a0'}${symbol}`;
}

/**
 * Signs written as a word after the amount on their own market's page
 * (docs/seo/i18n/ja-JP.md 通貨, zh-CN.md 金额, ko-KR.md §4): yen on Japanese
 * pages (halfwidth, fullwidth, CLDR's JP¥), yuan on Chinese pages (¥ is the
 * yuan sign in zh-CN; CN¥, ￥), won on Korean pages (₩, fullwidth ￦).
 */
const SUFFIX_SIGNS: Record<string, { signs: Set<string>; word: string }> = {
  'ja-JP': { signs: new Set(['¥', '￥', 'JP¥']), word: '円' },
  'zh-CN': { signs: new Set(['¥', '￥', 'CN¥']), word: '元' },
  'ko-KR': { signs: new Set(['₩', '￦']), word: '원' },
};

/** Reads a typed number on the current page (see the parsing rule above); NaN for blank or invalid text. */
export const parseLocal = (text: string): number => parseNumber(current, text);

/**
 * A text field as a number: blank -> undefined, invalid -> NaN. English pages
 * keep the helpers' original rule (commas dropped, then Number()); language
 * pages read the locale's format (parseLocal).
 */
export function parseField(text: string): number | undefined {
  const raw = String(text);
  if (current === null) {
    const t = raw.trim().replace(/,/g, '');
    return t === '' ? undefined : Number(t);
  }
  return raw.trim() === '' ? undefined : parseLocal(raw);
}

/** translate() for the render locale (module-level strings such as "3 days"); the source on English pages. */
export const renderT = (source: string, vars?: Vars): string => translate(current, source, vars);
