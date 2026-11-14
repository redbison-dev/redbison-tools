/**
 * Reference tests for the Number Base Converter and the IEEE 754 Float
 * Converter (content week 2026-11-09, batch t4).
 *
 * Base conversion is checked against BigInt.prototype.toString(radix) and
 * ECMA-262 numeric literal rules. Float patterns are IEEE 754-2019 values
 * (Table 3.5 parameters, roundTiesToEven), cross-checked against DataView
 * and Math.fround where those are exact, and the exact decimals of the
 * stored values against Python's decimal module.
 */
import { describe, it, expect } from 'vitest';
import { convertNumber, parseInBase, toBaseString, twosComplement, groupDigits, positionalExpansion } from '@/lib/tools/dataformats/number-base-converter';
import { encodeFloat, decodeFloat, formatLimits, FORMATS, nextUpBits, nextDownBits, exactDecimal, nanToFormat } from '@/lib/tools/dataformats/ieee-754-float-converter';

describe('number-base-converter: parsing', () => {
  it('reads ECMA-262 prefixes in auto mode and separators', () => {
    expect(parseInBase('0xFF').num).toBe(255n);
    expect(parseInBase('0XfF').base).toBe(16);
    expect(parseInBase('0o777').num).toBe(511n);
    expect(parseInBase('0b1010_1010').num).toBe(170n);
    expect(parseInBase('1_000_000').num).toBe(1000000n);
    expect(parseInBase('1,234').num).toBe(1234n);
    expect(parseInBase('1,234,567.5').num).toBe(12345675n);
  });

  it('accepts commas only as decimal thousands separators', () => {
    expect(() => parseInBase('1,5')).toThrow(/thousands separators/);
    expect(() => parseInBase('12,34')).toThrow(/Use a point/);
    expect(() => parseInBase('1,234', 16)).toThrow(/thousands/);
    expect(() => parseInBase('1.2,345')).toThrow(/thousands/);
  });

  it('says which part has no digits', () => {
    expect(() => parseInBase('-')).toThrow('No digits after the sign.');
    expect(() => parseInBase('-0x')).toThrow('No digits after the prefix.');
  });

  it('writes the positional expansion in the input base', () => {
    expect(positionalExpansion(200n, 16)).toBe('12×16^1 + 8×16^0');
    expect(positionalExpansion(200n, 10)).toBe('2×10^2 + 0×10^1 + 0×10^0');
    expect(positionalExpansion(0n, 2)).toBeNull();
    expect(positionalExpansion(2n ** 40n, 16)).toBeNull();
  });

  it('strips a prefix only when it names the chosen base', () => {
    expect(parseInBase('0x1f', 16).num).toBe(31n);
    // In base 16, "0b1" is the hex number B1, as parseInt('0b1', 16) reads it.
    expect(parseInBase('0b1', 16).num).toBe(0xb1n);
    expect(parseInt('0b1', 16)).toBe(0xb1);
  });

  it('rejects digits outside the base and bad bases', () => {
    expect(() => parseInBase('102', 2)).toThrow(/not a digit in base 2/);
    expect(() => parseInBase('1g', 16)).toThrow(/not a digit in base 16/);
    expect(() => parseInBase('z', 35)).toThrow();
    expect(parseInBase('z', 36).num).toBe(35n);
    expect(() => parseInBase('1', 37)).toThrow(/2 to 36/);
    expect(() => parseInBase('1', 1)).toThrow(/2 to 36/);
    expect(() => parseInBase('')).toThrow();
    expect(() => parseInBase('1.2.3')).toThrow(/radix point/);
    expect(() => parseInBase('0x')).toThrow(/No digits/);
  });

  it('treats -0 as zero', () => {
    const r = convertNumber('-0');
    expect(r.negative).toBe(false);
    expect(r.hex.text).toBe('0');
  });
});

