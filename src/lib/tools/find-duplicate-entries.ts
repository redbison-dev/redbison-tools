import { msg } from '../msg';

export type DuplicateOptions = {
  caseSensitive: boolean;
  trimSpaces: boolean;
  removeExtraSpaces: boolean;
  showOnlyDuplicates: boolean;
  includeCount: boolean;
};

export type DuplicateStats = {
  totalLines: number;
  uniqueLines: number;
  /** Occurrences beyond the first, summed over all entries. */
  duplicateLines: number;
  /** Number of distinct entries that appear more than once. */
  duplicateCount: number;
};

export const NO_DUPLICATES = msg('No duplicate entries found.');
export const NO_ENTRIES = msg('No entries found.');

type Vars = Record<string, string | number>;
/** Translator the page passes in (its useT() t); the default fills placeholders in English. */
export type DuplicateT = (source: string, vars?: Vars) => string;
const fill: DuplicateT = (source, vars) => (vars ? source.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : source);

const label = (value: string, count: number, t: DuplicateT) =>
  t(msg.plural(count, { one: '{value} (appears {count} time)', other: '{value} (appears {count} times)' }), { value, count });

/** Count non-blank lines, grouping them by the normalised key the options describe. `t` translates the labels (English by default). */
export function findDuplicateEntries(text: string, options: DuplicateOptions, t: DuplicateT = fill): { output: string; stats: DuplicateStats } {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  const counts = new Map<string, { original: string; count: number }>();

  for (const line of lines) {
    let processed = line;
    if (options.trimSpaces) processed = processed.trim();
    if (options.removeExtraSpaces) processed = processed.replace(/\s+/g, ' ');
    const key = options.caseSensitive ? processed : processed.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { original: processed, count: 1 });
  }

  const entries = [...counts.values()];
  const shown = options.showOnlyDuplicates ? entries.filter((e) => e.count > 1) : entries;
  const rendered = shown.map((e) => (options.includeCount ? label(e.original, e.count, t) : e.original));

  return {
    output: rendered.length ? rendered.join('\n') : t(options.showOnlyDuplicates ? NO_DUPLICATES : NO_ENTRIES),
    stats: {
      totalLines: lines.length,
      uniqueLines: counts.size,
      duplicateLines: lines.length - counts.size,
      duplicateCount: entries.filter((e) => e.count > 1).length,
    },
  };
}
