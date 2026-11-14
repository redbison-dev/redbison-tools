/**
 * Working steps for rollout batch s8 (docs/calculation-standard.md): each
 * steps function's last result equals the calculator's own answer, formatted
 * the way the page shows it, for the page defaults and another case; plus a
 * hand-checked figure and an edge case per tool.
 */
import { describe, expect, it } from 'vitest';
import * as S from '@/lib/tools/steps/s8';
import { loanMoney, loanPct, bizMoney } from '@/lib/tools/steps/s1';
import { calculateBalanceTransfer, type BalanceTransferInput } from '@/lib/tools/calculators/balance-transfer-calculator';
import { calculateConsolidation, type ConsolidationInput } from '@/lib/tools/calculators/debt-consolidation-calculator';
import { analyzeOptionPool, type OptionPoolInput } from '@/lib/tools/startup/option-pool-calculator';
import { buildCapTable, ownershipByHolder, type CapTableRound, type Holding } from '@/lib/tools/startup/cap-table-calculator';
import { freelanceRate, meetingCost, paybackPeriod, type FreelanceInput, type MeetingInput, type PaybackInput } from '@/lib/tools/w500/business2-calc';
import { calculateBarbellLoad, type BarbellInput } from '@/lib/tools/calculators/barbell-plate-calculator';
import { ACC_AHA_LABELS, bodySurfaceArea, dailyFastingPlan, summariseReadings } from '@/lib/tools/w500/health2';
import { toOctal } from '@/lib/tools/w500/webops-chmod';
import { dayOfWeek } from '@/lib/tools/w500/everyday2-dates';
import { evaluateCalculatorExpression, evaluateProgrammerExpression } from '@/lib/tools/advanced-calculator';
import { calculateMarketSize, type MarketSizingInputs } from '@/lib/tools/market-sizing-calculator';
import { analyzeRentalProperty, type RentalPropertyInput } from '@/lib/tools/real-estate-investment-analyzer';
import { convertUnit } from '@/lib/tools/unit-converter';
import { computeBudget, type BudgetInput } from '@/lib/tools/budget-planner';
import { simulateEtf, type EtfSimulationInput } from '@/lib/tools/etf-investment-simulator';
import { computeFirePlan, type FireInput } from '@/lib/tools/fire-planner';
import type { ReportStep } from '@/lib/report/model';

const last = (s: ReportStep[]) => s[s.length - 1].result;
const noNaN = (s: ReportStep[]) => expect(s.map((x) => [x.formula ?? '', x.working ?? '', x.result].join(' ')).join(' ')).not.toMatch(/NaN|undefined|Infinity/);
const sized = (s: ReportStep[]) => {
  expect(s.length).toBeGreaterThanOrEqual(1);
  expect(s.length).toBeLessThanOrEqual(8);
  noNaN(s);
};

describe('balanceTransferSteps', () => {
  const def: BalanceTransferInput = { balance: 12000, currentAprPct: 24.99, feePct: 4, feeMin: 5, promoAprPct: 0, promoMonths: 12, goToAprPct: 27.99, monthlyPayment: 350 };
  it.each([[def], [{ ...def, promoAprPct: 3.99, monthlyPayment: 1200 }], [{ ...def, feePct: 5, monthlyPayment: 300 }]])('ends with the headline the page shows', (i) => {
    const s = S.balanceTransferSteps(i);
    sized(s);
    expect(last(s)).toBe(S.balanceTransferHeadline(calculateBalanceTransfer(i)!));
  });
  it('fee by hand: max(4% × 12,000, 5) = 480', () => {
    expect(S.balanceTransferSteps(def)[0].result).toBe('$480.00');
    expect(S.balanceTransferSteps({ ...def, balance: 100, feeMin: 10 })[0].result).toBe('$10.00');
  });
  it('invalid input gives no steps', () => expect(S.balanceTransferSteps({ ...def, monthlyPayment: 0 })).toEqual([]));
});

