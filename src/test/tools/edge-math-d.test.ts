/**
 * Edge, corner, positive and negative cases for the science calculators
 * (calculators/science and w500/science2). References: exact SI defining
 * constants (CODATA 2018), NEC Chapter 9 Table 8, CIAAW atomic weights, the
 * CIPM water-density formula, closed-form kinematics, an RK4 integration of the
 * quadratic-drag fall equation, and textbook equilibrium hand calculations.
 */
import { describe, it, expect } from 'vitest';
import {
  prefixFactor, formatSI, solveOhm, seriesResistance, parallelResistance, bandRoles, allowedColors, decodeBands,
  encodeResistor, nearestPreferred, resistancePerMetre, voltageDrop, smallestSizeFor, AWG_SIZES, METRIC_SIZES, ALPHA20,
  parseFormula, molarMass, solveMolarity, solveDilution, solveHalfLife, solveSdt, parseDuration, formatHms,
  paceFromSpeed, downloadTime, requiredSpeed, formatDuration,
} from '@/lib/tools/calculators/science';
import type { BandColor } from '@/lib/tools/calculators/science';
import {
  factorOf, toSI, fromSI, MASS_UNITS, tempToK, kToTemp, gravityOf, G0, C_LIGHT, solveKineticEnergy, solvePotentialEnergy,
  projectile, trajectoryPoints, projectileAt, anglesToHit, freeFall, fallSpeedSeries, terminalVelocity, solveNewton,
  friction, solveDensity, waterDensity, archimedesDensity, closestMaterials, speedOfSoundAir, solveWave, ituBand, emRegion,
  visibleColour, wavelengthToRgb, soundBand, nearestNote, solveIdealGas, solveCombinedGas, solveChargeBalance, phOfSpecies,
  customSpecies, buffer, bufferRatioFor, convertPh, phLabel, SPECIES, PLANCK, E_CHARGE,
} from '@/lib/tools/w500/science2';

