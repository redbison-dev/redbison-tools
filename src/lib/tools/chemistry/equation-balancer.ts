/**
 * Shared chemical-equation core for the chemistry calculators (stoichiometry,
 * limiting reactant, percent yield): parse "Al + I2 -> AlI3", find the
 * smallest whole-number coefficients that conserve every element and the
 * charge, and attach each species' molar mass.
 *
 * Balancing is linear algebra: one column per species, one row per element
 * (plus charge), product columns negated. The coefficients are the null space
 * of that matrix, found with exact rational arithmetic (BigInt fractions), so
 * there is no floating-point rounding. A one-dimensional null space with all
 * entries of one sign is a unique balanced equation; anything else is reported
 * with a reason. Formula parsing and atomic weights are reused from the
 * molecular weight calculator so every chemistry tool agrees on molar masses.
 */
import { ATOMIC_WEIGHTS, parseFormula } from '../calculators/science';

export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: string): Result<T> => ({ ok: false, error });

export type PhysicalState = 's' | 'l' | 'g' | 'aq';
export type Side = 'reactant' | 'product';

export type Species = {
  /** Formula as typed, without coefficient, state or charge, e.g. "Ca(OH)2". */
  formula: string;
  /** Formula with charge, as shown in results, e.g. "SO4^2-". */
  label: string;
  side: Side;
  state?: PhysicalState;
  /** Element counts; empty for an electron. */
  atoms: Record<string, number>;
  charge: number;
  /** g/mol from the IUPAC/CIAAW abridged standard atomic weights (0 for e-). */
  molarMass: number;
  /** Stoichiometric coefficient in the balanced equation. */
  coefficient: number;
  /** True when an element in it has no standard atomic weight (mass number used). */
  usesMassNumber: boolean;
};

export type BalancedEquation = {
  species: Species[];
  /** Balanced equation text, e.g. "2Al + 3I2 → 2AlI3". */
  text: string;
  /** Elements in order of first appearance. */
  elements: string[];
  /** True when the coefficients were computed here rather than taken as typed. */
  autoBalanced: boolean;
  /** Advice worth showing (e.g. the typed coefficients did not balance). */
  notes: string[];
};

/* ------------------------------------------------------------------ */
/* Exact rational arithmetic                                           */
/* ------------------------------------------------------------------ */

const B0 = BigInt(0);
const B1 = BigInt(1);

function bigAbs(a: bigint): bigint {
  return a < B0 ? -a : a;
}

