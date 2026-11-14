/**
 * Pure logic for the physics and chemistry calculators: kinetic and potential
 * energy, projectile motion, free fall (with and without quadratic drag),
 * force (F = ma, weight, friction on a flat surface or incline), density,
 * wavelength/frequency/photon energy, the ideal gas law and pH.
 *
 * Constants are the exact SI defining constants (2019 redefinition, as listed
 * in CODATA 2018) plus standard gravity g0 = 9.80665 m/s² (3rd CGPM, 1901).
 * No React here, so src/test/tools/w500-science2.test.ts exercises the same
 * code as the pages and the MCP specs.
 */
import { msg, fillMsg, type MsgText } from '../../msg';

/** A failure's error is English; errorMsg, when the text carries values, is its template for t(text, vars). */
export type Result<T> = { ok: true; value: T; error?: undefined; errorMsg?: undefined } | { ok: false; error: string; errorMsg?: MsgText; value?: undefined };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: string, vars?: MsgText['vars']): Result<T> => (vars ? { ok: false, error: fillMsg({ text: error, vars }), errorMsg: { text: error, vars } } : { ok: false, error });

/** "Enter the …" per quantity, one whole message each (the speed is keyed as velocity). */
const ENTER_THE: Record<string, string> = {
  energy: msg('Enter the energy.'), mass: msg('Enter the mass.'), velocity: msg('Enter the speed.'), height: msg('Enter the height.'), force: msg('Enter the force.'), acceleration: msg('Enter the acceleration.'),
  density: msg('Enter the density.'), volume: msg('Enter the volume.'), pressure: msg('Enter the pressure.'), moles: msg('Enter the moles.'), temperature: msg('Enter the temperature.'),
};
const MUST_BE_POSITIVE: Record<string, string> = { density: msg('The density must be greater than zero.'), mass: msg('The mass must be greater than zero.'), volume: msg('The volume must be greater than zero.'), moles: msg('The amount of gas must be greater than zero.') };
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

/** Speed of light in vacuum, m/s (exact). */
export const C_LIGHT = 299792458;
/** Planck constant, J·s (exact). */
export const PLANCK = 6.62607015e-34;
/** Elementary charge, C (exact); also J per eV. */
export const E_CHARGE = 1.602176634e-19;
/** Avogadro constant, 1/mol (exact). */
export const AVOGADRO = 6.02214076e23;
/** Boltzmann constant, J/K (exact). */
export const BOLTZMANN = 1.380649e-23;
/** Molar gas constant R = NA·k, J/(mol·K) (exact, 8.314462618...). */
export const GAS_R = AVOGADRO * BOLTZMANN;
/** Standard acceleration of gravity, m/s² (exact by definition). */
export const G0 = 9.80665;
/** Standard atmosphere, Pa (exact). */
export const ATM = 101325;

/* ------------------------------------------------------------------ */
/* Units (factor = SI value of one unit)                               */
/* ------------------------------------------------------------------ */

export type UnitDef = { id: string; label: string; factor: number };
const u = (id: string, factor: number, label = id): UnitDef => ({ id, label, factor });

export const LB = 0.45359237;
export const FT = 0.3048;
export const LBF = LB * G0; // 4.4482216152605 N

export const MASS_UNITS: UnitDef[] = [u('kg', 1), u('g', 1e-3), u('mg', 1e-6), u('t', 1000, 't (tonne)'), u('lb', LB), u('oz', LB / 16)];
export const LENGTH_UNITS: UnitDef[] = [u('m', 1), u('cm', 0.01), u('mm', 0.001), u('km', 1000), u('ft', FT), u('in', 0.0254), u('yd', 0.9144), u('mi', 1609.344)];
export const SPEED_UNITS: UnitDef[] = [u('m/s', 1), u('km/h', 1 / 3.6), u('mph', 0.44704), u('ft/s', FT), u('knot', 1852 / 3600, 'knots')];
export const TIME_UNITS: UnitDef[] = [u('s', 1), u('ms', 1e-3), u('min', 60), u('h', 3600)];
export const ACCEL_UNITS: UnitDef[] = [u('m/s²', 1), u('ft/s²', FT), u('g', G0, 'g (9.80665)')];
export const ENERGY_UNITS: UnitDef[] = [
  u('J', 1),
  u('kJ', 1e3),
  u('MJ', 1e6),
  u('Wh', 3600),
  u('kWh', 3.6e6),
  u('cal', 4.184, 'cal (thermo.)'),
  u('kcal', 4184, 'kcal (Cal)'),
  u('ft·lbf', FT * LBF),
  u('BTU', 1055.05585262, 'BTU (IT)'),
  u('eV', E_CHARGE),
];
export const FORCE_UNITS: UnitDef[] = [u('N', 1), u('kN', 1e3), u('mN', 1e-3), u('lbf', LBF), u('kgf', G0), u('dyn', 1e-5)];
export const MOMENTUM_UNITS: UnitDef[] = [u('kg·m/s', 1), u('N·s', 1)];
export const AREA_UNITS: UnitDef[] = [u('m²', 1), u('cm²', 1e-4), u('mm²', 1e-6), u('ft²', FT * FT), u('in²', 0.0254 * 0.0254)];
export const VOLUME_UNITS: UnitDef[] = [
  u('m³', 1),
  u('L', 1e-3),
  u('mL', 1e-6),
  u('cm³', 1e-6),
  u('ft³', FT ** 3),
  u('in³', 0.0254 ** 3),
  u('gal', 3.785411784e-3, 'gal (US)'),
  u('gal UK', 4.54609e-3, 'gal (UK)'),
];
export const DENSITY_UNITS: UnitDef[] = [
  u('kg/m³', 1),
  u('g/cm³', 1000),
  u('g/mL', 1000),
  u('kg/L', 1000),
  u('g/L', 1),
  u('lb/ft³', LB / FT ** 3),
  u('lb/in³', LB / 0.0254 ** 3),
  u('lb/gal', LB / 3.785411784e-3, 'lb/gal (US)'),
];
export const PRESSURE_UNITS: UnitDef[] = [
  u('Pa', 1),
  u('kPa', 1e3),
  u('MPa', 1e6),
  u('bar', 1e5),
  u('mbar', 100),
  u('atm', ATM),
  u('psi', LBF / 0.0254 ** 2),
  u('mmHg', 133.322387415),
  u('Torr', ATM / 760),
  u('inHg', 3386.389),
];
export const FREQ_UNITS: UnitDef[] = [u('Hz', 1), u('kHz', 1e3), u('MHz', 1e6), u('GHz', 1e9), u('THz', 1e12), u('PHz', 1e15)];
export const WAVELENGTH_UNITS: UnitDef[] = [
  u('km', 1e3),
  u('m', 1),
  u('cm', 1e-2),
  u('mm', 1e-3),
  u('µm', 1e-6),
  u('nm', 1e-9),
  u('Å', 1e-10),
  u('pm', 1e-12),
  u('ft', FT),
  u('in', 0.0254),
];
export const PERIOD_UNITS: UnitDef[] = [u('s', 1), u('ms', 1e-3), u('µs', 1e-6), u('ns', 1e-9), u('ps', 1e-12), u('fs', 1e-15)];
export const PHOTON_ENERGY_UNITS: UnitDef[] = [u('eV', E_CHARGE), u('meV', E_CHARGE * 1e-3), u('keV', E_CHARGE * 1e3), u('MeV', E_CHARGE * 1e6), u('J', 1), u('zJ', 1e-21)];
export const CONC_UNITS: UnitDef[] = [u('M', 1, 'M (mol/L)'), u('mM', 1e-3), u('µM', 1e-6), u('nM', 1e-9)];

export function factorOf(units: UnitDef[], id: string): number {
  const f = units.find((x) => x.id === id)?.factor;
  if (f === undefined) throw new Error(`Unknown unit "${id}".`);
  return f;
}
/** Value in `unit` -> SI. */
export const toSI = (units: UnitDef[], value: number, unit: string) => value * factorOf(units, unit);
/** SI -> value in `unit`. */
export const fromSI = (units: UnitDef[], value: number, unit: string) => value / factorOf(units, unit);

