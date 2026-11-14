/**
 * Edge, corner, positive and negative cases for the w500 finance2 and health2
 * calculators (lane 6 of docs/test-coverage-plan.md). References: IRS Rev.
 * Proc. 2025-32 brackets and deductions (as cited in finance2.ts), SSA 2026
 * wage base, IRS Pub 590-B Uniform Lifetime Table, ACC/AHA 2017 and ESH 2023
 * blood-pressure tables, FRIEND 2022 VO2 norms, Mosteller / Du Bois BSA, and
 * hand calculations written beside each assertion.
 */
import { describe, it, expect } from 'vitest';
import * as Fin from '@/lib/tools/w500/finance2';
import * as H from '@/lib/tools/w500/health2';

const cents = (x: number) => Math.round(x * 100) / 100;
const ok = <T,>(r: { ok: boolean; value?: T; error?: string }): T => {
  expect(r.error).toBeUndefined();
  return r.value as T;
};

describe('finance2: helpers and federal tax', () => {
  it('round2 and the amortized payment', () => {
    expect(Fin.round2(1.005)).toBe(1.01);
    expect(Fin.round2(-1.005)).toBe(-1.01);
    expect(Fin.round2(NaN)).toBeNaN();
    // $50,000 at 9% over 20 years = $449.86 (standard amortization table)
    expect(cents(Fin.amortizedPayment(50000, 9, 240))).toBe(449.86);
    expect(Fin.amortizedPayment(1200, 0, 12)).toBe(100);
    expect(Fin.amortizedPayment(0, 9, 12)).toBe(0);
    expect(Fin.amortizedPayment(1000, 9, 0)).toBe(0);
  });
  it('pay periods and unknown frequency fallback', () => {
    expect(Fin.periodsPerYear('semimonthly')).toBe(24);
    expect(Fin.periodsPerYear('daily' as never)).toBe(26);
    expect(Fin.annualGrossFrom('hourly', 25, 'weekly')).toBe(52000);
    expect(Fin.annualGrossFrom('hourly', 25, 'weekly', 20)).toBe(26000);
    expect(Fin.annualGrossFrom('perPeriod', 2000, 'biweekly')).toBe(52000);
    expect(Fin.annualGrossFrom('annual', 52000, 'monthly')).toBe(52000);
  });
  it('2026 single brackets: exactly 12,400 is all 10%; one dollar more is in the 12% bracket', () => {
    const at = Fin.federalIncomeTax(12400, 'single');
    expect(at.tax).toBeCloseTo(1240, 9);
    expect(at.marginalRate).toBe(0.1);
    const over = Fin.federalIncomeTax(12401, 'single');
    expect(over.marginalRate).toBe(0.12);
    expect(over.tax).toBeCloseTo(1240.12, 9);
    // 43,900: 1,240 + 12% of 31,500 = 5,020
    expect(Fin.federalIncomeTax(43900, 'single').tax).toBeCloseTo(5020, 9);
    expect(Fin.federalIncomeTax(-5, 'mfj')).toEqual({ tax: 0, marginalRate: 0.1, lines: [] });
    expect(Fin.federalIncomeTax(1e7, 'hoh').marginalRate).toBe(0.37);
  });
  it('401(k) deferral limit by age (2026): 24,500, +8,000 at 50, +11,250 at 60-63', () => {
    expect(Fin.k401Limit(49)).toBe(24500);
    expect(Fin.k401Limit(50)).toBe(32500);
    expect(Fin.k401Limit(60)).toBe(35750);
    expect(Fin.k401Limit(63)).toBe(35750);
    expect(Fin.k401Limit(64)).toBe(32500);
  });
});

