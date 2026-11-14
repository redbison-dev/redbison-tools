/**
 * Markets RedBison localizes for (docs/seo/localization-plan.md).
 *
 * The bare URL (/mortgage-calculator) is US English and stays the default.
 * A market version lives under its locale path (/en-gb/mortgage-calculator)
 * only when that page has been localized for the market: its own copy,
 * phrasing, examples, sources, defaults and images. Pages link their versions
 * with hreflang, and nothing redirects by IP address or browser language.
 *
 * Path segments are lowercase BCP 47 tags with a hyphen (en-gb), the form
 * hreflang and search engines use; `code` is the hreflang value.
 */

export type EnglishLocaleCode = 'en-GB' | 'en-IN' | 'en-CA' | 'en-AU' | 'en-NZ' | 'en-IE' | 'en-SG' | 'en-ZA' | 'en-PH' | 'en-NG' | 'en-PK' | 'en-AE';
/** Other-language markets (docs/seo/i18n-plan.md): the whole page, interface included, is in the language. */
export type LanguageLocaleCode = 'fr-FR' | 'de-DE' | 'es-ES' | 'es-MX' | 'pt-BR' | 'zh-CN' | 'ja-JP' | 'ko-KR' | 'ru-RU' | 'id-ID';
export type LocaleCode = EnglishLocaleCode | LanguageLocaleCode;

export type Locale = {
  code: LocaleCode;
  /** ISO 639-1 language ('en' for every English market). English-only rules (spelling, "maths") apply where it is 'en'. */
  language: string;
  /** ISO 15924 script of the language. */
  script: 'Latn' | 'Hans' | 'Jpan' | 'Kore' | 'Cyrl';
  /** CJK text: no spaces between words, wider glyphs, fonts beyond DejaVu Sans. */
  cjk: boolean;
  /** URL segment: /<path>/<tool-id>. */
  path: string;
  /** Market name as readers in it say it ("United Kingdom"); for other languages the endonym ("Deutsch", "Español (México)"). */
  name: string;
  /** Short label for links and cards ("UK", "DE", "日本語"). */
  short: string;
  country: string;
  /** Open Graph locale (en_GB). */
  og: string;
  currency: string;
  currencySymbol: string;
  /** 'indian' groups digits as 12,34,567 (lakh and crore). */
  numbering: 'standard' | 'indian';
  /** CLDR decimal and grouping separators, as Intl.NumberFormat(code) prints them (checked in src/test/i18n.test.ts). */
  decimal: string;
  group: string;
  dateOrder: 'DMY' | 'MDY' | 'YMD';
  units: 'metric' | 'imperial' | 'mixed';
  /** "maths" outside North America; English markets only. */
  mathsWord?: 'math' | 'maths';
};

export const BASE_LOCALE = { code: 'en-US', og: 'en_US', name: 'United States', short: 'US', currency: 'USD', currencySymbol: '$' } as const;
/** English named in itself, for the language row next to the other languages' endonyms (`name`); never translated. */
export const ENGLISH_ENDONYM = 'English';

