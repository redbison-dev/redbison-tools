import { describe, it, expect } from 'vitest';
import {
  solveOhm,
  seriesResistance,
  parallelResistance,
  formatSI,
  decodeBands,
  encodeResistor,
  nearestPreferred,
  E_SERIES,
  RESISTOR_COLORS,
  AWG_SIZES,
  METRIC_SIZES,
  voltageDrop,
  resistancePerMetre,
  smallestSizeFor,
  molarMass,
  parseFormula,
  solveMolarity,
  solveDilution,
  solveHalfLife,
  ISOTOPES,
  TIME_UNITS,
  solveSdt,
  parseDuration,
  formatHms,
  paceFromSpeed,
  SPEED_UNITS,
  DISTANCE_UNITS,
  downloadTime,
  requiredSpeed,
  SIZE_UNITS,
  RATE_UNITS,
  formatDuration,
  type Result,
} from '@/lib/tools/calculators/science';

const val = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value as T;
};
const size = (id: string) => [...AWG_SIZES, ...METRIC_SIZES].find((s) => s.id === id)!;

describe("Ohm's law", () => {
  it('12 V across 2 A gives 6 Ω and 24 W', () => {
    const r = val(solveOhm({ V: 12, I: 2 }));
    expect(r.R).toBe(6);
    expect(r.P).toBe(24);
  });
  it('every pair of inputs reproduces the same circuit', () => {
    const ref = { V: 9, I: 0.03, R: 300, P: 0.27 };
    const keys = ['V', 'I', 'R', 'P'] as const;
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const r = val(solveOhm({ [keys[a]]: ref[keys[a]], [keys[b]]: ref[keys[b]] }));
      for (const k of keys) expect(r[k]).toBeCloseTo(ref[k], 9);
    }
  });
  it('a quarter-watt 1 kΩ resistor tops out at 15.81 V and 15.81 mA', () => {
    const r = val(solveOhm({ R: 1000, P: 0.25 }));
    expect(r.V).toBeCloseTo(15.8114, 4);
    expect(r.I).toBeCloseTo(0.0158114, 7);
  });
  it('rejects zero, negative and wrong counts', () => {
    expect(solveOhm({ V: 12 }).ok).toBe(false);
    expect(solveOhm({ V: 12, I: 1, R: 12 }).ok).toBe(false);
    expect(solveOhm({ V: 12, R: 0 }).ok).toBe(false);
    expect(solveOhm({ V: -5, I: 1 }).ok).toBe(false);
  });
  it('series and parallel combinations', () => {
    expect(seriesResistance([100, 220, 330])).toBe(650);
    expect(parallelResistance([100, 100])).toBeCloseTo(50, 12);
    expect(parallelResistance([10, 20, 30])).toBeCloseTo(5.454545, 5);
    expect(parallelResistance([10, 0])).toBe(0);
  });
  it('formats with engineering prefixes', () => {
    expect(formatSI(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatSI(0.0158114, 'A')).toBe('15.81 mA');
    expect(formatSI(2.2e6, 'Ω')).toBe('2.2 MΩ');
    expect(formatSI(999999, 'Ω')).toBe('1 MΩ');
  });
});