describe('finance2: calculatePaycheck', () => {
  const base: Fin.PaycheckInput = { annualGross: 60000, frequency: 'biweekly', status: 'single', age: 35 };
  it('single, $60,000, no extras: tax 5,020, SS 3,720, Medicare 870, take-home 50,390', () => {
    const r = ok(Fin.calculatePaycheck(base));
    expect(r.taxableIncome).toBe(43900);
    expect(r.federalTax).toBeCloseTo(5020, 9);
    expect(r.socialSecurity).toBeCloseTo(3720, 9);
    expect(r.medicare).toBeCloseTo(870, 9);
    expect(r.netAnnual).toBeCloseTo(50390, 6);
    expect(cents(r.netPerPeriod)).toBe(1938.08);
    expect(r.marginalRate).toBe(0.12);
    // lines add back up to the gross
    const minus = r.lines.filter((l) => !['gross', 'net'].includes(l.id)).reduce((s, l) => s + l.annual, 0);
    expect(minus + r.netAnnual).toBeCloseTo(r.grossAnnual, 6);
  });
  it('above the wage base: SS capped at 6.2% of 184,500; 0.9% extra Medicare over 200,000', () => {
    const r = ok(Fin.calculatePaycheck({ ...base, annualGross: 250000 }));
    expect(r.socialSecurity).toBeCloseTo(11439, 9);
    expect(r.additionalMedicare).toBeCloseTo(450, 9);
    expect(r.notes.some((n) => /Social Security tax stops/.test(n))).toBe(true);
  });
  it('age 65 single: 16,100 + 2,050 standard deduction plus the 6,000 senior deduction', () => {
    const r = ok(Fin.calculatePaycheck({ ...base, age: 65 }));
    expect(r.standardDeduction).toBe(18150);
    expect(r.seniorDeduction).toBe(6000);
    // 60,000 - 18,150 - 6,000 = 35,850 -> 1,240 + 12% of 23,450 = 4,054
    expect(r.federalTax).toBeCloseTo(4054, 9);
  });
  it('married filing separately gets no senior deduction', () => {
    expect(ok(Fin.calculatePaycheck({ ...base, status: 'mfs', age: 70 })).seniorDeduction).toBe(0);
  });
  it('MFJ with two children: the 4,400 credit is limited to the 2,840 tax owed', () => {
    const r = ok(Fin.calculatePaycheck({ ...base, status: 'mfj', children: 2, spouse65: false }));
    // 60,000 - 32,200 = 27,800: 10% of 24,800 + 12% of 3,000 = 2,480 + 360 = 2,840
    expect(r.federalBeforeCredits).toBeCloseTo(2840, 9);
    expect(r.credits).toBeCloseTo(2840, 9);
    expect(r.federalTax).toBeCloseTo(0, 9);
    expect(r.notes.some((n) => /refundable/.test(n))).toBe(true);
  });
  it('401(k) deferrals capped at the age limit, traditional first then Roth', () => {
    const r = ok(Fin.calculatePaycheck({ ...base, annualGross: 100000, k401Pct: 20, roth401kPct: 10, age: 40 }));
    expect(r.k401Capped).toBe(true);
    expect(r.traditional401k).toBe(20000);
    expect(r.roth401k).toBe(4500);
  });
  it('itemized deductions win only when larger than the standard deduction', () => {
    expect(ok(Fin.calculatePaycheck({ ...base, itemized: 20000 })).usedItemized).toBe(true);
    expect(ok(Fin.calculatePaycheck({ ...base, itemized: 16100 })).usedItemized).toBe(false);
  });
  it('HSA over the family limit adds a note; pre-tax deductions above gross are an error', () => {
    const r = ok(Fin.calculatePaycheck({ ...base, hsaPerPeriod: 400 }));
    expect(r.hsa).toBe(10400);
    expect(r.ficaWages).toBe(60000 - 10400);
    expect(r.notes.some((n) => /HSA contributions/.test(n))).toBe(true);
    expect(Fin.calculatePaycheck({ ...base, section125PerPeriod: 3000 }).ok).toBe(false);
  });
  it('rejects bad input with a message', () => {
    expect(Fin.calculatePaycheck({ ...base, annualGross: 0 }).ok).toBe(false);
    expect(Fin.calculatePaycheck({ ...base, annualGross: 2e9 }).ok).toBe(false);
    expect(Fin.calculatePaycheck({ ...base, status: 'widow' as never }).ok).toBe(false);
    expect(Fin.calculatePaycheck({ ...base, age: 13 }).ok).toBe(false);
    expect(Fin.calculatePaycheck({ ...base, k401Pct: 101 }).ok).toBe(false);
    expect(Fin.calculatePaycheck({ ...base, statePct: NaN }).ok).toBe(false);
    expect(Fin.calculatePaycheck({ ...base, hsaPerPeriod: -1 }).ok).toBe(false);
    expect(Fin.calculatePaycheck({ ...base, children: -1 }).ok).toBe(false);
    // a missing age falls back to 35
    expect(ok(Fin.calculatePaycheck({ ...base, age: NaN })).k401Cap).toBe(24500);
  });
});

