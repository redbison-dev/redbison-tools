/**
 * The Retirement Calculator's plan (savings needed against savings projected),
 * moved out of the component so the page, its working steps
 * (src/lib/tools/steps/s7.ts) and the tests use the same code.
 */
import {
  projectRetirementSavings, computeRetirementNeed, monthlyIncomeFromSavings,
  type RetirementProjectionRow, type RetirementNeed,
} from '../retirement-calculator';

export interface RetirementPlanInput {
  householdType: string;
  spouseSocialSecurity: number;
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  monthlyExpenses: number;
  inflationRate: number;
  retirementIncomeRatio: number;
  currentSavings: number;
  monthlyContribution: number;
  annualIncrease: number;
  expectedReturn: number;
  socialSecurityBenefit: number;
  employerMatch: number;
  pensionBenefit: number;
  hasKids: boolean;
  numberOfKids: number;
  educationCostPerChild: number;
  marriageFundPerChild: number;
  kidsCurrentAge: number;
  healthInsuranceCost: number;
  longTermCareFund: number;
  healthEmergencyFund: number;
  /**
   * Age the public pension (Social Security, UK State Pension, CPP/OAS, Age
   * Pension) starts. 0 or anything up to the retirement age means it is paid
   * from retirement, as before; a later age leaves a bridge of years that
   * savings must cover alone (the private pension still counts).
   */
  publicPensionAge?: number;
  /**
   * True when the public pension amounts are entered in today's money: they
   * are then raised by inflation to the retirement date, like the spending
   * they offset. False keeps them as entered (the US page's behaviour).
   */
  publicPensionIndexed?: boolean;
}

/** Education costs are inflated at this rate rather than general inflation. */
export const EDUCATION_INFLATION_PCT = 5;

export interface RetirementPlan {
  yearsToRetirement: number;
  yearsInRetirement: number;
  kidsCosts: number;
  healthCosts: number;
  guaranteedMonthlyIncome: number;
  /** Public pension a month at retirement (after inflation when indexed). */
  publicMonthlyIncome: number;
  /** Years between retirement and the public pension's start. */
  bridgeYears: number;
  /** Monthly gap in the bridge years (spending − private pension). */
  bridgeMonthlyGap: number;
  need: RetirementNeed;
  projections: RetirementProjectionRow[];
  finalSavings: number;
  monthlyFromSavings: number;
  onTrack: boolean;
  shortfall: number;
  /** Projected savings above the need (0 when behind). */
  surplus: number;
}

export function retirementPlan(i: RetirementPlanInput): RetirementPlan {
  const yearsToRetirement = i.retirementAge - i.currentAge;
  const yearsInRetirement = Math.max(0, i.lifeExpectancy - i.retirementAge);

  // Kids-related costs that need to be saved before retirement
  let kidsCosts = 0;
  if (i.hasKids) {
    const yearsUntilEducation = Math.max(0, 18 - i.kidsCurrentAge);
    const inflatedEducationCost = i.educationCostPerChild * Math.pow(1 + EDUCATION_INFLATION_PCT / 100, yearsUntilEducation);
    const inflatedMarriageCost = i.marriageFundPerChild * Math.pow(1 + i.inflationRate / 100, Math.max(0, 25 - i.kidsCurrentAge));
    kidsCosts = i.numberOfKids * (inflatedEducationCost + inflatedMarriageCost);
  }
  const healthCosts = i.longTermCareFund + i.healthEmergencyFund;
  // Guaranteed monthly income reduces what savings must cover
  const spouseIncome = i.householdType === 'married' ? i.spouseSocialSecurity : 0;
  const inflationToRetirement = Math.pow(1 + i.inflationRate / 100, Math.max(0, yearsToRetirement));
  const publicMonthlyIncome = (i.socialSecurityBenefit + spouseIncome) * (i.publicPensionIndexed ? inflationToRetirement : 1);
  const guaranteedMonthlyIncome = publicMonthlyIncome + i.pensionBenefit;
  const bridgeYears = Math.min(yearsInRetirement, Math.max(0, (i.publicPensionAge ?? 0) - i.retirementAge));
  const baseNeed = computeRetirementNeed({
    yearsToRetirement,
    yearsInRetirement,
    monthlyExpenses: i.monthlyExpenses,
    healthInsuranceCost: i.healthInsuranceCost,
    inflationRate: i.inflationRate,
    retirementIncomeRatio: i.retirementIncomeRatio,
    guaranteedMonthlyIncome,
    lumpSumGoals: kidsCosts + healthCosts,
  });
  const bridgeMonthlyGap = Math.max(0, baseNeed.monthlySpending - i.pensionBenefit);
  const need: RetirementNeed = bridgeYears > 0
    ? { ...baseNeed, total: baseNeed.total + (bridgeMonthlyGap - baseNeed.monthlyGap) * 12 * bridgeYears }
    : baseNeed;
  const projections = projectRetirementSavings({
    currentAge: i.currentAge,
    retirementAge: i.retirementAge,
    currentSavings: i.currentSavings,
    monthlyContribution: i.monthlyContribution,
    employerMatch: i.employerMatch,
    annualIncrease: i.annualIncrease,
    expectedReturn: i.expectedReturn,
    inflationRate: i.inflationRate,
  });
  const finalSavings = projections[projections.length - 1]?.totalSavings || 0;
  return {
    yearsToRetirement,
    yearsInRetirement,
    kidsCosts,
    healthCosts,
    guaranteedMonthlyIncome,
    publicMonthlyIncome,
    bridgeYears,
    bridgeMonthlyGap,
    need,
    projections,
    finalSavings,
    monthlyFromSavings: monthlyIncomeFromSavings(finalSavings, yearsInRetirement),
    onTrack: finalSavings >= need.total,
    shortfall: Math.max(0, need.total - finalSavings),
    surplus: Math.max(0, finalSavings - need.total),
  };
}
