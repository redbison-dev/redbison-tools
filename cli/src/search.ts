/**
 * Searching the catalogue by what a tool is for, not by what it is called.
 *
 * The names are no help to someone who does not already know them: nobody
 * types `epoch` when they want "unix timestamp", or `json-format` when they
 * want "pretty print". The website has always matched on a keyword list per
 * tool, and this matches on the same one — it is generated into the catalogue
 * from the site's `searchMetadata` — so a query that finds a tool on
 * redbison.dev finds it here too.
 *
 * Four fields, in the order they are worth: the id people type, the title,
 * the keywords, and the summary with the category. A hit in the name beats a
 * hit in a keyword, which beats a hit in prose, because that is the order of
 * how sure we are that the match was meant.
 *
 * Typos are tolerated to the same degree the website tolerates them (a word
 * is "close enough" above 0.6 similarity, which is tighter than the site's
 * 0.4 — in a list of a hundred names, 0.4 matched `cron` against `crop` and
 * `color` against `colon` and made the first page useless). Every word of the
 * query has to match something, which is how a two-word query narrows instead
 * of widening.
 */
import { TOOLS, type CliTool } from './catalog';
import { optionsFor } from './options';
import { score as subsequence } from './tui/fuzzy';

/*
 * Words that carry no intent. Dropping them is what lets "how do I convert a
 * unix timestamp" find the same tool as "unix timestamp", instead of failing
 * because "how" matches nothing. Deliberately short: a long stopword list
 * starts eating real queries ("to" matters in "json to yaml", so it stays).
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'do', 'does', 'how', 'i',
  'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please', 'show', 'that',
  'the', 'this', 'want', 'what', 'which', 'with', 'you', 'your',
]);

export type Field = 'name' | 'keyword' | 'text';

export type Hit = {
  tool: CliTool;
  score: number;
  /** Which field earned the match, so the caller can show why. */
  why: Field;
};