describe('finance2: HELOC', () => {
  const heloc: Fin.HelocInput = { homeValue: 400000, mortgageBalance: 200000, cltvLimitPct: 85, drawAmount: 50000, ratePct: 9, drawYears: 10, repayYears: 20 };
  it('85% CLTV on 400k with 200k owed: 140k line; 50k at 9% = 375 interest-only then 449.86', () => {
    const r = ok(Fin.calculateHeloc(heloc));
    expect(r.maxLine).toBe(140000);
    expect(r.interestOnlyPayment).toBeCloseTo(375, 9);
    expect(cents(r.repaymentPayment)).toBe(449.86);
    expect(r.drawInterest).toBeCloseTo(375 * 120, 6);
    const repay = r.schedule.filter((s) => s.phase === 'repay');
    expect(repay.length).toBe(20);
    expect(cents(repay.reduce((s, y) => s + y.principal, 0))).toBe(50000);
    expect(repay.at(-1)!.balance).toBeCloseTo(0, 6);
    expect(r.cltvAfter).toBeCloseTo(0.625, 12);
  });
  it('a draw larger than the line is capped; no draw amount uses the whole line', () => {
    const big = ok(Fin.calculateHeloc({ ...heloc, drawAmount: 200000 }));
    expect(big.drawCapped).toBe(true);
    expect(big.drawn).toBe(140000);
    expect(ok(Fin.calculateHeloc({ ...heloc, drawAmount: undefined })).drawn).toBe(140000);
  });
  it('owing more than the CLTV limit leaves no line', () => {
    const r = ok(Fin.calculateHeloc({ ...heloc, mortgageBalance: 380000 }));
    expect(r.maxLine).toBe(0);
    expect(r.drawn).toBe(0);
  });
  it('0% rate, no draw period, rate shock default of 2 points', () => {
    const r = ok(Fin.calculateHeloc({ ...heloc, ratePct: 0, drawYears: 0 }));
    expect(r.repaymentPayment).toBeCloseTo(50000 / 240, 9);
    expect(r.totalInterest).toBe(0);
    expect(r.shockedInterestOnly).toBeCloseTo((50000 * 0.02) / 12, 9);
  });
  it('rejects bad input, including a repayment period that rounds to zero months', () => {
    expect(Fin.calculateHeloc({ ...heloc, homeValue: 0 }).ok).toBe(false);
    expect(Fin.calculateHeloc({ ...heloc, mortgageBalance: -1 }).ok).toBe(false);
    expect(Fin.calculateHeloc({ ...heloc, cltvLimitPct: 101 }).ok).toBe(false);
    expect(Fin.calculateHeloc({ ...heloc, ratePct: 41 }).ok).toBe(false);
    expect(Fin.calculateHeloc({ ...heloc, drawYears: -1 }).ok).toBe(false);
    expect(Fin.calculateHeloc({ ...heloc, repayYears: 0 }).ok).toBe(false);
    // 0.02 years = 0.24 months -> 0 payments: used to report interest of -50,000
    expect(Fin.calculateHeloc({ ...heloc, repayYears: 0.02 }).ok).toBe(false);
  });
});

describe('finance2: net worth and emergency fund', () => {
  it('assets 360k, debts 205k: net worth 155k, home equity 100k, Stanley-Danko 40 x 100k / 10', () => {
    const r = ok(Fin.calculateNetWorth(
      [{ label: 'Cash', amount: 10000, kind: 'cash' }, { label: 'Home', amount: 300000, kind: 'home' }, { label: '401k', amount: 50000, kind: 'retirement' }],
      [{ label: 'Mortgage', amount: 200000, kind: 'mortgage' }, { label: 'Card', amount: 5000, kind: 'credit-card' }],
      { age: 40, annualIncome: 100000 },
    ));
    expect(r.netWorth).toBe(155000);
    expect(r.liquidNetWorth).toBe(-195000);
    expect(r.homeEquity).toBe(100000);
    expect(r.netWorthExcludingHome).toBe(55000);
    expect(r.debtToAssetRatio).toBeCloseTo(205000 / 360000, 12);
    expect(r.expectedNetWorth).toBe(400000);
    expect(r.scfBand).toEqual({ label: '35 to 44', median: 135600 });
    expect(r.assetsByKind.map((a) => a.kind)).toEqual(['cash', 'retirement', 'home']);
  });
  it('empty lists: no ratio, no benchmark without age', () => {
    const r = ok(Fin.calculateNetWorth([], []));
    expect(r.debtToAssetRatio).toBeNull();
    expect(r.expectedNetWorth).toBeNull();
    expect(r.scfBand).toBeNull();
  });
  it('rejects negative and non-numeric amounts', () => {
    expect(Fin.calculateNetWorth([{ label: 'Cash', amount: -1, kind: 'cash' }], []).ok).toBe(false);
    expect(Fin.calculateNetWorth([], [{ label: '', amount: NaN, kind: 'auto' }]).error).toMatch(/every row/);
  });
  it('suggested months: every factor adds up to 10', () => {
    expect(Fin.suggestedMonths({}).months).toBe(3);
    expect(Fin.suggestedMonths({ singleIncome: true, dependents: true, variableIncome: true, homeowner: true, longJobSearch: true, highDeductible: true }).months).toBe(10);
  });
  it('6 months of 3,000 with 3,000 saved and 1,000 a month at 0%: 15 months', () => {
    const r = ok(Fin.calculateEmergencyFund({ monthlyEssentials: 3000, targetMonths: 6, currentSavings: 3000, monthlyContribution: 1000 }));
    expect(r.target).toBe(18000);
    expect(r.gap).toBe(15000);
    expect(r.monthsToGoal).toBe(15);
    expect(r.monthsCovered).toBe(1);
    expect(r.milestones.map((m) => m.month)).toEqual([0, 6, 15]);
    expect(r.interestEarned).toBe(0);
  });
  it('nothing saved each month at 0%: the goal is never reached', () => {
    const r = ok(Fin.calculateEmergencyFund({ monthlyEssentials: 3000, targetMonths: 3, currentSavings: 0, monthlyContribution: 0 }));
    expect(r.monthsToGoal).toBeNull();
    expect(r.milestones.map((m) => m.month)).toEqual([null, null]);
  });
  it('emergency fund rejects bad input', () => {
    const ef = { monthlyEssentials: 3000, targetMonths: 6, currentSavings: 0, monthlyContribution: 100 };
    expect(Fin.calculateEmergencyFund({ ...ef, monthlyEssentials: 0 }).ok).toBe(false);
    expect(Fin.calculateEmergencyFund({ ...ef, targetMonths: 37 }).ok).toBe(false);
    expect(Fin.calculateEmergencyFund({ ...ef, currentSavings: -1 }).ok).toBe(false);
    expect(Fin.calculateEmergencyFund({ ...ef, monthlyContribution: NaN }).ok).toBe(false);
    expect(Fin.calculateEmergencyFund({ ...ef, apyPct: 26 }).ok).toBe(false);
  });
});