type R<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };
const val = <T,>(r: R<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const bad = <T,>(r: R<T>, re?: RegExp): string => {
  expect(r.ok).toBe(false);
  if (re) expect(r.error).toMatch(re);
  return r.error as string;
};
const sp = (id: string) => SPECIES.find((s) => s.id === id)!;

/* ------------------------------------------------------------------ */
/* calculators/science                                                  */
/* ------------------------------------------------------------------ */

describe('SI formatting and Ohm’s law', () => {
  it('formatSI picks the prefix after rounding and names non-finite values', () => {
    expect(formatSI(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatSI(999999, 'Ω')).toBe('1 MΩ'); // not "1000 kΩ"
    expect(formatSI(-0.0047, 'A')).toBe('-4.7 mA');
    expect(formatSI(1e-15, 'F')).toBe('0.001 pF');
    expect(formatSI(0, 'V')).toBe('0 V');
    expect(formatSI(NaN, 'V')).toBe('n/a');
    expect(formatSI(-Infinity, 'V')).toBe('n/a');
    expect(formatSI(Infinity, 'Ω')).toBe('∞ Ω');
    expect(prefixFactor('k')).toBe(1000);
    expect(prefixFactor('?')).toBe(1);
  });
  it('solveOhm for every pair (12 V, 2 A, 6 Ω, 24 W) and the errors', () => {
    const want = { V: 12, I: 2, R: 6, P: 24 };
    for (const pair of [['V', 'I'], ['V', 'R'], ['V', 'P'], ['I', 'R'], ['I', 'P'], ['R', 'P']] as const) {
      const r = val(solveOhm({ [pair[0]]: want[pair[0]], [pair[1]]: want[pair[1]] }));
      for (const k of ['V', 'I', 'R', 'P'] as const) expect(r[k]).toBeCloseTo(want[k], 12);
    }
    bad(solveOhm({ V: 12 }), /exactly two/);
    bad(solveOhm({ V: 12, I: 2, R: 6 }), /exactly two/);
    bad(solveOhm({ V: NaN, I: 2 }), /number/);
    bad(solveOhm({ V: 0, I: 2 }), /greater than zero/);
    bad(solveOhm({ V: -12, I: 2 }), /greater than zero/);
  });
  it('series and parallel with empty lists and shorts', () => {
    expect(seriesResistance([])).toBe(0);
    expect(parallelResistance([])).toBeNaN();
    expect(parallelResistance([0, 10])).toBe(0);
    expect(parallelResistance([10, 10])).toBe(5);
    expect(parallelResistance([1, 2, 3])).toBeCloseTo(6 / 11, 15);
  });
});

describe('resistor colour code (IEC 60062)', () => {
  it('band roles and allowed colours', () => {
    expect(bandRoles(3)).toEqual(['digit', 'digit', 'mult']);
    expect(bandRoles(6)[5]).toBe('tcr');
    expect(allowedColors('digit')).toHaveLength(10);
    expect(allowedColors('tol').some((c) => c.id === 'none')).toBe(false);
    expect(allowedColors('mult').map((c) => c.id)).toContain('pink');
  });
  it('decodeBands values and invalid colours for each role', () => {
    const r = val(decodeBands(['brown', 'black', 'red', 'gold'])); // 10 × 10² ± 5 %
    expect(r).toMatchObject({ ohms: 1000, tolerance: 5, min: 950, max: 1050 });
    expect(val(decodeBands(['brown', 'black', 'red'])).tolerance).toBe(20);
    expect(val(decodeBands(['brown', 'black', 'pink', 'gold'])).ohms).toBe(0.01);
    expect(val(decodeBands(['brown', 'black', 'black', 'brown', 'brown', 'red'])).tcr).toBe(50);
    bad(decodeBands(['brown', 'black']), /3, 4, 5 or 6/);
    bad(decodeBands(['gold', 'black', 'red', 'gold']), /Gold cannot be a digit/);
    bad(decodeBands(['brown', 'black', 'none', 'gold']), /None cannot be a multiplier/);
    bad(decodeBands(['brown', 'black', 'red', 'black']), /Black is not a tolerance/);
    bad(decodeBands(['brown', 'black', 'black', 'brown', 'brown', 'gold']), /Gold is not a temperature coefficient/);
  });
  it('encodeResistor round trips and range limits', () => {
    expect(val(encodeResistor(4.7, 4, 5)).bands).toEqual(['yellow', 'violet', 'gold', 'gold']);
    expect(val(encodeResistor(0.01, 4, 5)).bands).toEqual(['brown', 'black', 'pink', 'gold']);
    const r = val(encodeResistor(4.75, 4, 1));
    expect(r).toMatchObject({ ohms: 4.8, rounded: true });
    expect(val(encodeResistor(9.96, 4, 1)).bands.slice(0, 3)).toEqual(['brown', 'black', 'black']); // 10 Ω
    expect(val(encodeResistor(47000, 6, 1)).bands[5]).toBe('brown'); // default 100 ppm/K
    for (const bands of [['yellow', 'violet', 'red', 'gold'], ['brown', 'black', 'black', 'black', 'brown']] as BandColor[][]) {
      const d = val(decodeBands(bands));
      expect(val(encodeResistor(d.ohms, bands.length as 4 | 5, d.tolerance)).bands).toEqual(bands);
    }
    bad(encodeResistor(0, 4, 5), /greater than zero/);
    bad(encodeResistor(NaN, 4, 5), /greater than zero/);
    bad(encodeResistor(0.001, 4, 5), /outside/);
    bad(encodeResistor(1e12, 4, 5), /outside/);
    bad(encodeResistor(100, 4, 3), /standard tolerance/);
    bad(encodeResistor(100, 6, 1, 7), /temperature coefficient/);
  });
  it('nearestPreferred works across decade boundaries', () => {
    const n = nearestPreferred(4800, 'E12');
    expect(n.value).toBe(4700);
    expect(n.errorPct).toBeCloseTo(-100 / 48, 12);
    expect(nearestPreferred(9900, 'E12').value).toBe(10000);
    expect(nearestPreferred(1000, 'E96')).toEqual({ value: 1000, errorPct: 0 });
  });
});

describe('voltage drop (NEC Chapter 9 Table 8)', () => {
  const awg12 = AWG_SIZES.find((s) => s.id === '12awg')!;
  const awg14 = AWG_SIZES.find((s) => s.id === '14awg')!;
  const base = { system: 'single' as const, material: 'copper' as const, size: awg12, lengthM: 30.48, currentA: 10, voltageV: 120, tempC: 75 };
  it('12 AWG copper, 100 ft, 10 A: 2 × 0.198 Ω × 10 A = 3.96 V', () => {
    const r = val(voltageDrop(base));
    expect(r.dropV).toBeCloseTo(3.96, 10);
    expect(r.dropPct).toBeCloseTo(3.3, 10);
    expect(r.powerLossW).toBeCloseTo(39.6, 9);
    expect(val(voltageDrop({ ...base, system: 'three' })).dropV).toBeCloseTo(Math.sqrt(3) * 1.98, 10);
    expect(val(voltageDrop({ ...base, parallel: 2 })).dropV).toBeCloseTo(1.98, 10);
  });
  it('temperature correction with the inferred zero-resistance temperature', () => {
    const T0 = 1 / ALPHA20.copper - 20; // 234.45 °C
    expect(resistancePerMetre(awg12, 'copper', 20)! / resistancePerMetre(awg12, 'copper', 75)!).toBeCloseTo((T0 + 20) / (T0 + 75), 14);
    expect(resistancePerMetre(awg14, 'aluminum', 75)).toBeUndefined();
    expect(METRIC_SIZES[0].cu).toBeCloseTo(0.0245, 15);
  });
  it('input errors and size selection', () => {
    bad(voltageDrop({ ...base, lengthM: 0 }), /length/);
    bad(voltageDrop({ ...base, currentA: NaN }), /current/);
    bad(voltageDrop({ ...base, voltageV: -1 }), /voltage/);
    bad(voltageDrop({ ...base, tempC: 300 }), /-50 and 250/);
    bad(voltageDrop({ ...base, parallel: 1.5 }), /whole number/);
    bad(voltageDrop({ ...base, parallel: 0 }), /whole number/);
    bad(voltageDrop({ ...base, size: awg14, material: 'aluminum' }), /not listed for aluminium/);
    const { size: _omit, ...rest } = base;
    expect(smallestSizeFor(rest, AWG_SIZES, 3)!.id).toBe('10awg'); // 12 AWG gives 3.3 %
    expect(smallestSizeFor({ ...rest, lengthM: 1e6 }, AWG_SIZES, 3)).toBeNull();
  });
});

describe('chemical formulas', () => {
  const counts = (s: string) => Object.fromEntries(val(parseFormula(s)));
  it('hydrates, nested brackets, charges and Unicode subscripts', () => {
    expect(counts('CuSO4·5H2O')).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
    expect(counts('CuSO4.5H2O')).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
    expect(counts('K4[Fe(CN)6]')).toEqual({ K: 4, Fe: 1, C: 6, N: 6 });
    expect(counts('{Ca(OH)2}2')).toEqual({ Ca: 2, O: 4, H: 4 });
    expect(counts('SO4^2-')).toEqual({ S: 1, O: 4 });
    expect(counts('NH4+')).toEqual({ N: 1, H: 4 });
    expect(counts('Fe³⁺')).toEqual({ Fe: 1 });
    expect(counts('H₂O')).toEqual({ H: 2, O: 1 });
  });
  it('reports each malformed formula', () => {
    bad(parseFormula(''), /Enter a chemical formula/);
    bad(parseFormula('5'), /number but no formula/);
    bad(parseFormula('co'), /capital letter/);
    bad(parseFormula('Xx'), /"Xx" is not an element/);
    bad(parseFormula('H2O)'), /Unmatched "\)"/);
    bad(parseFormula('(H2O]'), /Unmatched "\]"/);
    bad(parseFormula('(H2O'), /not closed/);
    bad(parseFormula('H2O!'), /Unexpected character "!"/);
    bad(parseFormula('(2H)'), /Unexpected number/);
    bad(parseFormula('·'), /No elements/);
  });
  it('molar masses from CIAAW abridged weights', () => {
    // 63.546 + 32.06 + 9 × 15.999 + 10 × 1.008 = 249.677
    const m = val(molarMass('CuSO4·5H2O'));
    expect(m.molarMass).toBeCloseTo(249.677, 9);
    expect(m.atoms).toBe(21);
    expect(m.elements.reduce((s, e) => s + e.percent, 0)).toBeCloseTo(100, 12);
    expect(val(molarMass('O2')).molarMass).toBeCloseTo(31.998, 12);
    expect(val(molarMass('TcO4')).elements[0].massNumber).toBe(true);
    bad(molarMass('Qq'), /not an element/);
  });
});

describe('molarity, dilution and half-life', () => {
  it('solveMolarity in each direction', () => {
    // 58.44 g of NaCl (58.44 g/mol) in 1 L = 1 M
    expect(val(solveMolarity('molarity', { mass: 58.44, volume: 1, molarMass: 58.44 })).molarity).toBeCloseTo(1, 14);
    expect(val(solveMolarity('mass', { molarity: 0.5, volume: 2, molarMass: 10 })).mass).toBe(10);
    expect(val(solveMolarity('volume', { molarity: 2, mass: 40, molarMass: 40 })).volume).toBe(0.5);
    expect(val(solveMolarity('molarMass', { molarity: 1, mass: 18, volume: 1 })).molarMass).toBe(18);
    bad(solveMolarity('molarity', { mass: 1, volume: 0, molarMass: 1 }), /volume greater than zero/);
    bad(solveMolarity('mass', { molarity: 1, volume: 1 }), /molar mass/);
  });
  it('solveDilution, including no dilution and an impossible concentration', () => {
    const d = val(solveDilution('v1', { c1: 10, c2: 1, v2: 100 })); // 10 mL of stock + 90 mL solvent
    expect(d).toMatchObject({ v1: 10, solventToAdd: 90 });
    expect(val(solveDilution('c1', { v1: 10, c2: 1, v2: 100 })).c1).toBe(10);
    expect(val(solveDilution('c2', { c1: 10, v1: 10, v2: 100 })).c2).toBe(1);
    expect(val(solveDilution('v2', { c1: 5, v1: 1, c2: 5 })).solventToAdd).toBe(0);
    bad(solveDilution('v2', { c1: 1, v1: 1, c2: 2 }), /cannot be higher/);
    bad(solveDilution('v2', { c1: 1, v1: -1, c2: 1 }), /positive/);
  });
  it('solveHalfLife edge cases (carbon-14, 5700 y)', () => {
    expect(val(solveHalfLife('time', { remaining: 25, initial: 100, halfLife: 5700 })).time).toBeCloseTo(11400, 9);
    expect(val(solveHalfLife('remaining', { initial: 100, halfLife: 5700, time: 0 })).remaining).toBe(100);
    expect(val(solveHalfLife('initial', { remaining: 50, halfLife: 2, time: 2 })).initial).toBeCloseTo(100, 12);
    expect(val(solveHalfLife('halfLife', { remaining: 12.5, initial: 100, time: 30 })).halfLife).toBeCloseTo(10, 12);
    expect(val(solveHalfLife('time', { remaining: 100, initial: 100, halfLife: 5 })).time).toBe(0);
    const r = val(solveHalfLife('remaining', { initial: 1, halfLife: 1, time: 1 }));
    expect(r.meanLife).toBeCloseTo(1 / Math.LN2, 14);
    bad(solveHalfLife('time', { remaining: 200, initial: 100, halfLife: 5 }), /smaller than the initial/);
    bad(solveHalfLife('halfLife', { remaining: 100, initial: 100, time: 5 }), /smaller than the initial/);
    bad(solveHalfLife('halfLife', { remaining: 50, initial: 100, time: 0 }), /greater than zero/);
    bad(solveHalfLife('remaining', { initial: 100, halfLife: 5, time: -1 }), /cannot be negative/);
    bad(solveHalfLife('remaining', { initial: 0, halfLife: 5, time: 1 }), /greater than zero/);
    bad(solveHalfLife('remaining', { initial: 100, halfLife: NaN, time: 1 }), /three known values/);
  });
});

describe('speed, durations and downloads', () => {
  it('solveSdt in each direction', () => {
    expect(val(solveSdt('speed', { distance: 100, time: 9.58 })).speed).toBeCloseTo(10.438413361169102, 12);
    expect(val(solveSdt('distance', { speed: 2, time: 3 })).distance).toBe(6);
    expect(val(solveSdt('time', { speed: 2, distance: 3 })).time).toBe(1.5);
    bad(solveSdt('time', { speed: 0, distance: 3 }), /speed greater than zero/);
    bad(solveSdt('speed', { distance: 3 }), /time greater than zero/);
  });
  it('parseDuration forms and rejections', () => {
    expect(parseDuration('1:30:15')).toBe(5415);
    expect(parseDuration('45:00')).toBe(2700);
    expect(parseDuration('90')).toBe(5400); // bare number = minutes
    expect(parseDuration('1.5')).toBe(90);
    expect(parseDuration('1h 20m 5s')).toBe(4805);
    expect(parseDuration('2d')).toBe(172800);
    expect(parseDuration('3 hours 2 mins')).toBe(10920);
    for (const s of ['', '  ', '1:60', '1:2:60', 'abc', '1h foo', '-5']) expect(parseDuration(s)).toBeNull();
  });
  it('formatHms, pace and formatDuration', () => {
    expect(formatHms(5025)).toBe('1:23:45');
    expect(formatHms(-65)).toBe('-0:01:05');
    expect(formatHms(86401)).toBe('1d 0:00:01');
    expect(formatHms(59.999)).toBe('0:01:00'); // rounds before splitting
    expect(formatHms(61.5, 2)).toBe('0:01:01.50');
    expect(formatHms(NaN)).toBe('n/a');
    expect(paceFromSpeed(1000 / 300, 1000)).toBeCloseTo(300, 12); // 5:00 per km
    expect(formatDuration(Infinity)).toBe('n/a');
    expect(formatDuration(0.5)).toBe('500 ms');
    expect(formatDuration(0.0001234)).toBe('0.123 ms');
    expect(formatDuration(59.94)).toBe('59.9 s');
    expect(formatDuration(3661)).toBe('1 h 1 min 1 s');
    expect(formatDuration(365.25 * 86400 + 86400 + 3600 + 60)).toBe('1 y 1 d 1 h'); // three parts at most
  });
  it('downloadTime and requiredSpeed with overhead', () => {
    // 1 GB = 8 × 10⁹ bit at 100 Mbit/s = 80 s; 20 % overhead → 100 s
    expect(val(downloadTime(1e9, 1e8)).seconds).toBe(80);
    expect(val(downloadTime(1e9, 1e8, 20)).seconds).toBeCloseTo(100, 12);
    expect(val(requiredSpeed(1e9, 100, 20)).bps).toBeCloseTo(1e8, 4);
    bad(downloadTime(0, 1), /file size/);
    bad(downloadTime(1, NaN), /connection speed/);
    bad(downloadTime(1, 1, 100), /below 100%/);
    bad(downloadTime(1, 1, -1), /at least 0%/);
    bad(requiredSpeed(1, 0), /target time/);
    bad(requiredSpeed(-1, 1), /file size/);
    bad(requiredSpeed(1, 1, 100), /below 100%/);
  });
});

/* ------------------------------------------------------------------ */
/* w500/science2                                                        */
/* ------------------------------------------------------------------ */

describe('units, temperatures and gravity', () => {
  it('unit factors and temperature scales', () => {
    expect(() => factorOf(MASS_UNITS, 'stone')).toThrow(/Unknown unit/);
    expect(toSI(MASS_UNITS, 1, 'lb')).toBe(0.45359237);
    expect(fromSI(MASS_UNITS, 0.45359237, 'oz')).toBeCloseTo(16, 13);
    expect(tempToK(32, '°F')).toBeCloseTo(273.15, 12);
    expect(tempToK(491.67, '°R')).toBeCloseTo(273.15, 12);
    expect(tempToK(0, '°R')).toBe(0);
    expect(kToTemp(tempToK(-40, '°C'), '°F')).toBeCloseTo(-40, 12);
    expect(kToTemp(0, '°R')).toBe(0);
    expect(kToTemp(300, 'K')).toBe(300);
    expect(gravityOf('custom')).toBeNaN();
    expect(gravityOf('custom', 5)).toBe(5);
    expect(gravityOf('pluto')).toBe(G0);
    expect(gravityOf('moon')).toBe(1.62);
  });
});

describe('kinetic and potential energy', () => {
  it('kinetic energy: errors, zero speed, and the relativistic correction', () => {
    bad(solveKineticEnergy('energy', { mass: NaN, velocity: 1 }), /Enter the mass/);
    bad(solveKineticEnergy('energy', { mass: 0, velocity: 1 }), /greater than zero/);
    bad(solveKineticEnergy('energy', { mass: 1, velocity: -1 }), /speed cannot be negative/);
    bad(solveKineticEnergy('mass', { energy: 10, velocity: 0 }), /Speed must be greater/);
    bad(solveKineticEnergy('mass', { energy: 0, velocity: 3 }), /Energy must be greater/);
    bad(solveKineticEnergy('energy', { mass: 1, velocity: C_LIGHT }), /speed of light/);
    const r = val(solveKineticEnergy('energy', { mass: 2, velocity: 3 }));
    expect(r).toMatchObject({ energy: 9, momentum: 6 });
    expect(r.equivalentDropHeight).toBeCloseTo(9 / (2 * G0), 14);
    expect(r.relativisticEnergy / 9).toBeCloseTo(1, 12); // β = 10⁻⁸: series form, no cancellation
    // β = 0.6 → γ = 1.25 → (γ − 1)mc² = 0.25 mc²
    const fast = val(solveKineticEnergy('energy', { mass: 1, velocity: 0.6 * C_LIGHT }));
    expect(fast.relativisticEnergy / (0.25 * C_LIGHT * C_LIGHT)).toBeCloseTo(1, 12);
    expect(val(solveKineticEnergy('velocity', { energy: 0, mass: 1 })).velocity).toBe(0);
    expect(val(solveKineticEnergy('velocity', { energy: 8, mass: 1 })).velocity).toBe(4);
  });
  it('potential energy: errors, negative heights and impact speed', () => {
    bad(solvePotentialEnergy('energy', { mass: 1, height: 1 }, 0), /Gravity/);
    bad(solvePotentialEnergy('energy', { mass: 1 }), /Enter the height/);
    bad(solvePotentialEnergy('energy', { mass: 0, height: 1 }), /Mass must be/);
    bad(solvePotentialEnergy('mass', { energy: 10, height: 0 }), /non-zero/);
    bad(solvePotentialEnergy('mass', { energy: 10, height: -1 }), /same sign/);
    const r = val(solvePotentialEnergy('energy', { mass: 2, height: 10 }));
    expect(r.energy).toBeCloseTo(196.133, 12);
    expect(r.impactSpeed).toBeCloseTo(Math.sqrt(2 * G0 * 10), 13);
    const below = val(solvePotentialEnergy('energy', { mass: 1, height: -5 }));
    expect(below.energy).toBeCloseTo(-5 * G0, 13);
    expect(below.impactSpeed).toBe(0);
    expect(val(solvePotentialEnergy('height', { energy: 98.0665, mass: 1 })).height).toBeCloseTo(10, 13);
  });
});

describe('projectiles', () => {
  it('validation', () => {
    bad(projectile({ speed: NaN, angleDeg: 45, height: 0, g: 10 }), /Enter numbers/);
    bad(projectile({ speed: -1, angleDeg: 45, height: 0, g: 10 }), /negative/);
    bad(projectile({ speed: 1, angleDeg: 45, height: -1, g: 10 }), /below the landing/);
    bad(projectile({ speed: 1, angleDeg: 45, height: 0, g: 0 }), /Gravity/);
    bad(projectile({ speed: 1, angleDeg: 91, height: 0, g: 10 }), /−90° and 90°/);
    bad(projectile({ speed: 0, angleDeg: 45, height: 0, g: 10 }), /no flight/);
    expect(trajectoryPoints({ speed: -1, angleDeg: 45, height: 0, g: 10 })).toEqual([]);
  });
  it('level ground at 45°, straight up and a plain drop', () => {
    // v = 10, g = 10, 45°: T = √2, R = v²/g = 10, H = v²/(4g) = 2.5
    const r = val(projectile({ speed: 10, angleDeg: 45, height: 0, g: 10 }));
    expect(r.timeOfFlight).toBeCloseTo(Math.SQRT2, 14);
    expect(r.range).toBeCloseTo(10, 13);
    expect(r.maxHeight).toBeCloseTo(2.5, 13);
    expect(r.impactAngleDeg).toBeCloseTo(45, 12);
    expect(r.optimalAngleDeg).toBeCloseTo(45, 12);
    const up = val(projectile({ speed: 10, angleDeg: 90, height: 0, g: 10 }));
    expect(up).toMatchObject({ vx: 0, range: 0 });
    expect(up.timeOfFlight).toBeCloseTo(2, 14);
    // dropped from 5 m with g = 10: t = 1 s, lands at 10 m/s straight down
    const drop = val(projectile({ speed: 0, angleDeg: 0, height: 5, g: 10 }));
    expect(drop.timeOfFlight).toBeCloseTo(1, 14);
    expect(drop.impactAngleDeg).toBeCloseTo(90, 12);
    expect(drop.maxRange).toBe(0);
    const pts = trajectoryPoints({ speed: 10, angleDeg: 45, height: 0, g: 10 }, 10);
    expect(pts).toHaveLength(11);
    expect(pts[10].y).toBe(0);
    expect(projectileAt({ speed: 10, angleDeg: 90, height: 0, g: 10 }, 1)).toMatchObject({ x: 0, y: 5, vy: 0 });
  });
  it('anglesToHit: none, one (grazing) and two', () => {
    expect(anglesToHit(0, 10, 0, 10)).toEqual([]);
    expect(anglesToHit(10, 0, 0, 10)).toEqual([]);
    expect(anglesToHit(5, 100, 0, 10)).toEqual([]); // out of range: v²/g = 2.5
    expect(anglesToHit(10, 10, 0, 10)).toEqual([expect.closeTo(45, 12)]); // exactly the maximum range
    const two = anglesToHit(20, 10, 0, 10);
    expect(two).toHaveLength(2);
    expect(two[0] + two[1]).toBeCloseTo(90, 12); // complementary on level ground
  });
});

describe('free fall with and without drag', () => {
  const g = 9.80665;
  const drag = { mass: 80, cd: 1, area: 0.7, airDensity: 1.225 };
  const vt = Math.sqrt((2 * 80 * g) / (1.225 * 0.7)); // 42.7763 m/s
  it('validation', () => {
    bad(freeFall({ solve: 'height', given: NaN, v0: 0, g }), /known value/);
    bad(freeFall({ solve: 'height', given: 10, v0: -1, g }), /cannot be negative/);
    bad(freeFall({ solve: 'height', given: 10, v0: 0, g: 0 }), /Gravity/);
    bad(freeFall({ solve: 'height', given: 0, v0: 0, g }), /Height must be/);
    bad(freeFall({ solve: 'time', given: -1, v0: 0, g }), /Time must be/);
    bad(freeFall({ solve: 'velocity', given: 5, v0: 5, g }), /greater than the initial/);
    bad(freeFall({ solve: 'height', given: 10, v0: 0, g, drag: { ...drag, cd: 0 } }), /must all be greater than zero/);
    bad(freeFall({ solve: 'velocity', given: 50, v0: 0, g, drag }), /never reach/);
    bad(freeFall({ solve: 'velocity', given: 200, v0: 100, g, drag }), /slows down/);
  });
  it('vacuum: h = ½gt² with g = 10', () => {
    expect(val(freeFall({ solve: 'height', given: 20, v0: 0, g: 10 }))).toMatchObject({ time: 2, velocity: 20, terminalVelocity: null });
    expect(val(freeFall({ solve: 'time', given: 3, v0: 0, g: 10 }))).toMatchObject({ height: 45, velocity: 30 });
    expect(val(freeFall({ solve: 'velocity', given: 30, v0: 0, g: 10 }))).toMatchObject({ height: 45, time: 3 });
    expect(val(freeFall({ solve: 'height', given: 15, v0: 10, g: 10 })).time).toBeCloseTo(1, 14); // 10t + 5t² = 15
  });
  it('quadratic drag matches t = (vt/g)·acosh(e^(gh/vt²)) and an RK4 integration, including long drops', () => {
    expect(terminalVelocity(drag, g)).toBeCloseTo(vt, 12);
    const short = val(freeFall({ solve: 'height', given: 100, v0: 0, g, drag }));
    expect(short.time).toBeCloseTo((vt / g) * Math.acosh(Math.exp((g * 100) / (vt * vt))), 10); // 4.92810 s
    expect(short.velocity).toBeCloseTo(vt * Math.sqrt(1 - Math.exp((-2 * g * 100) / (vt * vt))), 10); // v² = vt²(1 − e^(−2gh/vt²))
    // 10 km: the speed rounds to vt, but the time is still h/vt + (vt/g)·ln 2 ≈ 236.80 s (was 81.6 s).
    const long = val(freeFall({ solve: 'height', given: 10000, v0: 0, g, drag }));
    expect(long.time).toBeCloseTo(236.79777046438335, 6); // RK4, dt = 1 ms
    expect(long.averageSpeed).toBeLessThan(vt);
    // Starting above terminal velocity: slows towards vt (was Infinity for the 10 km case).
    const fastShort = val(freeFall({ solve: 'height', given: 100, v0: 100, g, drag }));
    expect(fastShort.time).toBeCloseTo(1.2316926893786748, 6); // RK4
    expect(fastShort.velocity).toBeCloseTo(Math.sqrt(vt * vt + (1e4 - vt * vt) * Math.exp((-2 * g * 100) / (vt * vt))), 10);
    const fastLong = val(freeFall({ solve: 'height', given: 10000, v0: 100, g, drag }));
    expect(fastLong.time).toBeCloseTo(231.54031181636853, 6); // RK4
    // Time → height round trip, both regimes
    expect(val(freeFall({ solve: 'time', given: long.time, v0: 0, g, drag })).height).toBeCloseTo(10000, 6);
    expect(val(freeFall({ solve: 'time', given: fastShort.time, v0: 100, g, drag })).height).toBeCloseTo(100, 8);
    // Velocity mode: h = (vt²/2g)·ln(vt²/(vt² − v²)), t = (vt/g)·atanh(v/vt)
    const v30 = val(freeFall({ solve: 'velocity', given: 30, v0: 0, g, drag }));
    expect(v30.height).toBeCloseTo(((vt * vt) / (2 * g)) * Math.log((vt * vt) / (vt * vt - 900)), 10);
    expect(v30.time).toBeCloseTo((vt / g) * Math.atanh(30 / vt), 12);
    expect(v30.timeTo95).toBeCloseTo((vt / g) * Math.atanh(0.95), 12);
  });
  it('starting exactly at terminal velocity keeps a constant speed', () => {
    const at = val(freeFall({ solve: 'height', given: 100, v0: vt, g, drag }));
    expect(at.velocity).toBe(vt);
    expect(at.time).toBeCloseTo(100 / vt, 12);
    expect(val(freeFall({ solve: 'time', given: 2, v0: vt, g, drag })).height).toBeCloseTo(2 * vt, 12);
  });
  it('fallSpeedSeries with and without drag', () => {
    const s = fallSpeedSeries(0, 10, 10, null, 5);
    expect(s.map((p) => p.vacuum)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(s[0]).not.toHaveProperty('drag');
    const d = fallSpeedSeries(0, g, 60, drag, 3);
    expect(d[3].drag).toBeCloseTo(vt, 6);
  });
});

describe('force, friction and density', () => {
  const g = G0;
  it('solveNewton', () => {
    expect(val(solveNewton('force', { mass: 2, acceleration: -3 })).force).toBe(-6);
    expect(val(solveNewton('mass', { force: 10, acceleration: 2 })).mass).toBe(5);
    expect(val(solveNewton('acceleration', { force: 10, mass: 4 })).acceleration).toBe(2.5);
    bad(solveNewton('force', { mass: 2 }), /Enter the acceleration/);
    bad(solveNewton('force', { mass: 0, acceleration: 1 }), /Mass must be/);
    bad(solveNewton('mass', { force: 10, acceleration: 0 }), /non-zero/);
    bad(solveNewton('mass', { force: 10, acceleration: -2 }), /same way/);
  });
  it('friction on a 30° incline (μk 0.3, μs 0.5) and on the flat', () => {
    bad(friction({ mass: 0, g, angleDeg: 0, mu: 0.3 }), /Mass/);
    bad(friction({ mass: 1, g: -1, angleDeg: 0, mu: 0.3 }), /Gravity/);
    bad(friction({ mass: 1, g, angleDeg: 90, mu: 0.3 }), /90°/);
    bad(friction({ mass: 1, g, angleDeg: -1, mu: 0.3 }), /90°/);
    bad(friction({ mass: 1, g, angleDeg: 0, mu: -0.1 }), /kinetic/);
    bad(friction({ mass: 1, g, angleDeg: 0, mu: 0.1, muStatic: NaN }), /static/);
    const r = val(friction({ mass: 1, g, angleDeg: 30, mu: 0.3, muStatic: 0.5 }));
    expect(r.slidesOnItsOwn).toBe(true); // tan 30° = 0.577 > 0.5
    expect(r.slideAcceleration).toBeCloseTo(2.3554825921932, 12); // g(sin θ − μk cos θ)
    expect(r.reposeAngleDeg).toBeCloseTo(26.565051177077994, 12);
    const flat = val(friction({ mass: 10, g: 10, angleDeg: 0, mu: 0.2 }));
    expect(flat).toMatchObject({ normal: 100, kinetic: 20, maxStatic: null, slidesOnItsOwn: null, slideAcceleration: 0, breakaway: 20 });
    const steep = val(friction({ mass: 1, g, angleDeg: 10, mu: 0.5 }));
    expect(steep.slideAcceleration).toBe(0); // friction wins
  });
  it('density, water density and hydrostatic weighing', () => {
    expect(val(solveDensity('density', { mass: 7.874, volume: 0.001 })).density).toBeCloseTo(7874, 10);
    expect(val(solveDensity('mass', { density: 1000, volume: 2 })).mass).toBe(2000);
    expect(val(solveDensity('volume', { density: 1000, mass: 2 })).volume).toBe(0.002);
    bad(solveDensity('density', { mass: 1 }), /Enter the volume/);
    bad(solveDensity('density', { mass: 1, volume: 0 }), /greater than zero/);
    expect(waterDensity(3.98303)).toBeCloseTo(999.97495, 10); // maximum by construction (a5)
    expect(waterDensity(20)).toBeCloseTo(998.2067, 4); // CIPM (Tanaka 2001) table
    // 0.1 kg in air, 0.06 kg in water: displaced 0.04 kg → 4 × 10⁻⁵ m³ → 2500 kg/m³
    const a = val(archimedesDensity(0.1, 0.06, 1000));
    expect(a.density).toBeCloseTo(2500, 10);
    expect(a.volume).toBeCloseTo(4e-5, 18);
    bad(archimedesDensity(NaN, 0.06, 1000), /Enter both/);
    bad(archimedesDensity(0, -1, 1000), /mass in air/);
    bad(archimedesDensity(0.1, 0.06, 0), /Fluid density/);
    bad(archimedesDensity(0.1, 0.1, 1000), /lower than the reading in air/);
    expect(closestMaterials(7874)[0].id).toBe('iron');
    expect(closestMaterials(1, 2)).toHaveLength(2);
  });
});

describe('waves and light', () => {
  it('speed of sound and wave relations with exact constants', () => {
    expect(speedOfSoundAir(0)).toBeCloseTo(331.3196511816839, 10);
    bad(solveWave('frequency', 0, C_LIGHT), /greater than zero/);
    bad(solveWave('frequency', 1, NaN), /Wave speed/);
    expect(val(solveWave('frequency', 1e9, C_LIGHT)).wavelength).toBeCloseTo(0.299792458, 15);
    expect(val(solveWave('period', 1e-3, 343)).frequency).toBeCloseTo(1000, 10);
    expect(val(solveWave('wavelength', 0.5, 343)).frequency).toBe(686);
    // 1 eV photon: f = e/h = 2.417989242 × 10¹⁴ Hz, λ = hc/e = 1239.84198 nm
    const ev = val(solveWave('energy', E_CHARGE, C_LIGHT));
    expect(ev.frequency / (E_CHARGE / PLANCK)).toBeCloseTo(1, 14);
    expect(ev.wavelength * 1e9).toBeCloseTo(1239.84198433, 8);
    expect(ev.photonEnergyEv).toBeCloseTo(1, 14);
  });
  it('band and region classification at the edges', () => {
    expect(ituBand(1e9)).toMatchObject({ band: 9, short: 'UHF' });
    expect(ituBand(3)).toMatchObject({ band: 1, short: 'ELF' });
    expect(ituBand(2.9)).toBeNull();
    expect(ituBand(3e12)).toBeNull();
    const region = (m: number) => emRegion(m);
    expect(region(1e-12)).toEqual({ region: 'Gamma rays' });
    expect(region(5e-11)).toEqual({ region: 'X-rays', detail: 'hard X-ray' });
    expect(region(1e-9)).toEqual({ region: 'X-rays', detail: 'soft X-ray' });
    expect(region(50e-9).detail).toBe('extreme/vacuum UV');
    expect(region(250e-9).detail).toBe('UV-C');
    expect(region(300e-9).detail).toBe('UV-B');
    expect(region(350e-9).detail).toBe('UV-A');
    expect(region(550e-9)).toEqual({ region: 'Visible light', detail: 'green' });
    expect(region(1e-6).detail).toBe('near infrared');
    expect(region(10e-6).detail).toBe('mid infrared');
    expect(region(100e-6).detail).toBe('far infrared');
    expect(region(0.01)).toEqual({ region: 'Microwave' });
    expect(region(10)).toEqual({ region: 'Radio' });
    expect(['violet', 'blue', 'green', 'yellow', 'orange', 'red']).toEqual([420, 470, 530, 580, 600, 700].map(visibleColour));
  });
  it('wavelengthToRgb covers every segment of Bruton’s ramp', () => {
    expect(wavelengthToRgb(379)).toBeNull();
    expect(wavelengthToRgb(751)).toBeNull();
    expect(wavelengthToRgb(440)).toBe('rgb(0, 0, 255)');
    expect(wavelengthToRgb(490)).toBe('rgb(0, 255, 255)');
    expect(wavelengthToRgb(510)).toBe('rgb(0, 255, 0)');
    expect(wavelengthToRgb(580)).toBe('rgb(255, 255, 0)');
    expect(wavelengthToRgb(645)).toBe('rgb(255, 0, 0)');
    expect(wavelengthToRgb(380)).toMatch(/^rgb\(\d+, 0, \d+\)$/); // dimmed violet
    expect(wavelengthToRgb(750)).toMatch(/^rgb\(\d+, 0, 0\)$/); // dimmed red
  });
  it('sound bands and the nearest note (A4 = 440 Hz)', () => {
    expect(soundBand(19)).toMatch(/Infrasound/);
    expect(soundBand(20000)).toMatch(/Audible/);
    expect(soundBand(20001)).toMatch(/Ultrasound/);
    expect(nearestNote(440)).toMatchObject({ name: 'A', octave: 4, cents: 0 });
    expect(nearestNote(261.6256)).toMatchObject({ name: 'C', octave: 4, cents: 0 });
    expect(nearestNote(445)).toMatchObject({ name: 'A', cents: 20 }); // 1200·log2(445/440) = 19.56
    expect(nearestNote(8.175798915643707)).toMatchObject({ name: 'C', octave: -1 }); // MIDI 0
    for (const f of [0, -1, NaN, 4, 1e6]) expect(nearestNote(f)).toBeNull();
  });
});

describe('gas laws', () => {
  it('ideal gas: molar volume at 0 °C and 1 atm is 22.413969545 L (CODATA)', () => {
    const v = val(solveIdealGas('volume', { pressure: 101325, moles: 1, temperature: 273.15 }, 0.0289644));
    expect(v.volume).toBeCloseTo(0.022413969545014137, 15);
    expect(v.density).toBeCloseTo(0.0289644 / 0.022413969545014137, 12);
    expect(val(solveIdealGas('pressure', { volume: v.volume, moles: 1, temperature: 273.15 })).pressure).toBeCloseTo(101325, 8);
    expect(val(solveIdealGas('moles', { pressure: 101325, volume: v.volume, temperature: 273.15 })).moles).toBeCloseTo(1, 14);
    const t = val(solveIdealGas('temperature', { pressure: 101325, volume: v.volume, moles: 1 }, NaN));
    expect(t.temperature).toBeCloseTo(273.15, 10);
    expect(t.mass).toBeNull();
    bad(solveIdealGas('volume', { pressure: 101325, moles: 1 }), /Enter the temperature/);
    bad(solveIdealGas('volume', { pressure: 101325, moles: 1, temperature: 0 }), /above 0 K/);
    bad(solveIdealGas('volume', { pressure: 0, moles: 1, temperature: 1 }), /Absolute pressure/);
    bad(solveIdealGas('volume', { pressure: 1, moles: -1, temperature: 1 }), /amount of gas/);
    bad(solveIdealGas('pressure', { volume: 0, moles: 1, temperature: 1 }), /volume must be/);
  });
  it('combined gas law in every direction', () => {
    const known = { p1: 1, v1: 2, t1: 300, p2: 2, v2: 2, t2: 600 };
    for (const k of Object.keys(known) as (keyof typeof known)[]) {
      const given = { ...known, [k]: undefined };
      expect(val(solveCombinedGas(k, given))[k]).toBeCloseTo(known[k], 12);
    }
    bad(solveCombinedGas('v2', { p1: 1, v1: 2, t1: 300, p2: 2 }), /Enter T2/);
    bad(solveCombinedGas('v2', { p1: 1, v1: 2, t1: 0, p2: 2, t2: 1 }), /above 0 K/);
    bad(solveCombinedGas('v2', { p1: -1, v1: 2, t1: 1, p2: 2, t2: 1 }), /greater than zero/);
  });
});

describe('pH', () => {
  it('charge balance validation and pure water', () => {
    bad(solveChargeBalance({ total: NaN }), /valid numbers/);
    bad(solveChargeBalance({ cations: -1 }), /negative/);
    bad(solveChargeBalance({ system: { pKas: [NaN], z0: 0 }, total: 0.1 }), /pKa/);
    bad(solveChargeBalance({ anions: 1e4 }), /outside the range/);
    expect(val(solveChargeBalance({})).pH).toBeCloseTo(7, 10);
    expect(val(solveChargeBalance({ pKw: 13.6 })).pH).toBeCloseTo(6.8, 10);
  });
  it('strong and weak species against equilibrium hand calculations', () => {
    bad(phOfSpecies(sp('hcl'), 0), /greater than zero/);
    bad(phOfSpecies(sp('hcl'), NaN), /greater than zero/);
    bad(phOfSpecies(sp('hcl'), 21), /above 20 M/);
    expect(val(phOfSpecies(sp('hcl'), 0.01)).pH).toBeCloseTo(2, 6);
    // 10⁻⁸ M HCl is not basic: [H⁺] = (c + √(c² + 4Kw))/2 → pH 6.978
    const dilute = val(phOfSpecies(sp('hcl'), 1e-8));
    expect(dilute.pH).toBeCloseTo(6.978294313542888, 6);
    expect(dilute.approxPH).toBeCloseTo(8, 12); // the naive −log c the page warns about
    expect(val(phOfSpecies(sp('naoh'), 0.01)).pH).toBeCloseTo(12, 6);
    expect(val(phOfSpecies(sp('caoh2'), 0.01)).pH).toBeCloseTo(12.301029995663981, 6);
    // acetic 0.1 M: h²/(c − h) = 10^−4.76 → pH 2.8829 (water negligible)
    const ac = val(phOfSpecies(sp('acetic'), 0.1));
    expect(ac.pH).toBeCloseTo(2.882862537409523, 5);
    expect(ac.approxPH).toBeCloseTo(2.88, 12); // ½(4.76 + 1)
    expect(ac.ionisedFraction).toBeCloseTo(10 ** -2.882862537409523 / 0.1, 5);
    // ammonia 0.1 M: Kb = 10^−4.75 → pH 11.1221
    expect(val(phOfSpecies(sp('ammonia'), 0.1)).pH).toBeCloseTo(11.122104316457849, 5);
    // 0.01 M H₂SO₄: first proton strong, x(0.01 + x)/(0.01 − x) = 10^−1.99 → pH 1.848
    const s = val(phOfSpecies(sp('h2so4'), 0.01));
    expect(s.pH).toBeCloseTo(1.8480205751252041, 5);
    expect(s.approxPH).toBeNull();
  });
  it('custom species, buffers and conversions', () => {
    expect(customSpecies('weak-base', 4.75, true).system!.pKas[0]).toBeCloseTo(9.25, 12);
    expect(customSpecies('weak-acid', 4.75).system).toEqual({ pKas: [4.75], z0: 0 });
    bad(buffer(NaN, 0.1, 0.1), /pKa/);
    bad(buffer(4.76, 0, 0.1), /greater than zero/);
    const b = val(buffer(4.76, 0.1, 0.1));
    expect(b.hhPH).toBe(4.76);
    expect(b.exactPH).toBeCloseTo(4.76, 2);
    expect(b.capacity).toBeCloseTo((Math.LN10 * 0.2) / 4, 3); // Ct·Ka·h/(Ka + h)² with h = Ka
    const nh = val(buffer(9.25, 0.1, 0.1, 14, true));
    expect(nh.exactPH).toBeCloseTo(9.25, 2);
    expect(bufferRatioFor(5.76, 4.76)).toBeCloseTo(10, 12);
    bad(convertPh('pH', NaN), /Enter a number/);
    bad(convertPh('h', 0), /greater than zero/);
    bad(convertPh('oh', -1), /greater than zero/);
    expect(val(convertPh('pH', 3)).h).toBeCloseTo(1e-3, 15);
    expect(val(convertPh('pOH', 3)).pH).toBe(11);
    expect(val(convertPh('h', 1e-5)).pH).toBeCloseTo(5, 12);
    expect(val(convertPh('oh', 1e-3)).pH).toBeCloseTo(11, 12);
    expect(val(convertPh('pH', -1)).h).toBeCloseTo(10, 12); // concentrated acids go below 0
  });
  it('phLabel bands', () => {
    expect([7, 2, 5, 6.5, 12, 9, 7.5].map((p) => phLabel(p))).toEqual(
      ['Neutral', 'Strongly acidic', 'Acidic', 'Weakly acidic', 'Strongly basic', 'Basic', 'Weakly basic']);
    expect(phLabel(6.8, 13.6)).toBe('Neutral');
  });
});