describe('debtConsolidationSteps', () => {
  const def: ConsolidationInput = {
    debts: [{ name: 'Visa', balance: 7000, aprPct: 24.99, payment: 260 }, { name: 'Store card', balance: 2000, aprPct: 29.99, payment: 80 }, { name: 'Mastercard', balance: 3000, aprPct: 21.99, payment: 110 }],
    loanRatePct: 12.99, termMonths: 36, feePct: 5, feeMode: 'deducted',
  };
  it.each([[def], [{ ...def, feeMode: 'cash' as const, termMonths: 60 }], [{ ...def, feePct: 0, loanRatePct: 9 }]])('ends with the headline the page shows', (i) => {
    const s = S.debtConsolidationSteps(i);
    sized(s);
    const r = calculateConsolidation(i)!;
    expect(last(s)).toBe(S.debtConsolidationHeadline(r));
    expect(s.find((x) => x.label.startsWith('APR'))!.result).toBe(loanPct(r.loan.aprPct, 3));
  });
  it('loan amount by hand: 12,000 / (1 − 5%) = 12,631.58', () => expect(S.debtConsolidationSteps(def)[2].result).toBe('$12,631.58'));
  it('no debts gives no steps', () => expect(S.debtConsolidationSteps({ ...def, debts: [] })).toEqual([]));
});

describe('optionPoolSteps', () => {
  const def: OptionPoolInput = { preMoney: 30000000, investment: 10000000, preFdShares: 13000000, existingPool: 800000, poolTargetPct: 15 };
  it.each([[def], [{ ...def, poolTargetPct: 10, investment: 5000000 }], [{ ...def, poolTargetPct: 2 }]])('ends with the effective pre-money in the headline', (i) => {
    const s = S.optionPoolSteps(i);
    sized(s);
    const r = analyzeOptionPool(i);
    if ('error' in r) throw new Error(r.error);
    expect(last(s)).toBe(loanMoney(r.pre.effectivePreMoney, 'USD', 0));
  });
  it('pool by hand: k = 0.15 × 40M / 30M = 0.2; P = (0.2 × 13M − 0.8M) / 0.8 = 2,250,000', () => {
    const s = S.optionPoolSteps(def);
    expect(s[1].result).toBe('0.200000');
    expect(s[2].result).toBe('2,250,000');
  });
  it('a pool that swallows the pre-money gives no steps', () => expect(S.optionPoolSteps({ ...def, poolTargetPct: 80 })).toEqual([]));
});

describe('capTableSteps', () => {
  const holders: Holding[] = [
    { name: 'Founder A', kind: 'common', shares: 4550000 },
    { name: 'Founder B', kind: 'common', shares: 4550000 },
    { name: 'Unallocated option pool', kind: 'pool', shares: 900000 },
  ];
  const rounds: CapTableRound[] = [
    { name: 'Seed', preMoney: 8000000, investors: [{ name: 'Seed investors', amount: 2000000 }], poolTargetPct: 10, timing: 'pre', grantsBefore: 0 },
    { name: 'Series A', preMoney: 30000000, investors: [{ name: 'Series A investors', amount: 10000000 }], poolTargetPct: 15, timing: 'pre', grantsBefore: 500000 },
  ];
  const commonPct = (h: Holding[], rs: CapTableRound[]) => {
    const r = buildCapTable(h, rs);
    if ('error' in r) throw new Error(r.error);
    return ownershipByHolder(r, r.stages.length - 1).filter((x) => h.some((y) => y.name === x.name && y.kind === 'common')).reduce((a, b) => a + b.pct, 0);
  };
  it.each([[rounds], [rounds.slice(0, 1)], [[{ ...rounds[0], timing: 'post' as const }, rounds[1]]]])('ends with the common holders\' stake', (rs) => {
    const s = S.capTableSteps(holders, rs);
    sized(s);
    expect(last(s)).toBe(loanPct(commonPct(holders, rs)));
  });
  it('seed price by hand: P = (0.125 × 10M − 0.9M) / 0.875 = 400,000; price = 8M / 10.4M = $0.7692', () => {
    const s = S.capTableSteps(holders, rounds);
    expect(s[0].working).toContain('P = 400,000');
    expect(s[0].result).toBe('$0.7692');
  });
  it('compacts four or more rounds and stays within 8 steps', () => {
    const many = [0, 1, 2, 3, 4].map((k) => ({ name: `R${k}`, preMoney: 1e7 * (k + 1), investors: [{ name: `I${k}`, amount: 1e6 }], poolTargetPct: 0, timing: 'pre' as const, grantsBefore: 0 }));
    const s = S.capTableSteps(holders, many);
    expect(s.length).toBe(6);
    noNaN(s);
  });
  it('an invalid table gives no steps', () => expect(S.capTableSteps([], rounds)).toEqual([]));
});