describe('finance2: dividends, average cost, RMD', () => {
  const div: Fin.DividendInput = { sharePrice: 100, annualDividendPerShare: 4, initialInvestment: 10000, frequency: 4, years: 1, drip: false };
  it('4% yield, 100 shares: 400 a year in cash without DRIP', () => {
    const r = ok(Fin.projectDividends(div));
    expect(r.yieldPct).toBe(4);
    expect(r.annualIncome).toBe(400);
    expect(r.incomePerPayment).toBe(100);
    expect(r.rows[0].cash).toBeCloseTo(400, 9);
    expect(r.finalValue).toBeCloseTo(10400, 9);
  });
  it('DRIP at a flat price compounds 1% a quarter: 100 x 1.01^4 shares', () => {
    const r = ok(Fin.projectDividends({ ...div, drip: true }));
    expect(r.rows[0].shares).toBeCloseTo(100 * 1.01 ** 4, 9);
    expect(r.finalValue).toBeCloseTo(10000 * 1.01 ** 4, 6);
  });
  it('monthly contributions only; 15% dividend tax', () => {
    const r = ok(Fin.projectDividends({ ...div, initialInvestment: 0, monthlyContribution: 100, frequency: 12, taxPct: 15 }));
    expect(r.totalInvested).toBeCloseTo(1200, 9);
    expect(r.rows[0].dividendsNet).toBeCloseTo(r.rows[0].dividendsGross * 0.85, 9);
  });
  it('dividends reject bad input', () => {
    expect(Fin.projectDividends({ ...div, sharePrice: 0 }).ok).toBe(false);
    expect(Fin.projectDividends({ ...div, annualDividendPerShare: -1 }).ok).toBe(false);
    expect(Fin.projectDividends({ ...div, frequency: 3 }).ok).toBe(false);
    expect(Fin.projectDividends({ ...div, years: 0.5 }).ok).toBe(false);
    expect(Fin.projectDividends({ ...div, dividendGrowthPct: -100 }).ok).toBe(false);
    expect(Fin.projectDividends({ ...div, taxPct: 101 }).ok).toBe(false);
    expect(Fin.projectDividends({ ...div, monthlyContribution: -1 }).ok).toBe(false);
    expect(Fin.projectDividends({ ...div, initialInvestment: 0 }).ok).toBe(false);
    expect(Fin.dividendYield(4, 0)).toBeNaN();
    expect(Fin.investmentForIncome(12000, 4)).toBe(300000);
    expect(Fin.investmentForIncome(12000, 0)).toBeNaN();
  });
  it('average cost: 100 @ 10 + 100 @ 20 = 15; selling 50 @ 30 with a 5 fee realises 745', () => {
    const r = ok(Fin.averageCost([
      { side: 'buy', shares: 100, price: 10 },
      { side: 'buy', shares: 100, price: 20 },
      { side: 'sell', shares: 50, price: 30, fee: 5 },
    ]));
    expect(r.averageCost).toBe(15);
    expect(r.shares).toBe(150);
    expect(r.realizedPnl).toBe(745);
  });
  it('selling everything resets the basis; overselling and bad rows are errors', () => {
    const r = ok(Fin.averageCost([{ side: 'buy', shares: 10, price: 5 }, { side: 'sell', shares: 10, price: 6 }]));
    expect(r.shares).toBe(0);
    expect(r.averageCost).toBe(0);
    expect(Fin.averageCost([]).ok).toBe(false);
    expect(Fin.averageCost([{ side: 'sell', shares: 1, price: 5 }]).ok).toBe(false);
    expect(Fin.averageCost([{ side: 'buy', shares: 0, price: 5 }]).ok).toBe(false);
    expect(Fin.averageCost([{ side: 'buy', shares: 1, price: -5 }]).ok).toBe(false);
    expect(Fin.averageCost([{ side: 'buy', shares: 1, price: 5, fee: -1 }]).ok).toBe(false);
  });
  it('shares to reach a target average: (100 x 20 - 100 x 15) / (15 - 10) = 100', () => {
    const r = ok(Fin.sharesForTargetAverage(100, 20, 10, 15));
    expect(r.shares).toBe(100);
    expect(r.newAverage).toBe(15);
    expect(Fin.sharesForTargetAverage(100, 20, 10, 10).ok).toBe(false);
    expect(Fin.sharesForTargetAverage(100, 20, 10, 25).error).toMatch(/between 10 and 20/);
    expect(Fin.sharesForTargetAverage(100, 20, 30, 15).error).toMatch(/between 20 and 30/);
    expect(Fin.sharesForTargetAverage(0, 20, 10, 15).ok).toBe(false);
    expect(Fin.sharesForTargetAverage(100, 20, 10, 15, -1).ok).toBe(false);
    expect(Fin.averageAfterBuy(100, 20, 100, 10)).toBe(15);
    expect(Fin.averageAfterBuy(0, 0, 0, 10)).toBe(0);
    expect(Fin.breakEvenPrice(100, 1500, 10)).toBe(15.1);
    expect(Fin.breakEvenPrice(0, 1500)).toBeNaN();
  });
  it('RMD start ages under SECURE 2.0: 1950 -> 72, 1951-1959 -> 73, 1960+ -> 75', () => {
    expect(Fin.rmdStartAge(1950)).toBe(72);
    expect(Fin.rmdStartAge(1951)).toBe(73);
    expect(Fin.rmdStartAge(1959)).toBe(73);
    expect(Fin.rmdStartAge(1960)).toBe(75);
    expect(Fin.uniformLifetimeFactor(71)).toBeNull();
    expect(Fin.uniformLifetimeFactor(75.9)).toBe(24.6);
    expect(Fin.uniformLifetimeFactor(130)).toBe(2.0);
  });
  it('age 75 in 2026 with 100,000: 100,000 / 24.6 = 4,065.04 due 31 December', () => {
    const r = ok(Fin.calculateRmd({ priorYearEndBalance: 100000, birthYear: 1951, distributionYear: 2026 }));
    expect(r.age).toBe(75);
    expect(cents(r.rmd)).toBe(4065.04);
    expect(r.deadline).toBe('December 31, 2026');
    expect(r.projection[0].factor).toBe(24.6);
  });
  it('first RMD year may wait until 1 April; before the start age there is none', () => {
    const first = ok(Fin.calculateRmd({ priorYearEndBalance: 100000, birthYear: 1953, distributionYear: 2026 }));
    expect(first.isFirstYear).toBe(true);
    expect(first.deadline).toMatch(/^April 1, 2027/);
    const none = ok(Fin.calculateRmd({ priorYearEndBalance: 100000, birthYear: 1960, distributionYear: 2026, growthPct: 5, projectionYears: 3 }));
    expect(none.required).toBe(false);
    expect(none.rmd).toBe(0);
    expect(none.projection[0].year).toBe(2035);
    // grows untouched for 9 years first
    expect(none.projection[0].startBalance).toBeCloseTo(100000 * 1.05 ** 9, 6);
  });
  it('RMD rejects bad input', () => {
    const rmd = { priorYearEndBalance: 100000, birthYear: 1951, distributionYear: 2026 };
    expect(Fin.calculateRmd({ ...rmd, priorYearEndBalance: -1 }).ok).toBe(false);
    expect(Fin.calculateRmd({ ...rmd, birthYear: 1899 }).ok).toBe(false);
    expect(Fin.calculateRmd({ ...rmd, distributionYear: 2021 }).ok).toBe(false);
    expect(Fin.calculateRmd({ ...rmd, growthPct: 60 }).ok).toBe(false);
  });
  it('share-link rows round-trip separators and bad escapes', () => {
    const rows = [['a~b', '50%|x'], ['', 'é']];
    expect(Fin.decodeRows(Fin.encodeRows(rows))).toEqual(rows);
    expect(Fin.decodeRows('')).toEqual([]);
    expect(Fin.decodeRows('%E0%A4%A')).toEqual([['%E0%A4%A']]);
  });
});

