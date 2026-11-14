/**
 * Number base conversion for the Number Base Converter tool and its MCP tool.
 *
 * Values are held as exact rationals (BigInt numerator over a power of the
 * input base), so integers of any size convert without the 2^53 limit of
 * parseInt, and fractional parts convert exactly, with repeating digits
 * detected instead of being cut off silently. Prefixes and digit separators
 * follow ECMA-262 numeric literals: 0x, 0o and 0b (any case) and "_".
 */

export const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
export const MAX_INPUT_LENGTH = 4096;
export const DEFAULT_FRACTION_DIGITS = 64;

export type ParsedNumber = {
  negative: boolean;
  /** |value| = num / den, den = base^fractionDigits, not reduced. */
  num: bigint;
  den: bigint;
  /** Base the input was read in (after prefix detection). */
  base: number;
  /** Prefix that was recognised, if any ("0x", "0o", "0b"). */
  prefix: string | null;
  hasFraction: boolean;
};

const PREFIX_BASE: Record<string, number> = { '0x': 16, '0o': 8, '0b': 2 };

function checkBase(base: number): void {
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error(`Base must be a whole number from 2 to 36, got ${base}.`);
}

/**
 * Parse a number written in `base` (2 to 36), or with base "auto", read the
 * base from a 0x, 0o or 0b prefix and default to decimal. A prefix is only
 * stripped when it names the chosen base, so "0b1" in base 16 is the hex
 * number B1, as parseInt(s, 16) would read it.
 */