export type TempUnit = 'K' | '°C' | '°F' | '°R';
export const TEMP_UNITS: TempUnit[] = ['K', '°C', '°F', '°R'];
export function tempToK(t: number, unit: TempUnit): number {
  switch (unit) {
    case 'K':
      return t;
    case '°C':
      return t + 273.15;
    case '°F':
      return ((t - 32) * 5) / 9 + 273.15;
    case '°R':
      return (t * 5) / 9;
  }
}
export function kToTemp(k: number, unit: TempUnit): number {
  switch (unit) {
    case 'K':
      return k;
    case '°C':
      return k - 273.15;
    case '°F':
      return ((k - 273.15) * 9) / 5 + 32;
    case '°R':
      return (k * 9) / 5;
  }
}

/** Surface gravity presets, m/s². Earth is standard gravity; the others are NASA planetary fact sheet equatorial values. */
export const GRAVITY_PRESETS: { id: string; label: string; g: number }[] = [
  { id: 'earth', label: msg('Earth (standard, 9.80665)'), g: G0 },
  { id: 'moon', label: msg('Moon (1.62)'), g: 1.62 },
  { id: 'mars', label: msg('Mars (3.71)'), g: 3.71 },
  { id: 'venus', label: msg('Venus (8.87)'), g: 8.87 },
  { id: 'jupiter', label: msg('Jupiter (24.79)'), g: 24.79 },
  { id: 'mercury', label: msg('Mercury (3.70)'), g: 3.7 },
  { id: 'custom', label: msg('Custom'), g: NaN },
];
export function gravityOf(id: string, custom?: number): number {
  if (id === 'custom') return custom ?? NaN;
  return GRAVITY_PRESETS.find((p) => p.id === id)?.g ?? G0;
}

/* ------------------------------------------------------------------ */
/* Kinetic and potential energy                                         */
/* ------------------------------------------------------------------ */

export type KeKey = 'energy' | 'mass' | 'velocity';
export type KeValues = {
  energy: number;
  mass: number;
  velocity: number;
  momentum: number;
  /** Height an object would have to fall (no drag) to reach this speed, m. */
  equivalentDropHeight: number;
  /** Relativistic kinetic energy (γ − 1)mc², J. */
  relativisticEnergy: number;
  /** Fraction of the speed of light. */
  beta: number;
};

/** Solve KE = ½mv² for the missing one of energy (J), mass (kg) and speed (m/s). */
export function solveKineticEnergy(solve: KeKey, v: { energy?: number; mass?: number; velocity?: number }, g = G0): Result<KeValues> {
  const need = (['energy', 'mass', 'velocity'] as KeKey[]).filter((k) => k !== solve);
  for (const k of need) {
    const x = v[k];
    if (!isNum(x)) return fail(ENTER_THE[k]);
    if (k === 'mass' ? x <= 0 : x < 0) return fail(k === 'mass' ? msg('Mass must be greater than zero.') : k === 'velocity' ? msg('The speed cannot be negative.') : msg('The energy cannot be negative.'));
  }
  let { energy, mass, velocity } = v as { energy: number; mass: number; velocity: number };
  if (solve === 'energy') energy = 0.5 * mass * velocity * velocity;
  else if (solve === 'mass') {
    if (velocity === 0) return fail(msg('Speed must be greater than zero to solve for mass.'));
    mass = (2 * energy) / (velocity * velocity);
    if (mass <= 0) return fail(msg('Energy must be greater than zero to solve for mass.'));
  } else velocity = Math.sqrt((2 * energy) / mass);
  const beta = velocity / C_LIGHT;
  if (beta >= 1) return fail(msg('That speed is at or above the speed of light; ½mv² does not apply.'));
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  // (γ − 1) loses precision for small β; use the series ½β² + 3/8 β⁴ + 5/16 β⁶ there.
  const gm1 = beta < 1e-3 ? 0.5 * beta ** 2 + (3 / 8) * beta ** 4 + (5 / 16) * beta ** 6 : gamma - 1;
  return ok({
    energy,
    mass,
    velocity,
    momentum: mass * velocity,
    equivalentDropHeight: (velocity * velocity) / (2 * g),
    relativisticEnergy: gm1 * mass * C_LIGHT * C_LIGHT,
    beta,
  });
}

export type PeKey = 'energy' | 'mass' | 'height';
export type PeValues = { energy: number; mass: number; height: number; g: number; impactSpeed: number };

/** Solve PE = mgh near a planet's surface (uniform g) for the missing one of energy (J), mass (kg) and height (m). */
export function solvePotentialEnergy(solve: PeKey, v: { energy?: number; mass?: number; height?: number }, g = G0): Result<PeValues> {
  if (!isNum(g) || g <= 0) return fail(msg('Gravity must be greater than zero.'));
  const need = (['energy', 'mass', 'height'] as PeKey[]).filter((k) => k !== solve);
  for (const k of need) {
    const x = v[k];
    if (!isNum(x)) return fail(ENTER_THE[k]);
    if (k === 'mass' && x <= 0) return fail(msg('Mass must be greater than zero.'));
  }
  let { energy, mass, height } = v as { energy: number; mass: number; height: number };
  if (solve === 'energy') energy = mass * g * height;
  else if (solve === 'mass') {
    if (height === 0) return fail(msg('Height must be non-zero to solve for mass.'));
    mass = energy / (g * height);
    if (mass <= 0) return fail(msg('Energy and height must have the same sign to give a positive mass.'));
  } else height = energy / (mass * g);
  return ok({ energy, mass, height, g, impactSpeed: height > 0 ? Math.sqrt(2 * g * height) : 0 });
}

/* ------------------------------------------------------------------ */
/* Projectile motion (no air resistance)                                */
/* ------------------------------------------------------------------ */

export type ProjectileInput = { speed: number; angleDeg: number; height: number; g: number };
export type ProjectileResult = {
  vx: number;
  vy: number;
  timeOfFlight: number;
  range: number;
  maxHeight: number;
  timeToApex: number;
  impactSpeed: number;
  /** Degrees below horizontal at landing. */
  impactAngleDeg: number;
  /** Launch angle giving the greatest range from this height and speed. */
  optimalAngleDeg: number;
  maxRange: number;
};

export function projectile({ speed, angleDeg, height, g }: ProjectileInput): Result<ProjectileResult> {
  if (![speed, angleDeg, height, g].every(isNum)) return fail(msg('Enter numbers for speed, angle, height and gravity.'));
  if (speed < 0) return fail(msg('Launch speed cannot be negative.'));
  if (height < 0) return fail(msg('Launch height cannot be below the landing level. Use 0 for level ground.'));
  if (g <= 0) return fail(msg('Gravity must be greater than zero.'));
  if (angleDeg < -90 || angleDeg > 90) return fail(msg('Launch angle must be between −90° and 90°.'));
  if (speed === 0 && height === 0) return fail(msg('With zero speed and zero height there is no flight.'));
  const a = (angleDeg * Math.PI) / 180;
  const vx = Math.abs(angleDeg) === 90 ? 0 : speed * Math.cos(a);
  const vy = speed * Math.sin(a);
  const timeOfFlight = (vy + Math.sqrt(vy * vy + 2 * g * height)) / g;
  const range = vx * timeOfFlight;
  const timeToApex = vy > 0 ? vy / g : 0;
  const maxHeight = vy > 0 ? height + (vy * vy) / (2 * g) : height;
  const vyImpact = vy - g * timeOfFlight;
  const impactSpeed = Math.hypot(vx, vyImpact);
  const impactAngleDeg = (Math.atan2(-vyImpact, vx) * 180) / Math.PI;
  const root = Math.sqrt(speed * speed + 2 * g * height);
  const optimalAngleDeg = root === 0 ? 45 : (Math.atan(speed / root) * 180) / Math.PI;
  const maxRange = (speed / g) * root;
  return ok({ vx, vy, timeOfFlight, range, maxHeight, timeToApex, impactSpeed, impactAngleDeg, optimalAngleDeg, maxRange });
}

/** Points (x, y) along the path, `n` + 1 samples from launch to landing. */
export function trajectoryPoints(inp: ProjectileInput, n = 60): { t: number; x: number; y: number }[] {
  const r = projectile(inp);
  if (!r.ok) return [];
  const { vx, vy, timeOfFlight } = r.value;
  const pts: { t: number; x: number; y: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const t = (timeOfFlight * k) / n;
    pts.push({ t, x: vx * t, y: Math.max(0, inp.height + vy * t - 0.5 * inp.g * t * t) });
  }
  return pts;
}