describe('health2: body surface area and ratios', () => {
  it('70 kg, 170 cm: Mosteller sqrt(11900/3600) = 1.818; Du Bois 1.810', () => {
    expect(H.bodySurfaceArea('mosteller', 70, 170)).toBeCloseTo(1.8181, 4);
    expect(H.bodySurfaceArea('dubois', 70, 170)).toBeCloseTo(1.8101, 3);
    const all = H.allBodySurfaceAreas(70, 170, 'female');
    expect(all.length).toBe(9);
    expect(all.every((x) => x.bsa! > 1.6 && x.bsa! < 2.0)).toBe(true);
    expect(H.bodySurfaceArea('schlich', 70, 170, 'female')).not.toBe(H.bodySurfaceArea('schlich', 70, 170, 'male'));
  });
  it('BSA rejects bad input and unknown formulas', () => {
    expect(H.bodySurfaceArea('mosteller', 0, 170)).toBeNull();
    expect(H.bodySurfaceArea('mosteller', 70, NaN)).toBeNull();
    expect(H.bodySurfaceArea('nope' as never, 70, 170)).toBeNull();
  });
  it('dose, cardiac index, BMI', () => {
    expect(H.doseFromBsa(1.8, 100)).toBeCloseTo(180, 12);
    expect(H.doseFromBsa(1.8, 0)).toBe(0);
    expect(H.doseFromBsa(1.8, -1)).toBeNull();
    expect(H.doseFromBsa(0, 100)).toBeNull();
    expect(H.cardiacIndex(5, 2)).toBe(2.5);
    expect(H.cardiacIndex(5, 0)).toBeNull();
    expect(H.bmi(70, 175)).toBeCloseTo(22.857, 3);
    expect(H.bmi(0, 175)).toBeNaN();
  });
  it('WHO waist-hip and waist cut-offs at their exact values', () => {
    expect(H.waistHipRatio(90, 100)).toBe(0.9);
    expect(H.waistHipRatio(0, 100)).toBeNull();
    expect(H.whrRisk('male', 0.9)).toBe('substantially increased');
    expect(H.whrRisk('male', 0.89)).toBe('low');
    expect(H.whrRisk('female', 0.85)).toBe('substantially increased');
    expect(H.bodyShape('female', 0.84)).toBe('pear');
    expect(H.bodyShape('male', 0.9)).toBe('apple');
    expect(H.waistRisk('male', 94)).toBe('low');
    expect(H.waistRisk('male', 94.1)).toBe('increased');
    expect(H.waistRisk('male', 102)).toBe('increased');
    expect(H.waistRisk('male', 102.1)).toBe('substantially increased');
    expect(H.waistRisk('male', 90, true)).toBe('increased');
    expect(H.waistRisk('female', 79.9, true)).toBe('low');
  });
  it('waist-to-height bands', () => {
    expect(H.waistHeightRatio(85, 170)).toBe(0.5);
    expect(H.waistHeightRatio(85, 0)).toBeNull();
    expect(H.whtrBand(0.39)).toBe('below 0.4');
    expect(H.whtrBand(0.4)).toBe('healthy');
    expect(H.whtrBand(0.5)).toBe('increased');
    expect(H.whtrBand(0.6)).toBe('high');
    expect(H.waistForHalfHeight(170)).toBe(85);
    expect(H.waistForWhr(100, 0.85)).toBe(85);
  });
});

