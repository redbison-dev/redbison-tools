/**
 * Worked examples in the week 2026-11-09 batch e6 posts, computed by the same
 * src/lib/tools functions the linked tools use. If a number here changes,
 * update the post (and its SVG) to match.
 */
import { describe, it, expect } from 'vitest';
import { analyzePassword } from '@/lib/tools/w500/security-password';
import { computeLineDiff } from '@/lib/tools/online-diff-tool';

describe('ai-voice-cloning-scams-family-code-word', () => {
  // Typed into the Password Strength Checker, with "Words about you" as shown.
  it('Biscuit2015 with the pet name as a personal word is Weak: 10^4.2 guesses, 6 days at 100 guesses an hour', () => {
    const a = analyzePassword('Biscuit2015', { userInputs: 'biscuit'.split(/[,\n]/) });
    expect(a.score).toBe(1);
    expect(a.label).toBe('Weak');
    expect(a.guessesLog10.toFixed(1)).toBe('4.2');
    expect(a.crackTimes.find((c) => c.id === 'online-throttled')?.display).toBe('6 days');
    expect(a.patterns.map((p) => p.description)).toEqual(['one of your personal words', 'recent year']);
  });

  it('purple elephant is Strong but both words are on the common-password list', () => {
    const a = analyzePassword('purple elephant');
    expect(a.score).toBe(3);
    expect(a.label).toBe('Strong');
    expect(a.guessesLog10.toFixed(1)).toBe('8.0');
    expect(a.crackTimes.find((c) => c.id === 'online-throttled')?.display).toBe('1 century');
    expect(a.patterns.map((p) => p.description)).toEqual([
      'common password (rank 162)', 'random characters (brute force)', 'common password (rank 344)',
    ]);
  });

  it('velvet canyon oboe is Very strong: 10^14.1 guesses', () => {
    const a = analyzePassword('velvet canyon oboe');
    expect(a.score).toBe(4);
    expect(a.label).toBe('Very strong');
    expect(a.guessesLog10.toFixed(1)).toBe('14.1');
    expect(a.crackTimes.find((c) => c.id === 'online-throttled')?.display).toBe('centuries');
    expect(a.patterns.map((p) => p.description)).toEqual([
      'common password (rank 1826)', 'separator character', 'common Wikipedia word', 'random characters (brute force)',
    ]);
  });

  it('three words from a 7,776-word dice list carry 38.8 bits', () => {
    expect((3 * Math.log2(7776)).toFixed(1)).toBe('38.8');
  });
});

describe('ai-meeting-notes-consent-and-accuracy', () => {
  const reference = 'Priya will send the revised budget by Friday. We are not renewing the Acme contract. The launch moves to March 15 and the discount stays at fifteen percent.';
  const transcript = 'Korea will send the revised budget by Friday. Uh we are renewing the Acme contract. The launch moves to March 50 and the discount stays at fifty percent.';

  /** Word error rate as NIST scores it: minimum substitutions + deletions + insertions over reference words. */
  function wer(ref: string, hyp: string) {
    const norm = (s: string) => s.toLowerCase().replace(/[.,!?]/g, '').split(/\s+/).filter(Boolean);
    const r = norm(ref), h = norm(hyp);
    type Cell = { cost: number; s: number; d: number; i: number };
    const dp: Cell[][] = Array.from({ length: r.length + 1 }, () => Array(h.length + 1));
    for (let a = 0; a <= r.length; a++) {
      for (let b = 0; b <= h.length; b++) {
        if (a === 0) { dp[a][b] = { cost: b, s: 0, d: 0, i: b }; continue; }
        if (b === 0) { dp[a][b] = { cost: a, s: 0, d: a, i: 0 }; continue; }
        const diag = dp[a - 1][b - 1];
        const same = r[a - 1] === h[b - 1];
        const options: Cell[] = [
          { cost: diag.cost + (same ? 0 : 1), s: diag.s + (same ? 0 : 1), d: diag.d, i: diag.i },
          { cost: dp[a - 1][b].cost + 1, s: dp[a - 1][b].s, d: dp[a - 1][b].d + 1, i: dp[a - 1][b].i },
          { cost: dp[a][b - 1].cost + 1, s: dp[a][b - 1].s, d: dp[a][b - 1].d, i: dp[a][b - 1].i + 1 },
        ];
        dp[a][b] = options.reduce((best, o) => (o.cost < best.cost ? o : best));
      }
    }
    const end = dp[r.length][h.length];
    return { n: r.length, ...end, rate: end.cost / r.length };
  }

  it('the Note Taker counts 28 words in the reference passage', () => {
    // Same rule as the Note Taker's word count: trim, then split on whitespace.
    expect(reference.trim().split(/\s+/).length).toBe(28);
  });

  it('3 substitutions, 1 deletion and 1 insertion give a WER of 5/28 = 17.9%', () => {
    const w = wer(reference, transcript);
    expect(w.n).toBe(28);
    expect([w.s, w.d, w.i]).toEqual([3, 1, 1]);
    expect((w.rate * 100).toFixed(1)).toBe('17.9');
    expect(((1 - w.rate) * 100).toFixed(1)).toBe('82.1');
  });

  it('the Online Diff Tool, one word per line with Ignore case, shows 4 removed and 4 added words', () => {
    const lines = (s: string) => s.replace(/[.,]/g, '').split(/\s+/).join('\n');
    const d = computeLineDiff(lines(reference), lines(transcript), { ignoreCase: true });
    expect(d.deletions).toBe(4);
    expect(d.additions).toBe(4);
  });

  it('one sentence per line, all three sentences differ', () => {
    const lines = (s: string) => s.split(/(?<=\.)\s+/).join('\n');
    const d = computeLineDiff(lines(reference), lines(transcript));
    expect(d.deletions).toBe(3);
    expect(d.additions).toBe(3);
  });
});
