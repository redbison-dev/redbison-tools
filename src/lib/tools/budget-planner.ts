/** Monthly budget maths used by the Budget Planner. */

export interface BudgetLine {
  amount: number | string;
  category?: string;
}

export interface BudgetRecommendations {
  housing: { min: number; max: number };
  food: { min: number; max: number };
  transportation: { min: number; max: number };
  savings: { min: number; max: number };
  /** Months of expenses to hold as an emergency fund. */
  emergency: number;
}

export interface BudgetInput {
  numberOfAdults: number;
  numberOfKids: number;
  incomeItems: BudgetLine[];
  fixedExpenses: BudgetLine[];
  variableExpenses: BudgetLine[];
  savingsGoal: number | string;
  emergencyFund: number | string;
}

const amt = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function getBudgetRecommendations(numberOfAdults: number, numberOfKids: number): BudgetRecommendations {
  const base: BudgetRecommendations = {
    housing: { min: 25, max: 30 },
    food: { min: 10, max: 15 },
    transportation: { min: 10, max: 15 },
    savings: { min: 20, max: 30 },
    emergency: 6,
  };
  if (amt(numberOfKids) > 0) return { ...base, food: { min: 12, max: 18 }, emergency: 6 };
  if (amt(numberOfAdults) > 1) return { ...base, housing: { min: 20, max: 28 }, emergency: 4 };
  return base;
}

export function computeBudget(state: BudgetInput) {
  const sum = (items: BudgetLine[]) => items.reduce((s, i) => s + amt(i.amount), 0);
  const totalIncome = sum(state.incomeItems);
  const totalFixedExpenses = sum(state.fixedExpenses);
  const totalVariableExpenses = sum(state.variableExpenses);
  const totalExpenses = totalFixedExpenses + totalVariableExpenses;
  const remainingIncome = totalIncome - totalExpenses;
  const savingsGoal = amt(state.savingsGoal);
  const savingsAfterGoal = remainingIncome - savingsGoal;
  const recommendations = getBudgetRecommendations(state.numberOfAdults, state.numberOfKids);

  const expensesByCategory = [...state.fixedExpenses, ...state.variableExpenses].reduce((acc, e) => {
    const category = e.category || 'Other';
    acc[category] = (acc[category] || 0) + amt(e.amount);
    return acc;
  }, {} as Record<string, number>);

  const expensePercentages = Object.entries(expensesByCategory).map(([category, amount]) => ({
    category,
    amount,
    percentage: totalIncome > 0 ? Math.round((amount / totalIncome) * 1000) / 10 : 0,
  }));

  const savingsRate = totalIncome > 0 ? (savingsGoal / totalIncome) * 100 : 0;
  const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  let budgetHealth = 'excellent';
  if (totalIncome <= 0 && totalExpenses > 0) budgetHealth = 'critical';
  else if (expenseRatio > 90) budgetHealth = 'critical';
  else if (expenseRatio > 80) budgetHealth = 'warning';
  else if (expenseRatio > 70) budgetHealth = 'good';

  return {
    totalIncome,
    totalFixedExpenses,
    totalVariableExpenses,
    totalExpenses,
    remainingIncome,
    savingsAfterGoal,
    expensesByCategory,
    expensePercentages,
    savingsRate,
    expenseRatio,
    budgetHealth,
    recommendations,
    emergencyFundMonths: totalExpenses > 0 ? (amt(state.emergencyFund) / totalExpenses).toFixed(1) : '0',
    /** Target emergency fund: the household's recommended months x monthly expenses. */
    recommendedEmergencyFund: totalExpenses * recommendations.emergency,
  };
}