describe('health2: VO2 max', () => {
  it('Cooper: 2,400 m in 12 minutes = (2400 - 504.9) / 44.73 = 42.37', () => {
    expect(H.cooperVo2(2400)).toBeCloseTo(42.3675, 4);
    expect(H.cooperDistanceFor(H.cooperVo2(2400)!)).toBeCloseTo(2400, 9);
    expect(H.cooperVo2(400)).toBeNull();
    expect(H.cooperVo2(0)).toBeNull();
  });
  it('Rockport, HR ratio, 1.5-mile run', () => {
    // 132.853 - 0.0769 x 170 - 0.3877 x 40 + 6.315 - 3.2649 x 15 - 0.1565 x 120
    expect(H.rockportVo2({ sex: 'male', age: 40, weightLb: 170, minutes: 15, heartRate: 120 })).toBeCloseTo(132.853 - 13.073 - 15.508 + 6.315 - 48.9735 - 18.78, 9);
    expect(H.rockportVo2({ sex: 'female', age: 40, weightLb: 170, minutes: 60, heartRate: 120 })).toBeNull();
    expect(H.rockportVo2({ sex: 'female', age: 0, weightLb: 170, minutes: 15, heartRate: 120 })).toBeNull();
    expect(H.heartRateRatioVo2(190, 60)).toBeCloseTo(48.45, 9);
    expect(H.heartRateRatioVo2(60, 60)).toBeNull();
    expect(H.tanakaHrMax(40)).toBe(180);
    expect(H.onePointFiveMileVo2(12)).toBe(43.75);
    expect(H.onePointFiveMileVo2(0)).toBeNull();
    expect(H.vo2ToMets(35)).toBe(10);
  });
  it('Daniels VDOT: a 20:00 5K is about VDOT 50 (Daniels Running Formula tables)', () => {
    expect(H.danielsVdot(5000, 1200)!).toBeCloseTo(49.8, 0);
    expect(H.danielsVdot(0, 1200)).toBeNull();
  });
  it('FRIEND percentiles: table points, interpolation and the ends', () => {
    expect(H.ageDecade(19)).toBe(20);
    expect(H.ageDecade(95)).toBe(80);
    expect(H.friendPercentile(34.8, 45, 'male')).toBe(50);
    expect(H.friendPercentile(80, 45, 'male')).toBe(99.8);
    expect(H.friendPercentile(5, 45, 'male')).toBe(0.2);
    // halfway between 50th (34.8) and 55th (36.0)
    expect(H.friendPercentile(35.4, 45, 'male')).toBeCloseTo(52.5, 9);
    expect(H.friendPercentile(40, 19, 'male')).toBeNull();
    expect(H.friendPercentile(40, 90, 'female')).toBeNull();
    expect(H.friendPercentile(NaN, 40, 'female')).toBeNull();
    expect(H.friendValueAt(50, 45, 'male')).toBe(34.8);
    expect(H.friendValueAt(51, 45, 'male')).toBeNull();
    expect(H.fitnessBand(19.9)).toBe('Low');
    expect(H.fitnessBand(20)).toBe('Below average');
    expect(H.fitnessBand(40)).toBe('Average');
    expect(H.fitnessBand(60)).toBe('Above average');
    expect(H.fitnessBand(80)).toBe('High');
  });
});

