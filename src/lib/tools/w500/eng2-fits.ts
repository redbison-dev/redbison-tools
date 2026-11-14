/**
 * ISO 286-1:2010 / ISO 286-2:2010 limits and fits for nominal sizes up to 500 mm.
 *  - Standard tolerance grades IT1 to IT16 (ISO 286-1 Table 1).
 *  - Fundamental deviations for holes F, G, H, JS, K, M, N, P and shafts
 *    f, g, h, js, k, m, n, p, r, s (ISO 286-1 Tables 2 and 3), including the
 *    Δ rule for K, M, N (to IT8) and P (to IT7) and the M6 exception at
 *    250 to 315 mm.
 * All deviations in micrometres (µm).
 */
import { msg } from '../../msg';

export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Main size ranges: over lower, up to and including upper (mm). */
export const MAIN_RANGES: [number, number][] = [
  [0, 3], [3, 6], [6, 10], [10, 18], [18, 30], [30, 50], [50, 80], [80, 120], [120, 180], [180, 250], [250, 315], [315, 400], [400, 500],
];

/** Intermediate ranges used by r and s above 50 mm. */
export const SUB_RANGES: [number, number][] = [
  [0, 3], [3, 6], [6, 10], [10, 18], [18, 30], [30, 50], [50, 65], [65, 80], [80, 100], [100, 120], [120, 140], [140, 160], [160, 180],
  [180, 200], [200, 225], [225, 250], [250, 280], [280, 315], [315, 355], [355, 400], [400, 450], [450, 500],
];

/** IT1 ... IT16 in µm, one value per main range. */
export const IT: Record<number, number[]> = {
  1: [0.8, 1, 1, 1.2, 1.5, 1.5, 2, 2.5, 3.5, 4.5, 6, 7, 8],
  2: [1.2, 1.5, 1.5, 2, 2.5, 2.5, 3, 4, 5, 7, 8, 9, 10],
  3: [2, 2.5, 2.5, 3, 4, 4, 5, 6, 8, 10, 12, 13, 15],
  4: [3, 4, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20],
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
  12: [100, 120, 150, 180, 210, 250, 300, 350, 400, 460, 520, 570, 630],
  13: [140, 180, 220, 270, 330, 390, 460, 540, 630, 720, 810, 890, 970],
  14: [250, 300, 360, 430, 520, 620, 740, 870, 1000, 1150, 1300, 1400, 1550],
  15: [400, 480, 580, 700, 840, 1000, 1200, 1400, 1600, 1850, 2100, 2300, 2500],
  16: [600, 750, 900, 1100, 1300, 1600, 1900, 2200, 2500, 2900, 3200, 3600, 4000],
};

/** Shaft fundamental deviations by main range: es for f and g, ei for k (IT4 to IT7), m, n, p. */
const SHAFT_MAIN: Record<'f' | 'g' | 'k' | 'm' | 'n' | 'p', number[]> = {
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68],
};

/** ei for r and s by intermediate range. */
const SHAFT_SUB: Record<'r' | 's', number[]> = {
  r: [10, 15, 19, 23, 28, 34, 41, 43, 51, 54, 63, 65, 68, 77, 80, 84, 94, 98, 108, 114, 126, 132],
  s: [14, 19, 23, 28, 35, 43, 53, 59, 71, 79, 92, 100, 108, 122, 130, 140, 158, 170, 190, 208, 232, 252],
};

export type Kind = 'hole' | 'shaft';
export const HOLE_LETTERS = ['F', 'G', 'H', 'JS', 'K', 'M', 'N', 'P'] as const;
export const SHAFT_LETTERS = ['f', 'g', 'h', 'js', 'k', 'm', 'n', 'p', 'r', 's'] as const;

/** Grades this calculator offers per letter (the ranges tabulated in ISO 286-2 for common use). */
export const GRADE_RANGE: Record<string, [number, number]> = {
  F: [4, 10], G: [4, 10], H: [1, 16], JS: [1, 16], K: [4, 8], M: [4, 8], N: [4, 11], P: [4, 10],
  f: [4, 10], g: [4, 10], h: [1, 16], js: [1, 16], k: [4, 11], m: [4, 9], n: [4, 9], p: [4, 10], r: [4, 10], s: [4, 10],
};

function rangeIndex(sizeMm: number, ranges: [number, number][]): number {
  return ranges.findIndex(([a, b]) => sizeMm > a && sizeMm <= b);
}

export function itValue(grade: number, sizeMm: number): number | undefined {
  const i = rangeIndex(sizeMm, MAIN_RANGES);
  return i < 0 ? undefined : IT[grade]?.[i];
}