describe('resistor colour code (IEC 60062)', () => {
  it('brown-black-red-gold is 1 kΩ ±5%', () => {
    const r = val(decodeBands(['brown', 'black', 'red', 'gold']));
    expect(r.ohms).toBe(1000);
    expect(r.tolerance).toBe(5);
    expect(r.min).toBe(950);
    expect(r.max).toBe(1050);
  });
  it('yellow-violet-orange-gold is 47 kΩ', () => {
    expect(val(decodeBands(['yellow', 'violet', 'orange', 'gold'])).ohms).toBe(47000);
  });
  it('gold and silver multipliers give fractional ohms without float noise', () => {
    expect(val(decodeBands(['orange', 'orange', 'gold', 'gold'])).ohms).toBe(3.3);
    expect(val(decodeBands(['green', 'blue', 'silver', 'silver'])).ohms).toBe(0.56);
  });
  it('5-band and 6-band read three digits; the 6th band is the temperature coefficient', () => {
    expect(val(decodeBands(['brown', 'black', 'black', 'brown', 'brown'])).ohms).toBe(1000);
    const six = val(decodeBands(['red', 'red', 'black', 'brown', 'brown', 'brown']));
    expect(six.ohms).toBe(2200);
    expect(six.tolerance).toBe(1);
    expect(six.tcr).toBe(100);
  });
  it('3-band resistors have ±20% tolerance', () => {
    expect(val(decodeBands(['red', 'red', 'brown'])).tolerance).toBe(20);
  });
  it('rejects colours in the wrong place', () => {
    expect(decodeBands(['gold', 'black', 'red', 'gold']).ok).toBe(false);
    expect(decodeBands(['brown', 'black', 'red', 'white']).ok).toBe(false);
  });
  it('IEC 60062:2016 tolerance and TCR assignments', () => {
    const by = (id: string) => RESISTOR_COLORS.find((c) => c.id === id)!;
    expect([by('brown').tol, by('red').tol, by('green').tol, by('blue').tol, by('violet').tol, by('grey').tol]).toEqual([1, 2, 0.5, 0.25, 0.1, 0.01]);
    expect([by('orange').tol, by('yellow').tol]).toEqual([0.05, 0.02]);
    expect([by('black').tcr, by('brown').tcr, by('red').tcr, by('orange').tcr, by('yellow').tcr]).toEqual([250, 100, 50, 15, 25]);
  });
  it('encodes values back to bands', () => {
    expect(val(encodeResistor(4700, 4, 5)).bands).toEqual(['yellow', 'violet', 'red', 'gold']);
    expect(val(encodeResistor(10, 4, 5)).bands).toEqual(['brown', 'black', 'black', 'gold']);
    expect(val(encodeResistor(0.47, 4, 10)).bands).toEqual(['yellow', 'violet', 'silver', 'silver']);
    expect(val(encodeResistor(10000, 5, 1)).bands).toEqual(['brown', 'black', 'black', 'red', 'brown']);
    expect(val(encodeResistor(4990, 6, 1, 50)).bands).toEqual(['yellow', 'white', 'white', 'brown', 'brown', 'red']);
    const r = val(encodeResistor(4567, 4, 5));
    expect(r.rounded).toBe(true);
    expect(r.ohms).toBe(4600);
  });
  it('round-trips every E24 value through 4-band encode and decode', () => {
    for (const m of E_SERIES.E24) for (const k of [0, 2, 5]) {
      const v = Number((m * 10 ** k).toPrecision(6));
      expect(val(decodeBands(val(encodeResistor(v, 4, 5)).bands)).ohms).toBeCloseTo(v, 6);
    }
  });
  it('E-series tables: E96 follows the IEC 60063 geometric rule, E12 is every other E24', () => {
    expect(E_SERIES.E96).toHaveLength(96);
    E_SERIES.E96.forEach((v, i) => expect(v).toBeCloseTo(Number((10 ** (i / 96)).toPrecision(3)), 6));
    expect(E_SERIES.E24).toHaveLength(24);
    expect(E_SERIES.E12).toEqual(E_SERIES.E24.filter((_, i) => i % 2 === 0));
  });
  it('picks the nearest preferred value', () => {
    expect(nearestPreferred(5000, 'E12').value).toBe(4700);
    expect(nearestPreferred(5000, 'E24').value).toBe(5100);
    expect(nearestPreferred(5000, 'E96').value).toBe(4990);
    expect(nearestPreferred(9.9, 'E12').value).toBe(10);
  });
});