describe('health2: blood pressure', () => {
  it('ACC/AHA 2017 categories at every threshold', () => {
    expect(H.classifyAccAha(119, 79)).toBe('normal');
    expect(H.classifyAccAha(120, 79)).toBe('elevated');
    expect(H.classifyAccAha(130, 79)).toBe('stage1');
    expect(H.classifyAccAha(119, 80)).toBe('stage1');
    expect(H.classifyAccAha(140, 89)).toBe('stage2');
    expect(H.classifyAccAha(139, 90)).toBe('stage2');
    expect(H.classifyAccAha(180, 120)).toBe('stage2');
    expect(H.classifyAccAha(181, 80)).toBe('severe');
    expect(H.classifyAccAha(150, 121)).toBe('severe');
  });
  it('ESH grades take the higher of the two and flag isolated hypertension', () => {
    expect(H.classifyEsh(119, 79)).toEqual({ grade: 'optimal', isolated: null });
    expect(H.classifyEsh(125, 84)).toEqual({ grade: 'normal', isolated: null });
    expect(H.classifyEsh(135, 85)).toEqual({ grade: 'high-normal', isolated: null });
    expect(H.classifyEsh(150, 85)).toEqual({ grade: 'grade1', isolated: 'isolated-systolic' });
    expect(H.classifyEsh(130, 100)).toEqual({ grade: 'grade2', isolated: 'isolated-diastolic' });
    expect(H.classifyEsh(180, 110).grade).toBe('grade3');
  });
  it('MAP, pulse pressure, low BP', () => {
    expect(H.meanArterialPressure(120, 80)).toBeCloseTo(93.333, 3);
    expect(H.pulsePressure(120, 80)).toBe(40);
    expect(H.isLowBp(89, 70)).toBe(true);
    expect(H.isLowBp(100, 59)).toBe(true);
    expect(H.isLowBp(90, 60)).toBe(false);
  });
  it('validateReading', () => {
    expect(H.validateReading({ sys: 120, dia: 80 })).toBeNull();
    expect(H.validateReading({ sys: NaN, dia: 80 })).toMatch(/both/);
    expect(H.validateReading({ sys: 59, dia: 40 })).toMatch(/Systolic/);
    expect(H.validateReading({ sys: 120, dia: 29 })).toMatch(/Diastolic/);
    expect(H.validateReading({ sys: 80, dia: 80 })).toMatch(/higher than diastolic/);
    expect(H.validateReading({ sys: 120, dia: 80, pulse: 251 })).toMatch(/Pulse/);
  });
  it('parseReadings keeps good lines, reports bad ones with line numbers; summary drops the first', () => {
    const { readings, errors } = H.parseReadings('128/82 70\n# morning\n\nbad\n90/100\r\n140/90 # evening\n');
    expect(readings).toEqual([{ sys: 128, dia: 82, pulse: 70 }, { sys: 140, dia: 90 }]);
    expect(errors.map((e) => e.line)).toEqual([4, 5]);
    const s = H.summariseReadings(readings, true)!;
    expect(s.used).toBe(1);
    expect(s.count).toBe(2);
    expect(s.pulse).toBeNull();
    expect(s.accAha).toBe('stage2');
    const all = H.summariseReadings(readings)!;
    expect(all.sys).toBe(134);
    expect(all.pulse).toBe(70);
    expect(all.minDia).toBe(82);
    expect(H.summariseReadings([])).toBeNull();
    expect(H.summariseReadings([{ sys: 120, dia: 80 }], true)!.used).toBe(1);
  });
});