describe('freelanceRateSteps', () => {
  const def: FreelanceInput = { targetNetIncome: 70000, annualExpenses: 12000, taxRatePct: 28, profitMarginPct: 5, daysPerWeek: 5, hoursPerDay: 8, vacationDays: 20, holidays: 10, sickDays: 5, billablePct: 65 };
  it.each([[def], [{ ...def, billablePct: 80, taxRatePct: 35 }], [{ ...def, daysPerWeek: 4, profitMarginPct: 0 }]])('ends with the hourly rate', (i) => {
    const s = S.freelanceRateSteps(i);
    sized(s);
    const r = freelanceRate(i);
    expect(last(s)).toBe(bizMoney('USD')(r.value!.hourlyRate));
  });
  it('working days by hand: 52 × 5 − 35 = 225', () => expect(S.freelanceRateSteps(def)[0].result).toBe('225 days'));
  it('invalid input gives no steps', () => expect(S.freelanceRateSteps({ ...def, taxRatePct: 100 })).toEqual([]));
});

describe('meetingCostSteps', () => {
  const def: MeetingInput = { groups: [{ label: 'Engineers', count: 4, pay: 140000, basis: 'annual' }, { label: 'Managers', count: 2, pay: 175000, basis: 'annual' }], durationMinutes: 60, overheadMultiplier: 1.3, hoursPerYear: 2080, perWeek: 1, weeksPerYear: 48 };
  it('ends with the yearly cost when recurring, else the cost per meeting', () => {
    const money = bizMoney('USD');
    expect(last(S.meetingCostSteps(def))).toBe(money(meetingCost(def).value!.costPerYear!));
    const once = { ...def, perWeek: 0, durationMinutes: 45 };
    expect(last(S.meetingCostSteps(once))).toBe(money(meetingCost(once).value!.costPerMeeting));
    sized(S.meetingCostSteps(def));
  });
  it('rate by hand: 140,000 / 2,080 × 1.3 = $87.50 an hour', () => expect(S.meetingCostSteps(def)[0].result).toBe('$87.50/h'));
  it('many groups fold into one step', () => {
    const many = { ...def, groups: [1, 2, 3, 4, 5].map((k) => ({ label: `G${k}`, count: 1, pay: 50 * k, basis: 'hourly' as const })) };
    const s = S.meetingCostSteps(many);
    expect(s.length).toBeLessThanOrEqual(8);
    noNaN(s);
  });
  it('a zero-length meeting gives no steps', () => expect(S.meetingCostSteps({ ...def, durationMinutes: 0 })).toEqual([]));
});

describe('paybackPeriodSteps', () => {
  const def: PaybackInput = { initialInvestment: 100000, cashFlows: [30000, 40000, 50000, 20000, 20000], discountRatePct: 10 };
  it.each([[def], [{ ...def, cashFlows: [25000, 25000, 25000, 25000, 25000, 25000] }], [{ ...def, cashFlows: [10000, 10000] }]])('ends with the NPV and shows the paybacks as printed', (i) => {
    const s = S.paybackPeriodSteps(i, 'years');
    sized(s);
    const r = paybackPeriod(i).value!;
    expect(last(s)).toBe(bizMoney('USD')(r.npv));
    expect(s.find((x) => x.label === 'Simple payback')!.result).toBe(S.paybackLabel(r.simple, 'years'));
    expect(s.find((x) => x.label === 'Discounted payback')!.result).toBe(S.paybackLabel(r.discounted, 'years'));
  });
  it('simple payback by hand: 2 + 30,000 / 50,000 = 2.6 years', () => expect(S.paybackPeriodSteps(def).find((x) => x.label === 'Simple payback')!.result).toBe('2.6 years (2 y 7 m)'));
  it('no investment gives no steps', () => expect(S.paybackPeriodSteps({ ...def, initialInvestment: 0 })).toEqual([]));
});

