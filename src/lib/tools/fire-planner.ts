/**
 * FIRE (financial independence, retire early) projection maths used by the
 * FIRE Planner. Amounts are nominal; expenses grow with inflation.
 *
 * The starting portfolio is `currentSavings` alone: the invested assets you
 * could sell to fund spending. There is deliberately no separate net worth
 * input, because adding net worth to investments counts the same money twice.
 */

export interface FireInput {
  currentAge: number;
  targetAge: number;
  /** Invested assets today (the starting portfolio). */
  currentSavings: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  expectedInflation: number; // % per year
  expectedReturn: number; // % per year, nominal
  safeWithdrawalRate: number; // % of the portfolio withdrawn in year one
  socialSecurityAge: number;
  socialSecurityBenefit: number; // per month
  /**
   * Optional FIRE target in today's money. When above 0 it replaces
   * annual expenses / SWR and is inflated the same way; 0 or blank uses
   * the expenses-based number.
   */
  targetFIRENumber?: number;
  /**
   * Optional pension pot you cannot draw until `lockedAccessAge` (UK SIPP or
   * workplace pension: normal minimum pension age; Australia: super
   * preservation age). Not part of currentSavings. `lockedMonthly` is the part
   * of the monthly savings paid into it. With all three at 0 the plan is the
   * single-pot plan.
   */
  lockedSavings?: number;
  lockedMonthly?: number;
  lockedAccessAge?: number;
}

export interface FireProjectionRow {
  age: number;
  year: number;
  netWorth: number;
  fireTarget: number;
  annualContribution: number;
  withdrawal: number;
  socialSecurity: number;
  totalIncome: number;
  expenses: number;
  surplus: number;
}

