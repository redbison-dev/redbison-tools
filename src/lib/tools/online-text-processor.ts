/** Pure helpers behind the Online Text Processor and the single-purpose line tools. */

/**
 * Collapse runs of horizontal whitespace (spaces, tabs, non-breaking spaces)
 * to one space and trim each line. Line breaks are kept.
 */
export function collapseSpaces(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[^\S\r\n]+/g, ' ').trim())
    .join('\n');
}

/** Non-blank lines, trimmed, joined with ", ". */
export function linesToComma(text: string, separator = ', '): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(separator);
}

export function lineCount(text: string): number {
  return text === '' ? 0 : text.split('\n').length;
}

/** camelCase each line: split on anything that is not a letter or digit, and on lower-to-upper boundaries. */
export function toCamelCase(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const words = line
        .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((w) => w.toLowerCase());
      return words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
    })
    .join('\n');
}

/** Alphabetical, case-insensitive sort (A, b, C rather than A, C, b). */
export function sortLines(text: string): string {
  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: false });
  return text.split('\n').sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)).join('\n');
}

/** Literal find and replace-all. `$` in the replacement is inserted as-is. */
export function replaceAllLiteral(text: string, find: string, replacement: string, caseSensitive: boolean): string {
  if (!find) return text;
  const pattern = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  return text.replace(pattern, () => replacement);
}

export type TextHistory = { stack: string[]; index: number };

const HISTORY_LIMIT = 50;

/** Record an edit from `current` to `next` so undo returns to `current`. */
export function commitHistory(history: TextHistory, current: string, next: string): TextHistory {
  const stack = history.stack.slice(0, history.index + 1);
  if (stack[stack.length - 1] !== current) stack.push(current);
  stack.push(next);
  const trimmed = stack.slice(Math.max(0, stack.length - HISTORY_LIMIT));
  return { stack: trimmed, index: trimmed.length - 1 };
}

export function undoHistory(history: TextHistory): TextHistory | null {
  return history.index > 0 ? { stack: history.stack, index: history.index - 1 } : null;
}

export function redoHistory(history: TextHistory): TextHistory | null {
  return history.index < history.stack.length - 1 ? { stack: history.stack, index: history.index + 1 } : null;
}