describe('number-base-converter: integers', () => {
  it('converts the common bases', () => {
    const r = convertNumber('255');
    expect([r.binary.text, r.octal.text, r.decimal.text, r.hex.text]).toEqual(['11111111', '377', '255', 'FF']);
    expect(r.bitLength).toBe(8);
    expect(convertNumber('0').bitLength).toBe(0);
  });

  it('matches BigInt toString for every base 2 to 36', () => {
    const n = 123456789012345678901234567890n;
    for (let b = 2; b <= 36; b++) {
      const r = convertNumber(n.toString(), { from: 10, to: b, upper: false });
      expect(r.target!.text).toBe(n.toString(b));
      expect(convertNumber(n.toString(b), { from: b }).decimal.text).toBe(n.toString());
    }
  });

  it('keeps integers beyond 2^53 exact', () => {
    // parseInt loses this: 2^53 + 1 reads as 2^53.
    expect(parseInt('20000000000001', 16)).toBe(2 ** 53);
    expect(convertNumber('0x20000000000001').decimal.text).toBe('9007199254740993');
    expect(convertNumber('18446744073709551615').hex.text).toBe('FFFFFFFFFFFFFFFF');
    const big = 2n ** 200n;
    expect(convertNumber(big.toString()).binary.text).toBe('1' + '0'.repeat(200));
  });

  it('converts negative numbers with a sign', () => {
    expect(convertNumber('-42').hex.text).toBe('-2A');
    expect(convertNumber('-0b101').decimal.text).toBe('-5');
  });

  it('groups digits', () => {
    expect(groupDigits('11111111', 4)).toBe('1111 1111');
    expect(groupDigits('101', 4)).toBe('101');
    expect(groupDigits('1234567', 3, ',')).toBe('1,234,567');
  });
});

describe('number-base-converter: two\'s complement', () => {
  it('encodes negatives at 8, 16, 32 and 64 bits', () => {
    expect(twosComplement(-1n, 8).binary).toBe('11111111');
    expect(twosComplement(-5n, 8).binary).toBe('11111011');
    expect(twosComplement(-128n, 8).hex).toBe('80');
    expect(twosComplement(-1n, 16).hex).toBe('FFFF');
    expect(twosComplement(-42n, 32).hex).toBe('FFFFFFD6');
    expect(twosComplement(-1n, 64).hex).toBe('FFFFFFFFFFFFFFFF');
    expect(twosComplement(-(2n ** 63n), 64).hex).toBe('8000000000000000');
  });

  it('gives the signed and unsigned reading of a pattern and the ranges', () => {
    const t = twosComplement(200n, 8);
    expect(t.signed).toBe('-56');
    expect(t.unsigned).toBe('200');
    expect(t.overflow).toBe(false);
    expect([t.min, t.max, t.maxUnsigned]).toEqual(['-128', '127', '255']);
    expect(twosComplement(0n, 32).signed).toBe('0');
  });

  it('flags overflow and wraps modulo 2^w like BigInt.asUintN', () => {
    const t = twosComplement(256n, 8);
    expect(t.overflow).toBe(true);
    expect(t.binary).toBe('00000000');
    expect(twosComplement(-129n, 8).overflow).toBe(true);
    expect(twosComplement(-129n, 8).hex).toBe('7F');
    expect(() => twosComplement(1n, 0)).toThrow();
  });

  it('lists bytes in big- and little-endian order', () => {
    const t = twosComplement(0x12345678n, 32);
    expect(t.bytesBigEndian).toBe('12 34 56 78');
    expect(t.bytesLittleEndian).toBe('78 56 34 12');
    // DataView agrees: setInt32 with littleEndian = true writes 78 first.
    const dv = new DataView(new ArrayBuffer(4));
    dv.setInt32(0, 0x12345678, true);
    expect(dv.getUint8(0)).toBe(0x78);
  });

  it('reads an input pattern as signed when asked', () => {
    expect(convertNumber('FF', { from: 16, width: 8, inputIsPattern: true }).decimal.text).toBe('-1');
    expect(convertNumber('0x80000000', { width: 32, inputIsPattern: true }).decimal.text).toBe('-2147483648');
    expect(convertNumber('7F', { from: 16, width: 8, inputIsPattern: true }).decimal.text).toBe('127');
    expect(() => convertNumber('1FF', { from: 16, width: 8, inputIsPattern: true })).toThrow(/more than 8 bits/);
    expect(() => convertNumber('FF', { from: 16, inputIsPattern: true })).toThrow(/bit width/);
  });

  it('warns when a fraction meets two\'s complement', () => {
    const r = convertNumber('-2.5', { width: 8 });
    expect(r.twos).toBeNull();
    expect(r.warnings[0]).toMatch(/whole numbers/);
  });
});