export interface FireMetrics {
  requiredFIRENumber: number;
  leanFIRENumber: number;
  fatFIRENumber: number;
  /** Years until the portfolio first covers expenses / SWR, or null if not within 100 years. */
  timeToFIRE: number | null;
  savingsRate: number;
  currentFIREProgress: number;
  monthlySavingsRate: number;
  annualSavingsRate: number;
  /** True when the portfolio reaches the FIRE number by the target age. */
  isFireAchievable: boolean;
  fireAchievableAge: number | null;
  projectedNetWorthAtTarget: number;
  futureAnnualExpenses: number;
  /** Money outside the locked pension at the target age (equals the whole portfolio without one). */
  accessibleAtTarget: number;
  /** Years between the target age and the pension access age (0 without a locked pot). */
  bridgeYears: number;
  /** Accessible money needed at the target age to fund the planned withdrawals until the access age, at the expected return. */
  bridgeNeeded: number;
  /** True when the accessible money covers the bridge (always true without one). */
  bridgeCovered: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** FIRE number = annual expenses / safe withdrawal rate (25x expenses at 4%). */
export function fireNumber(annualExpenses: number, safeWithdrawalRatePercent: number): number {
  if (!(safeWithdrawalRatePercent > 0)) return 0;
  return annualExpenses / (safeWithdrawalRatePercent / 100);
}

/**
 * Years until the invested balance first reaches that year's FIRE number
 * (inflated expenses / SWR). Each year's savings are added at the start of
 * the year and then grow at the nominal return, the same timing the
 * projection uses. Returns null if it is not reached within maxYears.
 */
export function yearsToFinancialIndependence(
  startBalance: number,
  annualSavings: number,
  expectedReturnPercent: number,
  annualExpensesToday: number,
  inflationPercent: number,
  safeWithdrawalRatePercent: number,
  maxYears = 100,
  targetTodayOverride = 0,
): number | null {
  const targetToday = targetTodayOverride > 0
    ? targetTodayOverride
    : fireNumber(annualExpensesToday, safeWithdrawalRatePercent);
  if (!(targetToday > 0)) return null;
  const r = expectedReturnPercent / 100;
  const inf = inflationPercent / 100;
  let balance = startBalance;
  for (let y = 0; y <= maxYears; y++) {
    const target = targetToday * Math.pow(1 + inf, y);
    if (balance >= target) return y;
    balance = (balance + annualSavings) * (1 + r);
  }
  return null;
}

export function computeFirePlan(raw: FireInput): { projections: FireProjectionRow[]; metrics: FireMetrics } {
  const i = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, num(v)])) as unknown as FireInput;
  const yearsToTarget = Math.max(0, Math.round(i.targetAge - i.currentAge));
  const monthlySavings = i.monthlyIncome - i.monthlyExpenses;
  const annualSavings = monthlySavings * 12;
  const r = i.expectedReturn / 100;
  const inf = i.expectedInflation / 100;
  const swr = i.safeWithdrawalRate / 100;

  const annualExpensesToday = i.monthlyExpenses * 12;
  const futureAnnualExpenses = annualExpensesToday * Math.pow(1 + inf, yearsToTarget);
  const override = i.targetFIRENumber && i.targetFIRENumber > 0 ? i.targetFIRENumber : 0;
  const requiredFIRENumber = override > 0
    ? override * Math.pow(1 + inf, yearsToTarget)
    : fireNumber(futureAnnualExpenses, i.safeWithdrawalRate);
  const startBalance = i.currentSavings;
  const lockedStart = Math.max(0, i.lockedSavings ?? 0);
  const lockedAnnual = Math.max(0, (i.lockedMonthly ?? 0) * 12);
  const accessAge = i.lockedAccessAge ?? 0;
  const hasLock = lockedStart > 0 || lockedAnnual > 0;

  const projections: FireProjectionRow[] = [];
  // Accessible money (ISA, TFSA, taxable account) and the locked pension pot.
  let balance = startBalance;
  let locked = lockedStart;
  let firstWithdrawal = 0;
  let previousWithdrawal = 0;
  let accessibleAtTarget = startBalance;

  for (let year = 0; year <= yearsToTarget + 10; year++) {
    const age = i.currentAge + year;
    const contribution = year > 0 && year <= yearsToTarget ? annualSavings : 0;
    const lockedContribution = year > 0 && year <= yearsToTarget ? lockedAnnual : 0;
    if (year > 0) {
      if (year <= yearsToTarget) {
        balance = (balance + contribution - lockedContribution) * (1 + r);
        locked = (locked + lockedContribution) * (1 + r);
      } else {
        // Last year's withdrawal comes from accessible money first; the locked
        // pot only pays once the access age is reached.
        const fromAccessible = Math.min(Math.max(0, balance), previousWithdrawal);
        const fromLocked = age - 1 >= accessAge ? Math.min(locked, previousWithdrawal - fromAccessible) : 0;
        balance = Math.max(0, balance - fromAccessible) * (1 + r);
        locked = Math.max(0, locked - fromLocked) * (1 + r);
      }
    }
    if (year === yearsToTarget) accessibleAtTarget = balance;

    // 4% rule (Bengen 1994): withdraw SWR x the balance at retirement in
    // year one, then raise that amount with inflation every year after.
    // Before the access age only accessible money can be drawn.
    const available = hasLock && age < accessAge ? balance : balance + locked;
    let withdrawal = 0;
    if (year === yearsToTarget) {
      firstWithdrawal = (balance + locked) * swr;
      withdrawal = Math.min(available, firstWithdrawal);
    } else if (year > yearsToTarget) {
      withdrawal = Math.min(available, firstWithdrawal * Math.pow(1 + inf, year - yearsToTarget));
    }
    previousWithdrawal = withdrawal;

    const socialSecurity = age >= i.socialSecurityAge ? i.socialSecurityBenefit * 12 : 0;
    const expenses = annualExpensesToday * Math.pow(1 + inf, year);

    projections.push({
      age,
      year: i.currentAge + year,
      netWorth: Math.round(balance + locked),
      fireTarget: Math.round(requiredFIRENumber),
      annualContribution: Math.round(contribution),
      withdrawal: Math.round(withdrawal),
      socialSecurity: Math.round(socialSecurity),
      totalIncome: Math.round(withdrawal + socialSecurity),
      expenses: Math.round(expenses),
      surplus: Math.round(withdrawal + socialSecurity - expenses),
    });
  }

  // With a locked pot, both pots count towards the FIRE number (the bridge is
  // checked separately below).
  const timeToFIRE = hasLock
    ? yearsToFinancialIndependence(startBalance + lockedStart, annualSavings, i.expectedReturn, annualExpensesToday, i.expectedInflation, i.safeWithdrawalRate, 100, override)
    : yearsToFinancialIndependence(
      startBalance, annualSavings, i.expectedReturn, annualExpensesToday, i.expectedInflation, i.safeWithdrawalRate,
      100, override,
    );
  const bridgeYears = hasLock ? Math.max(0, Math.round(accessAge - i.targetAge)) : 0;
  let bridgeNeeded = 0;
  for (let k = 0; k < bridgeYears; k++) bridgeNeeded += (firstWithdrawal * Math.pow(1 + inf, k)) / Math.pow(1 + r, k);
  const fireAchievableAge = timeToFIRE === null ? null : i.currentAge + timeToFIRE;
  const savingsRate = i.monthlyIncome > 0 ? (monthlySavings / i.monthlyIncome) * 100 : 0;
  const projectedNetWorthAtTarget = projections[yearsToTarget]?.netWorth ?? 0;

  return {
    projections,
    metrics: {
      requiredFIRENumber: Math.round(requiredFIRENumber),
      leanFIRENumber: Math.round(futureAnnualExpenses * 25),
      fatFIRENumber: Math.round(futureAnnualExpenses * 35),
      timeToFIRE,
      savingsRate: Math.round(savingsRate * 100) / 100,
      currentFIREProgress: requiredFIRENumber > 0 ? Math.round((startBalance / requiredFIRENumber) * 10000) / 100 : 0,
      monthlySavingsRate: Math.round(monthlySavings),
      annualSavingsRate: Math.round(annualSavings),
      isFireAchievable: requiredFIRENumber > 0 && projectedNetWorthAtTarget >= requiredFIRENumber,
      fireAchievableAge,
      projectedNetWorthAtTarget,
      futureAnnualExpenses: Math.round(futureAnnualExpenses),
      accessibleAtTarget: Math.round(accessibleAtTarget),
      bridgeYears,
      bridgeNeeded: Math.round(bridgeNeeded),
      bridgeCovered: bridgeYears === 0 || accessibleAtTarget >= bridgeNeeded - 0.5,
    },
  };
}

/** Age at which FI is reached for a variant of the inputs (for scenarios). */
export function fireAgeFor(input: FireInput, overrides: Partial<FireInput> = {}): number | null {
  const i = { ...input, ...overrides };
  const years = yearsToFinancialIndependence(
    num(i.currentSavings) + Math.max(0, num(i.lockedSavings)),
    (num(i.monthlyIncome) - num(i.monthlyExpenses)) * 12,
    num(i.expectedReturn),
    num(i.monthlyExpenses) * 12,
    num(i.expectedInflation),
    num(i.safeWithdrawalRate),
    100,
    num(i.targetFIRENumber),
  );
  return years === null ? null : num(i.currentAge) + years;
}