/** Position and velocity at time t after launch (before landing). */
export function projectileAt(inp: ProjectileInput, t: number): { x: number; y: number; vx: number; vy: number; speed: number } {
  const a = (inp.angleDeg * Math.PI) / 180;
  const vx = Math.abs(inp.angleDeg) === 90 ? 0 : inp.speed * Math.cos(a);
  const vy0 = inp.speed * Math.sin(a);
  const vy = vy0 - inp.g * t;
  return { x: vx * t, y: inp.height + vy0 * t - 0.5 * inp.g * t * t, vx, vy, speed: Math.hypot(vx, vy) };
}

/**
 * Launch angles (degrees) that land a projectile at horizontal distance `distance`
 * on a target at height `targetHeight` relative to the launch point. 0, 1 or 2 angles.
 */
export function anglesToHit(speed: number, distance: number, targetHeight: number, g: number): number[] {
  if (!(speed > 0) || !(distance > 0) || !(g > 0)) return [];
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * distance * distance + 2 * targetHeight * v2);
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  const out = [Math.atan((v2 - s) / (g * distance)), Math.atan((v2 + s) / (g * distance))].map((r) => (r * 180) / Math.PI);
  return disc === 0 ? [out[0]] : out;
}

/* ------------------------------------------------------------------ */
/* Free fall                                                            */
/* ------------------------------------------------------------------ */

export type FallSolve = 'height' | 'time' | 'velocity';
export type DragInput = { mass: number; cd: number; area: number; airDensity: number };
export type FallInput = {
  solve: FallSolve;
  /** Known value for the chosen mode: drop height (m), fall time (s) or impact speed (m/s). */
  given: number;
  /** Initial downward speed, m/s (0 for a drop from rest). */
  v0: number;
  g: number;
  drag?: DragInput | null;
};
export type FallResult = {
  height: number;
  time: number;
  velocity: number;
  /** Same height in vacuum, for comparison. */
  vacuumTime: number;
  vacuumVelocity: number;
  terminalVelocity: number | null;
  /** Time from rest to 95% of terminal velocity (drag only). */
  timeTo95: number | null;
  averageSpeed: number;
};

/** Typical Cd values at Reynolds numbers of about 10⁴ to 10⁵, as tabulated in fluid mechanics references (White, Fluid Mechanics; Hoerner, Fluid-Dynamic Drag). Flat plate 1.28 per NASA Glenn. Skydiver is a rough figure. */
export const DRAG_SHAPES: { id: string; label: string; cd: number }[] = [
  { id: 'sphere', label: msg('Sphere (0.47)'), cd: 0.47 },
  { id: 'half-sphere', label: msg('Half sphere (0.42)'), cd: 0.42 },
  { id: 'cone', label: msg('Cone (0.50)'), cd: 0.5 },
  { id: 'cube', label: msg('Cube, face on (1.05)'), cd: 1.05 },
  { id: 'angled-cube', label: msg('Cube, edge on (0.80)'), cd: 0.8 },
  { id: 'long-cylinder', label: msg('Long cylinder, end on (0.82)'), cd: 0.82 },
  { id: 'short-cylinder', label: msg('Short cylinder, end on (1.15)'), cd: 1.15 },
  { id: 'flat-plate', label: msg('Flat plate, face on (1.28)'), cd: 1.28 },
  { id: 'streamlined', label: msg('Streamlined body (0.04)'), cd: 0.04 },
  { id: 'skydiver', label: msg('Skydiver, belly to earth (≈1.0)'), cd: 1.0 },
  { id: 'custom', label: msg('Custom'), cd: NaN },
];

/** Air density at sea level in the ICAO/ISO standard atmosphere (15 °C, 101.325 kPa), kg/m³. */
export const ISA_AIR_DENSITY = 1.225;

export function terminalVelocity(d: DragInput, g: number): number {
  return Math.sqrt((2 * d.mass * g) / (d.airDensity * d.cd * d.area));
}

/** atanh / acoth helpers for the quadratic-drag solution in units of terminal velocity. */
const atanh = (x: number) => 0.5 * Math.log((1 + x) / (1 - x));
const acoth = (x: number) => 0.5 * Math.log((x + 1) / (x - 1));

/** Speed after falling `h` metres from initial speed v0 with quadratic drag: v² = vt² + (v0² − vt²)·e^(−2gh/vt²). */
function dragSpeedAtHeight(h: number, v0: number, vt: number, g: number) {
  return Math.sqrt(vt * vt + (v0 * v0 - vt * vt) * Math.exp((-2 * g * h) / (vt * vt)));
}
/** Time to go from speed v0 to v (same side of vt) with quadratic drag. */
function dragTimeBetween(v0: number, v: number, vt: number, g: number) {
  if (Math.abs(v0 - vt) < 1e-12 * vt) return NaN; // handled by caller
  if (v0 < vt) return (vt / g) * (atanh(Math.min(v / vt, 1 - 1e-16)) - atanh(v0 / vt));
  return (vt / g) * (acoth(Math.max(v / vt, 1 + 1e-16)) - acoth(v0 / vt));
}
/** ln cosh x and ln sinh x (x > 0), computed stably for large x. */
const lnCosh = (x: number) => Math.abs(x) + Math.log1p(Math.exp(-2 * Math.abs(x))) - Math.LN2;
const lnSinh = (x: number) => x + Math.log1p(-Math.exp(-2 * x)) - Math.LN2;
/** Speed and distance after time t with quadratic drag. */
function dragAtTime(t: number, v0: number, vt: number, g: number): { v: number; h: number } {
  const s = (g * t) / vt;
  if (Math.abs(v0 - vt) < 1e-12 * vt) return { v: vt, h: vt * t };
  if (v0 < vt) {
    const a = atanh(v0 / vt);
    // ln(cosh(s + a) / cosh(a)) computed stably for large s.
    return { v: vt * Math.tanh(s + a), h: ((vt * vt) / g) * (lnCosh(s + a) - lnCosh(a)) };
  }
  const b = acoth(v0 / vt);
  return { v: vt / Math.tanh(s + b), h: ((vt * vt) / g) * (lnSinh(s + b) - lnSinh(b)) };
}
/**
 * Time to fall h metres from v0 with quadratic drag: dragAtTime's h(t) inverted in
 * log space (acosh(e^Y) = Y + ln(1 + √(1 − e^−2Y)), asinh(e^Y) = Y + ln(1 + √(1 + e^−2Y))),
 * so long drops whose speed has rounded to vt still get the right time.
 */
function dragTimeForHeight(h: number, v0: number, vt: number, g: number): number {
  const y = (g * h) / (vt * vt);
  if (v0 < vt) {
    const a = atanh(v0 / vt);
    const Y = y + lnCosh(a);
    return (vt / g) * (Y + Math.log1p(Math.sqrt(-Math.expm1(-2 * Y))) - a);
  }
  const b = acoth(v0 / vt);
  const Y = y + lnSinh(b);
  return (vt / g) * (Y + Math.log1p(Math.sqrt(1 + Math.exp(-2 * Y))) - b);
}