describe('health2: steps and fasting', () => {
  it('step length from height, cadence and a measured count', () => {
    expect(H.stepLengthFromHeight(180, 'male')).toBeCloseTo(74.7, 9);
    expect(H.stepLengthFromHeight(0, 'male')).toBeNull();
    // 5 km/h = 83.33 m/min at 110 steps/min = 75.76 cm
    expect(H.stepLengthFromCadence(5, 110)).toBeCloseTo(75.758, 3);
    expect(H.stepLengthFromCadence(5, 0)).toBeNull();
    expect(H.stepLengthFromCount(750, 1000)).toBe(75);
    expect(H.stepLengthFromCount(0, 1000)).toBeNull();
    expect(H.stepsToKm(10000, 75)).toBe(7.5);
    expect(H.kmToSteps(7.5, 75)).toBe(10000);
    expect(H.stepsPerKm(80)).toBe(1250);
    expect(H.stepsPerMile(75)).toBeCloseTo(2145.79, 2);
  });
  it('ACSM equations: walking 80 m/min on the flat = 3.5 + 8 = 11.5 ml/kg/min', () => {
    expect(H.acsmVo2('walk', 80)).toBe(11.5);
    expect(H.acsmVo2('run', 200, 5)).toBeCloseTo(3.5 + 40 + 9, 9);
    const c = H.stepCalories({ gait: 'walk', km: 4.8, speedKmh: 4.8, weightKg: 70 })!;
    expect(c.minutes).toBe(60);
    // 11.5 ml/kg/min x 70 kg x 60 min = 48.3 L O2 x 5 kcal/L = 241.5
    expect(c.grossKcal).toBeCloseTo(241.5, 9);
    expect(c.netKcal).toBeCloseTo(241.5 - 73.5, 9);
    expect(H.stepCalories({ gait: 'walk', km: 0, speedKmh: 4.8, weightKg: 70 })).toBeNull();
    expect(H.acsmSpeedWarning('walk', 2)).toMatch(/walking/);
    expect(H.acsmSpeedWarning('walk', 5)).toBeNull();
    expect(H.acsmSpeedWarning('run', 6)).toMatch(/running/);
    expect(H.acsmSpeedWarning('run', 10)).toBeNull();
  });
  it('fasting status across the fast, the eating window and after it', () => {
    const h = 3600 * 1000;
    expect(H.fastingStatus(0, 16, 8 * h)).toMatchObject({ phase: 'fasting', remainingMs: 8 * h, fastProgress: 0.5 });
    expect(H.fastingStatus(0, 16, 20 * h)).toMatchObject({ phase: 'eating', remainingMs: 4 * h, fastProgress: 1 });
    expect(H.fastingStatus(0, 16, 25 * h)).toMatchObject({ phase: 'past-window', remainingMs: 0 });
    // a start in the future: nothing elapsed yet
    expect(H.fastingStatus(10 * h, 16, 0)).toMatchObject({ phase: 'fasting', elapsedMs: 0, remainingMs: 16 * h });
    expect(H.fastingStatus(0, 73, 0)).toBeNull();
    expect(H.fastingStatus(NaN, 16, 0)).toBeNull();
    expect(H.protocolById('16:8')!.fastHours).toBe(16);
    expect(H.protocolById('nope')).toBeUndefined();
  });
  it('clock parsing and formatting across midnight', () => {
    expect(H.parseClock('7:30')).toBe(450);
    expect(H.parseClock('7.30')).toBe(450);
    expect(H.parseClock('19h05')).toBe(1145);
    expect(H.parseClock('24:00')).toBeNull();
    expect(H.parseClock('7:60')).toBeNull();
    expect(H.formatClock(1200 + 960)).toEqual({ time: '12:00', dayOffset: 1 });
    expect(H.formatClock(-30)).toEqual({ time: '23:30', dayOffset: -1 });
    expect(H.formatDurationMs(3723000)).toBe('1:02:03');
    expect(H.formatDurationMs(-5)).toBe('0:00:00');
  });
  it('daily plan and fast from last meal', () => {
    expect(H.dailyFastingPlan(720, 16)).toEqual({ windowStart: 720, windowEnd: 1200, fastStart: 1200, fastEnd: 2160, eatHours: 8 });
    expect(H.dailyFastingPlan(720, 24)).toBeNull();
    expect(H.dailyFastingPlan(NaN, 16)).toBeNull();
    expect(H.fastFromLastMeal(1200, 16)).toEqual({ fastEnd: 2160, windowEnd: 2640 });
    expect(H.fastFromLastMeal(1200, 36)).toEqual({ fastEnd: 3360, windowEnd: 3360 });
    expect(H.fastFromLastMeal(1200, 0)).toBeNull();
  });
  it('parseTime: minutes, mm:ss and h:mm:ss', () => {
    expect(H.parseTime('25')).toBe(1500);
    expect(H.parseTime('1:30')).toBe(90);
    expect(H.parseTime('1:02:03')).toBe(3723);
    expect(H.parseTime('1:60')).toBeNull();
    expect(H.parseTime('0')).toBeNull();
    expect(H.parseTime('')).toBeNull();
    expect(H.parseTime('1:2:3:4')).toBeNull();
    expect(H.parseTime('a:b')).toBeNull();
  });
});

describe('finance2: tiny positive rates (boundary fuzzer regression)', () => {
  it('amortizedPayment tends to principal / months instead of Infinity', () => {
    expect(Fin.amortizedPayment(12000, 1e-300, 12)).toBeCloseTo(1000, 9);
  });
  it('HELOC at a tiny rate repays the draw evenly', () => {
    const r = ok(Fin.calculateHeloc({ homeValue: 400000, mortgageBalance: 200000, cltvLimitPct: 85, drawAmount: 48000, ratePct: 1e-300, drawYears: 0, repayYears: 20 }));
    expect(r.repaymentPayment).toBeCloseTo(200, 9);
    expect(r.fixedLoanPayment).toBeCloseTo(200, 9);
    expect(Number.isFinite(r.shockedRepaymentPayment)).toBe(true);
  });
});
