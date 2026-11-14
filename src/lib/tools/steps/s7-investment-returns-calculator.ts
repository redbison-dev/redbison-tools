/**
 * Portfolio metrics for the Investment Returns (time-weighted return)
 * calculator, moved out of the component so the page, its working steps
 * (src/lib/tools/steps/s7.ts) and the tests use the same code.
 */
import { xirr, toCashFlows, timeWeightedReturnFromUnits } from '../investment-returns-calculator';
import { msg } from '../../msg';

export interface PortfolioTransaction {
  type: 'buy' | 'sell';
  date: string;
  amount: number;
  shares?: number;
  price?: number;
  description?: string;
}

export interface PortfolioSummary {
  totalInvested: number;
  totalWithdrawn: number;
  netInvestment: number;
  currentValue: number;
  totalReturns: number;
  returnsPercentage: number;
  /** Cumulative time-weighted return in percent; null without share counts */
  timeWeightedReturn: number | null;
  /** Money-weighted annual return (XIRR) in percent; null when it has no solution */
  annualizedReturn: number | null;
}

export interface PortfolioChartPoint {
  date: string;
  invested: number;
  withdrawn: number;
  netInvestment: number;
  transaction: string;
  holdingPeriod: number;
  currentValue?: number;
  returns?: number;
}

/** Totals, net return, time-weighted return and XIRR as of `today`. Null when there are no transactions. */
export function portfolioMetrics(
  transactions: PortfolioTransaction[],
  currentValue: number,
  today: Date,
): { summary: PortfolioSummary; chart: PortfolioChartPoint[]; asOf: string } | null {
  if (transactions.length === 0) return null;
  const sorted = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let totalInvested = 0;
  let totalWithdrawn = 0;
  const chart: PortfolioChartPoint[] = [];
  for (const t of sorted) {
    if (t.type === 'buy') totalInvested += t.amount;
    else totalWithdrawn += t.amount;
    chart.push({
      date: new Date(t.date).toLocaleDateString(),
      invested: totalInvested,
      withdrawn: totalWithdrawn,
      netInvestment: totalInvested - totalWithdrawn,
      transaction: `${t.type} $${t.amount.toLocaleString()}`,
      holdingPeriod: Math.round((today.getTime() - new Date(t.date).getTime()) / (24 * 60 * 60 * 1000)),
    });
  }
  chart.push({
    date: msg('Today'),
    invested: totalInvested,
    withdrawn: totalWithdrawn,
    netInvestment: totalInvested - totalWithdrawn,
    currentValue,
    returns: currentValue - (totalInvested - totalWithdrawn),
    transaction: msg('Current Position'),
    holdingPeriod: 0,
  });

  const netInvestment = totalInvested - totalWithdrawn;
  const totalReturns = currentValue - netInvestment;
  const returnsPercentage = netInvestment > 0 ? (totalReturns / netInvestment) * 100 : 0;
  // Time-weighted return: needs a valuation at every cash flow, which we get
  // from share prices. Sub-period returns are chained geometrically.
  const twr = timeWeightedReturnFromUnits(sorted, currentValue);
  // Money-weighted return (XIRR): annual rate that sets the NPV of every
  // dated deposit, withdrawal and today's value to zero.
  const asOf = today.toISOString().split('T')[0];
  const mwr = currentValue > 0 ? xirr(toCashFlows(sorted, currentValue, asOf)) : null;

  return {
    summary: {
      totalInvested,
      totalWithdrawn,
      netInvestment,
      currentValue,
      totalReturns,
      returnsPercentage,
      timeWeightedReturn: twr ? twr.twr * 100 : null,
      annualizedReturn: mwr === null ? null : mwr * 100,
    },
    chart,
    asOf,
  };
}