export function freeFall(inp: FallInput): Result<FallResult> {
  const { solve, given, v0, g, drag } = inp;
  if (!isNum(given)) return fail(msg('Enter the known value.'));
  if (!isNum(v0) || v0 < 0) return fail(msg('Initial downward speed cannot be negative.'));
  if (!isNum(g) || g <= 0) return fail(msg('Gravity must be greater than zero.'));
  if (solve === 'velocity' ? given <= v0 : given <= 0)
    return fail(solve === 'velocity' ? 'Impact speed must be greater than the initial speed.' : solve === 'height' ? 'Height must be greater than zero.' : 'Time must be greater than zero.');

  // Vacuum: h = v0 t + ½ g t², v = v0 + g t.
  const vac = (() => {
    if (solve === 'height') {
      const v = Math.sqrt(v0 * v0 + 2 * g * given);
      return { h: given, t: (v - v0) / g, v };
    }
    if (solve === 'time') return { h: v0 * given + 0.5 * g * given * given, t: given, v: v0 + g * given };
    return { h: (given * given - v0 * v0) / (2 * g), t: (given - v0) / g, v: given };
  })();

  if (!drag) {
    return ok({ height: vac.h, time: vac.t, velocity: vac.v, vacuumTime: vac.t, vacuumVelocity: vac.v, terminalVelocity: null, timeTo95: null, averageSpeed: vac.h / vac.t });
  }
  const { mass, cd, area, airDensity } = drag;
  if (![mass, cd, area, airDensity].every((x) => isNum(x) && x > 0)) return fail(msg('Mass, drag coefficient, area and air density must all be greater than zero.'));
  const vt = terminalVelocity(drag, g);
  const atVt = Math.abs(v0 - vt) < 1e-12 * vt;
  let h: number, t: number, v: number;
  if (solve === 'height') {
    h = given;
    v = atVt ? vt : dragSpeedAtHeight(h, v0, vt, g);
    t = atVt ? h / vt : dragTimeForHeight(h, v0, vt, g);
  } else if (solve === 'time') {
    t = given;
    const r = dragAtTime(t, v0, vt, g);
    v = r.v;
    h = r.h;
  } else {
    v = given;
    if (v0 <= vt && v >= vt) return fail(msg('With drag the object can never reach {v} m/s: its terminal velocity is {vt} m/s.'), { v: v.toPrecision(4), vt: vt.toPrecision(4) });
    if (v0 > vt) return fail(msg('Starting faster than terminal velocity, the object slows down; solve by height or time instead.'));
    h = ((vt * vt) / (2 * g)) * Math.log((vt * vt - v0 * v0) / (vt * vt - v * v));
    t = dragTimeBetween(v0, v, vt, g);
  }
  // Vacuum comparison over the same height.
  const vacV = Math.sqrt(v0 * v0 + 2 * g * h);
  const timeTo95 = (vt / g) * atanh(0.95);
  return ok({ height: h, time: t, velocity: v, vacuumTime: (vacV - v0) / g, vacuumVelocity: vacV, terminalVelocity: vt, timeTo95, averageSpeed: h / t });
}

