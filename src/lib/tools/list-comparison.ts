export type ListCompareOptions = { caseSensitive: boolean; trimWhitespace: boolean; ignoreEmpty: boolean };
export type SortDirection = 'none' | 'asc' | 'desc';

export type ListCompareResult = {
  leftOnly: string[];
  rightOnly: string[];
  common: string[];
  leftTotal: number;
  rightTotal: number;
  commonCount: number;
  uniqueLeft: number;
  uniqueRight: number;
  /** Dice coefficient of the two sets of distinct items, as a percentage with 2 decimals. */
  similarityPercentage: number;
};

const collator = new Intl.Collator('en', { sensitivity: 'base' });

export function sortItems(lines: string[], direction: SortDirection): string[] {
  if (direction === 'none') return lines;
  const sorted = [...lines].sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
  return direction === 'desc' ? sorted.reverse() : sorted;
}

export function splitItems(text: string, options: ListCompareOptions): string[] {
  let lines = text.split('\n');
  if (options.trimWhitespace) lines = lines.map((l) => l.trim());
  if (options.ignoreEmpty) lines = lines.filter((l) => l.length > 0);
  return lines;
}

/**
 * Compare two lists as sets. Matching uses a normalised key, but results keep
 * the spelling of the first occurrence, so case-insensitive mode does not
 * lower-case your data.
 */
export function compareLists(
  left: string,
  right: string,
  options: ListCompareOptions,
  leftSort: SortDirection = 'none',
  rightSort: SortDirection = 'none',
): ListCompareResult {
  const key = (s: string) => (options.caseSensitive ? s : s.toLowerCase());
  const distinct = (items: string[]) => {
    const map = new Map<string, string>();
    for (const item of items) if (!map.has(key(item))) map.set(key(item), item);
    return map;
  };
  const leftMap = distinct(sortItems(splitItems(left, options), leftSort));
  const rightMap = distinct(sortItems(splitItems(right, options), rightSort));

  const leftOnly = [...leftMap].filter(([k]) => !rightMap.has(k)).map(([, v]) => v);
  const rightOnly = [...rightMap].filter(([k]) => !leftMap.has(k)).map(([, v]) => v);
  const common = [...leftMap].filter(([k]) => rightMap.has(k)).map(([, v]) => v);
  const sizes = leftMap.size + rightMap.size;
  const similarity = sizes > 0 ? ((common.length * 2) / sizes) * 100 : 0;

  return {
    leftOnly,
    rightOnly,
    common,
    leftTotal: leftMap.size,
    rightTotal: rightMap.size,
    commonCount: common.length,
    uniqueLeft: leftOnly.length,
    uniqueRight: rightOnly.length,
    similarityPercentage: Math.round(similarity * 100) / 100,
  };
}