describe('barbellPlateSteps', () => {
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25].map((size) => ({ size, pairs: null as number | null }));
  const def: BarbellInput = { unit: 'kg', target: 100, bar: 20, collarEach: 0, plates };
  it.each([[def], [{ ...def, target: 142.5, collarEach: 2.5 }], [{ ...def, unit: 'lb' as const, target: 225, bar: 45, plates: [45, 35, 25, 10, 5, 2.5].map((size) => ({ size, pairs: null })) }]])('ends with the total on the bar', (i) => {
    const s = S.barbellPlateSteps(i);
    sized(s);
    const r = calculateBarbellLoad(i)!;
    expect(last(s)).toBe(`${S.fitFmt(r.exact!.total, 2)} ${i.unit}`);
  });
  it('per side by hand: (100 − 20) / 2 = 40 kg as 25 + 15', () => {
    const s = S.barbellPlateSteps(def);
    expect(s[1].result).toBe('40.00 kg');
    expect(s[2].result).toBe('25 + 15 per side');
  });
  it('without an exact load it reports the nearest loads', () => {
    const s = S.barbellPlateSteps({ ...def, target: 101, plates: plates.map((p) => ({ ...p, pairs: p.size === 1.25 ? 0 : null })) });
    expect(last(s)).toMatch(/below.*above/);
    noNaN(s);
  });
  it('a target below the bar gives no steps', () => expect(S.barbellPlateSteps({ ...def, target: 10 })).toEqual([]));
});

describe('bloodPressureSteps', () => {
  it.each([[[{ sys: 128, dia: 82 }]], [[{ sys: 138, dia: 88 }, { sys: 131, dia: 84 }, { sys: 129, dia: 83 }]], [[{ sys: 185, dia: 100 }]]])('ends with the ACC/AHA category', (readings) => {
    const s = S.bloodPressureSteps(readings);
    sized(s);
    expect(last(s)).toBe(ACC_AHA_LABELS[summariseReadings(readings)!.accAha]);
  });
  it('MAP by hand: 82 + (128 − 82) / 3 = 97', () => {
    const s = S.bloodPressureSteps([{ sys: 128, dia: 82 }]);
    expect(s.find((x) => x.label === 'Mean arterial pressure')!.result).toBe('97 mmHg');
    expect(s.find((x) => x.label === 'Pulse pressure')!.result).toBe('46 mmHg');
  });
  it('drops the first reading when asked, and no readings give no steps', () => {
    expect(S.bloodPressureSteps([{ sys: 150, dia: 95 }, { sys: 118, dia: 76 }], true)[0].label).toBe('Pulse pressure');
    expect(S.bloodPressureSteps([])).toEqual([]);
  });
});

describe('bodySurfaceAreaSteps', () => {
  it.each([['mosteller'], ['dubois'], ['boyd'], ['schlich']] as const)('ends with the %s BSA the page shows', (formula) => {
    const s = S.bodySurfaceAreaSteps({ weightKg: 70, heightCm: 170, sex: 'female', formula });
    sized(s);
    expect(last(s)).toBe(`${S.fitFmt(bodySurfaceArea(formula, 70, 170, 'female')!, 2)} m²`);
  });
  it('Mosteller by hand: √(170 × 70 / 3600) = 1.82 m²; dose 1.82 × 75 = 136.5', () => {
    const s = S.bodySurfaceAreaSteps({ weightKg: 70, heightCm: 170, sex: 'male', formula: 'mosteller', dosePerM2: 75 });
    expect(s[0].working).toBe('√(170 × 70 / 3600)');
    expect(s[0].result).toBe('1.82 m²');
    expect(last(s)).toBe('136.5');
  });
  it('shows the US unit conversion, and bad input gives no steps', () => {
    const s = S.bodySurfaceAreaSteps({ weightKg: 154 * 0.45359237, heightCm: 67 * 2.54, sex: 'male', formula: 'mosteller', imperial: { lb: 154, ft: 5, inch: 7 } });
    expect(s[0].working).toContain('154 × 0.45359237');
    expect(S.bodySurfaceAreaSteps({ weightKg: 0, heightCm: 170, sex: 'male', formula: 'mosteller' })).toEqual([]);
  });
});