function bigGcd(a: bigint, b: bigint): bigint {
  let x = bigAbs(a);
  let y = bigAbs(b);
  while (y !== B0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** A fraction n/d with d > 0, always reduced. */
type Frac = { n: bigint; d: bigint };

function frac(n: bigint, d: bigint = B1): Frac {
  if (d === B0) throw new Error('Division by zero');
  if (d < B0) {
    n = -n;
    d = -d;
  }
  const g = bigGcd(n, d) || B1;
  return { n: n / g, d: d / g };
}
const fSub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const fMul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const fDiv = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
const fIsZero = (a: Frac) => a.n === B0;

/**
 * Basis of the null space of an integer matrix (rows x cols), as integer
 * vectors. Gauss-Jordan elimination to reduced row echelon form; each free
 * column gives one basis vector.
 */
export function integerNullSpace(matrix: number[][], cols: number): bigint[][] {
  const m: Frac[][] = matrix.map((row) => row.map((v) => frac(BigInt(v))));
  const pivotCols: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < m.length; c++) {
    let p = r;
    while (p < m.length && fIsZero(m[p][c])) p++;
    if (p === m.length) continue;
    const tmp = m[p];
    m[p] = m[r];
    m[r] = tmp;
    const pv = m[r][c];
    for (let k = 0; k < cols; k++) m[r][k] = fDiv(m[r][k], pv);
    for (let i = 0; i < m.length; i++) {
      if (i === r || fIsZero(m[i][c])) continue;
      const f = m[i][c];
      for (let k = 0; k < cols; k++) m[i][k] = fSub(m[i][k], fMul(f, m[r][k]));
    }
    pivotCols.push(c);
    r++;
  }
  const free: number[] = [];
  for (let c = 0; c < cols; c++) if (!pivotCols.includes(c)) free.push(c);
  return free.map((fc) => {
    const v: Frac[] = Array.from({ length: cols }, () => frac(B0));
    v[fc] = frac(B1);
    pivotCols.forEach((pc, row) => {
      v[pc] = frac(-m[row][fc].n, m[row][fc].d);
    });
    // Scale to integers: multiply by the LCM of the denominators, divide by the GCD.
    let lcm = B1;
    for (const x of v) lcm = (lcm * x.d) / bigGcd(lcm, x.d);
    const ints = v.map((x) => (x.n * lcm) / x.d);
    let g = B0;
    for (const x of ints) g = bigGcd(g, x);
    return ints.map((x) => (g === B0 ? x : x / g));
  });
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

const SUPERSCRIPTS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

/** Arrows people type: ->, →, =, =>, <->, <=>, ⇌, ⟶. */
const ARROW = /\s*(?:<=>|<->|<-->|-->|->|=>|⟶|→|⇌|⇄|↔|=)\s*/;

/**
 * Split one side of an equation into species. A "+" separates species only
 * when the next non-space character can start a species, so the charges in
 * "Na+ + Cl-" or "Fe^3+ + 3OH-" stay with their ions.
 */
export function splitSide(side: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < side.length; i++) {
    const ch = side[i];
    if (ch === '+') {
      const rest = side.slice(i + 1).trimStart();
      const prev = cur.trimEnd();
      const startsSpecies = /^[A-Z0-9([{]|^e(?:\^?-|⁻)/.test(rest);
      const afterCaret = /\^\{?\d*$/.test(prev);
      if (startsSpecies && prev.length > 0 && !afterCaret) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** One way to read a species' formula and charge. */
export type SpeciesReading = { formula: string; label: string; charge: number };

export type ParsedToken = SpeciesReading & {
  coefficient?: number;
  state?: PhysicalState;
  electron: boolean;
  /** The species as typed, without coefficient or state, e.g. "SO42-". */
  written: string;
  /** True when the charge came from a trailing sign rather than caret or superscript notation. */
  implicitCharge: boolean;
  /**
   * A second reading when a trailing digit and sign are ambiguous: "SO42-" is
   * SO42 with charge 1- or SO4 with charge 2-. The balancer keeps whichever
   * reading balances.
   */
  alt?: SpeciesReading;
};

const ionLabel = (body: string, charge: number) =>
  charge === 0 ? body : `${body}^${Math.abs(charge) === 1 ? '' : Math.abs(charge)}${charge > 0 ? '+' : '-'}`;

function parseNumber(s: string): number {
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    return Number(a) / Number(b);
  }
  return Number(s);
}

/** Read one species token such as "3Ca(OH)2(aq)", "SO4^2-", "e-" or "1/2 O2". */
export function parseSpeciesToken(raw: string): Result<ParsedToken> {
  // Superscript charges ("SO₄²⁻", "Fe³⁺", "Ca⁺⁺") become caret notation.
  let s = raw
    .trim()
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻]+)/g, (_m, d: string, sg: string) => {
      const digits = d.replace(/./g, (c) => SUPERSCRIPTS[c]);
      return `^${digits || (sg.length > 1 ? String(sg.length) : '')}${SUPERSCRIPTS[sg[0]]}`;
    })
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUPERSCRIPTS[c]);
  if (!s) return fail('An empty species: check for a stray "+" or arrow.');

  let coefficient: number | undefined;
  const cm = /^(\d+\/\d+|\d+(?:\.\d+)?)\s*(?=[A-Z([{]|e(?:\^?-|$))/.exec(s);
  if (cm) {
    coefficient = parseNumber(cm[1]);
    if (!(coefficient > 0) || !Number.isFinite(coefficient)) return fail(`"${raw}" has a coefficient that is not a positive number.`);
    s = s.slice(cm[0].length);
  }

  let state: PhysicalState | undefined;
  const sm = /\((s|l|g|aq)\)$/i.exec(s);
  if (sm) {
    state = sm[1].toLowerCase() as PhysicalState;
    s = s.slice(0, sm.index).trim();
  }

  if (/^e(?:\^?-|\^\{-\})?$/.test(s) && s !== 'e') {
    return ok({ coefficient, formula: 'e', label: 'e-', state, charge: -1, electron: true, written: s, implicitCharge: false });
  }

  const written = s;
  let charge = 0;
  let body = s;
  let implicitCharge = false;
  let alt: SpeciesReading | undefined;
  const caret = /\^\{?(\d*)([+-])\}?$|\^\{?([+-])(\d*)\}?$/.exec(body);
  const spaced = /\s+(\d*)([+-])$/.exec(body);
  if (caret) {
    const digits = caret[1] ?? caret[4] ?? '';
    const sign = caret[2] ?? caret[3];
    charge = (sign === '-' ? -1 : 1) * (digits ? Number(digits) : 1);
    body = body.slice(0, caret.index).trim();
  } else if (spaced) {
    // "SO4 2-": a space separates the formula from its charge.
    charge = (spaced[2] === '-' ? -1 : 1) * (spaced[1] ? Number(spaced[1]) : 1);
    body = body.slice(0, spaced.index).trim();
    implicitCharge = true;
  } else {
    const trail = /([+-]+)$/.exec(body);
    if (trail) {
      const signs = trail[1];
      const sign = signs[0] === '-' ? -1 : 1;
      if (!/^(\+)+$|^(-)+$/.test(signs)) {
        return fail(`Could not read the charge on "${raw}". Write it with a caret, e.g. SO4^2- or Fe^3+.`);
      }
      implicitCharge = true;
      body = body.slice(0, trail.index).trim();
      const mono = /^([A-Z][a-z]?)(\d)$/.exec(body);
      if (signs.length === 1 && mono && ATOMIC_WEIGHTS[mono[1]]) {
        // A single element, one digit and a sign is a monatomic ion: Cu2+, Fe3+, O2-.
        charge = sign * Number(mono[2]);
        body = mono[1];
      } else if (signs.length > 1 && /\d$/.test(body)) {
        return fail(`Could not read the charge on "${raw}". Write it with a caret, e.g. Fe^3+ or SO4^2-.`);
      } else {
        charge = sign * signs.length;
        // "SO42-", "NH4+", "PO43-": the last digit may be a subscript or the charge.
        const poly = /^(.+)([2-9])$/.exec(body);
        if (signs.length === 1 && poly) {
          const altCharge = sign * Number(poly[2]);
          alt = { formula: poly[1], label: ionLabel(poly[1], altCharge), charge: altCharge };
        }
      }
    }
  }
  if (!body) return fail(`"${raw}" has no formula.`);
  if (/\s/.test(body)) return fail(`"${raw}" contains a space. Separate species with " + ".`);
  return ok({ coefficient, formula: body, label: ionLabel(body, charge), state, charge, electron: false, written, implicitCharge, alt });
}

/* ------------------------------------------------------------------ */
/* Balancing                                                           */
/* ------------------------------------------------------------------ */

function fmtCoef(c: number): string {
  return c === 1 ? '' : String(Number(c.toPrecision(12)));
}

/** "2Al + 3I2 → 2AlI3" with states when given. */
export function equationText(species: Species[]): string {
  const side = (s: Side) =>
    species
      .filter((x) => x.side === s)
      .map((x) => `${fmtCoef(x.coefficient)}${x.label}${x.state ? `(${x.state})` : ''}`)
      .join(' + ');
  return `${side('reactant')} → ${side('product')}`;
}

const MAX_SPECIES = 20;

/**
 * Parse and balance a chemical equation. Typed coefficients are kept when
 * they already balance (this is how to enter a reaction with more than one
 * independent balance); otherwise the smallest whole-number coefficients are
 * computed.
 */
export function balanceEquation(input: string): Result<BalancedEquation> {
  const text = String(input ?? '').trim();
  if (!text) return fail('Enter a chemical equation, for example Al + I2 -> AlI3.');
  const parts = text.split(ARROW);
  if (parts.length !== 2) {
    return fail(parts.length < 2 ? 'Separate reactants and products with an arrow, for example H2 + O2 -> H2O.' : 'Use exactly one arrow between reactants and products.');
  }
  const [left, right] = parts.map(splitSide);
  if (left.length === 0 || right.length === 0) return fail('Both sides of the arrow need at least one species.');
  if (left.length + right.length > MAX_SPECIES) return fail(`Up to ${MAX_SPECIES} species are supported.`);

  const tokens: { side: Side; token: ParsedToken }[] = [];
  const sides: { side: Side; list: string[] }[] = [
    { side: 'reactant', list: left },
    { side: 'product', list: right },
  ];
  for (const { side, list } of sides) {
    for (const tok of list) {
      const p = parseSpeciesToken(tok);
      if (!p.ok) return fail(p.error);
      tokens.push({ side, token: p.value });
    }
  }

  // Each ambiguous ion ("SO42-") has two readings; try every combination and
  // keep the one that balances.
  const ambiguous = tokens.map((t, k) => (t.token.alt ? k : -1)).filter((k) => k >= 0);
  if (ambiguous.length > 8) return fail('Too many charges are ambiguous. Write charges with a caret, e.g. SO4^2-.');
  const combos = 1 << ambiguous.length;
  const wins: BalancedEquation[] = [];
  let firstError = '';
  for (let mask = 0; mask < combos; mask++) {
    const readings = tokens.map((t, k) => {
      const bit = ambiguous.indexOf(k);
      return bit >= 0 && mask & (1 << bit) ? (t.token.alt as SpeciesReading) : (t.token as SpeciesReading);
    });
    const r = balanceReadings(tokens, readings);
    if (r.ok) wins.push(r.value);
    else if (mask === 0) firstError = r.error;
  }
  const askCaret = (list: number[]) =>
    list.map((k) => `"${tokens[k].token.written}" (${tokens[k].token.label} or ${tokens[k].token.alt!.label})`).join(', ');
  if (wins.length === 0) {
    return fail(ambiguous.length ? `${firstError} If ${askCaret(ambiguous)} carries a different charge, write it with a caret, e.g. SO4^2-.` : firstError);
  }
  if (wins.length > 1) {
    return fail(`The charge on ${askCaret(ambiguous)} can be read more than one way and each balances. Write charges with a caret, e.g. SO4^2- or NH4^+.`);
  }
  const eq = wins[0];
  const ions = eq.species
    .map((sp, k) => ({ sp, t: tokens[k].token }))
    .filter(({ t }) => t.implicitCharge)
    .map(({ sp, t }) => `${t.written} as ${sp.label} (${sp.formula}, charge ${Math.abs(sp.charge)}${sp.charge > 0 ? '+' : '-'})`);
  if (ions.length) eq.notes.unshift(`Ions read as: ${ions.join('; ')}. Use a caret, such as SO4^2-, if you meant something else.`);
  return ok(eq);
}

/** Build species from one reading of each token and balance them. */
function balanceReadings(tokens: { side: Side; token: ParsedToken }[], readings: SpeciesReading[]): Result<BalancedEquation> {
  const species: Species[] = [];
  const typed: (number | undefined)[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const { side, token } = tokens[k];
    const rd = readings[k];
    let atoms: Record<string, number> = {};
    let mm = 0;
    let usesMassNumber = false;
    if (!token.electron) {
      const f = parseFormula(rd.formula);
      if (!f.ok) return fail(`${rd.formula}: ${f.error}`);
      atoms = Object.fromEntries(f.value);
      for (const [el, n] of f.value) {
        mm += ATOMIC_WEIGHTS[el].w * n;
        if (ATOMIC_WEIGHTS[el].massNumber) usesMassNumber = true;
      }
    }
    typed.push(token.coefficient);
    species.push({
      formula: rd.formula,
      label: rd.label,
      side,
      state: token.state,
      atoms,
      charge: rd.charge,
      molarMass: mm,
      coefficient: 1,
      usesMassNumber,
    });
  }

  const elements: string[] = [];
  for (const sp of species) for (const el of Object.keys(sp.atoms)) if (!elements.includes(el)) elements.push(el);
  const sign = (sp: Species) => (sp.side === 'reactant' ? 1 : -1);
  const rows = elements.map((el) => species.map((sp) => sign(sp) * (sp.atoms[el] ?? 0)));
  if (species.some((sp) => sp.charge !== 0)) rows.push(species.map((sp) => sign(sp) * sp.charge));

  // Elements that appear on one side only can never balance.
  for (const el of elements) {
    const inR = species.some((sp) => sp.side === 'reactant' && sp.atoms[el]);
    const inP = species.some((sp) => sp.side === 'product' && sp.atoms[el]);
    if (inR !== inP) {
      return fail(`${el} (${ATOMIC_WEIGHTS[el].name.toLowerCase()}) appears only on the ${inR ? 'reactant' : 'product'} side, so the equation cannot balance. Check the formulas or add the missing species.`);
    }
  }

  const notes: string[] = [];
  // Coefficients as typed (1 where none is written) win when they already
  // balance. This also settles equations such as aspirin synthesis, where
  // atom counting alone allows more than one independent balance.
  const anyTyped = typed.some((c) => c !== undefined);
  const asTyped = typed.map((c) => c ?? 1);
  const balancedAsTyped = rows.every((row) => Math.abs(row.reduce((s, v, k) => s + v * asTyped[k], 0)) < 1e-9 * Math.max(1, ...asTyped));
  if (balancedAsTyped) {
    species.forEach((sp, k) => (sp.coefficient = asTyped[k]));
    return ok({ species, text: equationText(species), elements, autoBalanced: false, notes });
  }

  const basis = integerNullSpace(rows, species.length);
  if (basis.length === 0) {
    return fail('This equation cannot be balanced as written: no set of coefficients conserves every element' + (rows.length > elements.length ? ' and the charge' : '') + '. Check the formulas.');
  }
  if (basis.length > 1) {
    return fail('Atom counting alone allows more than one independent balance here (the equation can be split into separate reactions). Type the coefficients from your reaction, for example 2H2 + O2 -> 2H2O, and they will be checked.');
  }
  let v = basis[0];
  if (v.some((x) => x === B0)) {
    const idle = species.filter((_, k) => v[k] === B0).map((sp) => sp.label);
    return fail(`${idle.join(', ')} cannot take part in a balanced version of this equation (its coefficient would be zero). Check the formulas.`);
  }
  if (v[0] < B0) v = v.map((x) => -x);
  if (v.some((x) => x < B0)) {
    const wrong = species.filter((_, k) => v[k] < B0).map((sp) => sp.label);
    return fail(`The equation only balances with ${wrong.join(', ')} on the other side of the arrow.`);
  }
  if (v.some((x) => x > BigInt(1_000_000))) return fail('The balanced coefficients are implausibly large. Check the formulas.');
  species.forEach((sp, k) => (sp.coefficient = Number(v[k])));
  if (anyTyped) notes.push('The coefficients you typed did not balance, so they were replaced with the balanced ones.');
  return ok({ species, text: equationText(species), elements, autoBalanced: true, notes });
}

/** Find a species by its formula or label (case-sensitive), or by index. */
export function findSpecies(eq: BalancedEquation, key: string | number): number {
  if (typeof key === 'number') return key >= 0 && key < eq.species.length ? key : -1;
  const k = key.trim();
  const i = eq.species.findIndex((sp) => sp.formula === k || sp.label === k);
  return i;
}
