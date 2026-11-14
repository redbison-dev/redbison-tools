/**
 * Password strength analysis with zxcvbn-ts (pattern-based guess estimation,
 * the approach of Wheeler's 2016 USENIX Security paper) plus the simple
 * character-pool entropy figure most checkers show, and NIST SP 800-63B-4
 * length checks. Runs offline; nothing is sent anywhere.
 */
import { zxcvbn, zxcvbnOptions, type MatchExtended } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import { msg } from '../../msg';

let configured = false;
function configure() {
  if (configured) return;
  zxcvbnOptions.setOptions({
    translations: zxcvbnEnPackage.translations,
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    dictionary: { ...zxcvbnCommonPackage.dictionary, ...zxcvbnEnPackage.dictionary },
    useLevenshteinDistance: true,
  });
  configured = true;
}

export const SCORE_LABELS = [msg('Very weak'), msg('Weak'), msg('Fair'), msg('Strong'), msg('Very strong')] as const;

/** Attack scenarios: guesses per second. The first four are zxcvbn's standard set. */
export const ATTACK_SCENARIOS = [
  { id: 'online-throttled', label: msg('Online, rate limited (100 guesses per hour)'), rate: 100 / 3600 },
  { id: 'online', label: msg('Online, no rate limit (10 guesses per second)'), rate: 10 },
  { id: 'offline-slow', label: msg('Offline, slow hash such as bcrypt (10 thousand per second)'), rate: 1e4 },
  { id: 'offline-fast', label: msg('Offline, fast hash such as unsalted SHA-1 (10 billion per second)'), rate: 1e10 },
] as const;

/** Interface text with {placeholders} (the shape of StepMsg in src/lib/report/model.ts), for pages to translate. */
export type TextMsg = { text: string; vars: Record<string, string | number> };
const fill = (m: TextMsg): string => m.text.replace(/\{(\w+)\}/g, (_, k: string) => String(m.vars[k] ?? `{${k}}`));

export type CharClass = 'lower' | 'upper' | 'digit' | 'symbol' | 'space' | 'other';

export type PatternFinding = {
  pattern: string;
  /** Start and end index (inclusive) in the password. */
  i: number;
  j: number;
  length: number;
  description: string;
  /** `description` as messages: the base text, then any extras ("reversed") joined with ", ". */
  descriptionMsg: TextMsg;
  descriptionExtras: string[];
  guessesLog10: number;
};

export type PasswordAnalysis = {
  length: number;
  classes: CharClass[];
  poolSize: number;
  /** length × log2(pool): an upper bound that assumes every character was picked at random. */
  poolEntropyBits: number;
  /** log2 of zxcvbn's guess estimate: the realistic figure. */
  guessEntropyBits: number;
  guesses: number;
  guessesLog10: number;
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  crackTimes: { id: string; label: string; labelMsg: TextMsg; seconds: number; display: string; displayMsg: TextMsg }[];
  warning: string | null;
  suggestions: string[];
  patterns: PatternFinding[];
  nist: { singleFactorLength: boolean; mfaLength: boolean; commonPassword: boolean };
  /** True when zxcvbn only looked at the first `maxLength` characters. */
  truncated: boolean;
};

const POOL: Record<CharClass, number> = { lower: 26, upper: 26, digit: 10, symbol: 33, space: 1, other: 100 };

export function charClasses(password: string): CharClass[] {
  const found = new Set<CharClass>();
  for (const ch of password) {
    if (/[a-z]/.test(ch)) found.add('lower');
    else if (/[A-Z]/.test(ch)) found.add('upper');
    else if (/[0-9]/.test(ch)) found.add('digit');
    else if (ch === ' ') found.add('space');
    else if (/[\x21-\x7e]/.test(ch)) found.add('symbol');
    else found.add('other');
  }
  return (['lower', 'upper', 'digit', 'symbol', 'space', 'other'] as CharClass[]).filter((c) => found.has(c));
}

export function poolEntropy(password: string): { poolSize: number; bits: number; length: number } {
  const length = Array.from(password).length;
  const poolSize = charClasses(password).reduce((n, c) => n + POOL[c], 0);
  const bits = length && poolSize ? length * Math.log2(poolSize) : 0;
  return { poolSize, bits, length };
}

/** Human-readable duration, from "instant" to "centuries". */
export function formatDuration(seconds: number): string {
  return fill(formatDurationMsg(seconds));
}

/** formatDuration as a message: one/other forms per unit. */
export function formatDurationMsg(seconds: number): TextMsg {
  if (!Number.isFinite(seconds)) return { text: msg('centuries'), vars: {} };
  if (seconds < 1) return { text: msg('less than a second'), vars: {} };
  const units: { size: number; one: string; other: string }[] = [
    { size: 60, one: msg('{n} second'), other: msg('{n} seconds') },
    { size: 60, one: msg('{n} minute'), other: msg('{n} minutes') },
    { size: 24, one: msg('{n} hour'), other: msg('{n} hours') },
    { size: 30.4375, one: msg('{n} day'), other: msg('{n} days') },
    { size: 12, one: msg('{n} month'), other: msg('{n} months') },
    { size: 100, one: msg('{n} year'), other: msg('{n} years') },
  ];
  let v = seconds;
  for (const u of units) {
    if (v < u.size) {
      const n = Math.round(v);
      return { text: n === 1 ? u.one : u.other, vars: { n } };
    }
    v /= u.size;
  }
  if (v < 10) {
    const n = Math.round(v);
    return { text: msg.plural(n, { one: '{n} century', other: '{n} centuries' }), vars: { n } };
  }
  return { text: msg('centuries'), vars: {} };
}