describe('intermittentFastingSteps', () => {
  it.each([[720, 16], [600, 18], [1080, 20]])('ends when the fast ends (window %i, %i h)', (start, fast) => {
    const s = S.intermittentFastingSteps(start, fast);
    sized(s);
    expect(last(s)).toBe(S.fastingClock(dailyFastingPlan(start, fast)!.fastEnd));
  });
  it('16:8 from 12:00 by hand: window closes 20:00, fast until 12:00 next day', () => {
    const s = S.intermittentFastingSteps(720, 16);
    expect(s[1].result).toBe('20:00');
    expect(last(s)).toBe('12:00 next day');
  });
  it('a fast of 24 hours or more has no daily plan', () => expect(S.intermittentFastingSteps(720, 24)).toEqual([]));
});

describe('chmodSteps', () => {
  it.each([[0o755], [0o644], [0o4755], [0o1777], [0]])('ends with the octal mode %o', (mode) => {
    const s = S.chmodSteps(mode);
    sized(s);
    expect(last(s)).toBe(toOctal(mode));
  });
  it('755 by hand: 4 + 2 + 1 = 7, 4 + 1 = 5', () => {
    const s = S.chmodSteps(0o755);
    expect(s[0]).toMatchObject({ working: '4 + 2 + 1', result: '7 (rwx)' });
    expect(s[1]).toMatchObject({ working: '4 + 1', result: '5 (r-x)' });
  });
  it('out-of-range modes give no steps', () => expect(S.chmodSteps(0o17777)).toEqual([]));
});

describe('dayOfWeekSteps', () => {
  it.each([[{ y: 2026, m: 11, d: 6 }, 'gregorian'], [{ y: 2000, m: 2, d: 29 }, 'gregorian'], [{ y: 1500, m: 3, d: 1 }, 'julian'], [{ y: 1066, m: 10, d: 14 }, 'auto']] as const)('ends with the weekday', (v, cal) => {
    const s = S.dayOfWeekSteps(v, cal);
    sized(s);
    expect(last(s)).toBe(dayOfWeek(v, cal).weekday);
    expect(s[2].result).toBe(last(s));
  });
  it('by hand: 1 January 2000 was a Saturday (h = 0)', () => {
    const s = S.dayOfWeekSteps({ y: 2000, m: 1, d: 1 });
    expect(s[1].result).toBe('h = 0');
    expect(last(s)).toBe('Saturday');
  });
  it('an impossible date gives no steps', () => expect(S.dayOfWeekSteps({ y: 2025, m: 2, d: 29 })).toEqual([]));
});

describe('advancedCalculatorSteps', () => {
  it.each([['12 × (3 + 4) - 5^2'], ['sqrt(16) + ln(e) + log(100)'], ['(5)! ÷ 4'], ['50% × 80'], ['2 mod 3 + 7'], ['1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11']])('ends with the result the display shows for %s', (expr) => {
    const s = S.advancedCalculatorSteps(expr, 'scientific');
    sized(s);
    expect(last(s)).toBe(evaluateCalculatorExpression(expr));
  });
  it('order of operations by hand: 12 × 7 = 84, 5^2 = 25, 84 − 25 = 59', () => {
    const s = S.advancedCalculatorSteps('12 × (3 + 4) - 5^2');
    expect(s.map((x) => x.result)).toEqual(['7', '84', '25', '59']);
    expect(s[3].working).toBe('84 - 25');
  });
  it('programmer mode reads the operands in the base', () => {
    const s = S.advancedCalculatorSteps('FF & 0F', 'programming', 'HEX');
    expect(s[0].working).toBe('FF = 255, 0F = 15');
    expect(last(s)).toBe(evaluateProgrammerExpression('FF & 0F', 'HEX'));
    expect(last(S.advancedCalculatorSteps('12 << 2', 'programming', 'DEC'))).toBe('48');
  });
  it('a bare number is one step; empty or bad input gives no steps', () => {
    expect(S.advancedCalculatorSteps('42')).toEqual([{ label: 'Value', formula: '42', result: '42' }]);
    expect(S.advancedCalculatorSteps('')).toEqual([]);
    expect(S.advancedCalculatorSteps('3 +')).toEqual([]);
  });
});

