/** Valuation maths used by the Stock Analysis Calculator. */
import { msg } from '../msg';

export interface StockData {
  symbol: string;
  companyName: string;
  currentPrice: number;
  marketCap: number;
  peRatio: number;
  pbRatio: number;
  dividendYield: number; // percent
  eps: number;
  bookValue: number;
  roe: number; // fraction
  debtToEquity: number;
  revenueGrowth: number; // fraction
  earningsGrowth: number; // fraction
  freeCashFlow: number;
  beta: number;
  volume: number;
  avgVolume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

export interface IntrinsicValue {
  dcfValue: number;
  peBasedValue: number;
  pbBasedValue: number;
  averageValue: number;
  upside: number;
}

export const DCF_ASSUMPTIONS = {
  discountRate: 0.1,
  years: 5,
  terminalGrowth: 0.025,
  minGrowth: -0.1,
  maxGrowth: 0.2,
} as const;

/** P/E = price / EPS; 0 when EPS is not positive (P/E is not meaningful for losses). */
export function priceToEarnings(price: number, eps: number): number {
  return eps > 0 ? price / eps : 0;
}

/** Dividend yield in percent = annual dividend per share / price x 100. */
export function dividendYieldPercent(annualDividend: number, price: number): number {
  return price > 0 ? (annualDividend / price) * 100 : 0;
}

/** CAGR = (end / start)^(1 / years) - 1. */
export function cagr(start: number, end: number, years: number): number {
  if (!(start > 0) || !(end >= 0) || !(years > 0)) return NaN;
  return Math.pow(end / start, 1 / years) - 1;
}

/**
 * Two-stage discounted earnings model per share: EPS grows at `growth` for
 * `years`, each year discounted at `discountRate`, then a Gordon growth
 * terminal value EPS_n x (1 + g) / (r - g) discounted back from year n.
 * Growth is clamped because one quarter's year-on-year change is a poor
 * long-run forecast.
 */
export function discountedEarningsValue(
  eps: number,
  growth: number,
  opts: Partial<Record<keyof typeof DCF_ASSUMPTIONS, number>> = {},
): number {
  const o = { ...DCF_ASSUMPTIONS, ...opts };
  if (!(eps > 0) || !(o.discountRate > o.terminalGrowth)) return 0;
  const g = Math.min(o.maxGrowth, Math.max(o.minGrowth, Number.isFinite(growth) ? growth : 0));
  let pv = 0;
  let e = eps;
  for (let t = 1; t <= o.years; t++) {
    e *= 1 + g;
    pv += e / Math.pow(1 + o.discountRate, t);
  }
  const terminal = (e * (1 + o.terminalGrowth)) / (o.discountRate - o.terminalGrowth);
  return pv + terminal / Math.pow(1 + o.discountRate, o.years);
}

export function calculateIntrinsicValue(data: StockData): IntrinsicValue {
  const dcfValue = discountedEarningsValue(data.eps, data.earningsGrowth);
  const peBasedValue = Math.max(0, data.eps * 20); // fair P/E of 20
  const pbBasedValue = Math.max(0, data.bookValue * 2.5); // fair P/B of 2.5
  const averageValue = (dcfValue + peBasedValue + pbBasedValue) / 3;
  const upside = data.currentPrice > 0 ? ((averageValue - data.currentPrice) / data.currentPrice) * 100 : 0;
  return { dcfValue, peBasedValue, pbBasedValue, averageValue, upside };
}

/** Random but internally consistent demo data (ratios derived from price, EPS and book value). */
export function buildDemoStock(ticker: string, rand: () => number = Math.random): StockData {
  const symbol = ticker.trim().toUpperCase();
  const currentPrice = rand() * 200 + 50;
  const eps = rand() * 10 + 1;
  const bookValue = rand() * 50 + 10;
  const shares = rand() * 5e9 + 5e8;
  const low = currentPrice * (0.6 + rand() * 0.35);
  const high = currentPrice * (1.05 + rand() * 0.4);
  return {
    symbol,
    companyName: `${symbol} (simulated demo data)`,
    currentPrice,
    marketCap: currentPrice * shares,
    peRatio: priceToEarnings(currentPrice, eps),
    pbRatio: currentPrice / bookValue,
    dividendYield: rand() * 5,
    eps,
    bookValue,
    roe: eps / bookValue,
    debtToEquity: rand() * 3,
    revenueGrowth: (rand() - 0.5) * 0.4,
    earningsGrowth: (rand() - 0.5) * 0.6,
    freeCashFlow: rand() * 5e10,
    beta: rand() * 2 + 0.5,
    volume: rand() * 1e8,
    avgVolume: rand() * 1e8,
    fiftyTwoWeekHigh: high,
    fiftyTwoWeekLow: low,
  };
}

const f = (v: unknown, fallback = 0) => {
  const x = parseFloat(String(v));
  return Number.isFinite(x) ? x : fallback;
};

/**
 * Map Alpha Vantage OVERVIEW + GLOBAL_QUOTE responses. Alpha Vantage reports
 * rate limits and bad keys in "Note" / "Information" fields with an empty
 * quote, not in "Error Message", so those are treated as errors too.
 */
export function parseAlphaVantage(overview: Record<string, any>, quote: Record<string, any>, symbol: string): StockData {
  for (const r of [overview, quote]) {
    const message = r?.['Error Message'] || r?.Note || r?.Information;
    if (message) throw new Error(String(message).slice(0, 200));
  }
  const q = quote?.['Global Quote'];
  if (!q || Object.keys(q).length === 0 || !(f(q['05. price']) > 0)) {
    throw new Error(msg('No quote returned for this symbol. Check the ticker.'));
  }
  const currentPrice = f(q['05. price']);
  const eps = f(overview.EPS);
  const bookValue = f(overview.BookValue);
  const sym = (overview.Symbol || symbol).toUpperCase();
  return {
    symbol: sym,
    companyName: overview.Name || sym,
    currentPrice,
    marketCap: f(overview.MarketCapitalization),
    peRatio: f(overview.PERatio) || priceToEarnings(currentPrice, eps),
    pbRatio: f(overview.PriceToBookRatio) || (bookValue > 0 ? currentPrice / bookValue : 0),
    dividendYield: f(overview.DividendYield) * 100,
    eps,
    bookValue,
    roe: f(overview.ReturnOnEquityTTM),
    debtToEquity: f(overview.DebtToEquityRatio),
    revenueGrowth: f(overview.QuarterlyRevenueGrowthYOY),
    earningsGrowth: f(overview.QuarterlyEarningsGrowthYOY),
    freeCashFlow: 0,
    beta: f(overview.Beta, 1),
    volume: f(q['06. volume']),
    avgVolume: 0,
    fiftyTwoWeekHigh: f(overview['52WeekHigh']),
    fiftyTwoWeekLow: f(overview['52WeekLow']),
  };
}
