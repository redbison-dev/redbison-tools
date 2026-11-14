/**
 * "Show the working" for rollout batch s8 (docs/calculation-standard.md):
 * card and loan comparisons, startup and business calculators, the older
 * finance planners, converters and a few health and date tools. Each
 * `<tool>Steps()` returns ReportStep[] built from the same function the page
 * uses for its answer, so the last step's result equals what the page shows
 * (src/test/tools/steps-s8.test.ts).
 *
 * Formatters that copy a page's own (or that the page now imports from here)
 * sit next to the steps they serve, so a step reads exactly like the result
 * on screen.
 */
import { parse, type MathNode } from 'mathjs';
import { stepMsg, stepMsgText, type ReportStep } from '../../report/model';
import { loanMoney, loanPct, plain, bizMoney, bizNum } from './s1';
import { calculateBalanceTransfer, type BalanceTransferInput, type BalanceTransferResult } from '../calculators/balance-transfer-calculator';
import { calculateConsolidation, type ConsolidationInput, type ConsolidationResult } from '../calculators/debt-consolidation-calculator';
import { analyzeOptionPool, type OptionPoolInput } from '../startup/option-pool-calculator';
import { buildCapTable, type CapTableResult, type CapTableRound, type Holding } from '../startup/cap-table-calculator';
import { freelanceRate, meetingCost, paybackPeriod, yearsMonths, type FreelanceInput, type MeetingInput, type PaybackInput } from '../w500/business2-calc';
import { calculateBarbellLoad, describePlates, type BarbellInput } from '../calculators/barbell-plate-calculator';
import {
  ACC_AHA_LABELS, ESH_LABELS, BSA_FORMULAS, KG_PER_LB, classifyAccAha, summariseReadings, bodySurfaceArea, doseFromBsa, cardiacIndex,
  dailyFastingPlan, formatClock, BP_GUIDELINES, classifyBpGuideline, type BpGuideline, type BpSetting, type BpReading, type BsaFormula, type Sex,
} from '../w500/health2';
import { hasBit, toOctal, toSymbolic, SETUID, SETGID, STICKY, type Who } from '../w500/webops-chmod';
import { dayOfWeek, type CalendarChoice } from '../w500/everyday2-dates';
import { evaluateCalculatorExpression, evaluateProgrammerExpression, formatCalcResult, parseInBase, type NumberBase } from '../advanced-calculator';
import { calculateMarketSize, type MarketSizingInputs } from '../market-sizing-calculator';
import { analyzeRentalProperty, monthlyNominalRatePct, rentalMonthlyPayment, type RentalPropertyInput } from '../real-estate-investment-analyzer';
import { conversionCategories, convertUnit } from '../unit-converter';
import { computeBudget, type BudgetInput } from '../budget-planner';
import { simulateEtf, type EtfSimulationInput } from '../etf-investment-simulator';
import { computeFirePlan, type FireInput } from '../fire-planner';
import { msg } from '../../msg';

type MsgVars = Record<string, string | number>;
/** Fills {name} placeholders: the US English text of a msg() template, as t() renders it on an English page. */
const fillMsg = (text: string, vars: MsgVars) => text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k])));
/*
 * Step text built from a msg() template with values in it. Each spreads the
 * English text into its field plus the message for t() (labelMsg,
 * formulaMsg, workingMsg, resultMsg; same shape as ReportStep.resultMsg), so
 * the English output stays as it was.
 */
const msgLabel = (text: string, vars: Record<string, unknown>) => { const m = stepMsg(text, vars); return { label: stepMsgText(m), labelMsg: m }; };
const msgFormula = (text: string, vars: Record<string, unknown>) => { const m = stepMsg(text, vars); return { formula: stepMsgText(m), formulaMsg: m }; };
const msgWorking = (text: string, vars: Record<string, unknown>) => { const m = stepMsg(text, vars); return { working: stepMsgText(m), workingMsg: m }; };
const msgResult = (text: string, vars: Record<string, unknown>) => { const m = stepMsg(text, vars); return { result: stepMsgText(m), resultMsg: m }; };
/** A result from a helper that returns { text, vars } (the page's headline as a message). */
const msgResultOf = (m: { text: string; vars: MsgVars }) => msgResult(m.text, m.vars);


// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A loan-kit amount in the working: no cents when it is a whole number. */
const lw = (v: number, cur: string) => loanMoney(v, cur, Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 2);
/** `$1,234` with the default locale, the way the older finance pages print money (`$${x.toLocaleString()}`). */
export const dollars = (x: number) => `$${x.toLocaleString()}`;
const shares = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '–');

// ---------------------------------------------------------------------------
// Balance transfer
// ---------------------------------------------------------------------------

/** The headline the balance transfer page shows (also used by the page). */
export function balanceTransferHeadline(r: BalanceTransferResult, cur = 'USD'): string {
  const h = balanceTransferHeadlineMsg(r, cur);
  return fillMsg(h.text, h.vars);
}

/** balanceTransferHeadline() as a message for t(). */
export function balanceTransferHeadlineMsg(r: BalanceTransferResult, cur = 'USD'): { text: string; vars: MsgVars } {
  const m = (v: number) => loanMoney(v, cur);
  if (r.savings === null) {
    if (r.stay.months === null && r.transfer.months === null) return { text: msg('Neither plan pays off at this payment'), vars: {} };
    return r.stay.months === null ? { text: msg('Only the transfer pays off'), vars: {} } : { text: msg('The transfer never pays off'), vars: {} };
  }
  return r.savings >= 0 ? { text: msg('Saves {amount}'), vars: { amount: m(r.savings) } } : { text: msg('Costs {amount} more'), vars: { amount: m(-r.savings) } };
}

