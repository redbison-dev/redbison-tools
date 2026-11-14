/**
 * IEEE 754-2019 binary interchange formats (binary16, binary32, binary64)
 * for the IEEE 754 Float Converter tool and its MCP tool.
 *
 * Encoding works on exact rationals with BigInt and rounds once, to nearest
 * with ties to even (roundTiesToEven, IEEE 754-2019 clause 4.3.3). That
 * avoids the double rounding of Math.fround(parseFloat(s)), which can be off
 * by one unit in the last place for binary32, and it covers binary16, which
 * DataView only gained recently. Decoding reads any bit pattern, including
 * subnormals, infinities and NaNs with payloads, and gives the exact decimal
 * value of the stored number (every binary float is a finite decimal).
 */

export type FloatFormat = 'binary16' | 'binary32' | 'binary64';

export type FormatSpec = {
  id: FloatFormat;
  name: string;
  /** Total width in bits. */
  bits: number;
  exponentBits: number;
  /** Stored fraction (trailing significand) bits, t in IEEE 754 Table 3.5. */
  fractionBits: number;
  /** Precision p = t + 1, counting the implicit leading bit. */
  precision: number;
  bias: number;
  emax: number;
  emin: number;
  /** Common names in languages and hardware. */
  aka: string;
};

const spec = (id: FloatFormat, bits: number, exponentBits: number, aka: string, name: string): FormatSpec => {
  const fractionBits = bits - 1 - exponentBits;
  const emax = 2 ** (exponentBits - 1) - 1;
  return { id, name, bits, exponentBits, fractionBits, precision: fractionBits + 1, bias: emax, emax, emin: 1 - emax, aka };
};

export const FORMATS: Record<FloatFormat, FormatSpec> = {
  binary16: spec('binary16', 16, 5, 'half precision, float16, _Float16, Float16Array', 'Half precision (binary16)'),
  binary32: spec('binary32', 32, 8, 'single precision, float in C and Java, f32, Float32Array', 'Single precision (binary32)'),
  binary64: spec('binary64', 64, 11, 'double precision, double, f64, JavaScript number', 'Double precision (binary64)'),
};

export type FloatClass = 'zero' | 'subnormal' | 'normal' | 'infinity' | 'nan';

/** An exact non-negative rational with a sign. */
type Rational = { negative: boolean; num: bigint; den: bigint };

export const MAX_INPUT_LENGTH = 2000;

const bitLen = (n: bigint): number => (n === 0n ? 0 : n.toString(2).length);

/** floor(log2(num/den)) for positive num/den. */
function floorLog2(num: bigint, den: bigint): number {
  let e = bitLen(num) - bitLen(den);
  // 2^e <= num/den < 2^(e+1) after at most one correction.
  if (e >= 0 ? num < den << BigInt(e) : num << BigInt(-e) < den) e -= 1;
  return e;
}

/** Round num/den to the nearest integer, ties to even. */
function roundHalfEven(num: bigint, den: bigint): bigint {
  const q = num / den;
  const r = num % den;
  const twice = 2n * r;
  if (twice > den || (twice === den && (q & 1n) === 1n)) return q + 1n;
  return q;
}

/** Parse the special words and the three numeric forms the tool accepts. */
/** Scientific notation (6 significant digits) of m x 10^e10, from a mantissa in [1, 10). */
const sci = (mant: number, e10: number) => {
  let m = Number(mant.toPrecision(6));
  let e = e10;
  if (m >= 10) {
    m /= 10;
    e += 1;
  }
  return `${m}e${e >= 0 ? '+' : ''}${e}`;
};

type Parsed =
  | { kind: 'number'; value: Rational }
  | { kind: 'inf'; negative: boolean }
  | { kind: 'nan'; negative: boolean }
  /** Non-zero but far below the smallest subnormal of any format; `magnitude` is its value in scientific notation. */
  | { kind: 'tiny'; negative: boolean; magnitude: string };