/** Lower-case, and everything that is not a letter or digit becomes a gap. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Levenshtein, bounded by the longer string, as a 0-1 similarity. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  /*
   * Short words have to match exactly. One substitution in a three-letter
   * word scores 0.67, which is "close enough" by any threshold worth having
   * for longer words — and it made `jsf` match `jsx`, an option value of
   * js-beautify, so a query for json-format returned a JavaScript formatter.
   */
  if (a.length < 4 || b.length < 4) return a === b ? 1 : 0;

  const rows = Array.from({ length: b.length + 1 }, (_, i) => [i, ...Array<number>(a.length).fill(0)]);
  for (let i = 0; i <= a.length; i += 1) rows[0][i] = i;
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      rows[j][i] = Math.min(
        rows[j][i - 1] + 1,
        rows[j - 1][i] + 1,
        rows[j - 1][i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  const longest = Math.max(a.length, b.length);
  return (longest - rows[b.length][a.length]) / longest;
}

const CLOSE_ENOUGH = 0.6;

type Indexed = {
  tool: CliTool;
  name: string;
  nameWords: string[];
  keywords: string;
  keywordWords: string[];
  text: string;
  textWords: string[];
};

const index = (tool: CliTool): Indexed => {
  const name = normalise(`${tool.id} ${tool.title}`);
  /*
   * The option values are part of what a tool is for. "uuid v7" and "sha512"
   * are the obvious ones: v7 is a value of --variant, sha512 of --algorithm,
   * and without them in the index a query naming exactly the thing the user
   * wants finds nothing at all.
   */
  const options = optionsFor(tool.id)
    .flatMap((o) => [o.key, ...(o.values ?? []).map((v) => v.value), String(o.defaultValue ?? '')])
    .join(' ');
  const keywords = normalise(`${tool.keywords} ${options}`);
  const text = normalise(`${tool.summary} ${tool.group}`);
  return {
    tool,
    name,
    nameWords: name.split(' ').filter(Boolean),
    keywords,
    keywordWords: keywords.split(' ').filter(Boolean),
    text,
    textWords: text.split(' ').filter(Boolean),
  };
};

/** What one query word is worth against one tool, and where it was found. */
function wordScore(word: string, t: Indexed): { score: number; why: Field } | null {
  if (t.nameWords.includes(word)) return { score: 10, why: 'name' };
  if (t.name.includes(word)) return { score: 7, why: 'name' };
  if (t.keywordWords.includes(word)) return { score: 5, why: 'keyword' };
  if (t.keywords.includes(word)) return { score: 4, why: 'keyword' };
  if (t.textWords.includes(word)) return { score: 3, why: 'text' };
  if (t.text.includes(word)) return { score: 2, why: 'text' };

  // Nothing matched outright, so allow a near miss — a typo, or a plural
  // against a singular — at a fraction of the value of a real hit.
  let best: { score: number; why: Field } | null = null;
  const consider = (candidates: string[], worth: number, why: Field) => {
    for (const candidate of candidates) {
      const close = similarity(word, candidate);
      if (close >= CLOSE_ENOUGH) {
        const score = worth * close * 0.5;
        if (!best || score > best.score) best = { score, why };
      }
    }
  };
  consider(t.nameWords, 10, 'name');
  consider(t.keywordWords, 5, 'keyword');
  consider(t.textWords, 3, 'text');
  return best;
}

/**
 * The catalogue, ranked for a query. Every word has to find something.
 *
 * One box, two habits. Somebody who knows the catalogue types initials —
 * `b64`, `jsf` — and expects base64-encode and json-format; somebody who does
 * not types what they want — "unix timestamp", "pretty print json". Keyword
 * matching answers the second and cannot answer the first (`b64` is three
 * edits from `base64`, which is below any sane typo threshold), so a
 * single-word query is also tried as a subsequence of the name, scored well
 * below a real match so it fills the tail rather than the head.
 */
export function searchTools(query: string, tools: CliTool[] = TOOLS): Hit[] {
  const q = normalise(query);
  if (!q) return [];
  const all = q.split(' ').filter(Boolean);
  // Keep the stopwords if that is all there is: someone searching "it" gets
  // the best we can do rather than an empty list for a word we deleted.
  const content = all.filter((w) => !STOPWORDS.has(w));
  const words = content.length ? content : all;
  const oneWord = words.length === 1;

  const hits: Hit[] = [];
  const partial: Hit[] = [];
  /*
   * How much of the query a partial answer has to cover: the website's
   * threshold, which for one or two words means all of them. Looser than
   * that and "qr code" — a tool this package does not carry — came back with
   * morse and curl-to-code because they contain the word "code".
   */
  const needed = Math.max(1, Math.ceil(words.length * 0.7));

  for (const tool of tools) {
    const t = index(tool);

    let total = 0;
    let matched = 0;
    let why: Field = 'text';
    for (const word of words) {
      const found = wordScore(word, t);
      if (!found) continue;
      matched += 1;
      total += found.score;
      // The strongest field any word matched is the one worth reporting.
      if (found.why === 'name' || (found.why === 'keyword' && why === 'text')) why = found.why;
    }
    const matchedAll = matched === words.length;

    // Initials, and any other subsequence of the name: `jsf` in json-format.
    // Against the id alone: including the title gives a second set of word
    // boundaries to score bonuses on, which made `jsf` prefer js-beautify
    // over json-format.
    const loose = oneWord ? subsequence(q, tool.id) : null;

    if (!matchedAll) {
      /*
       * Half a query is worth answering, but only when nothing answered all
       * of it: "convert unix timestamp to tokyo time" should still reach the
       * timezone tools rather than returning nothing at all. These are kept
       * apart and only used if the strict pass comes back empty, so a precise
       * query is never diluted by a vaguer tool that matched one word of it.
       */
      if (matched >= needed) {
        partial.push({ tool, score: total * (matched / words.length) * 0.5, why });
      } else if (loose !== null) {
        partial.push({ tool, score: loose * 0.4, why: 'name' });
      }
      continue;
    }

    // The whole query as one phrase is a far better signal than its words
    // scattered across different fields.
    if (t.name === q) total += 60;
    else if (t.name.startsWith(q)) total += 30;
    else if (t.name.includes(q)) total += 20;
    if (t.keywords.includes(q)) total += 12;
    if (t.text.includes(q)) total += 6;
    if (loose !== null) total += loose * 0.1;

    // A short name is a more precise answer than a long one that happens to
    // contain the same words: `hash` over `hash-file-checksum-generator`.
    total -= t.name.length * 0.02;

    hits.push({ tool, score: total, why });
  }

  const byScore = (a: Hit, b: Hit) =>
    b.score === a.score ? a.tool.id.localeCompare(b.tool.id) : b.score - a.score;
  return (hits.length ? hits : partial).sort(byScore);
}

/** `redbison search` output: one tool per line, the shape `--list` uses. */
export function formatHits(hits: Hit[], limit = 20): string {
  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
  return hits
    .slice(0, limit)
    .map((h) => `${pad(h.tool.id, 24)}${h.tool.offline ? 'local ' : 'server'}  ${h.tool.title}`)
    .join('\n');
}