/** Transfer fee, the promotional phase and the comparison with staying. Last step: the headline. */
export function balanceTransferSteps(i: BalanceTransferInput, cur = 'USD'): ReportStep[] {
  const r = calculateBalanceTransfer(i);
  if (!r) return [];
  const m = (v: number) => loanMoney(v, cur);
  const n = Math.round(i.promoMonths);
  const steps: ReportStep[] = [
    { label: msg('Transfer fee'), formula: msg('fee = max(fee % × balance, minimum fee)'), working: `max(${plain(i.feePct)}% × ${lw(i.balance, cur)}, ${lw(i.feeMin, cur)})`, result: m(r.fee) },
    { label: msg('Balance on the new card'), formula: msg('B₀ = balance + fee'), working: `${lw(i.balance, cur)} + ${m(r.fee)}`, result: m(r.startingBalance) },
  ];
  if (n > 0) {
    steps.push({
      label: msg('Payment that clears it within the promotion'),
      formula: i.promoAprPct > 0 ? msg('P = B₀ × r / (1 − (1 + r)^−n), r = promotional APR / 12') : msg('P = B₀ / n (0% promotional APR)'),
      working: i.promoAprPct > 0 ? `${m(r.startingBalance)} × r / (1 − (1 + r)^−${n}), r = ${plain(i.promoAprPct)}% / 12` : `${m(r.startingBalance)} / ${n}`,
      result: m(r.paymentToClearInPromo),
    });
  }
  steps.push({
    label: msg('Owed when the promotion ends'),
    formula: msg('each month: B ← B × (1 + APR / 12) − payment'),
    ...msgWorking(msg('{startingBalance} at {promoAprPct}% for {n} months, paying {monthlyPayment} a month'), { startingBalance: m(r.startingBalance), promoAprPct: plain(i.promoAprPct), n, monthlyPayment: lw(i.monthlyPayment, cur) }),
    result: m(r.transfer.balanceAtPromoEnd),
  });
  steps.push({
    label: msg('Cost of the transfer'),
    formula: msg('cost = fee + interest (promotional, then go-to APR)'),
    ...(r.transfer.months === null ? msgWorking(msg('{fee} + interest at {goToAprPct}% that the payment never clears'), { fee: m(r.fee), goToAprPct: plain(i.goToAprPct) }) : { working: `${m(r.fee)} + ${m(r.transfer.totalInterest)}` }),
    ...(r.transfer.months === null ? msgResult(msg('open-ended'), {}) : { result: m(r.transfer.totalCost) }),
  });
  steps.push({
    label: msg('Cost of staying on the current card'),
    formula: msg('interest at the current APR / 12 each month until paid off'),
    ...(r.stay.months === null
      ? msgWorking(msg('{balance} at {apr}%, paying {payment} a month'), { balance: lw(i.balance, cur), apr: plain(i.currentAprPct), payment: lw(i.monthlyPayment, cur) })
      : msgWorking(msg('{balance} at {apr}%, paying {payment} a month for {months} months'), { balance: lw(i.balance, cur), apr: plain(i.currentAprPct), payment: lw(i.monthlyPayment, cur), months: r.stay.months })),
    ...(r.stay.months === null ? msgResult(msg('open-ended'), {}) : { result: m(r.stay.totalCost) }),
  });
  steps.push({
    label: msg('Transfer against staying'),
    formula: msg('savings = cost of staying − cost of the transfer'),
    ...(r.savings === null ? msgWorking(msg('one plan never pays off at this payment'), {}) : { working: `${m(r.stay.totalCost)} − ${m(r.transfer.totalCost)}` }),
    ...msgResultOf(balanceTransferHeadlineMsg(r, cur)),
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Debt consolidation
// ---------------------------------------------------------------------------

/** The headline the debt consolidation page shows (also used by the page). */
export function debtConsolidationHeadline(r: ConsolidationResult, cur = 'USD'): string {
  const h = debtConsolidationHeadlineMsg(r, cur);
  return fillMsg(h.text, h.vars);
}

/** debtConsolidationHeadline() as a message for t(). */
export function debtConsolidationHeadlineMsg(r: ConsolidationResult, cur = 'USD'): { text: string; vars: MsgVars } {
  const m = (v: number) => loanMoney(v, cur);
  if (r.savings === null) return { text: msg('Only the loan pays off'), vars: {} };
  return r.savings >= 0 ? { text: msg('Saves {amount}'), vars: { amount: m(r.savings) } } : { text: msg('Costs {amount} more'), vars: { amount: m(-r.savings) } };
}

/** Debt total, loan amount with the fee, payment, APR and the cost comparison. Last step: the headline. */
export function debtConsolidationSteps(i: ConsolidationInput, cur = 'USD'): ReportStep[] {
  const r = calculateConsolidation(i);
  if (!r) return [];
  const m = (v: number) => loanMoney(v, cur);
  const debts = i.debts.filter((d) => Number.isFinite(d.balance) && d.balance > 0);
  const n = Math.round(i.termMonths);
  const list = debts.length <= 5 ? debts : null;
  const ukApr = (i.compoundingPerYear ?? 12) === 1;
  return [
    { label: msg('Debts to consolidate'), formula: msg('D = Σ balances'), ...(list ? { working: list.map((d) => lw(d.balance, cur)).join(' + ') } : msgWorking(msg('{length} balances'), { length: debts.length })), result: m(r.totalDebt) },
    {
      label: msg('Average APR now'),
      formula: msg('weighted APR = Σ (balance × APR) / D'),
      ...(list ? { working: `(${list.map((d) => `${lw(d.balance, cur)} × ${plain(d.aprPct)}%`).join(' + ')}) / ${m(r.totalDebt)}` } : msgWorking(msg('Σ (balance × APR) / {totalDebt}'), { totalDebt: m(r.totalDebt) })),
      result: loanPct(r.weightedAprPct),
    },
    i.feeMode === 'deducted'
      ? { label: msg('Loan amount'), formula: msg('L = D / (1 − fee %), so the money received still pays every debt'), working: `${m(r.totalDebt)} / (1 − ${plain(i.feePct)}%)`, result: m(r.loan.amount) }
      : { label: msg('Loan amount'), formula: msg('L = D (the fee is paid in cash)'), working: m(r.totalDebt), result: m(r.loan.amount) },
    { label: msg('Origination fee'), formula: msg('fee = L × fee %'), working: `${m(r.loan.amount)} × ${plain(i.feePct)}%`, result: m(r.loan.fee) },
    ukApr
      ? {
          label: msg('Monthly loan payment'),
          formula: 'P = L × r / (1 − (1 + r)^−n), r = (1 + APR)^(1/12) − 1',
          working: `${m(r.loan.amount)} × r / (1 − (1 + r)^−${n}), r = (1 + ${plain(i.loanRatePct)}%)^(1/12) − 1`,
          result: m(r.loan.payment),
        }
      : {
          label: msg('Monthly loan payment'),
          formula: msg('P = L × r / (1 − (1 + r)^−n), r = rate / 12'),
          working: `${m(r.loan.amount)} × r / (1 − (1 + r)^−${n}), r = ${plain(i.loanRatePct)}% / 12`,
          result: m(r.loan.payment),
        },
    {
      label: ukApr ? msg('APR with the fee (annual effective, FCA CONC App 1.1)') : msg('APR with the fee (Regulation Z, Appendix J)'),
      formula: ukApr ? msg('find i so that Σ P / (1 + i)^t for t = 1 … n equals L − fee; APR = (1 + i)^12 − 1') : msg('find i so that Σ P / (1 + i)^t for t = 1 … n equals L − fee; APR = 12 × i'),
      ...msgWorking(msg('Σ {payment} / (1 + i)^t for t = 1 … {n} = {amountFinanced}'), { payment: m(r.loan.payment), n, amountFinanced: m(r.loan.amountFinanced) }),
      result: loanPct(r.loan.aprPct, 3),
    },
    {
      label: msg('Loan against your current plan'),
      formula: msg('savings = current interest − (loan interest + fee)'),
      ...(r.savings === null ? msgWorking(msg('the current plan never pays off at these payments'), {}) : { working: `${m(r.current.totalInterest)} − (${m(r.loan.totalInterest)} + ${m(r.loan.fee)})` }),
      ...msgResultOf(debtConsolidationHeadlineMsg(r, cur)),
    },
  ];
}

// ---------------------------------------------------------------------------
// Option pool and cap table
// ---------------------------------------------------------------------------

/** Pool in the pre-money (the option pool shuffle). Last step: the effective pre-money in the headline. */
export function optionPoolSteps(i: OptionPoolInput, cur = 'USD'): ReportStep[] {
  const res = analyzeOptionPool(i);
  if ('error' in res) return [];
  const r = res.pre;
  const m = (v: number) => loanMoney(v, cur, 0);
  const t = i.poolTargetPct / 100;
  const k = (t * (i.preMoney + i.investment)) / i.preMoney;
  return [
    { label: msg('Post-money valuation'), formula: msg('post = V + I'), working: `${m(i.preMoney)} + ${m(i.investment)}`, result: m(r.postMoney) },
    { label: msg('Pool factor'), formula: 'k = t × (V + I) / V', working: `${plain(i.poolTargetPct)}% × ${m(r.postMoney)} / ${m(i.preMoney)}`, result: k.toFixed(6) },
    {
      label: msg('New pool shares'),
      formula: msg('P = (k × F − U) / (1 − k), or 0 if the existing pool already meets the target'),
      working: `(${k.toFixed(6)} × ${shares(i.preFdShares)} − ${shares(i.existingPool)}) / (1 − ${k.toFixed(6)})`,
      result: shares(r.newPoolShares),
    },
    { label: msg('Price per share'), formula: msg('price = V / (F + P)'), working: `${m(i.preMoney)} / (${shares(i.preFdShares)} + ${shares(r.newPoolShares)})`, result: loanMoney(r.pricePerShare, cur, 4) },
    { label: msg('New investor shares'), formula: msg('N = I / price'), working: `${m(i.investment)} / ${loanMoney(r.pricePerShare, cur, 4)}`, result: shares(r.investorShares) },
    { label: msg('Effective pre-money'), formula: msg('effective pre-money = V − P × price'), working: `${m(i.preMoney)} − ${shares(r.newPoolShares)} × ${loanMoney(r.pricePerShare, cur, 4)}`, result: m(r.effectivePreMoney) },
  ];
}

/** Common holders' fully diluted percent at a stage, as the cap table headline sums it. */
export function capTableCommonPct(r: CapTableResult, stage: number): number {
  const st = r.stages[stage];
  return r.rows.reduce((acc, row, k) => acc + (row.kind === 'common' && st.totalFd > 0 ? (st.shares[k] / st.totalFd) * 100 : 0), 0);
}

/** Each priced round (pool, price, new shares) and the common holders' final stake. Last step: the headline percent. */
export function capTableSteps(holders: Holding[], rounds: CapTableRound[], cur = 'USD'): ReportStep[] {
  const res = buildCapTable(holders, rounds);
  if ('error' in res) return [];
  const m = (v: number) => loanMoney(v, cur, 0);
  const p4 = (v: number) => loanMoney(v, cur, 4);
  const compact = res.rounds.length > 3;
  const steps: ReportStep[] = [];
  for (const x of res.rounds) {
    const F = x.preFdShares;
    const pv = { pool: shares(x.newPoolShares), pct: plain(x.poolTargetPct), preMoney: m(x.preMoney), F: shares(F), investment: m(x.investment), price: p4(x.pricePerShare) };
    const pre = x.timing === 'pre';
    if (compact) {
      steps.push({
        ...msgLabel(msg('{name}: price and new shares'), { name: x.name }),
        formula: pre ? msg('k = t (V + I) / V, P = (k F − U) / (1 − k), price = V / (F + P), N = I / price') : msg('price = V / F, P = (t (F + N) − U) / (1 − t), N = I / price'),
        ...(pre
          ? msgWorking(msg('P = {pool} for a {pct}% pool; {preMoney} / ({F} + {pool}); N = {investment} / {price}'), pv)
          : msgWorking(msg('{preMoney} / {F}; P = {pool} for a {pct}% pool; N = {investment} / {price}'), pv)),
        ...msgResult(msg('{pricePerShare} a share, {investorShares} new shares'), { pricePerShare: p4(x.pricePerShare), investorShares: shares(x.investorShares) }),
      });
      continue;
    }
    steps.push({
      ...msgLabel(msg('{name}: price per share'), { name: x.name }),
      formula: pre ? msg('k = t (V + I) / V, P = (k F − U) / (1 − k), price = V / (F + P)') : msg('price = V / F, P = (t (F + N) − U) / (1 − t)'),
      ...(pre ? msgWorking(msg('P = {pool} for a {pct}% pool; {preMoney} / ({F} + {pool})'), pv) : msgWorking(msg('{preMoney} / {F}; P = {pool} for a {pct}% pool'), pv)),
      result: p4(x.pricePerShare),
    });
    steps.push({
      ...msgLabel(msg('{name}: new investor shares'), { name: x.name }),
      formula: msg('N = I / price; fully diluted after = F + P + N'),
      working: `${m(x.investment)} / ${p4(x.pricePerShare)}; ${shares(F)} + ${shares(x.newPoolShares)} + ${shares(x.investorShares)}`,
      ...msgResult(msg('{investorShares} shares, {postFdShares} fully diluted'), { investorShares: shares(x.investorShares), postFdShares: shares(x.postFdShares) }),
    });
  }
  const last = res.stages.length - 1;
  const st = res.stages[last];
  const common = res.rows.reduce((acc, row, k) => acc + (row.kind === 'common' ? st.shares[k] : 0), 0);
  steps.push({
    ...(res.rounds.length ? msgLabel(msg('Common holders after {round}'), { round: res.rounds[res.rounds.length - 1].name }) : { label: msg('Common holders after the last round') }),
    formula: msg('ownership = common shares / total fully diluted shares'),
    working: `${shares(common)} / ${shares(st.totalFd)}`,
    result: loanPct(capTableCommonPct(res, last)),
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Business: freelance rate, meeting cost, payback period
// ---------------------------------------------------------------------------

/** A business-kit amount in the working: no cents when it is a whole number. */
function bizW(code: string) {
  const money = bizMoney(code);
  const whole = code === 'NONE'
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return (x: number) => (Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9 ? whole.format(x) : money(x));
}

/** Working days, billable hours and the gross-up for tax and margin. Last step: the hourly rate. */
export function freelanceRateSteps(i: FreelanceInput, cur = 'USD'): ReportStep[] {
  const res = freelanceRate(i);
  if (!res.ok) return [];
  const r = res.value;
  const money = bizMoney(cur);
  const w = bizW(cur);
  const dpw = i.daysPerWeek ?? 5;
  const hpd = i.hoursPerDay ?? 8;
  return [
    {
      label: msg('Working days a year'),
      formula: msg('days = 52 × days per week − vacation − holidays − sick days'),
      working: `52 × ${plain(dpw)} − ${plain(i.vacationDays ?? 20)} − ${plain(i.holidays ?? 10)} − ${plain(i.sickDays ?? 5)}`,
      ...msgResult(msg('{workingDays} days'), { workingDays: bizNum(r.workingDays) }),
    },
    { label: msg('Billable hours a year'), formula: msg('hours = days × hours per day × billable share'), working: `${bizNum(r.workingDays)} × ${plain(hpd)} h × ${plain(i.billablePct ?? 70)}%`, result: `${bizNum(r.billableHours, 1)} h` },
    { label: msg('Profit before tax'), formula: msg('profit = take-home / (1 − tax rate)'), working: `${w(i.targetNetIncome)} / (1 − ${plain(i.taxRatePct)}%)`, result: money(r.preTaxProfit) },
    { label: msg('Revenue needed'), formula: msg('revenue = (profit + expenses) / (1 − margin)'), working: `(${money(r.preTaxProfit)} + ${w(i.annualExpenses)}) / (1 − ${plain(i.profitMarginPct ?? 0)}%)`, result: money(r.revenue) },
    { label: msg('Hourly rate'), formula: msg('rate = revenue / billable hours'), working: `${money(r.revenue)} / ${bizNum(r.billableHours, 1)} h`, result: money(r.hourlyRate) },
  ];
}

/** Loaded hourly rate per group, cost per hour and per meeting (and per year when recurring). Last step: per year if recurring, else per meeting. */
export function meetingCostSteps(i: MeetingInput, cur = 'USD'): ReportStep[] {
  const res = meetingCost(i);
  if (!res.ok) return [];
  const r = res.value;
  const money = bizMoney(cur);
  const w = bizW(cur);
  const hours = i.hoursPerYear ?? 2080;
  const overhead = i.overheadMultiplier ?? 1;
  const steps: ReportStep[] = [];
  const groups = i.groups.map((g, k) => ({ g, out: r.groups[k] }));
  const rateWorking = (g: (typeof i.groups)[number]) => (g.basis === 'annual' ? `${w(g.pay)} / ${plain(hours)} h × ${plain(overhead)}` : `${w(g.pay)} × ${plain(overhead)}`);
  if (groups.length <= 4) {
    for (const { g, out } of groups) {
      steps.push({
        ...msgLabel(msg('{label}: loaded hourly rate'), { label: out.label }),
        formula: g.basis === 'annual' ? msg('rate = salary / paid hours a year × overhead') : msg('rate = hourly pay × overhead'),
        working: rateWorking(g),
        result: `${money(out.hourlyRate)}/h`,
      });
    }
  } else {
    steps.push({
      label: msg('Loaded hourly rates'),
      formula: msg('rate = salary / paid hours a year × overhead (or hourly pay × overhead)'),
      working: groups.map(({ g, out }) => `${out.label} ${rateWorking(g)}`).join('; '),
      result: groups.map(({ out }) => `${money(out.hourlyRate)}/h`).join(', '),
    });
  }
  steps.push({ label: msg('Cost per hour'), formula: msg('cost per hour = Σ people × loaded rate'), working: groups.map(({ out }) => `${out.count} × ${money(out.hourlyRate)}`).join(' + '), result: money(r.costPerHour) });
  steps.push({ label: msg('Cost per meeting'), formula: msg('cost = cost per hour × minutes / 60'), working: `${money(r.costPerHour)} × ${plain(i.durationMinutes)} / 60`, result: money(r.costPerMeeting) });
  if (r.costPerYear !== null) {
    steps.push({ label: msg('Cost per year'), formula: msg('cost per year = cost per meeting × times a week × weeks a year'), working: `${money(r.costPerMeeting)} × ${plain(i.perWeek ?? 0)} × ${plain(i.weeksPerYear ?? 48)}`, result: money(r.costPerYear) });
  }
  return steps;
}

/** A payback period as the payback page prints it (also used by the page). */
export function paybackLabel(p: number | null, unit: 'years' | 'months'): string {
  const l = paybackLabelMsg(p, unit);
  return fillMsg(l.text, l.vars);
}

/** paybackLabel() as a message for t(). */
export function paybackLabelMsg(p: number | null, unit: 'years' | 'months'): { text: string; vars: MsgVars } {
  if (p === null) return { text: msg('Not recovered'), vars: {} };
  if (unit === 'years') {
    const ym = yearsMonths(p);
    const vars = { n: bizNum(p, 2), y: ym.years, m: ym.months };
    return ym.years || ym.months ? { text: msg('{n} years ({y} y {m} m)'), vars } : { text: msg('{n} years'), vars };
  }
  return { text: msg('{n} months'), vars: { n: bizNum(p, 2) } };
}

/** Simple and discounted payback by interpolation, then NPV. Last step: the NPV. */
export function paybackPeriodSteps(i: PaybackInput, unit: 'years' | 'months' = 'years', cur = 'USD'): ReportStep[] {
  const res = paybackPeriod(i);
  if (!res.ok) return [];
  const r = res.value;
  const money = bizMoney(cur);
  const w = bizW(cur);
  const rate = i.discountRatePct ?? 0;
  /** Investment minus the flows before period k: all of them up to six, else the first three and a count. */
  const recoveredWorking = (xs: number[]) =>
    xs.length <= 6
      ? { working: `${w(i.initialInvestment)} − (${xs.map(w).join(' + ')})` }
      : msgWorking(msg('{investment} − ({first} + … ({count} flows))'), { investment: w(i.initialInvestment), first: xs.slice(0, 3).map(w).join(' + '), count: xs.length });
  const recovery = (at: number | null, flows: number[], disc: boolean): ReportStep[] => {
    const name = disc ? msg('Discounted payback') : msg('Simple payback');
    if (at === null) {
      return [{
        label: name,
        formula: disc ? msg('first period where Σ discounted cash flow ≥ investment') : msg('first period where Σ cash flow ≥ investment'),
        ...(unit === 'years'
          ? msgWorking(msg('{investment} not recovered within {n} years'), { investment: w(i.initialInvestment), n: flows.length })
          : msgWorking(msg('{investment} not recovered within {n} months'), { investment: w(i.initialInvestment), n: flows.length })),
        ...msgResultOf(paybackLabelMsg(null, unit)),
      }];
    }
    const k = Math.ceil(at - 1e-12);
    const before = flows.slice(0, k - 1).reduce((s, x) => s + x, 0);
    const left = i.initialInvestment - before;
    return [
      {
        ...(disc ? msgLabel(msg('Discounted payback: still to recover before period {n}'), { n: k }) : msgLabel(msg('Simple payback: still to recover before period {n}'), { n: k })),
        ...(disc ? msgFormula(msg('U = investment − Σ discounted cash flow of periods 1 … {n}'), { n: k - 1 }) : msgFormula(msg('U = investment − Σ cash flow of periods 1 … {n}'), { n: k - 1 })),
        ...(k > 1 ? recoveredWorking(flows.slice(0, k - 1)) : { working: w(i.initialInvestment) }),
        result: money(left),
      },
      { label: name, formula: msg('payback = (k − 1) + U / flow in period k'), working: `${k - 1} + ${money(left)} / ${money(flows[k - 1])}`, ...msgResultOf(paybackLabelMsg(at, unit)) },
    ];
  };
  const discounted = r.rows.map((x) => x.discounted);
  const n = r.rows.length;
  return [
    ...recovery(r.simple, i.cashFlows, false),
    {
      label: msg('Discount factors'),
      formula: 'DF_t = 1 / (1 + r)^t',
      working: `1 / (1 + ${plain(rate)}%)^1 … 1 / (1 + ${plain(rate)}%)^${n}`,
      result: `${r.rows[0].discountFactor.toFixed(4)} … ${r.rows[n - 1].discountFactor.toFixed(4)}`,
    },
    ...recovery(r.discounted, discounted, true),
    { label: msg('Net present value'), formula: msg('NPV = −investment + Σ CF_t / (1 + r)^t'), working: `−${w(i.initialInvestment)} + ${money(discounted.reduce((s, x) => s + x, 0))}`, result: money(r.npv) },
  ];
}

// ---------------------------------------------------------------------------
// Fitness and health
// ---------------------------------------------------------------------------

/** Same as fmt() in fitnessShared.tsx. */
export const fitFmt = (v: number, digits = 1) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '-');

/** Empty bar, load per side and the plates. Last step: the total on the bar (exact) or the nearest loads. */
export function barbellPlateSteps(i: BarbellInput): ReportStep[] {
  const r = calculateBarbellLoad(i);
  if (!r) return [];
  const u = i.unit;
  const steps: ReportStep[] = [
    { label: msg('Empty bar'), formula: msg('empty = bar + 2 × collar'), working: `${plain(i.bar)} + 2 × ${plain(i.collarEach)}`, result: `${fitFmt(r.emptyBar, 2)} ${u}` },
    { label: msg('Load per side'), formula: msg('per side = (target − empty bar) / 2'), working: `(${plain(i.target)} − ${fitFmt(r.emptyBar, 2)}) / 2`, result: `${fitFmt(r.targetPerSide, 2)} ${u}` },
  ];
  if (r.exact) {
    steps.push({ label: msg('Plates on each side'), formula: msg('heaviest plates first, from the plates available, adding up to the load per side'), working: `${describePlates(r.exact.plates)} = ${fitFmt(r.exact.perSide, 2)}`, ...msgResult(msg('{plates} per side'), { plates: describePlates(r.exact.plates) }) });
    steps.push({ label: msg('Total on the bar'), formula: msg('total = empty bar + 2 × plates per side'), working: `${fitFmt(r.emptyBar, 2)} + 2 × ${fitFmt(r.exact.perSide, 2)}`, result: `${fitFmt(r.exact.total, 2)} ${u}` });
  } else {
    const fmtLoad = (l: typeof r.below) => (l ? `${fitFmt(l.total, 2)} ${u}` : '-');
    steps.push({
      label: msg('Nearest loads you can build'),
      formula: msg('no exact combination; search every combination of the plates available'),
      ...(() => {
        const pv = { below: r.below ? describePlates(r.below.plates) : '', above: r.above ? describePlates(r.above.plates) : '' };
        if (r.below && r.above) return msgWorking(msg('below: {below} per side; above: {above} per side'), pv);
        if (r.below) return msgWorking(msg('below: {below} per side; above: not enough plates'), pv);
        if (r.above) return msgWorking(msg('below: nothing lighter; above: {above} per side'), pv);
        return msgWorking(msg('below: nothing lighter; above: not enough plates'), pv);
      })(),
      ...msgResult(msg('{below} below, {above} above'), { below: fmtLoad(r.below), above: fmtLoad(r.above) }),
    });
  }
  return steps;
}

/** Average, pulse pressure, MAP, ESH grade and the ACC/AHA category. Last step: the ACC/AHA category. */
export function bloodPressureSteps(readings: BpReading[], dropFirst = false, opts?: { guideline: BpGuideline; setting: BpSetting }): ReportStep[] {
  const s = summariseReadings(readings, dropFirst);
  if (!s) return [];
  const used = dropFirst && readings.length > 1 ? readings.slice(1) : readings;
  const S = Math.round(s.sys);
  const D = Math.round(s.dia);
  const v = (x: number) => plain(x, 1);
  const steps: ReportStep[] = [];
  if (used.length > 1) {
    const list = (xs: number[]) => (xs.length <= 6 ? xs.join(' + ') : `${xs.slice(0, 3).join(' + ')} + …`);
    steps.push({
      ...msgLabel(msg('Average of {length} readings'), { length: used.length }),
      formula: msg('mean = Σ readings / n, rounded before classifying'),
      working: `(${list(used.map((r) => r.sys))}) / ${used.length}; (${list(used.map((r) => r.dia))}) / ${used.length}`,
      ...msgResult(msg('{sys}/{dia} mmHg, classified as {S}/{D}'), { sys: v(s.sys), dia: v(s.dia), S, D }),
    });
  }
  steps.push({ label: msg('Pulse pressure'), formula: 'PP = SBP − DBP', working: `${v(s.sys)} − ${v(s.dia)}`, ...msgResult(msg('{pulsePressure} mmHg'), { pulsePressure: Math.round(s.pulsePressure) }) });
  steps.push({ label: msg('Mean arterial pressure'), formula: 'MAP = DBP + (SBP − DBP) / 3', working: `${v(s.dia)} + (${v(s.sys)} − ${v(s.dia)}) / 3`, ...msgResult(msg('{map} mmHg'), { map: Math.round(s.map) }) });
  steps.push({
    label: msg('ESH 2023 grade'),
    formula: msg('the higher of the systolic and diastolic grades; isolated systolic when SBP ≥ 140 and DBP < 90'),
    ...msgWorking(msg('systolic {S}, diastolic {D} mmHg'), { S, D }),
    ...(s.esh.isolated ? msgResult('{grade} ({isolated})', { grade: ESH_LABELS[s.esh.grade], isolated: ESH_LABELS[s.esh.isolated] }) : msgResult(ESH_LABELS[s.esh.grade], {})),
  });
  steps.push({
    label: msg('ACC/AHA category'),
    formula: msg('the higher row of the systolic and diastolic readings (ACC/AHA 2017)'),
    ...msgWorking(msg('systolic {S} → {sysCategory}; diastolic {D} → {diaCategory}'), { S, sysCategory: ACC_AHA_LABELS[classifyAccAha(S, 0)], D, diaCategory: ACC_AHA_LABELS[classifyAccAha(0, D)] }),
    ...msgResult(ACC_AHA_LABELS[s.accAha], {}),
  });
  if (opts && opts.guideline !== 'acc-aha') {
    const g = BP_GUIDELINES[opts.guideline];
    const setting = g.homeAware ? opts.setting : 'clinic';
    steps.push({
      ...(!g.homeAware
        ? msgLabel(msg('{name} category'), { name: g.name })
        : setting === 'home'
          ? msgLabel(msg('{name} category (home or ambulatory average)'), { name: g.name })
          : msgLabel(msg('{name} category (clinic reading)'), { name: g.name })),
      formula: msg('the higher row of the systolic and diastolic readings'),
      ...msgWorking(msg('systolic {S}, diastolic {D} mmHg'), { S, D }),
      ...msgResult(classifyBpGuideline(opts.guideline, setting, S, D).label, {}),
    });
  }
  return steps;
}

export type BsaStepsInput = {
  weightKg: number;
  heightCm: number;
  sex: Sex;
  formula: BsaFormula;
  /** The figures as typed in US units, to show the conversion. */
  imperial?: { lb: number; ft: number; inch: number };
  dosePerM2?: number | null;
  cardiacOutput?: number | null;
};

function bsaWorking(f: BsaFormula, W: string, H: string, w: number, sex: Sex): string {
  if (f === 'boyd') {
    const g = plain(w * 1000, 1);
    return `0.0003207 × ${H}^0.3 × ${g}^(0.7285 − 0.0188 × log10 ${g})`;
  }
  if (f === 'schlich') return sex === 'female' ? `0.000975482 × ${W}^0.46 × ${H}^1.08` : `0.000579479 × ${W}^0.38 × ${H}^1.24`;
  return BSA_FORMULAS[f].expr.replace(/\bW\b/g, W).replace(/\bH\b/g, H);
}

/** Unit conversion, the chosen BSA formula and any dose or cardiac index. Last step: the last figure the page shows in the first row. */
export function bodySurfaceAreaSteps(i: BsaStepsInput): ReportStep[] {
  const bsa = bodySurfaceArea(i.formula, i.weightKg, i.heightCm, i.sex);
  if (bsa === null) return [];
  const info = BSA_FORMULAS[i.formula];
  const W = plain(i.weightKg, 2);
  const H = plain(i.heightCm, 2);
  const steps: ReportStep[] = [];
  if (i.imperial) {
    steps.push({
      label: msg('Convert to kilograms and centimetres'),
      formula: msg('W = lb × 0.45359237; H = (12 × ft + in) × 2.54 (exact, NIST SP 811)'),
      working: `${plain(i.imperial.lb)} × ${KG_PER_LB}; (12 × ${plain(i.imperial.ft)} + ${plain(i.imperial.inch)}) × 2.54`,
      result: `W = ${fitFmt(i.weightKg, 1)} kg, H = ${fitFmt(i.heightCm, 1)} cm`,
    });
  }
  steps.push({
    ...msgLabel(msg('Body surface area, {name} ({year})'), { name: info.name, year: info.year }),
    formula: `BSA = ${info.expr}${i.formula === 'schlich' ? '' : ' (W in kg, H in cm)'}`,
    working: bsaWorking(i.formula, W, H, i.weightKg, i.sex),
    result: `${fitFmt(bsa, 2)} m²`,
  });
  const dose = i.dosePerM2 !== null && i.dosePerM2 !== undefined ? doseFromBsa(Math.round(bsa * 100) / 100, i.dosePerM2) : null;
  if (dose !== null) {
    steps.push({ label: msg('Dose'), formula: msg('dose = BSA (rounded to 2 decimals) × dose per m²'), working: `${(Math.round(bsa * 100) / 100).toFixed(2)} × ${plain(i.dosePerM2!)}`, result: fitFmt(dose, 1) });
  }
  const ci = i.cardiacOutput !== null && i.cardiacOutput !== undefined ? cardiacIndex(i.cardiacOutput, bsa) : null;
  if (ci !== null) {
    steps.push({ label: msg('Cardiac index'), formula: msg('CI = cardiac output / BSA'), working: `${plain(i.cardiacOutput!)} L/min / ${fitFmt(bsa, 3)} m²`, result: `${fitFmt(ci, 2)} L/min/m²` });
  }
  return steps;
}

/** Same as planLabel() on the fasting timer page. */
export const fastingClock = (minutes: number) => {
  const c = fastingClockMsg(minutes);
  return fillMsg(c.text, c.vars);
};

/** fastingClock() as a message for t(). */
export const fastingClockMsg = (minutes: number): { text: string; vars: MsgVars } => {
  const c = formatClock(minutes);
  return c.dayOffset > 0 ? { text: msg('{time} next day'), vars: { time: c.time } } : { text: '{time}', vars: { time: c.time } };
};

/** The daily eating window and fast. Last step: when the fast ends. */
export function intermittentFastingSteps(windowStartMin: number, fastHours: number): ReportStep[] {
  const plan = dailyFastingPlan(windowStartMin, fastHours);
  if (!plan) return [];
  // "<clock> + <hours> h", with "next day" after the clock when it falls on the next day.
  const plus = (minutes: number, hours: number) => {
    const c = formatClock(minutes);
    return c.dayOffset > 0 ? msgWorking(msg('{time} next day + {hours} h'), { time: c.time, hours: plain(hours) }) : { working: `${c.time} + ${plain(hours)} h` };
  };
  return [
    { label: msg('Eating window'), formula: msg('eating hours = 24 − fasting hours'), working: `24 − ${plain(fastHours)}`, result: `${plain(plan.eatHours)} h` },
    { label: msg('Last meal finished by'), formula: msg('window closes = first meal + eating hours'), ...plus(plan.windowStart, plan.eatHours), ...msgResultOf(fastingClockMsg(plan.windowEnd)) },
    { label: msg('Fast until'), formula: msg('fast ends = window close + fasting hours'), ...plus(plan.windowEnd, fastHours), ...msgResultOf(fastingClockMsg(plan.fastEnd)) },
  ];
}

// ---------------------------------------------------------------------------
// Web and dates
// ---------------------------------------------------------------------------

/** Permission digits (r = 4, w = 2, x = 1) and the special-bit digit. Last step: the octal mode. */
export function chmodSteps(mode: number, isDir = false): ReportStep[] {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) return [];
  const names: Record<Who, string> = { u: msg('Owner digit'), g: msg('Group digit'), o: msg('Others digit') };
  const digit = (who: Who) => (mode >> (who === 'u' ? 6 : who === 'g' ? 3 : 0)) & 7;
  const steps: ReportStep[] = (['u', 'g', 'o'] as Who[]).map((who) => {
    const parts = ([['r', 4], ['w', 2], ['x', 1]] as const).filter(([p]) => hasBit(mode, who, p)).map(([, v]) => String(v));
    const sym = toSymbolic(mode).slice(who === 'u' ? 0 : who === 'g' ? 3 : 6).slice(0, 3);
    return { label: names[who], formula: msg('read = 4, write = 2, execute = 1; digit = sum'), ...(parts.length ? { working: parts.join(' + ') } : msgWorking(msg('no permissions'), {})), result: `${digit(who)} (${sym})` };
  });
  const special = (mode >> 9) & 7;
  const sp = ([[SETUID, 'setuid 4'], [SETGID, 'setgid 2'], [STICKY, 'sticky 1']] as const).filter(([b]) => mode & b).map(([, l]) => l);
  steps.push({ label: msg('Special bits'), formula: msg('setuid = 4, setgid = 2, sticky = 1; digit = sum (left out when 0)'), ...(sp.length ? { working: sp.join(' + ') } : msgWorking(msg('none set'), {})), result: String(special) });
  steps.push({ label: msg('Symbolic and ls -l'), formula: msg('r, w, x per class; s or t replaces x when a special bit is set'), ...(isDir ? msgWorking(msg('{mode} for a directory'), { mode: toSymbolic(mode) }) : msgWorking(msg('{mode} for a file'), { mode: toSymbolic(mode) })), result: `${isDir ? 'd' : '-'}${toSymbolic(mode)}` });
  steps.push({ label: msg('Octal mode'), formula: msg('mode = [special] owner group others'), working: `${special ? `${special} ` : ''}${digit('u')} ${digit('g')} ${digit('o')}`, result: toOctal(mode) });
  return steps;
}

const ZELLER_DAYS = [msg('Saturday'), msg('Sunday'), msg('Monday'), msg('Tuesday'), msg('Wednesday'), msg('Thursday'), msg('Friday')];

/** Zeller's congruence, then the Julian Day Number check. Last step: the weekday. */
export function dayOfWeekSteps(v: { y: number; m: number; d: number }, choice: CalendarChoice = 'gregorian'): ReportStep[] {
  if (![v.y, v.m, v.d].every(Number.isInteger)) return [];
  let r;
  try {
    r = dayOfWeek(v, choice);
  } catch {
    return [];
  }
  const z = r.zeller;
  const greg = r.calendar === 'gregorian';
  const sumPart = z.formula.split(' = ').slice(2, 4).join(' = ');
  return [
    {
      label: msg('Zeller inputs'),
      formula: msg('January and February count as months 13 and 14 of the previous year; K = year mod 100, J = ⌊year / 100⌋'),
      ...msgWorking(msg('q = {q}, m = {m}, year = {value}'), { q: z.q, m: z.m, value: v.m < 3 ? v.y - 1 : v.y }),
      result: `K = ${z.K}, J = ${z.J}`,
    },
    {
      ...(greg ? msgLabel(msg('Zeller\'s congruence (Gregorian)'), {}) : msgLabel(msg('Zeller\'s congruence (Julian)'), {})),
      formula: greg ? 'h = (q + ⌊13(m + 1) / 5⌋ + K + ⌊K / 4⌋ + ⌊J / 4⌋ + 5J) mod 7' : 'h = (q + ⌊13(m + 1) / 5⌋ + K + ⌊K / 4⌋ + 5 + 6J) mod 7',
      working: sumPart,
      result: `h = ${z.h}`,
    },
    { label: msg('Weekday from h'), formula: msg('0 = Saturday, 1 = Sunday … 6 = Friday'), working: `h = ${z.h}`, ...msgResult(ZELLER_DAYS[z.h], {}) },
    // r.weekday is an English weekday name, one of the ZELLER_DAYS messages.
    { label: msg('Check with the Julian Day Number'), formula: msg('weekday = (JDN + 1) mod 7, 0 = Sunday'), working: `(${r.jdn} + 1) mod 7 = ${r.weekdayIndex}`, ...msgResult(r.weekday, {}) },
  ];
}

// ---------------------------------------------------------------------------
// Advanced (scientific) calculator
// ---------------------------------------------------------------------------

const OP_NAMES: Record<string, string> = { '+': 'Add', '-': 'Subtract', '*': 'Multiply', '/': 'Divide', '^': 'Power', mod: 'Remainder', '%': 'Remainder', '!': 'Factorial' };
/** mathjs notation back to the calculator's keys. */
const showExpr = (s: string) => s.replace(/\blog\(/g, 'ln(').replace(/\blog10\(/g, 'log(').replace(/\*/g, '×').replace(/\//g, '÷');
const opSym = (op: string) => (op === '*' ? '×' : op === '/' ? '÷' : op);
const operand = (v: string) => (v.startsWith('-') ? `(${v})` : v);

/** Order of operations for a basic or scientific expression, innermost first, or base conversion for programmer mode. Last step: the result the display shows. */
export function advancedCalculatorSteps(expression: string, mode: 'basic' | 'scientific' | 'programming' = 'basic', base: NumberBase = 'DEC'): ReportStep[] {
  const expr = expression.trim();
  if (!expr) return [];
  if (mode === 'programming') return programmerSteps(expr, base);
  let answer: string;
  let root: MathNode;
  try {
    answer = evaluateCalculatorExpression(expr);
    root = parse(expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)').replace(/\blog\(/g, 'log10(').replace(/\bln\(/g, 'log('));
  } catch {
    return [];
  }
  const steps: ReportStep[] = [];
  const walk = (node: MathNode): string => {
    const n = node as MathNode & { content?: MathNode; args?: MathNode[]; op?: string; fn?: string | { name: string }; name?: string };
    if (node.type === 'ParenthesisNode' && n.content) return walk(n.content);
    if (node.type === 'OperatorNode' || node.type === 'FunctionNode') {
      const vals = (n.args ?? []).map(walk);
      const value = formatCalcResult(node.evaluate());
      let working: string;
      let label: string;
      if (node.type === 'OperatorNode') {
        const op = n.op ?? '';
        const fnName = typeof n.fn === 'string' ? n.fn : '';
        if (vals.length === 1) {
          working = fnName === 'factorial' ? `${operand(vals[0])}!` : `${op}${operand(vals[0])}`;
          label = fnName === 'factorial' ? 'Factorial' : fnName === 'unaryMinus' ? 'Negate' : 'Apply sign';
        } else {
          working = vals.map(operand).join(` ${opSym(op)} `);
          label = OP_NAMES[op] ?? 'Evaluate';
        }
      } else {
        const name = typeof n.fn === 'object' && n.fn ? n.fn.name : n.name ?? '';
        const shown = name === 'log10' ? 'log' : name === 'log' ? 'ln' : name;
        working = `${shown}(${vals.join(', ')})`;
        label = `Evaluate ${shown}`;
      }
      steps.push({ label, formula: showExpr(node.toString()), working, result: value });
      return value;
    }
    return formatCalcResult(node.evaluate());
  };
  try {
    walk(root);
  } catch {
    return [];
  }
  if (!steps.length) return [{ label: msg('Value'), formula: showExpr(root.toString()), result: answer }];
  const trimmed = steps.length > 8 ? [...steps.slice(0, 7), steps[steps.length - 1]] : steps;
  trimmed[trimmed.length - 1] = { ...trimmed[trimmed.length - 1], ...msgLabel(msg('{label} (result)'), { label: trimmed[trimmed.length - 1].label }), result: answer };
  return trimmed;
}

const RADIX: Record<NumberBase, number> = { HEX: 16, DEC: 10, OCT: 8, BIN: 2 };

function programmerSteps(expr: string, base: NumberBase): ReportStep[] {
  let answer: string;
  try {
    answer = evaluateProgrammerExpression(expr, base);
  } catch {
    return [];
  }
  const tokens = expr.toUpperCase().match(/[0-9A-F.]+/g) ?? [];
  const decimal = expr.toUpperCase().replace(/[0-9A-F.]+/g, (t) => (base === 'DEC' ? t : String(parseInBase(t, base))));
  const steps: ReportStep[] = [];
  if (base !== 'DEC') {
    steps.push({
      ...msgLabel(msg('Read the operands in {base}'), { base }),
      ...msgFormula(msg('value = Σ digit × {RADIX}^position'), { RADIX: RADIX[base] }),
      working: tokens.slice(0, 6).map((t) => `${t} = ${parseInBase(t, base)}`).join(', '),
      result: decimal.replace(/\s+/g, ' ').trim(),
    });
  }
  const dec = evaluateProgrammerExpression(decimal, 'DEC');
  steps.push({ label: msg('Evaluate in decimal'), formula: msg('& AND, | OR, ^ XOR, ~ NOT, << and >> shifts; the result is truncated to an integer'), working: decimal.replace(/\s+/g, ' ').trim(), result: dec });
  if (base !== 'DEC') steps.push({ ...msgLabel(msg('Write the result in {base}'), { base }), ...msgFormula(msg('repeated division by {RADIX}'), { RADIX: RADIX[base] }), ...msgWorking(msg('{dec} in base {RADIX}'), { dec, RADIX: RADIX[base] }), result: answer });
  steps[steps.length - 1] = { ...steps[steps.length - 1], result: answer };
  return steps;
}

// ---------------------------------------------------------------------------
// Market sizing
// ---------------------------------------------------------------------------

/** The market sizing page's $1.2B / $3.4M / $5.6K format (the page imports it from here). */
export function marketCurrency(value: number): string {
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const full = (x: number) => `$${(Number.isFinite(x) ? x : 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** Top-down TAM, SAM, SOM, revenue and the launch projection. Last step: SOM at launch. */
export function marketSizingSteps(d: MarketSizingInputs): ReportStep[] {
  const r = calculateMarketSize(d);
  const v = (x: number | undefined) => plain(typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const months = Math.max(0, typeof d.timeToMarket === 'number' && Number.isFinite(d.timeToMarket) ? d.timeToMarket : 0);
  const growth = Math.pow(1 + (Number.isFinite(d.industryGrowthRate ?? 0) ? d.industryGrowthRate ?? 0 : 0) / 100, months / 12);
  return [
    { label: msg('Total addressable market'), formula: msg('TAM = industry size'), working: full(d.industrySize), result: marketCurrency(r.tam) },
    { label: msg('Serviceable addressable market'), formula: 'SAM = TAM × SAM %', working: `${full(r.tam)} × ${v(d.samPercentage)}%`, result: marketCurrency(r.sam) },
    { label: msg('Competition factor'), formula: msg('f = max(0.1, 1 − 0.03 × competitors)'), ...msgWorking('max(0.1, 1 − 0.03 × {n})', { n: v(d.competitorCount) }), result: plain(r.competitionFactor, 2) },
    { label: msg('Serviceable obtainable market'), formula: msg('SOM = SAM × penetration % × f'), working: `${full(r.sam)} × ${v(d.marketPenetration)}% × ${plain(r.competitionFactor, 2)}`, result: marketCurrency(r.som) },
    { label: msg('Customers'), formula: msg('customers = SOM / average spending per customer'), ...(d.avgSpending > 0 ? { working: `${full(r.som)} / ${full(d.avgSpending)}` } : msgWorking(msg('no average spending entered'), {})), result: plain(r.projectedCustomers, 1) },
    { label: msg('Projected annual revenue'), formula: msg('revenue = customers × monthly price × 12'), working: `${plain(r.projectedCustomers, 1)} × ${full(d.pricingStrategy)} × 12`, result: marketCurrency(r.revenueProjection) },
    {
      label: msg('SOM at launch'),
      formula: msg('growth = (1 + annual growth %)^(months to launch / 12); SOM at launch = SOM × growth'),
      working: `(1 + ${v(d.industryGrowthRate)}%)^(${plain(months)} / 12) = ${growth.toFixed(4)}; ${full(r.som)} × ${growth.toFixed(4)}`,
      result: marketCurrency(r.somAtLaunch),
    },
  ];
}

// ---------------------------------------------------------------------------
// Real estate investment
// ---------------------------------------------------------------------------

/** Cash invested, mortgage, year-one NOI and cash flow, then the four ratios. Last step: total ROI. */
export function realEstateInvestmentSteps(i: RentalPropertyInput): ReportStep[] {
  const { results, metrics } = analyzeRentalProperty(i);
  const first = results[0];
  if (!first) return [];
  const price = Number(i.purchasePrice) || 0;
  const down = Number(i.downPayment) || 0;
  const closing = Number(i.closingCosts) || 0;
  const cash = price * (down / 100) + price * (closing / 100);
  const loan = Math.max(0, price * (1 - down / 100));
  const rate = Number(i.interestRate) || 0;
  const perYear = Number(i.compoundingPerYear) > 0 ? Number(i.compoundingPerYear) : 12;
  const interestOnly = i.repayment === 'interest-only';
  const pay = rentalMonthlyPayment(loan, rate, Number(i.loanTerm) || 0, interestOnly ? 'interest-only' : 'amortising', perYear);
  const egi = (Number(i.monthlyRent) || 0) * 12 * (1 - (Number(i.vacancy) || 0) / 100);
  const last = results[results.length - 1];
  const rText = perYear === 12 ? `${plain(rate)}% / 12` : `${plain(rate)}% compounded ${perYear} times a year = ${plain(monthlyNominalRatePct(rate, perYear), 4)}% / 12`;
  const model = i.taxModel ?? 'none';
  const sd = (x: number) => (x < 0 ? `-${dollars(-x)}` : dollars(x));
  const taxStep: ReportStep[] =
    model === 'none'
      ? []
      : [
          {
            label: msg('Tax on rental profit, year 1'),
            formula:
              model === 'uk-finance-credit' ? msg('tax = (NOI − depreciation) × tax rate − 20% × lower of (mortgage interest, rental profit)') : model === 'india-house-property' ? msg('income = 70% × (rent received − municipal taxes) − interest; tax = income × tax rate (a loss saves tax as far as it can be set off)') : msg('tax = (NOI − interest − depreciation) × tax rate (a loss saves tax as far as it can be set off)'),
            ...msgWorking(msg('taxable {taxableProfit} at {plain}%, interest {interestPayment}'), { taxableProfit: sd(first.taxableProfit), plain: plain(Number(i.taxRate) || 0), interestPayment: dollars(first.interestPayment) }),
            result: sd(first.tax),
          },
          { label: msg('After-tax cash flow, year 1'), formula: msg('after-tax cash flow = cash flow − tax'), working: `${sd(first.cashFlow)} − (${sd(first.tax)})`, result: sd(first.afterTaxCashFlow) },
        ];
  return [
    { label: msg('Cash invested'), formula: msg('cash = price × (down payment % + closing costs %)'), working: `${dollars(price)} × (${plain(down)}% + ${plain(closing)}%)`, result: dollars(cash) },
    {
      label: msg('Monthly mortgage payment'),
      formula: interestOnly ? msg('M = L × r, L = price × (1 − down %), r = rate / 12 (interest only: the balance stays at L)') : msg('M = L × r (1 + r)^n / ((1 + r)^n − 1), L = price × (1 − down %), r = rate / 12, n = years × 12'),
      working: interestOnly ? `L = ${dollars(loan)}, r = ${rText}` : `L = ${dollars(loan)}, r = ${rText}, n = ${plain(Number(i.loanTerm) || 0)} × 12`,
      result: `$${pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      label: msg('Net operating income, year 1'),
      formula: msg('NOI = rent × 12 × (1 − vacancy) − (tax + insurance + maintenance + management % × effective income)'),
      working: `${dollars(Number(i.monthlyRent) || 0)} × 12 × (1 − ${plain(Number(i.vacancy) || 0)}%) − (${dollars(Number(i.propertyTaxes) || 0)} + ${dollars(Number(i.insurance) || 0)} + ${dollars(Number(i.maintenance) || 0)} + ${plain(Number(i.propertyManagement) || 0)}% × ${dollars(Math.round(egi))})`,
      result: dollars(first.noi),
    },
    { label: msg('Cap rate'), formula: msg('cap rate = NOI / price × 100'), working: `${dollars(first.noi)} / ${dollars(price)} × 100`, result: `${metrics.capRate}%` },
    { label: msg('Cash flow, year 1'), formula: msg('cash flow = NOI − mortgage payments for the year'), working: `${dollars(first.noi)} − ${dollars(first.mortgagePayment)}`, result: dollars(first.cashFlow) },
    { label: msg('Cash-on-cash return'), formula: msg('cash-on-cash = year-1 cash flow / cash invested × 100'), working: `${dollars(first.cashFlow)} / ${dollars(cash)} × 100`, result: `${metrics.cashOnCashReturn}%` },
    { label: msg('Debt service coverage ratio'), formula: msg('DSCR = NOI / annual debt service'), working: `${dollars(first.noi)} / ${dollars(first.mortgagePayment)}`, result: `${metrics.dscr}` },
    ...taxStep,
    {
      ...msgLabel(msg('Total ROI over {length} years'), { length: results.length }),
      formula: msg('ROI = (total cash flow + appreciation + equity build-up) / cash invested × 100'),
      working: `(${dollars(last.cumulativeCashFlow)} + ${dollars(metrics.totalAppreciation)} + ${dollars(metrics.totalEquityBuildup)}) / ${dollars(cash)} × 100`,
      result: `${metrics.totalROI}%`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Unit converter
// ---------------------------------------------------------------------------

/** Same as the unit converter page's number format (the page imports it from here). */
export function formatUnitResult(value: number, precisionText: string | number = 6): string {
  if (isNaN(value)) return '0';
  const precision = parseInt(String(precisionText)) || 6;
  if (Math.abs(value) >= 1e15) return value.toExponential(precision);
  if (Math.abs(value) < 1e-6 && value !== 0) return value.toExponential(precision);
  if (Math.abs(value) >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: precision });
  return value.toPrecision(precision);
}

/** Where each unit's size comes from. */
const UNIT_DEFINITIONS: Record<string, string> = {
  Kilometer: msg('SI prefix kilo = 10³'), Centimeter: msg('SI prefix centi = 10⁻²'), Millimeter: msg('SI prefix milli = 10⁻³'), Micrometer: msg('SI prefix micro = 10⁻⁶'), Nanometer: msg('SI prefix nano = 10⁻⁹'),
  Mile: msg('international mile, 5,280 ft, exact (NIST SP 811)'), Yard: msg('international yard, exact (1959)'), Foot: msg('international foot, exact (1959)'), Inch: msg('international inch, exact (1959)'),
  'Light Year': msg('IAU: c × 365.25 days, exact'), 'Square Kilometer': '(10³ m)²', 'Square Centimeter': '(10⁻² m)²', 'Square Millimeter': '(10⁻³ m)²', 'Square Inch': msg('(0.0254 m)², exact'),
  'Square Foot': msg('(0.3048 m)², exact'), 'Square Yard': msg('(0.9144 m)², exact'), Acre: msg('international acre, 43,560 ft², exact'), Hectare: '10⁴ m²', Milliliter: '10⁻³ L', 'Cubic Meter': '10³ L',
  'Gallon (US)': msg('US gallon = 231 in³, exact'), 'Gallon (UK)': msg('imperial gallon, exact (UK Weights and Measures Act 1985)'), 'Quart (US)': msg('US gallon / 4'), 'Pint (US)': msg('US gallon / 8'),
  'Cup (US)': msg('US gallon / 16'), 'Fluid Ounce (US)': msg('US gallon / 128'), Gram: msg('SI prefix milli of the kilogram'), Milligram: '10⁻⁶ kg', 'Metric Ton': '10³ kg',
  Pound: msg('international avoirdupois pound, exact (1959)'), Ounce: msg('pound / 16'), Stone: msg('14 pounds'), 'US Ton': msg('2,000 pounds'), Minute: '60 s', Hour: '3,600 s', Day: '86,400 s',
  Week: msg('7 days'), Year: msg('Julian year, 365.25 days'), Millisecond: '10⁻³ s', Microsecond: '10⁻⁶ s', Nanosecond: '10⁻⁹ s',
};

const factorText = (f: number) => f.toLocaleString('en-US', { maximumSignificantDigits: 17 });

export type UnitStepsInput = { category: string; from: string; to: string; value: number; precision?: string | number };

/** The definition of each unit and the multiplication through the base unit (or the temperature offsets). Last step: the converted value as listed. */
export function unitConverterSteps(i: UnitStepsInput): ReportStep[] {
  const cat = conversionCategories[i.category];
  if (!cat || !Number.isFinite(i.value)) return [];
  const from = cat.units.find((u) => u.name === i.from);
  const to = cat.units.find((u) => u.name === i.to);
  if (!from || !to) return [];
  const prec = i.precision ?? 6;
  const answer = `${formatUnitResult(convertUnit(i.value, i.category, from.name, to.name), prec)} ${to.symbol}`;
  const x = plain(i.value, 10);
  if (i.category === 'temperature') {
    const c = convertUnit(i.value, 'temperature', from.name, 'Celsius');
    const toC: Record<string, [string, string]> = {
      Celsius: ['°C = °C', x],
      Fahrenheit: [msg('°C = (°F − 32) × 5 / 9 (NIST SP 811)'), `(${x} − 32) × 5 / 9`],
      Kelvin: [msg('°C = K − 273.15 (SI Brochure)'), `${x} − 273.15`],
      Rankine: ['°C = (°R − 491.67) × 5 / 9', `(${x} − 491.67) × 5 / 9`],
    };
    const cx = plain(c, 10);
    const fromC: Record<string, [string, string]> = {
      Celsius: ['°C = °C', cx],
      Fahrenheit: ['°F = °C × 9 / 5 + 32', `${cx} × 9 / 5 + 32`],
      Kelvin: ['K = °C + 273.15', `${cx} + 273.15`],
      Rankine: ['°R = °C × 9 / 5 + 491.67', `${cx} × 9 / 5 + 491.67`],
    };
    const steps: ReportStep[] = [];
    if (from.name !== 'Celsius') steps.push({ label: msg('Convert to Celsius'), formula: toC[from.name][0], working: toC[from.name][1], result: `${formatUnitResult(c, prec)} °C` });
    if (to.name !== 'Celsius' || !steps.length) steps.push({ ...msgLabel(msg('Convert to {name}'), { name: to.name }), formula: fromC[to.name][0], working: fromC[to.name][1], result: answer });
    steps[steps.length - 1] = { ...steps[steps.length - 1], result: answer };
    return steps;
  }
  if (i.category === 'fuel-economy') {
    // L/100 km is volume per distance, the others are distance per volume,
    // so the working goes through km/L with a reciprocal where needed.
    const kmPerL = convertUnit(i.value, 'fuel-economy', from.name, 'Kilometer per Liter');
    const steps: ReportStep[] = [];
    if (from.name === 'Liter per 100 Kilometers') {
      steps.push({ ...msgLabel(msg('Convert to km/L'), {}), formula: msg('km/L = 100 / (L/100 km) (reciprocal)'), working: `100 / ${x}`, result: `${formatUnitResult(kmPerL, prec)} km/L` });
    } else if (from.name !== 'Kilometer per Liter') {
      steps.push({ ...msgLabel(msg('Convert to km/L'), {}), formula: msg('km/L = mpg × (km per mile) / (liters per gallon)'), working: `${x} × ${factorText(from.factor)}`, result: `${formatUnitResult(kmPerL, prec)} km/L` });
    }
    if (to.name === 'Liter per 100 Kilometers') {
      steps.push({ ...msgLabel(msg('Convert to {name}'), { name: to.name }), formula: msg('L/100 km = 100 / (km/L) (reciprocal)'), working: `100 / ${plain(kmPerL, 10)}`, result: answer });
    } else if (to.name !== 'Kilometer per Liter' || !steps.length) {
      steps.push({ ...msgLabel(msg('Convert to {name}'), { name: to.name }), formula: msg('value = (km/L) / (size of the target unit in km/L)'), working: `${plain(kmPerL, 10)} / ${factorText(to.factor)}`, result: answer });
    }
    steps[steps.length - 1] = { ...steps[steps.length - 1], result: answer };
    return steps;
  }
  const baseUnit = cat.units.find((u) => u.factor === 1) ?? cat.units[0];
  const def = (u: typeof from): ReportStep => ({
    ...msgLabel(msg('Definition of the {unit}'), { unit: u.name.toLowerCase() }),
    formula: UNIT_DEFINITIONS[u.name] ?? msg('base unit'),
    result: `1 ${u.symbol} = ${factorText(u.factor)} ${baseUnit.symbol}`,
  });
  const steps: ReportStep[] = [];
  if (from.factor !== 1) steps.push(def(from));
  if (to.factor !== 1 && to.name !== from.name) steps.push(def(to));
  const inBase = i.value * from.factor;
  if (from.factor !== 1) steps.push({ ...msgLabel(msg('Convert to {symbol}'), { symbol: baseUnit.symbol }), ...msgFormula(msg('value in {symbol} = value × size of 1 {symbol2}'), { symbol: baseUnit.symbol, symbol2: from.symbol }), working: `${x} × ${factorText(from.factor)}`, result: `${formatUnitResult(inBase, prec)} ${baseUnit.symbol}` });
  if (to.factor !== 1 || !steps.length) steps.push({ ...msgLabel(msg('Convert to {symbol}'), { symbol: to.symbol }), ...msgFormula(msg('value in {symbol} = value in {symbol2} / size of 1 {symbol3}'), { symbol: to.symbol, symbol2: baseUnit.symbol, symbol3: to.symbol }), working: `${plain(inBase, 12)} / ${factorText(to.factor)}`, result: answer });
  steps[steps.length - 1] = { ...steps[steps.length - 1], result: answer };
  return steps;
}

// ---------------------------------------------------------------------------
// Budget, ETF and FIRE planners
// ---------------------------------------------------------------------------

/** The budget planner's health bands, capitalised as the page shows them. */
const BUDGET_HEALTH: Record<string, string> = { excellent: msg('Excellent'), good: msg('Good'), warning: msg('Warning'), critical: msg('Critical') };

/** Totals, savings rate, emergency months and the expense-ratio health band. Last step: the budget health. */
export function budgetPlannerSteps(state: BudgetInput): ReportStep[] {
  const b = computeBudget(state);
  const amounts = (xs: { amount: number | string }[]) => (xs.length <= 6 ? xs.map((x) => dollars(Number(x.amount) || 0)).join(' + ') : `${xs.length} items`);
  const goal = Number(state.savingsGoal) || 0;
  const fund = Number(state.emergencyFund) || 0;
  const health = String(b.budgetHealth);
  return [
    { label: msg('Total income'), formula: msg('income = Σ monthly income'), working: amounts(state.incomeItems) || '$0', result: dollars(b.totalIncome) },
    { label: msg('Total expenses'), formula: msg('expenses = fixed + variable'), working: `${dollars(b.totalFixedExpenses)} + ${dollars(b.totalVariableExpenses)}`, result: dollars(b.totalExpenses) },
    { label: msg('Remaining income'), formula: msg('remaining = income − expenses'), working: `${dollars(b.totalIncome)} − ${dollars(b.totalExpenses)}`, result: dollars(b.remainingIncome) },
    { label: msg('Savings rate'), formula: msg('savings rate = savings goal / income × 100'), working: `${dollars(goal)} / ${dollars(b.totalIncome)} × 100`, result: `${b.savingsRate.toFixed(1)}%` },
    { label: msg('Emergency fund'), formula: msg('months = emergency fund / monthly expenses'), working: `${dollars(fund)} / ${dollars(b.totalExpenses)}`, ...msgResult(msg('{emergencyFundMonths} months'), { emergencyFundMonths: b.emergencyFundMonths }) },
    {
      label: msg('Budget health'),
      formula: msg('expense ratio = expenses / income × 100; up to 70% excellent, 80% good, 90% warning, above that critical'),
      working: `${dollars(b.totalExpenses)} / ${dollars(b.totalIncome)} × 100 = ${b.expenseRatio.toFixed(1)}%`,
      ...(BUDGET_HEALTH[health] ? msgResult(BUDGET_HEALTH[health], {}) : { result: health.charAt(0).toUpperCase() + health.slice(1) }),
    },
  ];
}

/** Rates, the first year by the mid-year convention, and the value after the period. Last step: the final value. */
export function etfInvestmentSteps(i: EtfSimulationInput): ReportStep[] {
  const { years, summary } = simulateEtf(i);
  const first = years[0];
  if (!first) return [];
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const ret = num(i.annualReturn);
  const div = num(i.dividendYield);
  const fee = num(i.expenseRatio);
  const start = num(i.initialAmount);
  const C = first.yearlyContribution;
  const last = years[years.length - 1];
  return [
    { label: msg('Price growth rate'), formula: msg('capital growth = total return − dividend yield'), working: `${plain(ret)}% − ${plain(div)}%`, ...msgResult(msg('{plain}% a year'), { plain: plain(ret - div, 4) }) },
    { label: msg('Contributions, year 1'), formula: msg('C = monthly amount × 12'), working: `${dollars(num(i.monthlyContribution))} × 12`, result: dollars(C) },
    {
      label: msg('Value at the end of year 1'),
      formula: i.reinvestDividends
        ? msg('average balance A = start + C / 2; value = start + C + A × (growth − expense ratio) + A × dividend yield')
        : msg('average balance A = start + C / 2; value = start + C + A × (growth − expense ratio)'),
      working: `A = ${dollars(start)} + ${dollars(C)} / 2 = ${dollars(Math.round(start + C / 2))}; ${dollars(start)} + ${dollars(C)} + A × (${plain(ret - div, 4)}% − ${plain(fee)}%)${i.reinvestDividends ? ` + A × ${plain(div)}%` : ''}`,
      result: dollars(first.totalValue),
    },
    {
      label: msg('Later years'),
      formula: msg('repeat each year; the monthly amount rises by the contribution increase on schedule'),
      ...msgWorking(msg('{length} years, year {length2} contributions {yearlyContribution}'), { length: years.length, length2: years.length, yearlyContribution: dollars(last.yearlyContribution) }),
      ...msgResult(msg('{totalContributed} contributed'), { totalContributed: dollars(summary.totalContributed) }),
    },
    { ...msgLabel(msg('Value after {length} years'), { length: years.length }), formula: msg('final value = contributions + growth'), working: `${dollars(summary.totalContributed)} + ${dollars(summary.totalGrowth)}`, result: dollars(summary.finalValue) },
  ];
}

/** FIRE number from inflated expenses and the safe withdrawal rate, savings and the years to FI. Last step: years to FIRE as shown. */
export function firePlannerSteps(i: FireInput, sym = '$'): ReportStep[] {
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // The page's display currency symbol (market versions); '$' on the US page.
  const dollars = (x: number) => `${sym}${x.toLocaleString()}`;
  const { metrics: m } = computeFirePlan(i);
  const n = Math.max(0, Math.round(num(i.targetAge) - num(i.currentAge)));
  const override = num(i.targetFIRENumber);
  const monthlySavings = num(i.monthlyIncome) - num(i.monthlyExpenses);
  return [
    { label: msg('Years to the target age'), formula: msg('n = target age − current age'), working: `${plain(num(i.targetAge))} − ${plain(num(i.currentAge))}`, ...msgResult(msg('{n} years'), { n }) },
    {
      label: msg('Annual expenses at the target age'),
      formula: msg('E = monthly expenses × 12 × (1 + inflation)^n'),
      working: `${dollars(num(i.monthlyExpenses))} × 12 × (1 + ${plain(num(i.expectedInflation))}%)^${n}`,
      result: dollars(m.futureAnnualExpenses),
    },
    override > 0
      ? { label: msg('FIRE number'), formula: msg('FIRE number = custom target × (1 + inflation)^n'), working: `${dollars(override)} × (1 + ${plain(num(i.expectedInflation))}%)^${n}`, result: dollars(m.requiredFIRENumber) }
      : { label: msg('FIRE number'), formula: msg('FIRE number = E / safe withdrawal rate'), working: `${dollars(m.futureAnnualExpenses)} / ${plain(num(i.safeWithdrawalRate))}%`, result: dollars(m.requiredFIRENumber) },
    {
      label: msg('Savings'),
      formula: msg('S = (income − expenses) × 12; savings rate = (income − expenses) / income'),
      working: `(${dollars(num(i.monthlyIncome))} − ${dollars(num(i.monthlyExpenses))}) × 12`,
      ...msgResult(msg('{annualSavingsRate} a year ({savingsRate}%)'), { annualSavingsRate: dollars(m.annualSavingsRate), savingsRate: m.savingsRate }),
    },
    {
      label: msg('Years to FIRE'),
      formula: msg('first year y with B_y ≥ target × (1 + inflation)^y, where B_(y+1) = (B_y + S) × (1 + return)'),
      ...msgWorking(msg('B₀ = {dollars}, S = {dollars2}, return {plain}%'), { dollars: dollars(num(i.currentSavings) + Math.max(0, num(i.lockedSavings))), dollars2: dollars(monthlySavings * 12), plain: plain(num(i.expectedReturn)) }),
      ...(m.timeToFIRE === null ? msgResult(msg('Not reached'), {}) : msgResult(msg('{timeToFIRE} years'), { timeToFIRE: m.timeToFIRE })),
    },
  ];
}