function parseValue(input: string): Parsed {
  if (input.length > MAX_INPUT_LENGTH) throw new Error(`Input is longer than ${MAX_INPUT_LENGTH} characters.`);
  const s = input.trim().replace(/[_\s]/g, '').replace(/−/g, '-');
  if (!s) throw new Error('Enter a number, for example 0.1, -2.5e-3, 1/3, 0x1.8p3, inf or nan.');
  const sign = s[0] === '-' || s[0] === '+' ? s[0] : '';
  const body = sign ? s.slice(1) : s;
  const negative = sign === '-';
  const lower = body.toLowerCase();
  if (lower === 'inf' || lower === 'infinity' || lower === '∞') return { kind: 'inf', negative };
  if (lower === 'nan') return { kind: 'nan', negative };
  let m = /^(\d+)\/(\d+)$/.exec(body);
  if (m) {
    const den = BigInt(m[2]);
    if (den === 0n) throw new Error('Division by zero in the fraction.');
    return { kind: 'number', value: { negative, num: BigInt(m[1]), den } };
  }
  m = /^0x([0-9a-f]*)(?:\.([0-9a-f]*))?p([+-]?\d+)$/i.exec(body);
  if (m) {
    const intH = m[1];
    const fracH = m[2] ?? '';
    if (!intH && !fracH) throw new Error('A hex float needs at least one hex digit, as in 0x1.8p3.');
    let num = BigInt('0x' + (intH + fracH || '0'));
    let den = 1n << BigInt(4 * fracH.length);
    const p = Number(m[3]);
    if (num === 0n) return { kind: 'number', value: { negative, num: 0n, den: 1n } };
    if (p > 20000) return { kind: 'inf', negative };
    if (p < -20000) {
      // log10 of (num / den) x 2^p, for reporting the size of what was lost.
      const l = Math.log10(Number(num)) - Math.log10(Number(den)) + p * Math.log10(2);
      const e10 = Math.floor(l);
      return { kind: 'tiny', negative, magnitude: sci(10 ** (l - e10), e10) };
    }
    if (p >= 0) num <<= BigInt(p);
    else den <<= BigInt(-p);
    return { kind: 'number', value: { negative, num, den } };
  }
  m = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(body);
  if (m && (m[1] || m[2])) {
    const digits = (m[1] + (m[2] ?? '')).replace(/^0+(?=\d)/, '');
    let exp = (m[3] ? Number(m[3]) : 0) - (m[2] ?? '').length;
    let num = BigInt(digits || '0');
    if (num === 0n) return { kind: 'number', value: { negative, num: 0n, den: 1n } };
    if (exp > 20000) return { kind: 'inf', negative };
    if (exp < -20000) {
      // Far below the smallest subnormal of any format: rounds to zero, and the whole input is the error.
      const d = num.toString();
      return { kind: 'tiny', negative, magnitude: sci(Number(`${d[0]}.${d.slice(1, 17) || '0'}`), exp + d.length - 1) };
    }
    return exp >= 0 ? { kind: 'number', value: { negative, num: num * 10n ** BigInt(exp), den: 1n } } : { kind: 'number', value: { negative, num, den: 10n ** BigInt(-exp) } };
  }
  throw new Error(`Could not read "${input.trim()}" as a number. Use a decimal (0.1, 6.02e23), a fraction (1/3), a hex float (0x1.8p3), inf or nan.`);
}

