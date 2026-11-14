export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'its', 'our', 'their', 'myself', 'yourself', 'himself', 'herself', 'itself',
  'ourselves', 'yourselves', 'themselves',
]);

export type WordCountOptions = { caseSensitive: boolean; minWordLength: number; removeStopWords: boolean };

/**
 * Word frequencies in first-seen order. Letters and digits from any script
 * count as word characters, so accented and non-Latin words stay whole.
 */
export function countWords(text: string, options: WordCountOptions): Map<string, number> {
  const counts = new Map<string, number>();
  if (!text.trim()) return counts;
  const source = options.caseSensitive ? text : text.toLowerCase();
  for (const word of source.replace(/[^\p{L}\p{M}\p{N}_\s]/gu, ' ').split(/\s+/)) {
    if (!word || [...word].length < options.minWordLength) continue;
    if (options.removeStopWords && STOP_WORDS.has(word.toLowerCase())) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

/** The most frequent words, ties kept in first-seen order. */
export function topWords(counts: Map<string, number>, limit: number): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