export type Zone = {
  kind: Kind;
  letter: string;
  grade: number;
  label: string;
  sizeMm: number;
  range: [number, number];
  /** Upper and lower deviation, µm. */
  upper: number;
  lower: number;
  it: number;
  /** Fundamental deviation (the deviation nearest zero by definition), µm. */
  fundamental: number;
  maxMm: number;
  minMm: number;
  note: string | null;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Parse "H7", "g6", "js5", "JS7". Case decides hole (upper) or shaft (lower). */
export function parseClass(s: string): Result<{ kind: Kind; letter: string; grade: number }> {
  const m = /^\s*(JS|js|[A-Za-z])\s*(\d{1,2})\s*$/.exec(s ?? '');
  if (!m) return fail(msg('Write a tolerance class as a letter and a grade, for example H7 or g6.'));
  const letter = m[1];
  const kind: Kind = letter === letter.toUpperCase() ? 'hole' : 'shaft';
  return { ok: true, value: { kind, letter, grade: Number(m[2]) } };
}

export function toleranceZone(kind: Kind, letter: string, grade: number, sizeMm: number): Result<Zone> {
  if (!Number.isFinite(sizeMm) || sizeMm <= 0) return fail(msg('Enter a nominal size above 0 mm.'));
  if (sizeMm > 500) return fail(msg('This calculator covers nominal sizes up to 500 mm (ISO 286 continues to 3150 mm with different rules).'));
  const known = (kind === 'hole' ? HOLE_LETTERS : SHAFT_LETTERS) as readonly string[];
  if (!known.includes(letter)) return fail(`${kind === 'hole' ? 'Hole' : 'Shaft'} letter "${letter}" is not supported. Use ${known.join(', ')}.`);
  const [gLo, gHi] = GRADE_RANGE[letter];
  if (!Number.isInteger(grade) || grade < gLo || grade > gHi) return fail(`${letter} is offered in grades ${gLo} to ${gHi}.`);
  const mi = rangeIndex(sizeMm, MAIN_RANGES);
  const it = IT[grade][mi];
  const range = MAIN_RANGES[mi];
  let upper: number;
  let lower: number;
  let fundamental: number;
  let note: string | null = null;
  let useRange: [number, number] = range;

  if (kind === 'shaft') {
    switch (letter) {
      case 'f':
      case 'g':
        upper = SHAFT_MAIN[letter][mi];
        lower = upper - it;
        fundamental = upper;
        break;
      case 'h':
        upper = 0;
        lower = -it;
        fundamental = 0;
        break;
      case 'js':
        upper = it / 2;
        lower = -it / 2;
        fundamental = upper;
        break;
      case 'k':
        lower = grade >= 4 && grade <= 7 ? SHAFT_MAIN.k[mi] : 0;
        upper = lower + it;
        fundamental = lower;
        break;
      case 'm':
      case 'n':
      case 'p':
        lower = SHAFT_MAIN[letter][mi];
        upper = lower + it;
        fundamental = lower;
        break;
      default: {
        const si = rangeIndex(sizeMm, SUB_RANGES);
        useRange = SUB_RANGES[si];
        lower = SHAFT_SUB[letter as 'r' | 's'][si];
        upper = lower + it;
        fundamental = lower;
      }
    }
  } else {
    // Δ = ITn − IT(n−1) for sizes over 3 mm; 0 up to 3 mm.
    const delta = sizeMm > 3 && grade >= 2 ? IT[grade][mi] - IT[grade - 1][mi] : 0;
    switch (letter) {
      case 'F':
      case 'G':
        lower = -SHAFT_MAIN[letter.toLowerCase() as 'f' | 'g'][mi];
        upper = lower + it;
        fundamental = lower;
        break;
      case 'H':
        lower = 0;
        upper = it;
        fundamental = 0;
        break;
      case 'JS':
        upper = it / 2;
        lower = -it / 2;
        fundamental = lower;
        break;
      case 'K':
        // Up to IT8: ES = −ei(k) + Δ (with the k4 to k7 ei).
        upper = -SHAFT_MAIN.k[mi] + delta;
        lower = upper - it;
        fundamental = upper;
        break;
      case 'M':
        if (grade === 6 && range[0] === 250) {
          upper = -9;
          note = msg('ISO 286-1 special case: M6 from 250 to 315 mm has ES = −9 µm instead of −11 µm.');
        } else upper = -SHAFT_MAIN.m[mi] + delta;
        lower = upper - it;
        fundamental = upper;
        break;
      case 'N':
        upper = grade <= 8 ? -SHAFT_MAIN.n[mi] + delta : sizeMm <= 3 ? -SHAFT_MAIN.n[mi] : 0;
        lower = upper - it;
        fundamental = upper;
        break;
      default: // P
        upper = grade <= 7 ? -SHAFT_MAIN.p[mi] + delta : -SHAFT_MAIN.p[mi];
        lower = upper - it;
        fundamental = upper;
    }
  }
  const label = `${letter}${grade}`;
  return {
    ok: true,
    value: {
      kind,
      letter,
      grade,
      label,
      sizeMm,
      range: useRange,
      upper: r1(upper),
      lower: r1(lower),
      it,
      fundamental: r1(fundamental),
      maxMm: Number((sizeMm + upper / 1000).toFixed(5)),
      minMm: Number((sizeMm + lower / 1000).toFixed(5)),
      note,
    },
  };
}

export function zoneFromClass(cls: string, sizeMm: number): Result<Zone> {
  const p = parseClass(cls);
  if (!p.ok) return fail(p.error);
  return toleranceZone(p.value.kind, p.value.letter, p.value.grade, sizeMm);
}

export type FitType = 'clearance' | 'transition' | 'interference';

export type Fit = {
  sizeMm: number;
  hole: Zone;
  shaft: Zone;
  /** Hole max − shaft min, µm (positive = clearance). */
  maxClearance: number;
  /** Hole min − shaft max, µm (negative = interference). */
  minClearance: number;
  type: FitType;
  /** Range of the fit = hole tolerance + shaft tolerance, µm. */
  fitTolerance: number;
};

export function computeFit(holeClass: string, shaftClass: string, sizeMm: number): Result<Fit> {
  const h = parseClass(holeClass);
  if (!h.ok) return fail(h.error);
  if (h.value.kind !== 'hole') return fail('The hole class uses an upper-case letter, for example H7.');
  const s = parseClass(shaftClass);
  if (!s.ok) return fail(s.error);
  if (s.value.kind !== 'shaft') return fail('The shaft class uses a lower-case letter, for example g6.');
  const hole = toleranceZone('hole', h.value.letter, h.value.grade, sizeMm);
  if (!hole.ok) return fail(hole.error);
  const shaft = toleranceZone('shaft', s.value.letter, s.value.grade, sizeMm);
  if (!shaft.ok) return fail(shaft.error);
  const maxClearance = r1(hole.value.upper - shaft.value.lower);
  const minClearance = r1(hole.value.lower - shaft.value.upper);
  const type: FitType = minClearance >= 0 ? 'clearance' : maxClearance <= 0 ? 'interference' : 'transition';
  return { ok: true, value: { sizeMm, hole: hole.value, shaft: shaft.value, maxClearance, minClearance, type, fitTolerance: r1(hole.value.it + shaft.value.it) } };
}

/** Preferred hole-basis and shaft-basis fits (ISO 286-1 Annex / common practice). */
export const COMMON_FITS: { hole: string; shaft: string; name: string; use: string }[] = [
  { hole: 'H9', shaft: 'f8', name: msg('Loose running'), use: msg('Plain bearings with large temperature swings or loose alignment') },
  { hole: 'H8', shaft: 'f7', name: msg('Close running'), use: msg('Running fits on accurate machine spindles and gearbox shafts') },
  { hole: 'H7', shaft: 'g6', name: msg('Sliding'), use: msg('Parts that slide or turn freely but locate accurately') },
  { hole: 'H7', shaft: 'h6', name: msg('Locational clearance'), use: msg('Stationary parts that can be assembled and taken apart by hand') },
  { hole: 'H7', shaft: 'js6', name: msg('Locational transition (light)'), use: msg('Accurate location where a small clearance or interference is acceptable') },
  { hole: 'H7', shaft: 'k6', name: msg('Locational transition'), use: msg('Gears, pulleys and couplings located with a key') },
  { hole: 'H7', shaft: 'n6', name: msg('Locational transition (tight)'), use: msg('Greater accuracy of location where more interference is allowed') },
  { hole: 'H7', shaft: 'p6', name: msg('Locational interference'), use: msg('Rigid, accurate location without special bore pressure requirements') },
  { hole: 'H7', shaft: 'r6', name: msg('Light press'), use: msg('Bushings and hubs pressed in, transmitting light loads by friction') },
  { hole: 'H7', shaft: 's6', name: msg('Medium drive'), use: msg('Permanent shrink or press fits on steel parts, cast-iron hubs need care') },
  { hole: 'G7', shaft: 'h6', name: msg('Sliding (shaft basis)'), use: msg('Shaft-basis version of H7/g6 when the shaft is a ground standard stock') },
  { hole: 'F8', shaft: 'h7', name: msg('Close running (shaft basis)'), use: msg('Shaft-basis running fit, for example on precision ground bar') },
];
