/**
 * Rent vs buy comparison used by the Rent vs Buy Calculator.
 *
 * Structure follows the usual opportunity-cost model (the one the New York
 * Times rent-vs-buy calculator popularised): the renter invests the cash the
 * buyer spends up front (down payment + closing costs), and every year
 * whichever side has the lower outflow invests the difference at the
 * investment return. Net worth is compared at the end of each year, with the
 * home valued after selling costs.
 */

export interface RentVsBuyInput {
  homePrice: number;
  downPayment: number;
  interestRate: number; // % per year
  loanTerm: number; // years
  closingCosts: number;
  propertyTax: number; // per year
  homeInsurance: number; // per year
  maintenanceCost: number; // per year
  hoaFees: number; // per year
  monthlyRent: number;
  renterInsurance: number; // per year
  rentIncrease: number; // % per year
  homeAppreciation: number; // % per year
  investmentReturn: number; // % per year
  inflationRate: number; // % per year, applied to ownership costs and renter's insurance
  marginalTaxRate: number; // %
  analysisYears: number;
  sellingCosts?: number; // % of the sale price, default 6
  /**
   * How often the quoted mortgage rate compounds a year (default 12, monthly).
   * Canadian fixed-rate mortgages quote a rate compounded half-yearly
   * (Interest Act, s. 6), so set 2 there; payments stay monthly.
   */
  compoundingPerYear?: number;
  /**
   * Most mortgage interest that can be deducted a year before the marginal
   * rate applies (0 or unset = no limit). India's Section 24(b) caps interest
   * on a self-occupied home at Rs 2,00,000 a year (old regime only).
   */
  deductionCap?: number;
  /**
   * Whether property tax is deductible alongside the interest (default true,
   * outside the cap). False for India: Section 24(b) on a self-occupied home
   * covers interest only.
   */
  propertyTaxDeductible?: boolean;
}

export interface RentVsBuyYear {
  year: number;
  rentCumulativeCost: number;
  buyTotalCost: number;
  homeValue: number;
  mortgage: number;
  rentCost: number;
  buyCost: number;
  /** Buyer net worth minus renter net worth. Positive means buying is ahead. */
  netWorth: number;
  equityBuilt: number;
  taxDeduction: number;
  buyerNetWorth: number;
  renterNetWorth: number;
}