function describeMsg(m: MatchExtended): { base: TextMsg; extras: string[] } {
  const plain = (text: string, vars: TextMsg['vars'] = {}) => ({ base: { text, vars }, extras: [] as string[] });
  switch (m.pattern) {
    case 'dictionary': {
      const where: Record<string, TextMsg> = {
        passwords: { text: msg('common password (rank {rank})'), vars: { rank: m.rank } },
        commonWords: { text: msg('common English word (rank {rank})'), vars: { rank: m.rank } },
        firstnames: { text: msg('first name'), vars: {} },
        lastnames: { text: msg('surname'), vars: {} },
        wikipedia: { text: msg('common Wikipedia word'), vars: {} },
        diceware: { text: msg('Diceware word list entry'), vars: {} },
        userInputs: { text: msg('one of your personal words'), vars: {} },
      };
      const extras = [m.reversed ? msg('reversed') : '', m.l33t ? msg('with l33t substitutions') : '', m.levenshteinDistance ? msg('with small typos') : ''].filter(Boolean);
      return { base: where[m.dictionaryName] ?? { text: msg('dictionary word'), vars: {} }, extras };
    }
    case 'spatial':
      return plain(msg.plural(m.turns, { one: 'keyboard pattern on {graph} ({turns} turn)', other: 'keyboard pattern on {graph} ({turns} turns)' }, 'turns'), { graph: m.graph, turns: m.turns });
    case 'repeat':
      return plain(msg('{size}-character block repeated {count} times'), { size: typeof m.baseToken === 'string' ? m.baseToken.length : 1, count: m.repeatCount });
    case 'sequence':
      return plain(m.ascending ? msg('ascending {name} sequence') : msg('descending {name} sequence'), { name: m.sequenceName });
    case 'regex':
      return m.regexName === 'recentYear' ? plain(msg('recent year')) : plain(msg('pattern ({name})'), { name: m.regexName });
    case 'date':
      return plain(msg('date'));
    case 'separator':
      return plain(msg('separator character'));
    default:
      return plain(msg('random characters (brute force)'));
  }
}

function describe(m: MatchExtended): string {
  const { base, extras } = describeMsg(m);
  return `${fill(base)}${extras.length ? `, ${extras.join(', ')}` : ''}`;
}

export type AnalyzeOptions = {
  /** Names, email, site name and so on: zxcvbn treats them as a dictionary. */
  userInputs?: string[];
  /** Extra guesses-per-second scenario. */
  customRate?: number;
};

export const MAX_ANALYZED_LENGTH = 256;

export function analyzePassword(password: string, opts: AnalyzeOptions = {}): PasswordAnalysis {
  configure();
  const inputs = (opts.userInputs ?? []).map((s) => s.trim()).filter((s) => s.length >= 3);
  const r = zxcvbn(password, inputs);
  const { poolSize, bits, length } = poolEntropy(password);
  const guesses = r.guesses;
  const scenarios: { id: string; labelMsg: TextMsg; rate: number }[] = ATTACK_SCENARIOS.map((s) => ({ id: s.id, labelMsg: { text: s.label, vars: {} }, rate: s.rate }));
  if (opts.customRate && opts.customRate > 0) scenarios.push({ id: 'custom', labelMsg: { text: msg('Custom ({rate} guesses per second)'), vars: { rate: opts.customRate.toExponential(2) } }, rate: opts.customRate });
  const crackTimes = scenarios.map((s) => {
    const seconds = guesses / s.rate;
    const displayMsg = formatDurationMsg(seconds);
    return { id: s.id, label: fill(s.labelMsg), labelMsg: s.labelMsg, seconds, display: fill(displayMsg), displayMsg };
  });
  const patterns: PatternFinding[] = r.sequence.map((m) => {
    const d = describeMsg(m);
    return {
      pattern: m.pattern,
      i: m.i,
      j: m.j,
      length: m.j - m.i + 1,
      description: describe(m),
      descriptionMsg: d.base,
      descriptionExtras: d.extras,
      guessesLog10: Number(m.guessesLog10 ?? Math.log10(Math.max(1, m.guesses ?? 1))),
    };
  });
  const whole = r.sequence;
  const commonPassword = whole.length === 1 && whole[0].pattern === 'dictionary' && whole[0].dictionaryName === 'passwords' && whole[0].i === 0 && whole[0].j === password.length - 1;
  return {
    length,
    classes: charClasses(password),
    poolSize,
    poolEntropyBits: bits,
    guessEntropyBits: Math.log2(Math.max(1, guesses)),
    guesses,
    guessesLog10: r.guessesLog10,
    score: r.score,
    label: SCORE_LABELS[r.score],
    crackTimes,
    warning: r.feedback.warning || null,
    suggestions: r.feedback.suggestions ?? [],
    patterns,
    nist: { singleFactorLength: length >= 15, mfaLength: length >= 8, commonPassword },
    truncated: password.length > MAX_ANALYZED_LENGTH,
  };
}
