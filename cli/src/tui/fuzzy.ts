/**
 * Subsequence scoring, which is how initials find a name.
 *
 * Subsequence matching, the way every editor's command palette works: "b64"
 * finds base64-encode, "jsf" finds json-format. Plain substring matching would
 * find neither, and a Levenshtein distance would rank base32-encode above
 * base64-encode for the query "base64" because it only counts edits.
 *
 * Scoring rewards the three things that make a match feel right: hitting the
 * start of the name, hitting the start of a word inside it, and hitting
 * letters next to each other. Ties break on the shorter name, so a query that
 * matches both `hash` and `hash-file` puts `hash` first.
 */

/** Higher is better. null means the query does not match at all. */
export function score(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  let points = 0;
  let ti = 0;
  let lastHit = -2;

  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi];
    if (ch === ' ') continue; // spaces in a query only separate words
    const at = t.indexOf(ch, ti);
    if (at === -1) return null;

    points += 1;
    if (at === lastHit + 1) points += 4; // consecutive letters
    if (at === 0) points += 6; // the very start of the name
    else if (/[^a-z0-9]/.test(t[at - 1])) points += 3; // the start of a word

    lastHit = at;
    ti = at + 1;
  }

  // A whole-word hit beats a scattered one that happens to score similarly.
  if (t.includes(q)) points += 8;
  if (t.startsWith(q)) points += 6;

  // Shorter names win ties: the match is a larger share of the name.
  return points - t.length * 0.01;
}