export interface RentVsBuyResult {
  monthlyPayment: number;
  years: RentVsBuyYear[];
  breakEvenYear: number;
  totalRentCost: number;
  totalBuyCost: number;
  homeValueAfterYears: number;
  equityBuilt: number;
  netWorthDifference: number;
  recommendation: 'rent' | 'buy';
  savings: number;
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Monthly interest rate for a nominal annual rate compounded `compoundingPerYear`
 * times a year: rate / 12 when monthly (the US, UK, Australian and Indian
 * convention), (1 + rate / c)^(c / 12) - 1 otherwise (c = 2 for a Canadian
 * fixed-rate mortgage, so 5% gives 0.41239% a month rather than 0.41667%).
 */
export function monthlyRateFor(annualRatePercent: number, compoundingPerYear = 12): number {
  const c = Number.isFinite(compoundingPerYear) && compoundingPerYear > 0 ? compoundingPerYear : 12;
  if (c === 12) return annualRatePercent / 100 / 12;
  return Math.expm1((c / 12) * Math.log1p(annualRatePercent / 100 / c));
}

/** Standard amortising payment: P r (1+r)^n / ((1+r)^n - 1); P / n when the rate is 0. */
export function monthlyMortgagePayment(principal: number, annualRatePercent: number, years: number, compoundingPerYear = 12): number {
  const payments = Math.round(years * 12);
  if (!(principal > 0) || payments <= 0) return 0;
  const r = monthlyRateFor(annualRatePercent, compoundingPerYear);
  if (r === 0) return principal / payments;
  const f = Math.pow(1 + r, payments);
  return (principal * r * f) / (f - 1);
}

export function computeRentVsBuy(raw: RentVsBuyInput): RentVsBuyResult {
  const i = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, n(v)])) as unknown as Required<RentVsBuyInput>;
  const sellingCostRate = (raw.sellingCosts === undefined ? 6 : n(raw.sellingCosts)) / 100;
  const years = Math.max(1, Math.round(i.analysisYears));
  const loanAmount = Math.max(0, i.homePrice - i.downPayment);
  const compounding = raw.compoundingPerYear === undefined ? 12 : n(raw.compoundingPerYear) || 12;
  const monthlyRate = monthlyRateFor(i.interestRate, compounding);
  const payment = monthlyMortgagePayment(loanAmount, i.interestRate, i.loanTerm, compounding);
  const inv = i.investmentReturn / 100;
  const infl = i.inflationRate / 100;
  const tax = i.marginalTaxRate / 100;
  const cap = raw.deductionCap === undefined ? 0 : Math.max(0, n(raw.deductionCap));

  let balance = loanAmount;
  let renterPortfolio = i.downPayment + i.closingCosts; // opportunity cost of the cash spent up front
  let buyerPortfolio = 0;
  let rentCumulativeCost = 0;
  let buyCumulativeCost = i.downPayment + i.closingCosts;
  let homeValue = i.homePrice;
  const rows: RentVsBuyYear[] = [];

  for (let year = 1; year <= years; year++) {
    const growth = Math.pow(1 + infl, year - 1);
    const rentMonthly = i.monthlyRent * Math.pow(1 + i.rentIncrease / 100, year - 1);
    const annualRentCost = rentMonthly * 12 + i.renterInsurance * growth;

    let interestPaid = 0;
    let mortgagePaid = 0;
    for (let m = 0; m < 12 && balance > 0.005; m++) {
      const interest = balance * monthlyRate;
      const pay = Math.min(payment, balance + interest);
      interestPaid += interest;
      mortgagePaid += pay;
      balance = balance + interest - pay;
    }
    if (balance < 0.005) balance = 0;

    const propertyTax = i.propertyTax * growth;
    const ownership = propertyTax + (i.homeInsurance + i.maintenanceCost + i.hoaFees) * growth;
    const deductibleInterest = cap > 0 ? Math.min(interestPaid, cap) : interestPaid;
    const taxDeduction = (deductibleInterest + (raw.propertyTaxDeductible === false || (raw.propertyTaxDeductible as unknown) === 'false' ? 0 : propertyTax)) * tax;
    const netBuyingCost = mortgagePaid + ownership - taxDeduction;

    rentCumulativeCost += annualRentCost;
    buyCumulativeCost += netBuyingCost;

    // Whoever spends less this year invests the difference (mid-year, so half a year of growth).
    const diff = netBuyingCost - annualRentCost;
    renterPortfolio *= 1 + inv;
    buyerPortfolio *= 1 + inv;
    if (diff > 0) renterPortfolio += diff * (1 + inv / 2);
    else buyerPortfolio += -diff * (1 + inv / 2);

    homeValue = i.homePrice * Math.pow(1 + i.homeAppreciation / 100, year);
    const buyerNetWorth = homeValue * (1 - sellingCostRate) - balance + buyerPortfolio;

    rows.push({
      year,
      rentCumulativeCost,
      buyTotalCost: buyCumulativeCost,
      homeValue,
      mortgage: balance,
      rentCost: annualRentCost,
      buyCost: netBuyingCost,
      netWorth: buyerNetWorth - renterPortfolio,
      equityBuilt: homeValue - balance,
      taxDeduction,
      buyerNetWorth,
      renterNetWorth: renterPortfolio,
    });
  }

  const breakEven = rows.find((r) => r.netWorth > 0);
  const last = rows[rows.length - 1];
  return {
    monthlyPayment: payment,
    years: rows,
    breakEvenYear: breakEven ? breakEven.year : years + 1,
    totalRentCost: last.rentCumulativeCost,
    totalBuyCost: last.buyTotalCost,
    homeValueAfterYears: last.homeValue,
    equityBuilt: last.equityBuilt,
    netWorthDifference: last.netWorth,
    recommendation: last.netWorth > 0 ? 'buy' : 'rent',
    savings: Math.abs(last.netWorth),
  };
}