export function parseInBase(input: string, base: number | 'auto' = 'auto'): ParsedNumber {
  if (input.length > MAX_INPUT_LENGTH) throw new Error(`Input is longer than ${MAX_INPUT_LENGTH} characters.`);
  let s = input.trim().replace(/[\s_']/g, '');
  if (base !== 'auto') checkBase(base);
  if (!s) throw new Error('Enter a number.');
  let negative = false;
  if (s[0] === '-' || s[0] === '+' || s[0] === '−') {
    negative = s[0] !== '+';
    s = s.slice(1);
  }
  let prefix: string | null = null;
  const p = s.slice(0, 2).toLowerCase();
  let b: number;
  if (PREFIX_BASE[p] && (base === 'auto' || PREFIX_BASE[p] === base)) {
    prefix = p;
    b = PREFIX_BASE[p];
    s = s.slice(2);
  } else {
    b = base === 'auto' ? 10 : base;
  }
  if (!s) throw new Error(prefix ? 'No digits after the prefix.' : 'No digits after the sign.');
  if (s.includes(',')) {
    // Commas are accepted only as decimal thousands separators (1,234,567), never as a decimal comma.
    const [intPart, ...rest] = s.split('.');
    if (b !== 10 || rest.some((r) => r.includes(',')) || !/^\d{1,3}(,\d{3})+$/.test(intPart)) {
      throw new Error('Commas are only accepted as thousands separators in decimal (1,234,567). Use a point for a fraction, as in 1.5.');
    }
    s = s.replace(/,/g, '');
  }
  const parts = s.split('.');
  if (parts.length > 2) throw new Error('More than one radix point.');
  const intDigits = parts[0];
  const fracDigits = parts[1] ?? '';
  if (!intDigits && !fracDigits) throw new Error('No digits.');
  const big = BigInt(b);
  let num = 0n;
  const all = intDigits + fracDigits;
  for (let i = 0; i < all.length; i++) {
    const ch = all[i].toLowerCase();
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= b) {
      throw new Error(`"${all[i]}" is not a digit in base ${b}${b <= 10 ? ` (digits are 0 to ${b - 1})` : ` (digits are 0 to 9 and a to ${DIGITS[b - 1]})`}.`);
    }
    num = num * big + BigInt(d);
  }
  const den = big ** BigInt(fracDigits.length);
  return { negative: negative && num !== 0n, num, den, base: b, prefix, hasFraction: parts.length === 2 };
}

/** Insert `sep` every `size` digits from the right of an integer digit string. */
export function groupDigits(digits: string, size: number, sep = ' '): string {
  if (size <= 0 || digits.length <= size) return digits;
  const out: string[] = [];
  for (let end = digits.length; end > 0; end -= size) out.unshift(digits.slice(Math.max(0, end - size), end));
  return out.join(sep);
}

/**
 * Positional expansion of a short non-negative integer in its base, e.g.
 * 200n in base 16 gives "12×16^1 + 8×16^0". Null for 0 or more than 8 digits.
 */
export function positionalExpansion(value: bigint, base: number): string | null {
  if (value <= 0n) return null;
  const d = value.toString(base);
  if (d.length > 8) return null;
  return d
    .split('')
    .map((c, i) => `${DIGITS.indexOf(c)}×${base}^${d.length - 1 - i}`)
    .join(' + ');
}

export type BaseString = {
  base: number;
  /** Full result, e.g. "-1010.0(0011)" with the repeating block in parentheses. */
  text: string;
  integer: string;
  /** Non-repeating fraction digits. */
  fraction: string;
  /** Repeating block, empty when the fraction terminates or was cut off. */
  repeating: string;
  /** False when the fraction was cut off at maxFractionDigits without terminating or repeating. */
  exact: boolean;
};

/**
 * Write num/den (non-negative) in `base`. The fraction is expanded by long
 * division; a remainder seen before marks the start of a repeating block.
 */
export function toBaseString(negative: boolean, num: bigint, den: bigint, base: number, opts: { maxFractionDigits?: number; upper?: boolean } = {}): BaseString {
  checkBase(base);
  const maxFrac = opts.maxFractionDigits ?? DEFAULT_FRACTION_DIGITS;
  const big = BigInt(base);
  const intPart = num / den;
  let rem = num % den;
  let integer = intPart.toString(base);
  let fraction = '';
  let repeating = '';
  let exact = true;
  const seen = new Map<bigint, number>();
  const frac: string[] = [];
  while (rem !== 0n) {
    if (seen.has(rem)) {
      const at = seen.get(rem)!;
      fraction = frac.slice(0, at).join('');
      repeating = frac.slice(at).join('');
      break;
    }
    if (frac.length >= maxFrac) {
      exact = false;
      fraction = frac.join('');
      break;
    }
    seen.set(rem, frac.length);
    rem *= big;
    frac.push(DIGITS[Number(rem / den)]);
    rem %= den;
  }
  if (rem === 0n && !repeating && exact) fraction = frac.join('');
  if (opts.upper) {
    integer = integer.toUpperCase();
    fraction = fraction.toUpperCase();
    repeating = repeating.toUpperCase();
  }
  const isZero = num === 0n;
  let text = (negative && !isZero ? '-' : '') + integer;
  if (fraction || repeating) text += '.' + fraction + (repeating ? `(${repeating})` : '') + (exact ? '' : '...');
  return { base, text, integer, fraction, repeating, exact };
}

export type TwosComplement = {
  width: number;
  /** Bit pattern, exactly `width` digits. */
  binary: string;
  hex: string;
  /** The pattern read as a signed two's complement integer. */
  signed: string;
  /** The pattern read as an unsigned integer. */
  unsigned: string;
  /** Bytes most significant first (big-endian), then least significant first (little-endian). */
  bytesBigEndian: string;
  bytesLittleEndian: string;
  /** The value does not fit in [-2^(w-1), 2^w - 1], so the pattern is the value modulo 2^w. */
  overflow: boolean;
  min: string;
  max: string;
  maxUnsigned: string;
};

/**
 * Two's complement view of an integer at `width` bits. Values from
 * -2^(w-1) to 2^w - 1 fit (negative ones as signed, large positive ones as
 * unsigned patterns); anything else wraps modulo 2^w and is flagged.
 */
export function twosComplement(value: bigint, width: number): TwosComplement {
  if (!Number.isInteger(width) || width < 1 || width > 1024) throw new Error('Width must be from 1 to 1024 bits.');
  const w = BigInt(width);
  const pattern = BigInt.asUintN(width, value);
  const min = -(1n << (w - 1n));
  const maxUnsigned = (1n << w) - 1n;
  const hexDigits = Math.ceil(width / 4);
  const hex = pattern.toString(16).toUpperCase().padStart(hexDigits, '0');
  const byteCount = Math.ceil(width / 8);
  const bytes: string[] = [];
  for (let i = byteCount - 1; i >= 0; i--) bytes.push(((pattern >> BigInt(i * 8)) & 0xffn).toString(16).toUpperCase().padStart(2, '0'));
  return {
    width,
    binary: pattern.toString(2).padStart(width, '0'),
    hex,
    signed: BigInt.asIntN(width, pattern).toString(),
    unsigned: pattern.toString(),
    bytesBigEndian: bytes.join(' '),
    bytesLittleEndian: [...bytes].reverse().join(' '),
    overflow: value < min || value > maxUnsigned,
    min: min.toString(),
    max: ((1n << (w - 1n)) - 1n).toString(),
    maxUnsigned: maxUnsigned.toString(),
  };
}

/** Read `bits` (a pattern of `width` bits, given in any base) as a signed two's complement integer. */
export function signedFromPattern(pattern: bigint, width: number): bigint {
  return BigInt.asIntN(width, pattern);
}

export type ConvertOptions = {
  from?: number | 'auto';
  /** Extra target base besides 2, 8, 10 and 16. */
  to?: number;
  /** Two's complement width in bits, or 0/undefined for none. */
  width?: number;
  /** Read the input digits as a two's complement bit pattern of `width` bits (e.g. FF at 8 bits is -1). */
  inputIsPattern?: boolean;
  maxFractionDigits?: number;
  upper?: boolean;
};

export type ConvertResult = {
  input: string;
  fromBase: number;
  prefix: string | null;
  negative: boolean;
  isInteger: boolean;
  /** Exact value as a fraction in lowest terms, e.g. "1/3" for 0.1 in base 3. */
  fraction: string;
  binary: BaseString;
  octal: BaseString;
  decimal: BaseString;
  hex: BaseString;
  target: BaseString | null;
  /** Number of bits needed for |integer part| (0 for 0). */
  bitLength: number;
  twos: TwosComplement | null;
  warnings: string[];
};

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Convert one number between bases, with optional two's complement view. */
export function convertNumber(input: string, opts: ConvertOptions = {}): ConvertResult {
  const parsed = parseInBase(input, opts.from ?? 'auto');
  const warnings: string[] = [];
  let { negative, num } = parsed;
  const { den } = parsed;
  const isInteger = num % den === 0n;
  const width = opts.width && opts.width > 0 ? opts.width : 0;
  if (opts.inputIsPattern) {
    if (!width) throw new Error('Choose a bit width to read the input as a two\'s complement pattern.');
    if (!isInteger || negative) throw new Error('A bit pattern must be a non-negative whole number.');
    const pat = num / den;
    if (pat >> BigInt(width) !== 0n) throw new Error(`The pattern has more than ${width} bits.`);
    const signed = signedFromPattern(pat, width);
    negative = signed < 0n;
    num = (signed < 0n ? -signed : signed) * den;
  }
  const opt = { maxFractionDigits: opts.maxFractionDigits, upper: opts.upper ?? true };
  const conv = (b: number) => toBaseString(negative, num, den, b, opt);
  const g = gcd(num, den) || 1n;
  const reduced = num === 0n ? '0' : `${negative ? '-' : ''}${num / g}${den / g === 1n ? '' : `/${den / g}`}`;
  let twos: TwosComplement | null = null;
  if (width) {
    if (!isInteger) {
      warnings.push('Two\'s complement applies to whole numbers; the fractional part is not shown in the bit pattern.');
    } else {
      twos = twosComplement((negative ? -1n : 1n) * (num / den), width);
      if (twos.overflow) warnings.push(`The value does not fit in ${width} bits (range ${twos.min} to ${twos.maxUnsigned}); the pattern shows it modulo 2^${width}, as a cast in C or BigInt.asUintN would.`);
    }
  }
  const binary = conv(2);
  const octal = conv(8);
  const decimal = conv(10);
  const hex = conv(16);
  const target = opts.to ? conv(opts.to) : null;
  if ([binary, octal, decimal, hex, target].some((r) => r && !r.exact)) {
    warnings.push(`A fraction did not terminate or repeat within ${opt.maxFractionDigits ?? DEFAULT_FRACTION_DIGITS} digits; results cut off there end in "...".`);
  }
  return {
    input,
    fromBase: parsed.base,
    prefix: parsed.prefix,
    negative,
    isInteger,
    fraction: reduced,
    binary,
    octal,
    decimal,
    hex,
    target,
    bitLength: (num / den).toString(2) === '0' ? 0 : (num / den).toString(2).length,
    twos,
    warnings,
  };
}