describe('voltage drop', () => {
  it('12 AWG copper, 16 A, 100 ft one way at 120 V: 6.34 V (5.28%)', () => {
    const r = val(voltageDrop({ system: 'single', material: 'copper', size: size('12awg'), lengthM: 30.48, currentA: 16, voltageV: 120, tempC: 75 }));
    expect(r.dropV).toBeCloseTo(2 * 1.98 * 16 * 0.1, 6);
    expect(r.dropPct).toBeCloseTo(5.28, 2);
    expect(r.endVoltage).toBeCloseTo(113.664, 3);
  });
  it('three-phase uses √3 instead of 2', () => {
    const r = val(voltageDrop({ system: 'three', material: 'copper', size: size('1/0awg'), lengthM: 250 * 0.3048, currentA: 100, voltageV: 480, tempC: 75 }));
    expect(r.dropV).toBeCloseTo(Math.sqrt(3) * 0.122 * 0.25 * 100, 6);
  });
  it('NEC Table 8 values agree with resistivity ÷ area within 5% (copper and aluminium at 75 °C)', () => {
    const rhoCu = 1.7241e-8 * (234.5 + 75) / (234.5 + 20);
    const rhoAl = 2.8264e-8 * (228.1 + 75) / (228.1 + 20);
    for (const s of AWG_SIZES) {
      expect(s.cu! / (rhoCu / (s.areaMm2 * 1e-6))).toBeGreaterThan(0.99);
      expect(s.cu! / (rhoCu / (s.areaMm2 * 1e-6))).toBeLessThan(1.05);
      if (s.al) {
        expect(s.al / (rhoAl / (s.areaMm2 * 1e-6))).toBeGreaterThan(0.97);
        expect(s.al / (rhoAl / (s.areaMm2 * 1e-6))).toBeLessThan(1.05);
      }
    }
  });
  it('corrects temperature like NEC Table 8 Note 2 (α = 0.00323 at 75 °C)', () => {
    const r20 = resistancePerMetre(size('12awg'), 'copper', 20)! * 304.8;
    expect(r20).toBeCloseTo(1.98 * (1 + 0.00323 * (20 - 75)), 2);
    // IEC 60228 metric values are at 20 °C: 2.5 mm² copper is 7.41 Ω/km.
    expect(resistancePerMetre(size('2.5mm2'), 'copper', 20)! * 1000).toBeCloseTo(7.41, 9);
    expect(resistancePerMetre(size('2.5mm2'), 'copper', 70)! * 1000).toBeCloseTo(7.41 * (1 + 0.00393 * 50), 6);
  });
  it('DC behaves like single phase and reports conductor loss', () => {
    const r = val(voltageDrop({ system: 'dc', material: 'copper', size: size('2.5mm2'), lengthM: 10, currentA: 10, voltageV: 12, tempC: 20 }));
    expect(r.dropV).toBeCloseTo(2 * 0.00741 * 10 * 10, 9);
    expect(r.powerLossW).toBeCloseTo(r.dropV * 10, 9);
  });
  it('parallel sets divide the resistance and aluminium needs larger sizes', () => {
    const one = val(voltageDrop({ system: 'three', material: 'aluminum', size: size('500kcmil'), lengthM: 100, currentA: 400, voltageV: 480, tempC: 75 }));
    const two = val(voltageDrop({ system: 'three', material: 'aluminum', size: size('500kcmil'), lengthM: 100, currentA: 400, voltageV: 480, tempC: 75, parallel: 2 }));
    expect(two.dropV).toBeCloseTo(one.dropV / 2, 9);
    expect(voltageDrop({ system: 'single', material: 'aluminum', size: size('14awg'), lengthM: 10, currentA: 10, voltageV: 120, tempC: 75 }).ok).toBe(false);
  });
  it('finds the smallest size for a 3% target', () => {
    const s = smallestSizeFor({ system: 'single', material: 'copper', lengthM: 30.48, currentA: 16, voltageV: 120, tempC: 75 }, AWG_SIZES, 3);
    // 10 AWG: 2 × 1.24 × 16 × 0.1 = 3.97 V = 3.3%; 8 AWG: 2.49 V = 2.07%.
    expect(s?.label).toBe('8 AWG');
  });
  it('validates inputs', () => {
    expect(voltageDrop({ system: 'dc', material: 'copper', size: size('12awg'), lengthM: 0, currentA: 1, voltageV: 12, tempC: 75 }).ok).toBe(false);
    expect(voltageDrop({ system: 'dc', material: 'copper', size: size('12awg'), lengthM: 1, currentA: 1, voltageV: 0, tempC: 75 }).ok).toBe(false);
  });
});