describe('marketSizingSteps', () => {
  const sample: MarketSizingInputs = { industrySize: 50e9, samPercentage: 15, marketPenetration: 2.5, competitorCount: 25, avgSpending: 25000, pricingStrategy: 199, totalPopulation: 330e6, industryGrowthRate: 8.5, timeToMarket: 18 };
  const blank: MarketSizingInputs = { industrySize: 0, samPercentage: 0, marketPenetration: 0, competitorCount: 0, avgSpending: 0, pricingStrategy: 0, timeToMarket: 12 };
  it.each([[sample], [blank], [{ ...sample, competitorCount: 40, timeToMarket: 0 }]])('ends with SOM at launch', (d) => {
    const s = S.marketSizingSteps(d);
    sized(s);
    expect(last(s)).toBe(S.marketCurrency(calculateMarketSize(d).somAtLaunch));
  });
  it('by hand: SAM 7.5B, f = 1 − 0.75 = 0.25, SOM = 7.5B × 2.5% × 0.25 = $46.9M', () => {
    const s = S.marketSizingSteps(sample);
    expect(s[1].result).toBe('$7.5B');
    expect(s[2].result).toBe('0.25');
    expect(s[3].result).toBe('$46.9M');
  });
  it('the competition factor never falls below 0.1', () => expect(S.marketSizingSteps({ ...sample, competitorCount: 100 })[2].result).toBe('0.1'));
});

describe('realEstateInvestmentSteps', () => {
  const def: RentalPropertyInput = { purchasePrice: 300000, downPayment: 20, closingCosts: 3, loanTerm: 30, interestRate: 6.5, monthlyRent: 2500, propertyTaxes: 3600, insurance: 1200, maintenance: 2400, vacancy: 5, propertyManagement: 8, appreciation: 3, analysisYears: 10, depreciation: 3.636, taxRate: 25 };
  it.each([[def], [{ ...def, downPayment: 25, monthlyRent: 3000 }], [{ ...def, interestRate: 0, analysisYears: 5 }]])('ends with the total ROI the page shows', (i) => {
    const s = S.realEstateInvestmentSteps(i);
    sized(s);
    const { metrics } = analyzeRentalProperty(i);
    expect(last(s)).toBe(`${metrics.totalROI}%`);
    expect(s.find((x) => x.label === 'Cap rate')!.result).toBe(`${metrics.capRate}%`);
  });
  it('by hand: NOI = 28,500 − (7,200 + 8% × 28,500) = 19,020; cap rate 6.34%', () => {
    const s = S.realEstateInvestmentSteps(def);
    expect(s[0].result).toBe('$69,000');
    expect(s[2].result).toBe('$19,020');
    expect(s[3].result).toBe('6.34%');
  });
  it('a zero price still gives finite steps', () => noNaN(S.realEstateInvestmentSteps({ ...def, purchasePrice: 0 })));
});

describe('unitConverterSteps', () => {
  it.each([
    ['length', 'Micrometer', 'Meter', 12], ['length', 'Mile', 'Foot', 3], ['volume', 'Gallon (US)', 'Liter', 1], ['weight', 'Pound', 'Stone', 200],
    ['temperature', 'Fahrenheit', 'Kelvin', 32], ['temperature', 'Celsius', 'Fahrenheit', 100], ['time', 'Hour', 'Second', 1],
  ] as const)('%s: %s to %s ends with the listed value', (category, from, to, value) => {
    const s = S.unitConverterSteps({ category, from, to, value, precision: '6' });
    sized(s);
    const sym = { Meter: 'm', Foot: 'ft', Liter: 'l', Stone: 'st', Kelvin: 'K', Fahrenheit: '°F', Second: 's' }[to];
    expect(last(s)).toBe(`${S.formatUnitResult(convertUnit(value, category, from, to), '6')} ${sym}`);
  });
  it('by hand: 3 mi = 4,828.032 m = 15,840 ft; 32 °F = 273.15 K', () => {
    expect(last(S.unitConverterSteps({ category: 'length', from: 'Mile', to: 'Foot', value: 3 }))).toBe('15,840 ft');
    expect(last(S.unitConverterSteps({ category: 'temperature', from: 'Fahrenheit', to: 'Kelvin', value: 32 }))).toBe('273.15 K');
  });
  it('a blank value or an unknown unit gives no steps', () => {
    expect(S.unitConverterSteps({ category: 'length', from: 'Meter', to: 'Foot', value: NaN })).toEqual([]);
    expect(S.unitConverterSteps({ category: 'length', from: 'Meter', to: 'Furlong', value: 1 })).toEqual([]);
  });
});

