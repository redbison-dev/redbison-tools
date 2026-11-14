/**
 * Splits an identifier or phrase into words. Spaces, punctuation, hyphens and
 * underscores separate words, as do camelCase humps and acronym boundaries
 * (XMLHttpRequest -> XML, Http, Request).
 */
export function splitWords(text: string): string[] {
  return text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

const perLine = (text: string, fn: (words: string[]) => string) =>
  text.split('\n').map((line) => fn(splitWords(line))).join('\n');

export function convertCases(text: string) {
  return {
    upper: text.toUpperCase(),
    lower: text.toLowerCase(),
    title: text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()),
    camel: perLine(text, (w) => w.map((word, i) => (i === 0 ? word.toLowerCase() : cap(word))).join('')),
    pascal: perLine(text, (w) => w.map(cap).join('')),
    snake: perLine(text, (w) => w.map((word) => word.toLowerCase()).join('_')),
    kebab: perLine(text, (w) => w.map((word) => word.toLowerCase()).join('-')),
  };
}