/** Speed–time samples for the chart: vacuum and (if given) quadratic drag, from 0 to tMax. */
export function fallSpeedSeries(v0: number, g: number, tMax: number, drag?: DragInput | null, n = 50): { t: number; vacuum: number; drag?: number }[] {
  const vt = drag ? terminalVelocity(drag, g) : null;
  const out: { t: number; vacuum: number; drag?: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const t = (tMax * k) / n;
    out.push(vt ? { t, vacuum: v0 + g * t, drag: dragAtTime(t, v0, vt, g).v } : { t, vacuum: v0 + g * t });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Force                                                                */
/* ------------------------------------------------------------------ */

export type NewtonKey = 'force' | 'mass' | 'acceleration';
export function solveNewton(solve: NewtonKey, v: { force?: number; mass?: number; acceleration?: number }): Result<{ force: number; mass: number; acceleration: number }> {
  const need = (['force', 'mass', 'acceleration'] as NewtonKey[]).filter((k) => k !== solve);
  for (const k of need) {
    if (!isNum(v[k])) return fail(ENTER_THE[k]);
    if (k === 'mass' && v[k]! <= 0) return fail(msg('Mass must be greater than zero.'));
  }
  let { force, mass, acceleration } = v as { force: number; mass: number; acceleration: number };
  if (solve === 'force') force = mass * acceleration;
  else if (solve === 'mass') {
    if (acceleration === 0) return fail(msg('Acceleration must be non-zero to solve for mass.'));
    mass = force / acceleration;
    if (mass <= 0) return fail(msg('Force and acceleration must point the same way to give a positive mass.'));
  } else acceleration = force / mass;
  return ok({ force, mass, acceleration });
}

/** Static and kinetic friction coefficients (dry unless stated), from Serway & Jewett, Physics for Scientists and Engineers, Table 5.1. Approximate. */
export const FRICTION_PAIRS: { id: string; label: string; us: number | null; uk: number }[] = [
  { id: 'rubber-concrete', label: msg('Rubber on dry concrete'), us: 1.0, uk: 0.8 },
  { id: 'steel-steel', label: msg('Steel on steel'), us: 0.74, uk: 0.57 },
  { id: 'aluminum-steel', label: msg('Aluminium on steel'), us: 0.61, uk: 0.47 },
  { id: 'glass-glass', label: msg('Glass on glass'), us: 0.94, uk: 0.4 },
  { id: 'copper-steel', label: msg('Copper on steel'), us: 0.53, uk: 0.36 },
  { id: 'wood-wood', label: msg('Wood on wood'), us: 0.25, uk: 0.2 },
  { id: 'wood-wet-snow', label: msg('Waxed wood on wet snow'), us: 0.14, uk: 0.1 },
  { id: 'metal-lubricated', label: msg('Metal on metal, lubricated'), us: 0.15, uk: 0.06 },
  { id: 'teflon', label: msg('Teflon on Teflon'), us: 0.04, uk: 0.04 },
  { id: 'ice-ice', label: msg('Ice on ice'), us: 0.1, uk: 0.03 },
];

export type FrictionInput = { mass: number; g: number; angleDeg: number; mu: number; muStatic?: number | null; appliedForce?: number };
export type FrictionResult = {
  weight: number;
  normal: number;
  /** Weight component along the slope, N. */
  downslope: number;
  /** Kinetic friction force μk·N, N. */
  kinetic: number;
  /** Maximum static friction μs·N, N (if μs given). */
  maxStatic: number | null;
  /** Whether the block starts sliding by itself (tan θ > μs). Null if μs not given. */
  slidesOnItsOwn: boolean | null;
  /** Angle of repose atan(μs), degrees. */
  reposeAngleDeg: number | null;
  /** Acceleration down the slope once sliding, m/s² (0 if friction wins). */
  slideAcceleration: number;
  /** Force along the surface needed to push it up the slope at constant speed, N. */
  pushUp: number;
  /** Force along the surface needed to start it moving on the flat or up the slope (uses μs if given). */
  breakaway: number;
};

export function friction(inp: FrictionInput): Result<FrictionResult> {
  const { mass, g, angleDeg, mu } = inp;
  const muS = inp.muStatic ?? null;
  if (!isNum(mass) || mass <= 0) return fail(msg('Mass must be greater than zero.'));
  if (!isNum(g) || g <= 0) return fail(msg('Gravity must be greater than zero.'));
  if (!isNum(angleDeg) || angleDeg < 0 || angleDeg >= 90) return fail(msg('Slope angle must be from 0° up to (not including) 90°.'));
  if (!isNum(mu) || mu < 0) return fail(msg('The kinetic friction coefficient cannot be negative.'));
  if (muS !== null && (!isNum(muS) || muS < 0)) return fail(msg('The static friction coefficient cannot be negative.'));
  const a = (angleDeg * Math.PI) / 180;
  const weight = mass * g;
  const normal = weight * Math.cos(a);
  const downslope = weight * Math.sin(a);
  const kinetic = mu * normal;
  const maxStatic = muS === null ? null : muS * normal;
  const slidesOnItsOwn = muS === null ? null : downslope > maxStatic! + 1e-12;
  const slideAcceleration = Math.max(0, g * (Math.sin(a) - mu * Math.cos(a)));
  return ok({
    weight,
    normal,
    downslope,
    kinetic,
    maxStatic,
    slidesOnItsOwn,
    reposeAngleDeg: muS === null ? null : (Math.atan(muS) * 180) / Math.PI,
    slideAcceleration,
    pushUp: downslope + kinetic,
    breakaway: downslope + (maxStatic ?? kinetic),
  });
}

/* ------------------------------------------------------------------ */
/* Density                                                              */
/* ------------------------------------------------------------------ */

export type DensityKey = 'density' | 'mass' | 'volume';
export function solveDensity(solve: DensityKey, v: { density?: number; mass?: number; volume?: number }): Result<{ density: number; mass: number; volume: number; specificGravity: number }> {
  const need = (['density', 'mass', 'volume'] as DensityKey[]).filter((k) => k !== solve);
  for (const k of need) {
    if (!isNum(v[k])) return fail(ENTER_THE[k]);
    if (v[k]! <= 0) return fail(MUST_BE_POSITIVE[k]);
  }
  let { density, mass, volume } = v as { density: number; mass: number; volume: number };
  if (solve === 'density') density = mass / volume;
  else if (solve === 'mass') mass = density * volume;
  else volume = mass / density;
  return ok({ density, mass, volume, specificGravity: density / WATER_DENSITY_4C });
}

/** Maximum density of water (about 4 °C), kg/m³, the reference for specific gravity. */
export const WATER_DENSITY_4C = 999.97;

/**
 * Density of air-free water at temperature t (°C), kg/m³, from the Tanaka et al.
 * (2001) formula adopted by CIPM. Valid 0 to 40 °C at 101.325 kPa.
 */
export function waterDensity(tC: number): number {
  const a1 = -3.98303,
    a2 = 301.797,
    a3 = 522528.9,
    a4 = 69.34881,
    a5 = 999.97495;
  return a5 * (1 - ((tC + a1) ** 2 * (tC + a2)) / (a3 * (tC + a4)));
}

/** Hydrostatic weighing: density from mass in air and apparent mass when fully submerged in a fluid. */
export function archimedesDensity(massInAir: number, massSubmerged: number, fluidDensity: number): Result<{ density: number; volume: number; buoyantMass: number; specificGravity: number }> {
  if (![massInAir, massSubmerged, fluidDensity].every(isNum)) return fail(msg('Enter both weighings and the fluid density.'));
  if (massInAir <= 0) return fail(msg('The mass in air must be greater than zero.'));
  if (fluidDensity <= 0) return fail(msg('Fluid density must be greater than zero.'));
  if (massSubmerged >= massInAir) return fail(msg('The submerged reading must be lower than the reading in air (the object must sink and be fully under the fluid).'));
  const buoyantMass = massInAir - massSubmerged;
  const volume = buoyantMass / fluidDensity;
  const density = massInAir / volume;
  return ok({ density, volume, buoyantMass, specificGravity: density / WATER_DENSITY_4C });
}

/**
 * Typical densities at about 20 °C and 1 atm, kg/m³. Pure substances and
 * elements follow the CRC Handbook of Chemistry and Physics; alloys, woods,
 * plastics, fuels and building materials are typical values from supplier
 * data and vary by grade, so they are labelled "typical".
 */
export const MATERIALS: { id: string; name: string; group: string; density: number; note?: string }[] = [
  { id: 'water', name: msg('Water (20 °C)'), group: 'Liquids', density: 998.21 },
  { id: 'seawater', name: msg('Seawater (typical)'), group: 'Liquids', density: 1025 },
  { id: 'ethanol', name: msg('Ethanol'), group: 'Liquids', density: 789.3 },
  { id: 'gasoline', name: msg('Petrol / gasoline (typical)'), group: 'Liquids', density: 745, note: msg('720 to 775 by blend') },
  { id: 'diesel', name: msg('Diesel (typical)'), group: 'Liquids', density: 832, note: '820 to 845 (EN 590)' },
  { id: 'olive-oil', name: msg('Olive oil (typical)'), group: 'Liquids', density: 915 },
  { id: 'milk', name: msg('Milk, whole (typical)'), group: 'Liquids', density: 1030 },
  { id: 'honey', name: msg('Honey (typical)'), group: 'Liquids', density: 1420 },
  { id: 'glycerol', name: msg('Glycerol'), group: 'Liquids', density: 1261 },
  { id: 'mercury', name: msg('Mercury'), group: 'Liquids', density: 13546 },
  { id: 'air', name: msg('Air (20 °C, 1 atm)'), group: 'Gases', density: 1.204 },
  { id: 'helium', name: msg('Helium (20 °C, 1 atm)'), group: 'Gases', density: 0.1664 },
  { id: 'co2', name: msg('Carbon dioxide (20 °C, 1 atm)'), group: 'Gases', density: 1.842 },
  { id: 'aluminium', name: msg('Aluminium'), group: 'Metals', density: 2700 },
  { id: 'titanium', name: msg('Titanium'), group: 'Metals', density: 4506 },
  { id: 'iron', name: msg('Iron'), group: 'Metals', density: 7874 },
  { id: 'steel', name: msg('Carbon steel (typical)'), group: 'Metals', density: 7850 },
  { id: 'stainless', name: msg('Stainless steel 304 (typical)'), group: 'Metals', density: 8000 },
  { id: 'brass', name: msg('Brass (typical)'), group: 'Metals', density: 8500 },
  { id: 'copper', name: msg('Copper'), group: 'Metals', density: 8960 },
  { id: 'silver', name: msg('Silver'), group: 'Metals', density: 10490 },
  { id: 'lead', name: msg('Lead'), group: 'Metals', density: 11340 },
  { id: 'gold', name: msg('Gold'), group: 'Metals', density: 19300 },
  { id: 'platinum', name: msg('Platinum'), group: 'Metals', density: 21450 },
  { id: 'ice', name: msg('Ice (0 °C)'), group: 'Other solids', density: 917 },
  { id: 'concrete', name: msg('Concrete (typical)'), group: 'Other solids', density: 2400 },
  { id: 'glass', name: msg('Glass, soda-lime (typical)'), group: 'Other solids', density: 2500 },
  { id: 'granite', name: msg('Granite (typical)'), group: 'Other solids', density: 2700 },
  { id: 'oak', name: msg('Oak, dry (typical)'), group: 'Wood', density: 750, note: '600 to 900' },
  { id: 'pine', name: msg('Pine, dry (typical)'), group: 'Wood', density: 500, note: '350 to 650' },
  { id: 'balsa', name: msg('Balsa (typical)'), group: 'Wood', density: 160 },
  { id: 'cork', name: msg('Cork (typical)'), group: 'Wood', density: 240 },
  { id: 'pla', name: msg('PLA plastic (typical)'), group: 'Plastics', density: 1240 },
  { id: 'abs', name: msg('ABS plastic (typical)'), group: 'Plastics', density: 1050 },
  { id: 'hdpe', name: msg('HDPE (typical)'), group: 'Plastics', density: 950 },
  { id: 'pvc', name: msg('PVC, rigid (typical)'), group: 'Plastics', density: 1380 },
];

/** Materials whose density is closest to `density` (kg/m³), nearest first. */
export function closestMaterials(density: number, n = 3) {
  return [...MATERIALS]
    .map((m) => ({ ...m, ratio: density / m.density }))
    .sort((a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio)))
    .slice(0, n);
}

/* ------------------------------------------------------------------ */
/* Waves: wavelength, frequency, period, photon energy                  */
/* ------------------------------------------------------------------ */

/** Speed of sound in dry air treated as an ideal gas: √(γRT/M), γ = 1.4, M = 28.9647 g/mol. */
export function speedOfSoundAir(tC: number): number {
  return Math.sqrt((1.4 * GAS_R * (tC + 273.15)) / 0.0289647);
}

export const WAVE_MEDIA: { id: string; label: string; kind: 'em' | 'sound'; speed?: number; note?: string }[] = [
  { id: 'vacuum', label: msg('Light in vacuum (c)'), kind: 'em', speed: C_LIGHT },
  { id: 'light-medium', label: msg('Light in a medium (refractive index n)'), kind: 'em' },
  { id: 'air-sound', label: msg('Sound in air (set temperature)'), kind: 'sound' },
  { id: 'water-sound', label: msg('Sound in fresh water, 20 °C (1482 m/s)'), kind: 'sound', speed: 1482 },
  { id: 'seawater-sound', label: msg('Sound in seawater (≈1500 m/s)'), kind: 'sound', speed: 1500 },
  { id: 'steel-sound', label: msg('Sound in steel, longitudinal (≈5900 m/s)'), kind: 'sound', speed: 5900 },
  { id: 'custom', label: msg('Custom wave speed'), kind: 'sound' },
];

export type WaveSolve = 'frequency' | 'wavelength' | 'period' | 'energy';
export type WaveResult = {
  speed: number;
  frequency: number;
  wavelength: number;
  period: number;
  angularFrequency: number;
  /** Spectroscopic wavenumber 1/λ, per metre. */
  wavenumber: number;
  /** Photon energy E = hf, J (meaningful for light). */
  photonEnergy: number;
  photonEnergyEv: number;
};

/** Given one of frequency (Hz), wavelength (m), period (s) or photon energy (J), and the wave speed, return the rest. */
export function solveWave(from: WaveSolve, value: number, speed: number): Result<WaveResult> {
  if (!isNum(value) || value <= 0) return fail(msg('Enter a value greater than zero.'));
  if (!isNum(speed) || speed <= 0) return fail(msg('Wave speed must be greater than zero.'));
  let f: number;
  if (from === 'frequency') f = value;
  else if (from === 'wavelength') f = speed / value;
  else if (from === 'period') f = 1 / value;
  else f = value / PLANCK;
  const wavelength = speed / f;
  const photonEnergy = PLANCK * f;
  return ok({
    speed,
    frequency: f,
    wavelength,
    period: 1 / f,
    angularFrequency: 2 * Math.PI * f,
    wavenumber: 1 / wavelength,
    photonEnergy,
    photonEnergyEv: photonEnergy / E_CHARGE,
  });
}

/** ITU-R V.431 band designations, band N spans 0.3×10^N to 3×10^N Hz. */
const ITU_BANDS: [number, string, string][] = [
  [1, 'ELF', msg('extremely low frequency')],
  [2, 'SLF', msg('super low frequency')],
  [3, 'ULF', msg('ultra low frequency')],
  [4, 'VLF', msg('very low frequency')],
  [5, 'LF', msg('low frequency')],
  [6, 'MF', msg('medium frequency')],
  [7, 'HF', msg('high frequency')],
  [8, 'VHF', msg('very high frequency')],
  [9, 'UHF', msg('ultra high frequency')],
  [10, 'SHF', msg('super high frequency')],
  [11, 'EHF', msg('extremely high frequency')],
  [12, 'THF', msg('tremendously high frequency')],
];

export function ituBand(fHz: number): { band: number; short: string; name: string } | null {
  for (const [n, short, name] of ITU_BANDS) {
    if (fHz >= 0.3 * 10 ** n && fHz < 3 * 10 ** n) return { band: n, short, name };
  }
  return null;
}

/**
 * Electromagnetic region for a vacuum wavelength (m). Edges follow common
 * conventions: CIE UV-A/B/C, a 380 to 750 nm visible band, ISO 20473 infrared
 * sub-bands and 1 mm / 1 m for microwaves. Band edges are conventions, not
 * physical boundaries.
 */
export function emRegion(lambda: number): { region: string; detail?: string } {
  const nm = lambda * 1e9;
  if (nm < 0.01) return { region: msg('Gamma rays') };
  if (nm < 10) return { region: msg('X-rays'), detail: nm < 0.1 ? msg('hard X-ray') : msg('soft X-ray') };
  if (nm < 380) {
    const detail = nm < 100 ? msg('extreme/vacuum UV') : nm < 280 ? 'UV-C' : nm < 315 ? 'UV-B' : 'UV-A';
    return { region: msg('Ultraviolet'), detail };
  }
  if (nm <= 750) return { region: msg('Visible light'), detail: visibleColour(nm) };
  if (nm < 1e6) {
    const um = nm / 1000;
    const detail = um < 3 ? msg('near infrared') : um < 50 ? msg('mid infrared') : msg('far infrared');
    return { region: msg('Infrared'), detail };
  }
  if (nm < 1e9) return { region: msg('Microwave') };
  return { region: msg('Radio') };
}

export function visibleColour(nm: number): string {
  if (nm < 450) return msg('violet');
  if (nm < 495) return msg('blue');
  if (nm < 570) return msg('green');
  if (nm < 590) return msg('yellow');
  if (nm < 620) return msg('orange');
  return msg('red');
}

/** Approximate sRGB colour of monochromatic light (Bruton's piecewise approximation), for a swatch. */
export function wavelengthToRgb(nm: number): string | null {
  if (nm < 380 || nm > 750) return null;
  let r = 0,
    g = 0,
    b = 0;
  if (nm < 440) {
    r = -(nm - 440) / 60;
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / 65;
  } else r = 1;
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / 50 : 1;
  const c = (x: number) => Math.round(255 * Math.pow(x * f, 0.8));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

/** Hearing band for a sound frequency. */
export function soundBand(fHz: number): string {
  if (fHz < 20) return msg('Infrasound (below human hearing)');
  if (fHz <= 20000) return msg('Audible range (20 Hz to 20 kHz)');
  return msg('Ultrasound (above human hearing)');
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** Nearest 12-tone equal temperament note to a frequency, with A4 = 440 Hz (ISO 16). */
export function nearestNote(fHz: number, a4 = 440): { name: string; octave: number; cents: number; exact: number } | null {
  if (!(fHz > 0)) return null;
  const semis = 12 * Math.log2(fHz / a4);
  const n = Math.round(semis);
  const midi = 69 + n;
  if (midi < 0 || midi > 127) return null;
  return { name: NOTE_NAMES[midi % 12], octave: Math.floor(midi / 12) - 1, cents: Math.round((semis - n) * 100), exact: a4 * 2 ** (n / 12) };
}

/* ------------------------------------------------------------------ */
/* Ideal gas law                                                        */
/* ------------------------------------------------------------------ */

export type GasKey = 'pressure' | 'volume' | 'moles' | 'temperature';
export type GasValues = {
  pressure: number;
  volume: number;
  moles: number;
  temperature: number;
  molecules: number;
  /** Volume per mole, m³/mol. */
  molarVolume: number;
  /** Mass and density if a molar mass (kg/mol) is supplied. */
  mass: number | null;
  density: number | null;
};

/** Molar masses of common gases, g/mol (IUPAC standard atomic weights; dry air per ISO 2533). */
export const GASES: { id: string; label: string; molarMass: number }[] = [
  { id: 'air', label: msg('Dry air (28.9644)'), molarMass: 28.9644 },
  { id: 'n2', label: msg('Nitrogen N₂ (28.014)'), molarMass: 28.014 },
  { id: 'o2', label: msg('Oxygen O₂ (31.998)'), molarMass: 31.998 },
  { id: 'co2', label: msg('Carbon dioxide CO₂ (44.009)'), molarMass: 44.009 },
  { id: 'he', label: msg('Helium He (4.0026)'), molarMass: 4.0026 },
  { id: 'h2', label: msg('Hydrogen H₂ (2.016)'), molarMass: 2.016 },
  { id: 'ar', label: msg('Argon Ar (39.948)'), molarMass: 39.948 },
  { id: 'ch4', label: msg('Methane CH₄ (16.043)'), molarMass: 16.043 },
  { id: 'c3h8', label: msg('Propane C₃H₈ (44.097)'), molarMass: 44.097 },
  { id: 'h2o', label: msg('Water vapour H₂O (18.015)'), molarMass: 18.015 },
  { id: 'custom', label: msg('Custom molar mass'), molarMass: NaN },
];

/** Solve PV = nRT (SI: Pa, m³, mol, K) for the missing one. Molar mass in kg/mol is optional. */
export function solveIdealGas(solve: GasKey, v: { pressure?: number; volume?: number; moles?: number; temperature?: number }, molarMass?: number | null): Result<GasValues> {
  const need = (['pressure', 'volume', 'moles', 'temperature'] as GasKey[]).filter((k) => k !== solve);
  for (const k of need) {
    if (!isNum(v[k])) return fail(ENTER_THE[k]);
    if (v[k]! <= 0) return fail(k === 'temperature' ? msg('Absolute temperature must be above 0 K (−273.15 °C).') : k === 'pressure' ? msg('Absolute pressure must be greater than zero.') : MUST_BE_POSITIVE[k]);
  }
  let { pressure: P, volume: V, moles: n, temperature: T } = v as { pressure: number; volume: number; moles: number; temperature: number };
  if (solve === 'pressure') P = (n * GAS_R * T) / V;
  else if (solve === 'volume') V = (n * GAS_R * T) / P;
  else if (solve === 'moles') n = (P * V) / (GAS_R * T);
  else T = (P * V) / (n * GAS_R);
  const M = isNum(molarMass) && molarMass > 0 ? molarMass : null;
  return ok({
    pressure: P,
    volume: V,
    moles: n,
    temperature: T,
    molecules: n * AVOGADRO,
    molarVolume: V / n,
    mass: M ? n * M : null,
    density: M ? (n * M) / V : null,
  });
}

export type CombinedKey = 'p1' | 'v1' | 't1' | 'p2' | 'v2' | 't2';
/** Combined gas law P1V1/T1 = P2V2/T2 (fixed amount of gas). Any consistent pressure/volume units; temperatures in kelvin. */
export function solveCombinedGas(solve: CombinedKey, v: Partial<Record<CombinedKey, number>>): Result<Record<CombinedKey, number>> {
  const keys: CombinedKey[] = ['p1', 'v1', 't1', 'p2', 'v2', 't2'];
  for (const k of keys.filter((x) => x !== solve)) {
    if (!isNum(v[k])) return fail(msg('Enter {k}.'), { k: k.toUpperCase() });
    if (v[k]! <= 0) return fail(k.startsWith('t') ? 'Absolute temperatures must be above 0 K.' : 'Pressures and volumes must be greater than zero.');
  }
  const x: Record<CombinedKey, number> = { p1: v.p1 ?? NaN, v1: v.v1 ?? NaN, t1: v.t1 ?? NaN, p2: v.p2 ?? NaN, v2: v.v2 ?? NaN, t2: v.t2 ?? NaN };
  const lhs = (x.p1 * x.v1) / x.t1;
  const rhs = (x.p2 * x.v2) / x.t2;
  switch (solve) {
    case 'p1':
      x.p1 = (rhs * x.t1) / x.v1;
      break;
    case 'v1':
      x.v1 = (rhs * x.t1) / x.p1;
      break;
    case 't1':
      x.t1 = (x.p1 * x.v1) / rhs;
      break;
    case 'p2':
      x.p2 = (lhs * x.t2) / x.v2;
      break;
    case 'v2':
      x.v2 = (lhs * x.t2) / x.p2;
      break;
    case 't2':
      x.t2 = (x.p2 * x.v2) / lhs;
      break;
  }
  return ok(x);
}

/* ------------------------------------------------------------------ */
/* pH                                                                   */
/* ------------------------------------------------------------------ */

/** pKw of water at 25 °C (Kw = 1.0 × 10⁻¹⁴). */
export const PKW_25C = 14.0;

export type AcidSystem = {
  /** pKa values of the fully protonated form, in order (empty for a plain strong acid/base). */
  pKas: number[];
  /** Charge of the fully protonated form: 0 for HA, H₂A; +1 for BH⁺ (weak bases). */
  z0: number;
};

export type SpeciesPreset = {
  id: string;
  label: string;
  kind: 'strong-acid' | 'strong-base' | 'weak-acid' | 'weak-base';
  /** Strong acids: protons released per formula unit (all strong); strong bases: OH⁻ per formula unit. */
  equivalents?: number;
  /** Weak systems (and H₂SO₄'s second proton). */
  system?: AcidSystem;
  note?: string;
};

/**
 * Acid and base presets. pKa values at 25 °C as commonly tabulated (CRC
 * Handbook of Chemistry and Physics, "Dissociation constants of inorganic/organic
 * acids and bases"); weak bases are entered by the pKa of their conjugate acid.
 */
export const SPECIES: SpeciesPreset[] = [
  { id: 'hcl', label: msg('Hydrochloric acid HCl (strong)'), kind: 'strong-acid', equivalents: 1 },
  { id: 'hno3', label: msg('Nitric acid HNO₃ (strong)'), kind: 'strong-acid', equivalents: 1 },
  { id: 'hbr', label: msg('Hydrobromic acid HBr (strong)'), kind: 'strong-acid', equivalents: 1 },
  { id: 'hclo4', label: msg('Perchloric acid HClO₄ (strong)'), kind: 'strong-acid', equivalents: 1 },
  { id: 'h2so4', label: msg('Sulfuric acid H₂SO₄ (pKa₂ 1.99)'), kind: 'weak-acid', system: { pKas: [-3, 1.99], z0: 0 }, note: msg('First proton strong, second pKa 1.99.') },
  { id: 'naoh', label: msg('Sodium hydroxide NaOH (strong)'), kind: 'strong-base', equivalents: 1 },
  { id: 'koh', label: msg('Potassium hydroxide KOH (strong)'), kind: 'strong-base', equivalents: 1 },
  { id: 'caoh2', label: msg('Calcium hydroxide Ca(OH)₂ (strong)'), kind: 'strong-base', equivalents: 2 },
  { id: 'baoh2', label: msg('Barium hydroxide Ba(OH)₂ (strong)'), kind: 'strong-base', equivalents: 2 },
  { id: 'acetic', label: msg('Acetic acid CH₃COOH (pKa 4.76)'), kind: 'weak-acid', system: { pKas: [4.76], z0: 0 } },
  { id: 'formic', label: msg('Formic acid HCOOH (pKa 3.75)'), kind: 'weak-acid', system: { pKas: [3.75], z0: 0 } },
  { id: 'lactic', label: msg('Lactic acid (pKa 3.86)'), kind: 'weak-acid', system: { pKas: [3.86], z0: 0 } },
  { id: 'benzoic', label: msg('Benzoic acid (pKa 4.20)'), kind: 'weak-acid', system: { pKas: [4.2], z0: 0 } },
  { id: 'hf', label: msg('Hydrofluoric acid HF (pKa 3.17)'), kind: 'weak-acid', system: { pKas: [3.17], z0: 0 } },
  { id: 'hcn', label: msg('Hydrocyanic acid HCN (pKa 9.21)'), kind: 'weak-acid', system: { pKas: [9.21], z0: 0 } },
  { id: 'boric', label: msg('Boric acid (pKa 9.24)'), kind: 'weak-acid', system: { pKas: [9.24], z0: 0 } },
  { id: 'carbonic', label: msg('Carbonic acid / CO₂(aq) (6.35, 10.33)'), kind: 'weak-acid', system: { pKas: [6.35, 10.33], z0: 0 } },
  { id: 'phosphoric', label: msg('Phosphoric acid H₃PO₄ (2.15, 7.20, 12.35)'), kind: 'weak-acid', system: { pKas: [2.15, 7.2, 12.35], z0: 0 } },
  { id: 'citric', label: msg('Citric acid (3.13, 4.76, 6.40)'), kind: 'weak-acid', system: { pKas: [3.13, 4.76, 6.4], z0: 0 } },
  { id: 'ammonia', label: msg('Ammonia NH₃ (pKa of NH₄⁺ 9.25)'), kind: 'weak-base', system: { pKas: [9.25], z0: 1 } },
  { id: 'methylamine', label: msg('Methylamine (pKa of conj. acid 10.66)'), kind: 'weak-base', system: { pKas: [10.66], z0: 1 } },
  { id: 'pyridine', label: msg('Pyridine (pKa of conj. acid 5.23)'), kind: 'weak-base', system: { pKas: [5.23], z0: 1 } },
  { id: 'tris', label: msg('Tris base (pKa 8.07)'), kind: 'weak-base', system: { pKas: [8.07], z0: 1 } },
];

export type PhSolution = {
  pH: number;
  pOH: number;
  h: number;
  oh: number;
  /** Fraction of each protonation state, fully protonated first. */
  fractions: number[];
};

/**
 * Exact pH from the charge balance of one acid–base system plus fully
 * dissociated extra ions, solved by bisection on pH:
 *   [H⁺] − [OH⁻] + Ct·Σ αᵢ(z0 − i) + cations − anions = 0
 * Concentrations in mol/L. Activities are taken as concentrations (ideal, dilute).
 */
export function solveChargeBalance(opts: { system?: AcidSystem | null; total?: number; cations?: number; anions?: number; pKw?: number }): Result<PhSolution> {
  const pKw = opts.pKw ?? PKW_25C;
  const Kw = 10 ** -pKw;
  const sys = opts.system ?? null;
  const Ct = opts.total ?? 0;
  const cat = opts.cations ?? 0;
  const an = opts.anions ?? 0;
  if (![pKw, Ct, cat, an].every(isNum)) return fail(msg('Enter valid numbers.'));
  if (Ct < 0 || cat < 0 || an < 0) return fail(msg('Concentrations cannot be negative.'));
  if (sys && !sys.pKas.every(isNum)) return fail(msg('Enter valid pKa values.'));
  const Ks = sys ? sys.pKas.map((p) => 10 ** -p) : [];
  const fractions = (h: number): number[] => {
    // Terms for HnA, Hn-1A, ..., A: h^(n-i) * K1..Ki, normalised. Computed in logs to avoid overflow.
    const n = Ks.length;
    const logs: number[] = [];
    let cum = 0;
    for (let i = 0; i <= n; i++) {
      if (i > 0) cum += Math.log10(Ks[i - 1]);
      logs.push((n - i) * Math.log10(h) + cum);
    }
    const m = Math.max(...logs);
    const t = logs.map((l) => 10 ** (l - m));
    const s = t.reduce((a, b) => a + b, 0);
    return t.map((x) => x / s);
  };
  const f = (pH: number) => {
    const h = 10 ** -pH;
    let q = h - Kw / h + cat - an;
    if (sys && Ct > 0) {
      const a = fractions(h);
      for (let i = 0; i < a.length; i++) q += Ct * a[i] * (sys.z0 - i);
    }
    return q;
  };
  // f decreases as pH rises. Bracket wide enough for 10 M acids and bases.
  let lo = -3,
    hi = pKw + 3;
  if (f(lo) < 0 || f(hi) > 0) return fail(msg('The solution is outside the range this calculator can solve (pH −3 to 17).'));
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  const pH = (lo + hi) / 2;
  const h = 10 ** -pH;
  return ok({ pH, pOH: pKw - pH, h, oh: Kw / h, fractions: sys ? fractions(h) : [] });
}

export type PhForSpecies = PhSolution & {
  /** Fraction of the acid (or base) that has given up (or taken up) a proton, 0 to 1. Null for strong species. */
  ionisedFraction: number | null;
  /** The textbook approximation for comparison: √(Ka·C) etc. Null when it does not apply. */
  approxPH: number | null;
};

/** pH of a solution of one acid or base at concentration c (mol/L). */
export function phOfSpecies(sp: SpeciesPreset, c: number, pKw = PKW_25C): Result<PhForSpecies> {
  if (!isNum(c) || c <= 0) return fail(msg('Concentration must be greater than zero.'));
  if (c > 20) return fail(msg('Concentration above 20 M is outside the range of this model.'));
  let r: Result<PhSolution>;
  if (sp.kind === 'strong-acid') r = solveChargeBalance({ anions: c * (sp.equivalents ?? 1), pKw });
  else if (sp.kind === 'strong-base') r = solveChargeBalance({ cations: c * (sp.equivalents ?? 1), pKw });
  else r = solveChargeBalance({ system: sp.system!, total: c, pKw });
  if (!r.ok) return fail(r.error);
  const s = r.value;
  let ionisedFraction: number | null = null;
  let approxPH: number | null = null;
  if (sp.kind === 'weak-acid' && sp.system) {
    // Fraction of molecules that lost at least one proton.
    ionisedFraction = 1 - s.fractions[0];
    const Ka = 10 ** -sp.system.pKas[sp.system.pKas[0] < 0 ? 1 : 0];
    if (sp.system.pKas[0] >= 0) approxPH = -Math.log10(Math.sqrt(Ka * c));
  } else if (sp.kind === 'weak-base' && sp.system) {
    ionisedFraction = s.fractions[0];
    const Kb = 10 ** -(pKw - sp.system.pKas[0]);
    approxPH = pKw + Math.log10(Math.sqrt(Kb * c));
  } else if (sp.kind === 'strong-acid') approxPH = -Math.log10(c * (sp.equivalents ?? 1));
  else if (sp.kind === 'strong-base') approxPH = pKw + Math.log10(c * (sp.equivalents ?? 1));
  return ok({ ...s, ionisedFraction, approxPH });
}

/** Custom weak acid or base from a pKa (or pKb for bases, converted with pKw). */
export function customSpecies(kind: 'weak-acid' | 'weak-base', pK: number, isPkb = false, pKw = PKW_25C): SpeciesPreset {
  const pKa = kind === 'weak-base' && isPkb ? pKw - pK : pK;
  return { id: 'custom', label: msg('Custom'), kind, system: { pKas: [pKa], z0: kind === 'weak-base' ? 1 : 0 } };
}

export type BufferResult = {
  /** Henderson–Hasselbalch pH = pKa + log10([A⁻]/[HA]). */
  hhPH: number;
  /** Exact pH from the charge balance (includes water and the shift in [HA]/[A⁻]). */
  exactPH: number;
  ratio: number;
  pKa: number;
  /** Van Slyke buffer capacity β = 2.303(Kw/h + h + Ct·Ka·h/(Ka + h)²), mol/(L·pH). */
  capacity: number;
};

/**
 * Buffer of a weak acid HA (concentration ca) and its conjugate base as a sodium
 * salt (concentration cb), mol/L. For a base buffer such as NH₃/NH₄Cl, the
 * "acid" is NH₄⁺ and the "base" is NH₃: pass pKa of NH₄⁺, ca = [NH₄Cl], cb = [NH₃].
 */
export function buffer(pKa: number, ca: number, cb: number, pKw = PKW_25C, baseIsNeutral = false): Result<BufferResult> {
  if (!isNum(pKa)) return fail(msg('Enter the pKa.'));
  if (!isNum(ca) || !isNum(cb) || ca <= 0 || cb <= 0) return fail(msg('Both the acid and the conjugate base concentrations must be greater than zero.'));
  const hhPH = pKa + Math.log10(cb / ca);
  // Acid form HA (z0 = 0) with Na⁺ = cb; or BH⁺ (z0 = +1) with Cl⁻ = ca.
  const r = baseIsNeutral
    ? solveChargeBalance({ system: { pKas: [pKa], z0: 1 }, total: ca + cb, anions: ca, pKw })
    : solveChargeBalance({ system: { pKas: [pKa], z0: 0 }, total: ca + cb, cations: cb, pKw });
  if (!r.ok) return fail(r.error);
  const h = r.value.h;
  const Ka = 10 ** -pKa;
  const Kw = 10 ** -pKw;
  const capacity = Math.LN10 * (Kw / h + h + ((ca + cb) * Ka * h) / (Ka + h) ** 2);
  return ok({ hhPH, exactPH: r.value.pH, ratio: cb / ca, pKa, capacity });
}

/** Base-to-acid ratio [A⁻]/[HA] needed for a target pH (Henderson–Hasselbalch). */
export const bufferRatioFor = (targetPH: number, pKa: number) => 10 ** (targetPH - pKa);

export type PhConvertFrom = 'pH' | 'pOH' | 'h' | 'oh';
/** Convert between pH, pOH, [H⁺] and [OH⁻] (mol/L). */
export function convertPh(from: PhConvertFrom, value: number, pKw = PKW_25C): Result<{ pH: number; pOH: number; h: number; oh: number }> {
  if (!isNum(value)) return fail(msg('Enter a number.'));
  if ((from === 'h' || from === 'oh') && value <= 0) return fail(msg('Concentration must be greater than zero.'));
  let pH: number;
  if (from === 'pH') pH = value;
  else if (from === 'pOH') pH = pKw - value;
  else if (from === 'h') pH = -Math.log10(value);
  else pH = pKw + Math.log10(value);
  return ok({ pH, pOH: pKw - pH, h: 10 ** -pH, oh: 10 ** -(pKw - pH) });
}

export function phLabel(pH: number, pKw = PKW_25C): string {
  const neutral = pKw / 2;
  if (Math.abs(pH - neutral) < 0.005) return 'Neutral';
  if (pH < neutral) return pH < 3 ? msg('Strongly acidic') : pH < 6 ? 'Acidic' : 'Weakly acidic';
  return pH > 11 ? 'Strongly basic' : pH > 8 ? 'Basic' : 'Weakly basic';
}

/** pKw of pure water at temperature (Harned and Owen tabulation of Kw, as reproduced in the CRC Handbook), rounded to 0.01. */
export const PKW_BY_TEMP: { tC: number; pKw: number }[] = [
  { tC: 0, pKw: 14.95 },
  { tC: 10, pKw: 14.53 },
  { tC: 20, pKw: 14.17 },
  { tC: 25, pKw: 14.0 },
  { tC: 30, pKw: 13.83 },
  { tC: 40, pKw: 13.54 },
  { tC: 50, pKw: 13.26 },
  { tC: 60, pKw: 13.02 },
];