describe('budgetPlannerSteps', () => {
  const def: BudgetInput = {
    numberOfAdults: 2, numberOfKids: 0,
    incomeItems: [{ amount: 5000 }, { amount: 500 }],
    fixedExpenses: [{ amount: 1500, category: 'Housing' }, { amount: 200, category: 'Housing' }, { amount: 400, category: 'Transportation' }, { amount: 150 }],
    variableExpenses: [{ amount: 600 }, { amount: 200 }, { amount: 200 }, { amount: 400 }],
    savingsGoal: 500, emergencyFund: 3000,
  };
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  it.each([[def], [{ ...def, incomeItems: [{ amount: 4000 }] }], [{ ...def, incomeItems: [] }]])('ends with the budget health', (b) => {
    const s = S.budgetPlannerSteps(b);
    sized(s);
    expect(last(s)).toBe(cap(computeBudget(b).budgetHealth));
  });
  it('by hand: 3,650 / 5,500 = 66.4%, excellent; savings rate 500 / 5,500 = 9.1%', () => {
    const s = S.budgetPlannerSteps(def);
    expect(s[3].result).toBe('9.1%');
    expect(s[5].working).toContain('66.4%');
    expect(last(s)).toBe('Excellent');
  });
});

describe('etfInvestmentSteps', () => {
  const def: EtfSimulationInput = { initialAmount: 5000, monthlyContribution: 500, contributionFrequency: 'monthly', annualReturn: 10.2, dividendYield: 1.3, reinvestDividends: true, investmentPeriod: 30, contributionIncrease: 50, contributionIncreaseFrequency: 'yearly', expenseRatio: 0, inflationRate: 2.5, salary: 60000, salaryGrowthRate: 0 };
  it.each([[def], [{ ...def, reinvestDividends: false, expenseRatio: 0.2 }], [{ ...def, investmentPeriod: 1 }]])('ends with the final value', (i) => {
    const s = S.etfInvestmentSteps(i);
    sized(s);
    expect(last(s)).toBe(S.dollars(simulateEtf(i).summary.finalValue));
  });
  it('year 1 by hand: A = 8,000; 5,000 + 6,000 + 8,000 × 10.2% = 11,816', () => expect(S.etfInvestmentSteps(def)[2].result).toBe('$11,816'));
});

describe('firePlannerSteps', () => {
  const def: FireInput = { currentAge: 30, targetAge: 50, currentSavings: 75000, monthlyIncome: 8000, monthlyExpenses: 5000, expectedInflation: 2.5, expectedReturn: 7, safeWithdrawalRate: 4, socialSecurityAge: 67, socialSecurityBenefit: 2500, targetFIRENumber: 0 };
  it.each([[def], [{ ...def, monthlyExpenses: 3000 }], [{ ...def, monthlyIncome: 5000 }], [{ ...def, targetFIRENumber: 1500000 }]])('ends with years to FIRE as the page shows', (i) => {
    const s = S.firePlannerSteps(i);
    sized(s);
    const t = computeFirePlan(i).metrics.timeToFIRE;
    expect(last(s)).toBe(t === null ? 'Not reached' : `${t} years`);
  });
  it('by hand: FIRE number = 60,000 × 1.025^20 / 4% = 2,457,925', () => {
    const s = S.firePlannerSteps(def);
    expect(s[1].result).toBe('$98,317');
    expect(s[2].result).toBe('$2,457,925');
  });
});