/** Exact decimal expansion of m * 2^q (m >= 0). */
export function exactDecimal(m: bigint, q: number): string {
  if (q >= 0) return (m << BigInt(q)).toString();
  const k = -q;
  const scaled = (m * 5n ** BigInt(k)).toString().padStart(k + 1, '0');
  const int = scaled.slice(0, scaled.length - k);
  const frac = scaled.slice(scaled.length - k).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

/** Decimal of a rational with `sig` significant digits, in scientific notation (for rounding errors). */
function sciRational(negative: boolean, num: bigint, den: bigint, sig = 6): string {
  if (num === 0n) return '0';
  // Find e10 with 10^e10 <= num/den < 10^(e10+1).
  let e10 = num.toString().length - den.toString().length;
  const ge = (e: number) => (e >= 0 ? num >= den * 10n ** BigInt(e) : num * 10n ** BigInt(-e) >= den);
  if (!ge(e10)) e10 -= 1;
  const shift = sig - 1 - e10;
  let digits = shift >= 0 ? roundHalfEven(num * 10n ** BigInt(shift), den) : roundHalfEven(num, den * 10n ** BigInt(-shift));
  if (digits.toString().length > sig) {
    digits /= 10n;
    e10 += 1;
  }
  const d = digits.toString();
  const mant = d.length > 1 ? `${d[0]}.${d.slice(1).replace(/0+$/, '')}`.replace(/\.$/, '') : d;
  // Plain notation for moderate magnitudes (-1, 0.5), scientific otherwise (1.49012e-9).
  if (e10 >= -4 && e10 < 6) return String(Number(`${negative ? '-' : ''}${mant}e${e10}`));
  return `${negative ? '-' : ''}${mant}e${e10 >= 0 ? '+' : ''}${e10}`;
}

/** Fields of a bit pattern. */
export type FloatParts = { sign: number; exponent: number; fraction: bigint };

export function splitBits(bits: bigint, f: FormatSpec): FloatParts {
  const t = BigInt(f.fractionBits);
  return {
    sign: Number((bits >> BigInt(f.bits - 1)) & 1n),
    exponent: Number((bits >> t) & ((1n << BigInt(f.exponentBits)) - 1n)),
    fraction: bits & ((1n << t) - 1n),
  };
}

export function joinBits(p: FloatParts, f: FormatSpec): bigint {
  return (BigInt(p.sign) << BigInt(f.bits - 1)) | (BigInt(p.exponent) << BigInt(f.fractionBits)) | p.fraction;
}

export type RoundResult = {
  bits: bigint;
  /** Stored value differs from the input. */
  inexact: boolean;
  /** Finite input too large: rounded to infinity. */
  overflow: boolean;
  /** Inexact result that ends up subnormal or zero (the underflow case of IEEE 754-2019 7.5). */
  underflow: boolean;
};

/** Round an exact rational to the nearest value of the format, ties to even. */
export function roundToFormat(v: Rational, f: FormatSpec): RoundResult {
  const signBit = v.negative ? 1 : 0;
  if (v.num === 0n) return { bits: joinBits({ sign: signBit, exponent: 0, fraction: 0n }, f), inexact: false, overflow: false, underflow: false };
  const p = f.precision;
  let e = Math.max(floorLog2(v.num, v.den), f.emin);
  const q = e - (p - 1);
  const num = q >= 0 ? v.num : v.num << BigInt(-q);
  const den = q >= 0 ? v.den << BigInt(q) : v.den;
  let M = roundHalfEven(num, den);
  const inexact = M * den !== num;
  const top = 1n << BigInt(p);
  if (M === top) {
    M = top >> 1n;
    e += 1;
  }
  const inf = joinBits({ sign: signBit, exponent: 2 ** f.exponentBits - 1, fraction: 0n }, f);
  if (e > f.emax) return { bits: inf, inexact: true, overflow: true, underflow: false };
  const hidden = 1n << BigInt(p - 1);
  if (M < hidden) {
    return { bits: joinBits({ sign: signBit, exponent: 0, fraction: M }, f), inexact, overflow: false, underflow: inexact };
  }
  return { bits: joinBits({ sign: signBit, exponent: e + f.bias, fraction: M - hidden }, f), inexact, overflow: false, underflow: false };
}

/** Value of a finite pattern as m * 2^q with m >= 0, or null for inf/NaN. */
export function significandAndExponent(bits: bigint, f: FormatSpec): { negative: boolean; m: bigint; q: number } | null {
  const { sign, exponent, fraction } = splitBits(bits, f);
  if (exponent === 2 ** f.exponentBits - 1) return null;
  const t = f.fractionBits;
  if (exponent === 0) return { negative: sign === 1, m: fraction, q: f.emin - t };
  return { negative: sign === 1, m: (1n << BigInt(t)) | fraction, q: exponent - f.bias - t };
}

/** The pattern as a JavaScript number (exact for all three formats). */
export function toNumber(bits: bigint, f: FormatSpec): number {
  const { sign, exponent, fraction } = splitBits(bits, f);
  const s = sign ? -1 : 1;
  if (exponent === 2 ** f.exponentBits - 1) return fraction === 0n ? s * Infinity : NaN;
  const v = significandAndExponent(bits, f)!;
  // m < 2^53 and 2^q is a power of two in double range, so the product is exact.
  // Split 2^q in two steps so it never underflows on the way (binary64 subnormals).
  const half = Math.trunc(v.q / 2);
  return s * Number(v.m) * 2 ** half * 2 ** (v.q - half);
}

function classify(p: FloatParts, f: FormatSpec): FloatClass {
  if (p.exponent === 2 ** f.exponentBits - 1) return p.fraction === 0n ? 'infinity' : 'nan';
  if (p.exponent === 0) return p.fraction === 0n ? 'zero' : 'subnormal';
  return 'normal';
}

/** Next representable value towards +infinity (IEEE 754-2019 5.3.1 nextUp). */
export function nextUpBits(bits: bigint, f: FormatSpec): bigint {
  const p = splitBits(bits, f);
  const c = classify(p, f);
  if (c === 'nan') return bits;
  if (c === 'infinity') return p.sign ? joinBits({ sign: 1, exponent: 2 ** f.exponentBits - 2, fraction: (1n << BigInt(f.fractionBits)) - 1n }, f) : bits;
  if (c === 'zero') return 1n;
  // Negative values move towards zero; nextUp of -minSubnormal is -0 (IEEE 754-2019 5.3.1).
  return p.sign ? bits - 1n : bits + 1n;
}

/** Next representable value towards -infinity (nextDown(x) = -nextUp(-x)). */
export function nextDownBits(bits: bigint, f: FormatSpec): bigint {
  const signMask = 1n << BigInt(f.bits - 1);
  const p = splitBits(bits, f);
  if (classify(p, f) === 'nan') return bits;
  return nextUpBits(bits ^ signMask, f) ^ signMask;
}

/** Shortest decimal that rounds back to the same pattern in this format. */
export function shortestDecimal(bits: bigint, f: FormatSpec): string {
  const x = toNumber(bits, f);
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  if (f.id === 'binary64') return String(x);
  for (let prec = 1; prec <= 17; prec++) {
    const candidate = x.toPrecision(prec);
    if (roundToFormat((parseValue(candidate) as { value: Rational }).value, f).bits === bits) return String(Number(candidate));
  }
  return String(x);
}

const hexOf = (bits: bigint, f: FormatSpec) => bits.toString(16).toUpperCase().padStart(f.bits / 4, '0');

function bytesOf(bits: bigint, f: FormatSpec): string[] {
  const out: string[] = [];
  for (let i = f.bits / 8 - 1; i >= 0; i--) out.push(((bits >> BigInt(8 * i)) & 0xffn).toString(16).toUpperCase().padStart(2, '0'));
  return out;
}

export type Neighbour = { hex: string; value: string };

export type FloatResult = {
  format: FloatFormat;
  /** Full bit pattern, sign first. */
  bits: string;
  hex: string;
  bytesBigEndian: string;
  bytesLittleEndian: string;
  sign: number;
  exponentBits: string;
  fractionBits: string;
  /** Biased exponent field as stored. */
  biasedExponent: number;
  /** Unbiased exponent (emin for subnormals and zeros), null for inf/NaN. */
  exponent: number | null;
  class: FloatClass;
  /** The value as (-1)^s x 1.f x 2^e (or 0.f x 2^emin for subnormals). */
  formula: string;
  /** Exact decimal value of the stored number. */
  exactValue: string;
  /** Shortest decimal that reads back to the same bits. */
  shortest: string;
  /** Distance to the next float of larger magnitude at this exponent (unit in the last place), exact. */
  ulp: string | null;
  nextUp: Neighbour;
  nextDown: Neighbour;
  nan: { quiet: boolean; payload: string; payloadHex: string } | null;
  /** Only when encoding a value: the input, whether rounding changed it, and by how much. */
  rounding: { input: string; exact: boolean; error: string; relativeError: string; overflow: boolean; underflow: boolean } | null;
};

/** Everything the tool shows about one bit pattern. */
export function describeBits(bits: bigint, format: FloatFormat, rounding: FloatResult['rounding'] = null): FloatResult {
  const f = FORMATS[format];
  const p = splitBits(bits, f);
  const cls = classify(p, f);
  const t = f.fractionBits;
  const fracStr = p.fraction.toString(2).padStart(t, '0');
  const all = bits.toString(2).padStart(f.bits, '0');
  const bytes = bytesOf(bits, f);
  const sgn = p.sign ? '-' : '';
  let formula: string;
  let exactValue: string;
  let exponent: number | null;
  let ulp: string | null = null;
  if (cls === 'nan') {
    formula = 'NaN: exponent all ones, fraction not zero';
    exactValue = 'NaN';
    exponent = null;
  } else if (cls === 'infinity') {
    formula = `${sgn}Infinity: exponent all ones, fraction zero`;
    exactValue = `${sgn}Infinity`;
    exponent = null;
  } else {
    const v = significandAndExponent(bits, f)!;
    exponent = cls === 'normal' ? p.exponent - f.bias : f.emin;
    formula = cls === 'normal' ? `(-1)^${p.sign} x 1.${fracStr} (binary) x 2^${exponent}` : `(-1)^${p.sign} x 0.${fracStr} (binary) x 2^${f.emin}`;
    exactValue = sgn + exactDecimal(v.m, v.q);
    ulp = exactDecimal(1n, v.q);
  }
  const nb = (b: bigint): Neighbour => ({ hex: hexOf(b, f), value: shortestDecimal(b, f) });
  const quietBit = 1n << BigInt(t - 1);
  return {
    format,
    bits: all,
    hex: hexOf(bits, f),
    bytesBigEndian: bytes.join(' '),
    bytesLittleEndian: [...bytes].reverse().join(' '),
    sign: p.sign,
    exponentBits: all.slice(1, 1 + f.exponentBits),
    fractionBits: fracStr,
    biasedExponent: p.exponent,
    exponent,
    class: cls,
    formula,
    exactValue,
    shortest: shortestDecimal(bits, f),
    ulp,
    nextUp: nb(nextUpBits(bits, f)),
    nextDown: nb(nextDownBits(bits, f)),
    nan:
      cls === 'nan'
        ? {
            quiet: (p.fraction & quietBit) !== 0n,
            payload: (p.fraction & (quietBit - 1n)).toString(),
            payloadHex: '0x' + (p.fraction & (quietBit - 1n)).toString(16).toUpperCase(),
          }
        : null,
    rounding,
  };
}

/**
 * Encode a decimal, fraction (1/3), hex float (0x1.8p3), inf or nan into a
 * format, rounding to nearest with ties to even. NaN becomes the default
 * quiet NaN (exponent all ones, top fraction bit set, payload zero).
 */
export function encodeFloat(input: string, format: FloatFormat): FloatResult {
  const f = FORMATS[format];
  const parsed = parseValue(input);
  const expAll = 2 ** f.exponentBits - 1;
  if (parsed.kind === 'nan') {
    const bits = joinBits({ sign: parsed.negative ? 1 : 0, exponent: expAll, fraction: 1n << BigInt(f.fractionBits - 1) }, f);
    return describeBits(bits, format, { input: input.trim(), exact: true, error: '0', relativeError: '0', overflow: false, underflow: false });
  }
  if (parsed.kind === 'inf') {
    const bits = joinBits({ sign: parsed.negative ? 1 : 0, exponent: expAll, fraction: 0n }, f);
    return describeBits(bits, format, { input: input.trim(), exact: true, error: '0', relativeError: '0', overflow: false, underflow: false });
  }
  if (parsed.kind === 'tiny') {
    const bits = joinBits({ sign: parsed.negative ? 1 : 0, exponent: 0, fraction: 0n }, f);
    // Stored zero minus the input: the error is minus the input, 100% of it.
    const error = (parsed.negative ? '' : '-') + parsed.magnitude;
    return describeBits(bits, format, { input: input.trim(), exact: false, error, relativeError: '1', overflow: false, underflow: true });
  }
  const v = parsed.value;
  const r = roundToFormat(v, f);
  let error = '0';
  let relativeError = '0';
  if (r.inexact && !r.overflow) {
    const s = significandAndExponent(r.bits, f)!;
    // stored - input = (m 2^q) - num/den, as one rational.
    const sn = s.q >= 0 ? s.m << BigInt(s.q) : s.m;
    const sd = s.q >= 0 ? 1n : 1n << BigInt(-s.q);
    const diffNum = sn * v.den - v.num * sd; // magnitude difference, signs equal
    const neg = (diffNum < 0n) !== v.negative;
    const absNum = diffNum < 0n ? -diffNum : diffNum;
    error = sciRational(neg, absNum, sd * v.den);
    relativeError = sciRational(false, absNum * v.den, sd * v.den * v.num);
  } else if (r.overflow) {
    error = 'Infinity';
    relativeError = 'Infinity';
  }
  return describeBits(r.bits, format, { input: input.trim(), exact: !r.inexact, error, relativeError, overflow: r.overflow, underflow: r.underflow });
}

/**
 * Decode a bit pattern given as hex (0x3DCCCCCD, 3dcc cccd) or binary
 * (0b..., or exactly as many 0/1 digits as the format has bits).
 */
export function decodeFloat(input: string, format: FloatFormat): FloatResult {
  const f = FORMATS[format];
  let s = input.trim().replace(/[\s_:]/g, '');
  if (!s) throw new Error('Enter a bit pattern in hex or binary.');
  let bits: bigint;
  // Exactly bits/4 hex digits is a hex pattern, even when it starts with "0B" (0B100000 is 0x0B100000).
  const hexLike = /^[0-9a-f]+$/i.test(s) && s.length === f.bits / 4;
  if (!hexLike && (/^0b[01]+$/i.test(s) || (/^[01]+$/.test(s) && s.length === f.bits))) {
    s = s.replace(/^0b/i, '');
    if (s.length > f.bits) throw new Error(`${s.length} bits is too many for ${format} (${f.bits} bits).`);
    bits = BigInt('0b' + s);
  } else {
    s = s.replace(/^0x/i, '');
    if (!/^[0-9a-f]+$/i.test(s)) throw new Error('Use hex digits (0-9, A-F) or a binary pattern.');
    if (s.length > f.bits / 4) throw new Error(`${s.length} hex digits is too many for ${format} (${f.bits / 4} digits).`);
    bits = BigInt('0x' + s);
  }
  return describeBits(bits, format);
}

/**
 * The same NaN in another format: sign and quiet bit kept, payload truncated
 * to the low bits that fit. A signalling NaN whose payload truncates to zero
 * becomes quiet, since an all-zero fraction would mean infinity.
 */
export function nanToFormat(r: FloatResult, to: FloatFormat): bigint {
  if (!r.nan) throw new Error('Not a NaN.');
  const f = FORMATS[to];
  const quietBit = 1n << BigInt(f.fractionBits - 1);
  const payload = BigInt(r.nan.payload) & (quietBit - 1n);
  const fraction = r.nan.quiet || payload === 0n ? quietBit | payload : payload;
  return joinBits({ sign: r.sign, exponent: 2 ** f.exponentBits - 1, fraction }, f);
}

/** Field layout and limits of a format, for the reference table. */
export function formatLimits(format: FloatFormat) {
  const f = FORMATS[format];
  const maxFinite = joinBits({ sign: 0, exponent: 2 ** f.exponentBits - 2, fraction: (1n << BigInt(f.fractionBits)) - 1n }, f);
  const minNormal = joinBits({ sign: 0, exponent: 1, fraction: 0n }, f);
  // The exact value when it is short (65504), otherwise the shortest round-trip decimal.
  const show = (b: bigint) => {
    const v = significandAndExponent(b, f)!;
    const exact = exactDecimal(v.m, v.q);
    return exact.length <= 20 ? exact : shortestDecimal(b, f);
  };
  return {
    ...f,
    maxFinite: show(maxFinite),
    minNormal: show(minNormal),
    minSubnormal: show(1n),
    /** Machine epsilon 2^-(p-1): the gap between 1 and the next float. */
    epsilon: exactDecimal(1n, -(f.precision - 1)),
    /** Decimal digits that always survive a round trip: floor((p - 1) log10 2). */
    decimalDigits: Math.floor((f.precision - 1) * Math.log10(2)),
    /** Decimal digits needed to round-trip every value: ceil(p log10 2) + 1. */
    roundTripDigits: Math.ceil(f.precision * Math.log10(2)) + 1,
  };
}