describe('molecular weight', () => {
  const mm = (f: string) => val(molarMass(f)).molarMass;
  it('textbook molar masses with IUPAC abridged weights', () => {
    expect(mm('H2O')).toBeCloseTo(18.015, 3);
    expect(mm('NaCl')).toBeCloseTo(58.44, 2);
    expect(mm('C6H12O6')).toBeCloseTo(180.156, 3);
    expect(mm('H2SO4')).toBeCloseTo(98.072, 3);
    expect(mm('CO2')).toBeCloseTo(44.009, 3);
  });
  it('parentheses, brackets and nesting', () => {
    expect(mm('Ca(OH)2')).toBeCloseTo(74.092, 3);
    expect(mm('Al2(SO4)3')).toBeCloseTo(342.132, 3);
    expect(mm('K4[Fe(CN)6]')).toBeCloseTo(368.345, 3);
    expect(mm('(NH4)3PO4')).toBeCloseTo(149.087, 3);
  });
  it('hydrates with middle dot, full stop or asterisk', () => {
    expect(mm('CuSO4·5H2O')).toBeCloseTo(249.677, 3);
    expect(mm('CuSO4.5H2O')).toBeCloseTo(249.677, 3);
    expect(mm('CuSO4*5H2O')).toBeCloseTo(249.677, 3);
    expect(mm('CaCl2·2H2O')).toBeCloseTo(147.01, 2);
  });
  it('ignores charges and reads Unicode subscripts', () => {
    expect(mm('SO4^2-')).toBeCloseTo(96.056, 3);
    expect(mm('SO₄²⁻')).toBeCloseTo(96.056, 3);
    expect(mm('NH4+')).toBeCloseTo(18.039, 3);
  });
  it('per-element breakdown and mass percent', () => {
    const r = val(molarMass('H2O'));
    const o = r.elements.find((e) => e.symbol === 'O')!;
    expect(o.percent).toBeCloseTo(88.81, 2);
    expect(r.elements.reduce((a, e) => a + e.percent, 0)).toBeCloseTo(100, 9);
    expect(r.atoms).toBe(3);
    expect(val(parseFormula('CH3COOH')).get('C')).toBe(2);
  });
  it('clear errors for case mistakes, unknown symbols and brackets', () => {
    expect(molarMass('co2').ok).toBe(false);
    expect(molarMass('Xx2').ok).toBe(false);
    expect(molarMass('(H2O').ok).toBe(false);
    expect(molarMass('H2O)').ok).toBe(false);
    expect(molarMass('Ca(OH]2').ok).toBe(false);
    expect(molarMass('').ok).toBe(false);
    // Co (cobalt) and CO (carbon monoxide) differ.
    expect(mm('Co')).toBeCloseTo(58.933, 3);
    expect(mm('CO')).toBeCloseTo(28.01, 3);
  });
});

