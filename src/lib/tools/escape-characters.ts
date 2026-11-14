/**
 * Backslash escaping as used by JavaScript, JSON, C-family and most shell-free
 * string literals. Both directions are single-pass so an escaped backslash
 * (`\\`) followed by a letter is never mistaken for a different escape.
 */

const ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  '\n': '\\n',
  '\t': '\\t',
  '\r': '\\r',
  '"': '\\"',
  "'": "\\'",
  '\b': '\\b',
  '\f': '\\f',
  '\v': '\\v',
  '\0': '\\0',
};

const UNESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '"': '"',
  "'": "'",
  '\\': '\\',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

/** Escape backslashes, quotes and control characters. Inside a character class `\b` is backspace. */
export function addEscapes(text: string): string {
  return text.replace(/[\\\n\t\r"'\b\f\v\0]/g, (c) => ESCAPES[c]);
}

/** Turn escape sequences back into characters. Unknown sequences (e.g. `\q`) are left untouched. */
export function removeEscapes(text: string): string {
  return text.replace(/\\([ntr"'\\bfv0])/g, (_m, c: string) => UNESCAPES[c]);
}
