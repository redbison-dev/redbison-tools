/**
 * Interface translation, without React (docs/seo/i18n-plan.md).
 *
 * Messages are keyed by their exact US English source string (gettext style),
 * or by a context and that string for a word with several meanings
 * (msg.ctx('ordinal', 'Second'), src/lib/msg.ts), shown without the context
 * in English,
 * so base and English-market pages render the source unchanged and no keys
 * are invented. `{name}` placeholders are filled from `vars`. Catalogs live in
 * src/i18n/messages/<locale>.json and are registered here: lazily in the
 * browser (./load), all at once in prerender and tests (./eager).
 *
 * A language page is rendered in its language by React itself, never by
 * swapping text in the browser, so the prerendered HTML is already translated.
 */
import { getLocale, type LocaleCode } from '@/config/locales';
import { oneTakesCount, plainText, pluralGroupOf, type PluralForms } from '@/lib/msg';

/**
 * Every CLDR form of a count message (msg.plural, src/lib/msg.ts), stored
 * under its English plural key: { "one": "{n} jour", "many": "{n} de jours",
 * "other": "{n} jours" }. Only plural keys (src/i18n/plurals.json) may hold
 * one, and it needs every category of the language
 * (Intl.PluralRules(...).resolvedOptions().pluralCategories); a plain string
 * for the plural key (with the singular key's own string) also works.
 */
export type PluralValue = { [K in Intl.LDMLPluralRule]?: string } & { other: string };
export type Catalog = Record<string, string | PluralValue>;
export type Vars = Record<string, string | number>;

/** Test-only pseudo locale: every t() string comes out accented and bracketed, so untranslated English stands out. */
export const PSEUDO_LOCALE = 'qps';
/** Any locale t() accepts: a LocaleCode, the pseudo locale, or null for en-US. */
export type UiLocale = LocaleCode | typeof PSEUDO_LOCALE | null;

const catalogs = new Map<string, Catalog>();
const listeners = new Set<() => void>();
let version = 0;

export function registerCatalog(code: string, catalog: Catalog): void {
  catalogs.set(code, catalog);
  version++;
  for (const l of listeners) l();
}
export const hasCatalog = (code: string): boolean => catalogs.has(code);
export const getCatalog = (code: string): Catalog | undefined => catalogs.get(code);
export function subscribeCatalogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const catalogVersion = (): number => version;

/** True for a locale whose interface comes from a catalog (every language except English). */
export function needsCatalog(locale: string | null | undefined): locale is LocaleCode {
  if (!locale || locale === PSEUDO_LOCALE) return false;
  const l = getLocale(locale);
  return Boolean(l && l.language !== 'en');
}

/** Fills `{name}` placeholders; unknown names are left as written. */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (vars[name] === undefined ? all : String(vars[name])));
}

const PSEUDO_MAP: Record<string, string> = Object.fromEntries(
  [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [c, [...'áƀçđéƒĝĥíĵķĺḿñóṕɋŕšţúṽŵẋýžÁƁÇĐÉƑĜĤÍĴĶĹḾÑÓṔɊŔŠŢÚṼŴẊÝŽ'][i]]),
);
/** "Save the file" -> "⟦Šáṽé ţĥé ƒíĺé⟧"; `{placeholders}` stay intact. */
export function pseudo(text: string): string {
  const body = text
    .split(/(\{\w+\})/)
    .map((part) => (/^\{\w+\}$/.test(part) ? part : part.replace(/[A-Za-z]/g, (c) => PSEUDO_MAP[c])))
    .join('');
  return `⟦${body}⟧`;
}

/**
 * The message for `source` in `locale`, with `vars` filled in. English
 * locales and en-US (null) return the source; a language without the message
 * yet falls back to the source (pages only ship once their catalog is
 * complete, src/test/i18n.test.ts). `overrides` (a tool page's H1 and uiText
 * for its language version) win over the catalog.
 */
export function translate(locale: string | null | undefined, source: string, vars?: Vars, overrides?: Record<string, string>): string {
  const own = overrides?.[source];
  if (own !== undefined) return interpolate(own, vars);
  if (locale === PSEUDO_LOCALE) return interpolate(pseudo(plainText(source)), vars);
  if (!needsCatalog(locale)) return interpolate(plainText(source), vars);
  const group = pluralGroupOf(source);
  const n = group?.count !== undefined ? vars?.[group.count] : undefined;
  if (group && typeof n === 'number') return translatePlural(locale, n, group, vars);
  const value = catalogs.get(locale)?.[source];
  return interpolate(typeof value === 'object' ? value.other : value ?? plainText(source), vars);
}

const pluralRules = new Map<string, Intl.PluralRules>();
/** The CLDR plural category of `n` in `locale` ('one', 'few', 'many', 'other', ...). */
export function pluralCategory(locale: string, n: number): Intl.LDMLPluralRule {
  let r = pluralRules.get(locale);
  if (!r) pluralRules.set(locale, (r = new Intl.PluralRules(locale)));
  return r.select(n);
}

/**
 * A count message (msg.plural) in a language: the plural key's per-category
 * forms when the catalog has them; otherwise the singular key for exactly 1,
 * and for other counts the language's rule decides (French 0 and 1,5 take the
 * singular when the singular has the count's placeholder, '{n} day'; a
 * '1 day' singular only ever stands for 1). English pages never come here.
 */
function translatePlural(locale: LocaleCode, n: number, forms: PluralForms, vars?: Vars): string {
  const catalog = catalogs.get(locale);
  const value = catalog?.[forms.other];
  if (value && typeof value === 'object') return interpolate(value[pluralCategory(locale, n)] ?? value.other, vars);
  const category = pluralCategory(locale, n);
  const one = n === 1 || (category === 'one' && oneTakesCount(forms));
  // A language whose 1 is not 'one' (Chinese, Japanese: only 'other') may translate only the plural key.
  const key = one && (category === 'one' || catalog?.[forms.one] !== undefined) ? forms.one : forms.other;
  const text = catalog?.[key];
  return interpolate(typeof text === 'string' ? text : typeof text === 'object' ? text.other : plainText(key), vars);
}

export { msg } from '@/lib/msg';