describe('number-base-converter: fractions', () => {
  it('converts terminating fractions exactly', () => {
    expect(convertNumber('10.625').binary.text).toBe('1010.101');
    expect(convertNumber('0x0.8').decimal.text).toBe('0.5');
    expect(convertNumber('0.1', { from: 2 }).decimal.text).toBe('0.5');
    expect(convertNumber('-0.75').hex.text).toBe('-0.C');
  });

  it('marks repeating blocks', () => {
    const r = convertNumber('0.1');
    expect(r.binary.text).toBe('0.0(0011)');
    expect(r.binary.repeating).toBe('0011');
    expect(r.hex.text).toBe('0.1(9)');
    expect(r.fraction).toBe('1/10');
    expect(convertNumber('0.1', { from: 3 }).decimal.text).toBe('0.(3)');
    expect(convertNumber('0.2').octal.text).toBe('0.(1463)');
  });

  it('cuts off long expansions and says so', () => {
    const r = toBaseString(false, 1n, 1000003n, 2, { maxFractionDigits: 16 });
    expect(r.exact).toBe(false);
    expect(r.text.endsWith('...')).toBe(true);
    const c = convertNumber('0.1234567', { maxFractionDigits: 8 });
    expect(c.warnings.some((w) => w.includes('did not terminate'))).toBe(true);
  });
});

const enc = (s: string, f: 'binary16' | 'binary32' | 'binary64') => encodeFloat(s, f);

describe('ieee-754-float-converter: format parameters (IEEE 754-2019 Table 3.5)', () => {
  it('has the right widths, biases and exponent ranges', () => {
    expect([FORMATS.binary16.exponentBits, FORMATS.binary16.fractionBits, FORMATS.binary16.bias, FORMATS.binary16.emin]).toEqual([5, 10, 15, -14]);
    expect([FORMATS.binary32.exponentBits, FORMATS.binary32.fractionBits, FORMATS.binary32.bias, FORMATS.binary32.emax]).toEqual([8, 23, 127, 127]);
    expect([FORMATS.binary64.exponentBits, FORMATS.binary64.fractionBits, FORMATS.binary64.bias, FORMATS.binary64.emin]).toEqual([11, 52, 1023, -1022]);
    expect(FORMATS.binary64.precision).toBe(53);
  });

  it('gives the limits', () => {
    const h = formatLimits('binary16');
    expect([h.maxFinite, h.minNormal, h.minSubnormal]).toEqual(['65504', '0.00006103515625', '6e-8']);
    const s = formatLimits('binary32');
    expect([s.maxFinite, s.minNormal, s.minSubnormal]).toEqual(['3.4028235e+38', '1.1754944e-38', '1e-45']);
    const d = formatLimits('binary64');
    expect([d.maxFinite, d.minNormal, d.minSubnormal]).toEqual([String(Number.MAX_VALUE), '2.2250738585072014e-308', '5e-324']);
    expect(d.epsilon).toBe(exactDecimal(1n, -52));
    expect(Number(d.epsilon)).toBe(Number.EPSILON);
    expect([h.decimalDigits, s.decimalDigits, d.decimalDigits]).toEqual([3, 6, 15]);
    expect([h.roundTripDigits, s.roundTripDigits, d.roundTripDigits]).toEqual([5, 9, 17]);
  });
});