export const LOCALES: readonly Locale[] = [
  { code: 'en-GB', language: 'en', script: 'Latn', cjk: false, path: 'en-gb', name: 'United Kingdom', short: 'UK', country: 'GB', og: 'en_GB', currency: 'GBP', currencySymbol: '£', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'mixed', mathsWord: 'maths' },
  { code: 'en-IN', language: 'en', script: 'Latn', cjk: false, path: 'en-in', name: 'India', short: 'India', country: 'IN', og: 'en_IN', currency: 'INR', currencySymbol: '₹', numbering: 'indian', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric', mathsWord: 'maths' },
  { code: 'en-CA', language: 'en', script: 'Latn', cjk: false, path: 'en-ca', name: 'Canada', short: 'Canada', country: 'CA', og: 'en_CA', currency: 'CAD', currencySymbol: '$', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'YMD', units: 'mixed', mathsWord: 'math' },
  { code: 'en-AU', language: 'en', script: 'Latn', cjk: false, path: 'en-au', name: 'Australia', short: 'Australia', country: 'AU', og: 'en_AU', currency: 'AUD', currencySymbol: '$', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric', mathsWord: 'maths' },
  { code: 'en-NZ', language: 'en', script: 'Latn', cjk: false, path: 'en-nz', name: 'New Zealand', short: 'NZ', country: 'NZ', og: 'en_NZ', currency: 'NZD', currencySymbol: '$', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric', mathsWord: 'maths' },
  { code: 'en-IE', language: 'en', script: 'Latn', cjk: false, path: 'en-ie', name: 'Ireland', short: 'Ireland', country: 'IE', og: 'en_IE', currency: 'EUR', currencySymbol: '€', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric', mathsWord: 'maths' },
  { code: 'en-SG', language: 'en', script: 'Latn', cjk: false, path: 'en-sg', name: 'Singapore', short: 'Singapore', country: 'SG', og: 'en_SG', currency: 'SGD', currencySymbol: '$', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric', mathsWord: 'maths' },
  { code: 'en-ZA', language: 'en', script: 'Latn', cjk: false, path: 'en-za', name: 'South Africa', short: 'South Africa', country: 'ZA', og: 'en_ZA', currency: 'ZAR', currencySymbol: 'R', numbering: 'standard', decimal: ',', group: '\u00a0', dateOrder: 'YMD', units: 'metric', mathsWord: 'maths' },
  { code: 'en-PH', language: 'en', script: 'Latn', cjk: false, path: 'en-ph', name: 'Philippines', short: 'Philippines', country: 'PH', og: 'en_PH', currency: 'PHP', currencySymbol: '₱', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'MDY', units: 'mixed', mathsWord: 'math' },
  { code: 'en-NG', language: 'en', script: 'Latn', cjk: false, path: 'en-ng', name: 'Nigeria', short: 'Nigeria', country: 'NG', og: 'en_NG', currency: 'NGN', currencySymbol: '₦', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric', mathsWord: 'maths' },
  { code: 'en-PK', language: 'en', script: 'Latn', cjk: false, path: 'en-pk', name: 'Pakistan', short: 'Pakistan', country: 'PK', og: 'en_PK', currency: 'PKR', currencySymbol: 'Rs', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric', mathsWord: 'maths' },
  { code: 'en-AE', language: 'en', script: 'Latn', cjk: false, path: 'en-ae', name: 'United Arab Emirates', short: 'UAE', country: 'AE', og: 'en_AE', currency: 'AED', currencySymbol: 'AED', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric', mathsWord: 'maths' },
  // Other languages (docs/seo/i18n-plan.md). Separators and date order are CLDR's, as Intl prints them;
  // fr-FR groups with U+202F (narrow no-break space), ru-RU with U+00A0, and es-ES leaves four-digit numbers ungrouped (1234).
  { code: 'fr-FR', language: 'fr', script: 'Latn', cjk: false, path: 'fr-fr', name: 'Français', short: 'FR', country: 'FR', og: 'fr_FR', currency: 'EUR', currencySymbol: '€', numbering: 'standard', decimal: ',', group: '\u202f', dateOrder: 'DMY', units: 'metric' },
  { code: 'de-DE', language: 'de', script: 'Latn', cjk: false, path: 'de-de', name: 'Deutsch', short: 'DE', country: 'DE', og: 'de_DE', currency: 'EUR', currencySymbol: '€', numbering: 'standard', decimal: ',', group: '.', dateOrder: 'DMY', units: 'metric' },
  { code: 'es-ES', language: 'es', script: 'Latn', cjk: false, path: 'es-es', name: 'Español (España)', short: 'ES', country: 'ES', og: 'es_ES', currency: 'EUR', currencySymbol: '€', numbering: 'standard', decimal: ',', group: '.', dateOrder: 'DMY', units: 'metric' },
  { code: 'es-MX', language: 'es', script: 'Latn', cjk: false, path: 'es-mx', name: 'Español (México)', short: 'MX', country: 'MX', og: 'es_MX', currency: 'MXN', currencySymbol: '$', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'DMY', units: 'metric' },
  { code: 'pt-BR', language: 'pt', script: 'Latn', cjk: false, path: 'pt-br', name: 'Português (Brasil)', short: 'BR', country: 'BR', og: 'pt_BR', currency: 'BRL', currencySymbol: 'R$', numbering: 'standard', decimal: ',', group: '.', dateOrder: 'DMY', units: 'metric' },
  { code: 'zh-CN', language: 'zh', script: 'Hans', cjk: true, path: 'zh-cn', name: '简体中文', short: '中文', country: 'CN', og: 'zh_CN', currency: 'CNY', currencySymbol: '¥', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'YMD', units: 'metric' },
  { code: 'ja-JP', language: 'ja', script: 'Jpan', cjk: true, path: 'ja-jp', name: '日本語', short: '日本語', country: 'JP', og: 'ja_JP', currency: 'JPY', currencySymbol: '￥', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'YMD', units: 'metric' },
  { code: 'ko-KR', language: 'ko', script: 'Kore', cjk: true, path: 'ko-kr', name: '한국어', short: '한국어', country: 'KR', og: 'ko_KR', currency: 'KRW', currencySymbol: '₩', numbering: 'standard', decimal: '.', group: ',', dateOrder: 'YMD', units: 'metric' },
  { code: 'ru-RU', language: 'ru', script: 'Cyrl', cjk: false, path: 'ru-ru', name: 'Русский', short: 'RU', country: 'RU', og: 'ru_RU', currency: 'RUB', currencySymbol: '₽', numbering: 'standard', decimal: ',', group: '\u00a0', dateOrder: 'DMY', units: 'metric' },
  { code: 'id-ID', language: 'id', script: 'Latn', cjk: false, path: 'id-id', name: 'Bahasa Indonesia', short: 'ID', country: 'ID', og: 'id_ID', currency: 'IDR', currencySymbol: 'Rp', numbering: 'standard', decimal: ',', group: '.', dateOrder: 'DMY', units: 'metric' },
];

const byPath = new Map(LOCALES.map((l) => [l.path, l]));
const byCode = new Map(LOCALES.map((l) => [l.code, l]));

export const getLocale = (codeOrPath: string): Locale | undefined => byCode.get(codeOrPath as LocaleCode) ?? byPath.get(codeOrPath.toLowerCase());

/** "/en-gb/mortgage-calculator" -> { locale: en-GB, path: "/mortgage-calculator" }; base paths return locale null. */
export function splitLocalePath(pathname: string): { locale: Locale | null; path: string } {
  const m = pathname.match(/^\/([a-z]{2}-[a-z]{2})(\/.*)?$/i);
  const locale = m ? byPath.get(m[1].toLowerCase()) : undefined;
  if (!locale) return { locale: null, path: pathname };
  return { locale, path: m![2] && m![2] !== '/' ? m![2] : '/' };
}

/** The URL of `path` in a market version, or the base URL when locale is null. */
export function localizePath(path: string, locale: Locale | null | undefined): string {
  if (!locale) return path;
  return path === '/' ? `/${locale.path}` : `/${locale.path}${path}`;
}

/** English markets get English copy with the market's spelling; every other language gets a translated interface. */
export const isEnglishLocale = (l: Pick<Locale, 'language'> | null | undefined): boolean => !l || l.language === 'en';
/** The ISO 639-1 language of a locale code or path ('en' for en-US and null). */
export const languageOf = (codeOrPath: string | null | undefined): string => (codeOrPath ? getLocale(codeOrPath)?.language ?? codeOrPath.slice(0, 2).toLowerCase() : 'en');
export const ENGLISH_LOCALES: readonly Locale[] = LOCALES.filter((l) => l.language === 'en');
export const LANGUAGE_LOCALES: readonly Locale[] = LOCALES.filter((l) => l.language !== 'en');

/**
 * Where a bare language code points in hreflang when a page has a version in
 * that language (`de` -> de-DE, `es` -> es-MX, the larger Spanish market).
 * English has none: en-US on the bare URL is x-default.
 */
export const LANGUAGE_FALLBACK: Readonly<Record<string, LocaleCode>> = {
  fr: 'fr-FR', de: 'de-DE', es: 'es-MX', pt: 'pt-BR', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ru: 'ru-RU', id: 'id-ID',
};

/**
 * hreflang values for a page whose versions are `codes` (the bare en-US URL and
 * x-default are the caller's): one per version, then one language-only value
 * per other language present, pointing at its fallback version, or at the
 * language's only version when the fallback has none (es -> es-ES).
 */
export function hreflangCodes(codes: readonly LocaleCode[]): { hreflang: string; code: LocaleCode }[] {
  const out: { hreflang: string; code: LocaleCode }[] = codes.map((code) => ({ hreflang: code, code }));
  const languages = [...new Set(codes.map(languageOf))].filter((lang) => lang !== 'en');
  for (const lang of languages) {
    const preferred = LANGUAGE_FALLBACK[lang];
    const code = preferred && codes.includes(preferred) ? preferred : codes.find((c) => languageOf(c) === lang)!;
    out.push({ hreflang: lang, code });
  }
  return out;
}