describe('molarity and dilution', () => {
  it('58.44 g of NaCl in 1 L is 1 M', () => {
    expect(val(solveMolarity('molarity', { mass: 58.44, molarMass: 58.44, volume: 1 })).molarity).toBeCloseTo(1, 12);
  });
  it('mass for 250 mL of 0.5 M NaCl is 7.305 g', () => {
    expect(val(solveMolarity('mass', { molarity: 0.5, volume: 0.25, molarMass: 58.44 })).mass).toBeCloseTo(7.305, 9);
  });
  it('solves volume and molar mass', () => {
    expect(val(solveMolarity('volume', { molarity: 0.1, mass: 18.0156, molarMass: 180.156 })).volume).toBeCloseTo(1, 9);
    expect(val(solveMolarity('molarMass', { molarity: 2, mass: 80, volume: 1 })).molarMass).toBeCloseTo(40, 9);
  });
  it('C1V1 = C2V2: 12 M HCl to 500 mL of 1 M needs 41.67 mL of stock', () => {
    const r = val(solveDilution('v1', { c1: 12, c2: 1, v2: 500 }));
    expect(r.v1).toBeCloseTo(41.6667, 4);
    expect(r.solventToAdd).toBeCloseTo(458.3333, 4);
    expect(val(solveDilution('c2', { c1: 1, v1: 10, v2: 100 })).c2).toBeCloseTo(0.1, 12);
  });
  it('rejects impossible dilutions and missing values', () => {
    expect(solveDilution('v2', { c1: 1, v1: 10, c2: 2 }).ok).toBe(false);
    expect(solveMolarity('mass', { molarity: 0, volume: 1, molarMass: 10 }).ok).toBe(false);
  });
});

describe('half-life', () => {
  it('100 g after three half-lives leaves 12.5 g', () => {
    const r = val(solveHalfLife('remaining', { initial: 100, halfLife: 5, time: 15 }));
    expect(r.remaining).toBeCloseTo(12.5, 12);
    expect(r.halfLives).toBe(3);
  });
  it('carbon-14: 25% left means 11,400 years; λ = ln2 / 5700', () => {
    const r = val(solveHalfLife('time', { initial: 100, remaining: 25, halfLife: 5700 }));
    expect(r.time).toBeCloseTo(11400, 9);
    expect(r.decayConstant).toBeCloseTo(1.216e-4, 7);
    expect(r.meanLife).toBeCloseTo(5700 / Math.LN2, 6);
  });
  it('matches N0·e^(−λt) for iodine-131 after 30 days', () => {
    const r = val(solveHalfLife('remaining', { initial: 1, halfLife: 8.0252, time: 30 }));
    expect(r.remaining).toBeCloseTo(Math.exp((-Math.LN2 * 30) / 8.0252), 12);
  });
  it('solves half-life and initial amount', () => {
    expect(val(solveHalfLife('halfLife', { initial: 80, remaining: 10, time: 24 })).halfLife).toBeCloseTo(8, 12);
    expect(val(solveHalfLife('initial', { remaining: 10, halfLife: 8, time: 24 })).initial).toBeCloseTo(80, 12);
  });
  it('time zero, growth and bad inputs', () => {
    expect(val(solveHalfLife('remaining', { initial: 5, halfLife: 2, time: 0 })).remaining).toBe(5);
    expect(solveHalfLife('time', { initial: 10, remaining: 20, halfLife: 1 }).ok).toBe(false);
    expect(solveHalfLife('halfLife', { initial: 10, remaining: 10, time: 5 }).ok).toBe(false);
    expect(solveHalfLife('remaining', { initial: 10, halfLife: 0, time: 5 }).ok).toBe(false);
  });
  it('isotope presets carry the published half-lives', () => {
    const iso = (id: string) => ISOTOPES.find((i) => i.id === id)!;
    expect(iso('c14').halfLife).toBe(5700);
    expect(iso('i131').halfLife * TIME_UNITS[iso('i131').unit] / 86400).toBeCloseTo(8.0252, 6);
    expect(iso('u238').halfLife).toBe(4.468e9);
    expect(iso('cs137').halfLife).toBe(30.08);
  });
});