describe('ieee-754-float-converter: known patterns', () => {
  it('0.1 in all three formats', () => {
    const d = enc('0.1', 'binary64');
    expect(d.hex).toBe('3FB999999999999A');
    expect(d.exactValue).toBe('0.1000000000000000055511151231257827021181583404541015625');
    expect(d.rounding!.exact).toBe(false);
    expect(d.rounding!.error).toBe('5.55112e-18');
    expect(d.shortest).toBe('0.1');
    const s = enc('0.1', 'binary32');
    expect(s.hex).toBe('3DCCCCCD');
    expect(s.exactValue).toBe('0.100000001490116119384765625');
    expect(s.rounding!.error).toBe('1.49012e-9');
    expect(s.sign).toBe(0);
    expect(s.exponentBits).toBe('01111011');
    expect(s.exponent).toBe(-4);
    expect(s.fractionBits).toBe('10011001100110011001101');
    const h = enc('0.1', 'binary16');
    expect(h.hex).toBe('2E66');
    expect(h.exactValue).toBe('0.0999755859375');
  });

  it('1/3 from an exact fraction', () => {
    expect(enc('1/3', 'binary64').hex).toBe('3FD5555555555555');
    expect(enc('1/3', 'binary64').exactValue).toBe('0.333333333333333314829616256247390992939472198486328125');
    expect(enc('1/3', 'binary32').hex).toBe('3EAAAAAB');
    expect(enc('1/3', 'binary32').exactValue).toBe('0.3333333432674407958984375');
    expect(enc('1/3', 'binary16').hex).toBe('3555');
    expect(enc('1/3', 'binary16').exactValue).toBe('0.333251953125');
  });

  it('signed zeros', () => {
    expect(enc('-0', 'binary32').hex).toBe('80000000');
    expect(enc('-0', 'binary32').class).toBe('zero');
    expect(enc('-0', 'binary32').shortest).toBe('-0');
    expect(enc('0', 'binary64').hex).toBe('0000000000000000');
    expect(enc('-0.0', 'binary16').hex).toBe('8000');
  });

  it('smallest subnormals', () => {
    const s = decodeFloat('00000001', 'binary32');
    expect(s.class).toBe('subnormal');
    expect(s.exactValue).toBe('0.00000000000000000000000000000000000000000000140129846432481707092372958328991613128026194187651577175706828388979108268586060148663818836212158203125');
    expect(s.exponent).toBe(-126);
    expect(decodeFloat('0001', 'binary16').exactValue).toBe('0.000000059604644775390625');
    const d = decodeFloat('0000000000000001', 'binary64');
    expect(d.shortest).toBe('5e-324');
    expect(d.exactValue.startsWith('0.' + '0'.repeat(323) + '494065645841246544')).toBe(true);
    expect(enc('5e-324', 'binary64').hex).toBe('0000000000000001');
    expect(enc('2e-324', 'binary64').hex).toBe('0000000000000000');
    expect(enc('2e-324', 'binary64').rounding!.underflow).toBe(true);
    expect(enc('3e-324', 'binary64').hex).toBe('0000000000000001');
  });

  it('largest finite values and overflow to infinity', () => {
    expect(enc('65504', 'binary16').hex).toBe('7BFF');
    expect(enc('65519', 'binary16').hex).toBe('7BFF');
    // 65520 is halfway to 2^16; ties to even goes up, past the largest finite value.
    expect(enc('65520', 'binary16').hex).toBe('7C00');
    expect(enc('65520', 'binary16').rounding!.overflow).toBe(true);
    expect(decodeFloat('7F7FFFFF', 'binary32').exactValue).toBe('340282346638528859811704183484516925440');
    expect(enc('1e39', 'binary32').hex).toBe('7F800000');
    expect(enc('1.7976931348623157e308', 'binary64').hex).toBe('7FEFFFFFFFFFFFFF');
    expect(enc('1e309', 'binary64').class).toBe('infinity');
    expect(enc('1e999999', 'binary64').hex).toBe('7FF0000000000000');
  });

  it('infinities and NaN', () => {
    expect(enc('inf', 'binary32').hex).toBe('7F800000');
    expect(enc('-Infinity', 'binary64').hex).toBe('FFF0000000000000');
    expect(enc('nan', 'binary32').hex).toBe('7FC00000');
    expect(enc('nan', 'binary16').hex).toBe('7E00');
    expect(enc('nan', 'binary64').hex).toBe('7FF8000000000000');
  });

  it('NaN payloads and quiet vs signalling', () => {
    const q = decodeFloat('7FC00001', 'binary32');
    expect(q.class).toBe('nan');
    expect(q.nan).toEqual({ quiet: true, payload: '1', payloadHex: '0x1' });
    const sn = decodeFloat('7F800001', 'binary32');
    expect(sn.nan!.quiet).toBe(false);
    expect(decodeFloat('FFF8000000000BAD', 'binary64').nan).toEqual({ quiet: true, payload: String(0xbad), payloadHex: '0xBAD' });
    expect(decodeFloat('7F800000', 'binary32').nan).toBeNull();
  });

  it('decodes hex and binary input', () => {
    expect(decodeFloat('0x3F800000', 'binary32').exactValue).toBe('1');
    expect(decodeFloat('3f80 0000', 'binary32').exactValue).toBe('1');
    expect(decodeFloat('0b0011110000000000', 'binary16').exactValue).toBe('1');
    expect(decodeFloat('C000', 'binary16').exactValue).toBe('-2');
    expect(decodeFloat('40490FDB', 'binary32').shortest).toBe('3.1415927');
    expect(() => decodeFloat('3F8000001', 'binary32')).toThrow(/too many/);
    expect(() => decodeFloat('xyz', 'binary32')).toThrow();
  });

  it('reads exact-width hex that starts with 0B as hex, not binary', () => {
    expect(decodeFloat('0B100000', 'binary32').hex).toBe('0B100000');
    expect(decodeFloat('0B100000', 'binary32').shortest).toBe('2.773339e-32');
    expect(decodeFloat('0B01', 'binary16').hex).toBe('0B01');
    expect(decodeFloat('0x0B100000', 'binary32').hex).toBe('0B100000');
    // A 0b prefix with a non-hex-width pattern is still binary.
    expect(decodeFloat('0b0011110000000000', 'binary16').hex).toBe('3C00');
    expect(decodeFloat('0b1', 'binary32').hex).toBe('00000001');
  });

  it('reports inputs far below every subnormal as inexact underflow to zero', () => {
    const d = enc('1e-30000', 'binary64');
    expect(d.hex).toBe('0000000000000000');
    expect(d.rounding).toMatchObject({ exact: false, underflow: true, error: '-1e-30000', relativeError: '1' });
    expect(enc('-2.5e-30000', 'binary32').rounding).toMatchObject({ error: '2.5e-30000', underflow: true });
    expect(enc('-2.5e-30000', 'binary32').hex).toBe('80000000');
    const h = enc('0x1p-30000', 'binary32');
    expect(h.hex).toBe('00000000');
    expect(h.rounding).toMatchObject({ exact: false, underflow: true, relativeError: '1' });
    expect(h.rounding!.error).toMatch(/^-\d(\.\d+)?e-9031$/);
    expect(enc('0x0p-30000', 'binary32').rounding!.exact).toBe(true);
    expect(enc('0x1p30000', 'binary32').class).toBe('infinity');
  });

  it('carries a NaN to another format', () => {
    const q = decodeFloat('7FF8000000000BAD', 'binary64');
    expect(nanToFormat(q, 'binary16').toString(16).toUpperCase()).toBe('7FAD');
    expect(nanToFormat(q, 'binary32').toString(16).toUpperCase()).toBe('7FC00BAD');
    // A signalling NaN whose payload does not survive becomes quiet, not infinity.
    const sn = decodeFloat('7FF0000000000400', 'binary64');
    expect(sn.nan!.quiet).toBe(false);
    expect(nanToFormat(sn, 'binary16').toString(16).toUpperCase()).toBe('7E00');
    expect(nanToFormat(decodeFloat('FFC00001', 'binary32'), 'binary64').toString(16).toUpperCase()).toBe('FFF8000000000001');
  });

  it('reads hex floats and scientific notation', () => {
    expect(enc('0x1.8p3', 'binary64').exactValue).toBe('12');
    expect(enc('0x1p-149', 'binary32').hex).toBe('00000001');
    expect(enc('6.02214076e23', 'binary64').shortest).toBe('6.02214076e+23');
    expect(enc('.5', 'binary32').hex).toBe('3F000000');
    expect(() => enc('abc', 'binary32')).toThrow(/Could not read/);
    expect(() => enc('1/0', 'binary32')).toThrow(/zero/);
  });

  it('rounds ties to even', () => {
    // 1 + 2^-24 is halfway between 1 and the next binary32; the even neighbour is 1.
    expect(enc('1.000000059604644775390625', 'binary32').hex).toBe('3F800000');
    // 1 + 3 x 2^-24 is halfway between 1 + 2^-23 (odd) and 1 + 2^-22 (even).
    expect(enc('1.000000178813934326171875', 'binary32').hex).toBe('3F800002');
    // 2049 is halfway between 2048 and 2050 in binary16.
    expect(enc('2049', 'binary16').hex).toBe(enc('2048', 'binary16').hex);
    expect(enc('2051', 'binary16').exactValue).toBe('2052');
  });

  it('rounds once, avoiding the double rounding of Math.fround(parseFloat(s))', () => {
    const s = '1.0000000596046447753906251'; // just above the tie
    const viaDouble = Math.fround(parseFloat(s));
    expect(viaDouble).toBe(1);
    expect(enc(s, 'binary32').hex).toBe('3F800001');
  });

  it('agrees with DataView for binary64 and Math.fround for binary32 on ordinary inputs', () => {
    const dv = new DataView(new ArrayBuffer(8));
    const inputs = ['0', '1', '-1', '0.5', '3.14159', '-2.5e-3', '123456789', '1e-310', '1e300', '0.3', '2.2250738585072014e-308', '-7.0e-46', '16777217', '9007199254740993'];
    for (const s of inputs) {
      dv.setFloat64(0, parseFloat(s));
      expect(enc(s, 'binary64').hex).toBe(dv.getBigUint64(0).toString(16).toUpperCase().padStart(16, '0'));
      dv.setFloat32(0, parseFloat(s));
      expect(enc(s, 'binary32').hex).toBe(dv.getUint32(0).toString(16).toUpperCase().padStart(8, '0'));
    }
  });

  it('neighbours: nextUp and nextDown (IEEE 754-2019 5.3.1)', () => {
    const f = FORMATS.binary32;
    expect(nextUpBits(0n, f)).toBe(1n);
    expect(nextDownBits(0n, f)).toBe(0x80000001n);
    expect(nextUpBits(0x80000001n, f)).toBe(0x80000000n);
    expect(nextUpBits(0x7f7fffffn, f)).toBe(0x7f800000n);
    expect(nextUpBits(0xff800000n, f)).toBe(0xff7fffffn);
    expect(nextUpBits(0x7f800000n, f)).toBe(0x7f800000n);
    const one = enc('1', 'binary64');
    expect(one.nextUp.value).toBe(String(1 + Number.EPSILON));
    expect(one.nextDown.value).toBe(String(1 - Number.EPSILON / 2));
    expect(one.ulp).toBe(exactDecimal(1n, -52));
    expect(enc('0.1', 'binary32').nextUp.hex).toBe('3DCCCCCE');
  });

  it('shows the bytes in both orders', () => {
    const r = enc('1', 'binary32');
    expect(r.bytesBigEndian).toBe('3F 80 00 00');
    expect(r.bytesLittleEndian).toBe('00 00 80 3F');
  });
});
