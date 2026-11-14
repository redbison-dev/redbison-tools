/**
 * Fuel injector sizing.
 *   flow per injector (lb/hr) = crank hp × BSFC ÷ (injectors × max duty cycle)
 * BSFC (brake specific fuel consumption, lb/hp·hr) is how much fuel the
 * engine burns per horsepower per hour at full load. Flow scales with the
 * square root of the pressure difference across the injector.
 */

export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const LB_TO_G = 453.59237;
export const HP_PER_KW = 1 / 0.745699872;
export const PSI_PER_BAR = 14.5037738;

export type Induction = 'na' | 'supercharged' | 'turbo';
export type FuelId = 'gasoline' | 'e85' | 'methanol';

/** Typical full-load gasoline BSFC used for injector sizing (lb/hp·hr). */
export const BASE_BSFC: Record<Induction, number> = { na: 0.5, supercharged: 0.55, turbo: 0.6 };

/**
 * Fuel needed relative to gasoline for the same power, and specific gravity for
 * converting mass to volume. Gasoline 0.72 reproduces the trade rule
 * cc/min ≈ lb/hr × 10.5.
 */
export const FUELS: Record<FuelId, { label: string; multiplier: number; sg: number; stoich: number }> = {
  gasoline: { label: 'Gasoline', multiplier: 1, sg: 0.72, stoich: 14.7 },
  e85: { label: 'E85', multiplier: 1.4, sg: 0.78, stoich: 9.8 },
  methanol: { label: 'Methanol', multiplier: 2.2, sg: 0.79, stoich: 6.4 },
};

export function suggestedBsfc(induction: Induction, fuel: FuelId): number {
  return Math.round(BASE_BSFC[induction] * FUELS[fuel].multiplier * 100) / 100;
}

export const lbhrToCcmin = (lbhr: number, sg: number) => (lbhr * LB_TO_G) / 60 / sg;
export const ccminToLbhr = (cc: number, sg: number) => (cc * sg * 60) / LB_TO_G;

/** Flow at a new pressure from a rating at another (orifice law). */
export function flowAtPressure(ratedFlow: number, ratedPressure: number, newPressure: number): number {
  return ratedFlow * Math.sqrt(newPressure / ratedPressure);
}

export type InjectorInput = {
  power: number;
  powerUnit: 'hp' | 'kW';
  /** Is the power measured at the crank or at the wheels? */
  measuredAt: 'crank' | 'wheel';
  drivetrainLossPct: number;
  bsfc: number;
  injectors: number;
  maxDutyPct: number;
  sg: number;
  /** Pressure the injector flow is rated at, and the fuel pressure it will run at (same unit). */
  ratedPressure: number;
  operatingPressure: number;
};

export type InjectorResult = {
  crankHp: number;
  totalFuelLbHr: number;
  perInjectorLbHr: number;
  perInjectorCcMin: number;
  perInjectorGMin: number;
  /** The rating to shop for at the rated pressure, after the pressure correction. */
  ratedLbHr: number;
  ratedCcMin: number;
  pressureFactor: number;
};

export function injectorSize(i: InjectorInput): Result<InjectorResult> {
  if (!(i.power > 0) || i.power > 20000) return fail('Enter engine power above zero.');
  if (!(i.bsfc >= 0.2 && i.bsfc <= 2)) return fail('BSFC should be between 0.20 and 2.00 lb/hp·hr.');
  if (!Number.isInteger(i.injectors) || i.injectors < 1 || i.injectors > 32) return fail('Number of injectors must be a whole number from 1 to 32.');
  if (!(i.maxDutyPct > 0 && i.maxDutyPct <= 100)) return fail('Maximum duty cycle must be above 0% and no more than 100%.');
  if (!(i.drivetrainLossPct >= 0 && i.drivetrainLossPct < 50)) return fail('Drivetrain loss should be between 0% and 50%.');
  if (!(i.sg > 0.5 && i.sg < 1.2)) return fail('Fuel specific gravity should be between 0.5 and 1.2.');
  if (!(i.ratedPressure > 0) || !(i.operatingPressure > 0)) return fail('Fuel pressures must be above zero.');
  const hp = i.powerUnit === 'kW' ? i.power * HP_PER_KW : i.power;
  const crankHp = i.measuredAt === 'wheel' ? hp / (1 - i.drivetrainLossPct / 100) : hp;
  const total = crankHp * i.bsfc;
  const per = total / (i.injectors * (i.maxDutyPct / 100));
  const pressureFactor = Math.sqrt(i.operatingPressure / i.ratedPressure);
  const rated = per / pressureFactor;
  return {
    ok: true,
    value: {
      crankHp,
      totalFuelLbHr: total,
      perInjectorLbHr: per,
      perInjectorCcMin: lbhrToCcmin(per, i.sg),
      perInjectorGMin: (per * LB_TO_G) / 60,
      ratedLbHr: rated,
      ratedCcMin: lbhrToCcmin(rated, i.sg),
      pressureFactor,
    },
  };
}

export type CapacityInput = {
  /** Injector rating at ratedPressure. */
  flow: number;
  flowUnit: 'lbhr' | 'ccmin';
  injectors: number;
  maxDutyPct: number;
  bsfc: number;
  sg: number;
  ratedPressure: number;
  operatingPressure: number;
  drivetrainLossPct: number;
};

/** Maximum power a set of injectors supports. */
export function injectorCapacity(i: CapacityInput): Result<{ flowLbHrAtPressure: number; crankHp: number; crankKw: number; wheelHp: number }> {
  if (!(i.flow > 0)) return fail('Enter the injector flow rating.');
  if (!(i.bsfc >= 0.2 && i.bsfc <= 2)) return fail('BSFC should be between 0.20 and 2.00 lb/hp·hr.');
  if (!Number.isInteger(i.injectors) || i.injectors < 1 || i.injectors > 32) return fail('Number of injectors must be a whole number from 1 to 32.');
  if (!(i.maxDutyPct > 0 && i.maxDutyPct <= 100)) return fail('Maximum duty cycle must be above 0% and no more than 100%.');
  if (!(i.ratedPressure > 0) || !(i.operatingPressure > 0)) return fail('Fuel pressures must be above zero.');
  if (!(i.sg > 0.5 && i.sg < 1.2)) return fail('Fuel specific gravity should be between 0.5 and 1.2.');
  if (!(i.drivetrainLossPct >= 0 && i.drivetrainLossPct < 50)) return fail('Drivetrain loss should be between 0% and 50%.');
  const lbhr = i.flowUnit === 'ccmin' ? ccminToLbhr(i.flow, i.sg) : i.flow;
  const atP = flowAtPressure(lbhr, i.ratedPressure, i.operatingPressure);
  const crankHp = (atP * i.injectors * (i.maxDutyPct / 100)) / i.bsfc;
  return { ok: true, value: { flowLbHrAtPressure: atP, crankHp, crankKw: crankHp / HP_PER_KW, wheelHp: crankHp * (1 - i.drivetrainLossPct / 100) } };
}

/** Common catalogue sizes (cc/min at 3 bar / 43.5 psi) to suggest the next size up. */
export const COMMON_SIZES_CC = [190, 220, 240, 310, 380, 440, 550, 650, 750, 850, 1000, 1150, 1300, 1650, 2000, 2200, 2600];

export function nextCommonSize(ccMin: number): number | null {
  return COMMON_SIZES_CC.find((s) => s >= ccMin) ?? null;
}