describe('speed, distance and time', () => {
  it('100 km in 1 h 15 min is 80 km/h', () => {
    const r = val(solveSdt('speed', { distance: 100_000, time: 4500 }));
    expect(r.speed / SPEED_UNITS.kmh.mps).toBeCloseTo(80, 9);
  });
  it('unit factors: 60 mph = 26.8224 m/s, 1 knot = 0.514444 m/s', () => {
    expect(60 * SPEED_UNITS.mph.mps).toBeCloseTo(26.8224, 9);
    expect(SPEED_UNITS.kn.mps).toBeCloseTo(0.514444, 6);
    expect(DISTANCE_UNITS.mi.m).toBe(1609.344);
  });
  it('a 2-hour marathon is 2:50.6 per km and 4:34.6 per mile', () => {
    const r = val(solveSdt('speed', { distance: 42195, time: 7200 }));
    expect(paceFromSpeed(r.speed, 1000)).toBeCloseTo(170.64, 2);
    expect(paceFromSpeed(r.speed, 1609.344)).toBeCloseTo(274.61, 2);
  });
  it('time and distance', () => {
    expect(val(solveSdt('time', { distance: 300_000, speed: 100 / 3.6 })).time).toBeCloseTo(10800, 9);
    expect(val(solveSdt('distance', { speed: 20, time: 60 })).distance).toBe(1200);
    expect(solveSdt('time', { distance: 10, speed: 0 }).ok).toBe(false);
  });
  it('parses and formats durations', () => {
    expect(parseDuration('1:30:00')).toBe(5400);
    expect(parseDuration('45:00')).toBe(2700);
    expect(parseDuration('1h 20m')).toBe(4800);
    expect(parseDuration('90')).toBe(5400);
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(formatHms(5025)).toBe('1:23:45');
    expect(formatHms(90061)).toBe('1d 1:01:01');
  });
});

describe('download time', () => {
  it('1 GB at 100 Mbit/s takes 80 s; 1 GiB takes 85.9 s', () => {
    expect(val(downloadTime(SIZE_UNITS.GB.bytes, 100 * RATE_UNITS.Mbps.bps)).seconds).toBeCloseTo(80, 9);
    expect(val(downloadTime(SIZE_UNITS.GiB.bytes, 100 * RATE_UNITS.Mbps.bps)).seconds).toBeCloseTo(85.8993, 4);
  });
  it('overhead slows the transfer', () => {
    const r = val(downloadTime(4.7e9, 25e6, 10));
    expect(r.seconds).toBeCloseTo((4.7e9 * 8) / 22.5e6, 6);
    expect(r.effectiveBps).toBe(22.5e6);
  });
  it('MB/s is eight times Mbit/s', () => {
    expect(RATE_UNITS.MBps.bps).toBe(8 * RATE_UNITS.Mbps.bps);
  });
  it('speed needed for 10 GB in 10 minutes is 133.3 Mbit/s, more with overhead', () => {
    expect(val(requiredSpeed(10e9, 600)).bps).toBeCloseTo(133.333e6, -3);
    expect(val(requiredSpeed(10e9, 600, 20)).bps).toBeCloseTo(166.667e6, -3);
  });
  it('validates and formats', () => {
    expect(downloadTime(0, 1e6).ok).toBe(false);
    expect(downloadTime(1e6, 1e6, 100).ok).toBe(false);
    expect(formatDuration(80)).toBe('1 min 20 s');
    expect(formatDuration(3.21)).toBe('3.21 s');
    expect(formatDuration(0.05)).toBe('50 ms');
    expect(formatDuration(90061)).toBe('1 d 1 h 1 min');
  });
});

describe('atomic weight table', () => {
  it('covers H to Lr (Z = 1 to 103) with unique atomic numbers', async () => {
    const { ATOMIC_WEIGHTS } = await import('@/lib/tools/calculators/science');
    const zs = Object.values(ATOMIC_WEIGHTS).map((e) => e.z).sort((a, b) => a - b);
    expect(zs).toEqual(Array.from({ length: 103 }, (_, i) => i + 1));
    // Spot checks against the CIAAW abridged table.
    expect(ATOMIC_WEIGHTS.Zr.w).toBe(91.222);
    expect(ATOMIC_WEIGHTS.Cl.w).toBe(35.45);
    expect(ATOMIC_WEIGHTS.Ar.w).toBe(39.95);
    expect(ATOMIC_WEIGHTS.Tc.massNumber).toBe(true);
  });
});
