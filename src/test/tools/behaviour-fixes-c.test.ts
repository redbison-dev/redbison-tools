import { describe, expect, it } from 'vitest';
import { computeFirePlan, fireAgeFor, type FireInput } from '@/lib/tools/fire-planner';
import { calculateMarketSize } from '@/lib/tools/market-sizing-calculator';
import { simulateEtf, type EtfSimulationInput } from '@/lib/tools/etf-investment-simulator';
import { generateBackupScripts, type BackupConfig } from '@/lib/tools/database-backup-generator';

describe('fire-planner: current savings are counted once', () => {
  const base: FireInput = {
    currentAge: 30, targetAge: 40, currentSavings: 100000,
    monthlyIncome: 5000, monthlyExpenses: 2000, expectedInflation: 0, expectedReturn: 0,
    safeWithdrawalRate: 4, socialSecurityAge: 67, socialSecurityBenefit: 0,
  };

  it('ignores a legacy net worth value instead of adding it to invested savings', () => {
    const legacy = { ...base, currentNetWorth: 100000 } as FireInput;
    const { metrics, projections } = computeFirePlan(legacy);
    expect(projections[0].netWorth).toBe(100000);
    expect(metrics.currentFIREProgress).toBeCloseTo(16.67, 2); // 100,000 / 600,000
    expect(metrics.timeToFIRE).toBe(14);
    expect(fireAgeFor(legacy)).toBe(44);
  });

  it('uses Target FIRE Number (today\'s money) as an override target', () => {
    const { metrics } = computeFirePlan({ ...base, targetFIRENumber: 500000 });
    expect(metrics.requiredFIRENumber).toBe(500000);
    // 100,000 + 36,000 a year at 0% reaches 500,000 after 12 years (532,000)
    expect(metrics.timeToFIRE).toBe(12);
    expect(fireAgeFor(base, { targetFIRENumber: 500000 })).toBe(42);
  });

  it('inflates the override target to the target age like the computed one', () => {
    const { metrics } = computeFirePlan({ ...base, expectedInflation: 2, targetFIRENumber: 500000 });
    expect(metrics.requiredFIRENumber).toBe(609497);
  });

  it('falls back to expenses / withdrawal rate when the override is 0', () => {
    expect(computeFirePlan({ ...base, targetFIRENumber: 0 }).metrics.requiredFIRENumber).toBe(600000);
  });
});

describe('market-sizing-calculator: population and growth rate change the results', () => {
  const sample = {
    industrySize: 50e9, samPercentage: 15, marketPenetration: 2.5, competitorCount: 25, avgSpending: 25000, pricingStrategy: 199,
  };

  it('projects TAM, SAM, SOM and revenue forward to launch at the growth rate', () => {
    const r = calculateMarketSize({ ...sample, industryGrowthRate: 8.5, timeToMarket: 18 });
    expect(r.yearsToLaunch).toBe(1.5);
    expect(r.tamAtLaunch).toBeCloseTo(56_508_608_304, -1);
    expect(r.samAtLaunch).toBeCloseTo(8_476_291_246, -1);
    expect(r.somAtLaunch).toBeCloseTo(52_976_820, 0);
    expect(r.revenueAtLaunch).toBeCloseTo(5_060_346, 0);
    // today's figures are unchanged
    expect(r.som).toBeCloseTo(46_875_000);
  });

  it('uses population for spend per person and customers as a share of population', () => {
    const r = calculateMarketSize({ ...sample, totalPopulation: 330e6 });
    expect(r.spendPerPerson).toBeCloseTo(151.52, 2);
    expect(r.customersPerMillion).toBeCloseTo(5.68, 2);
  });

  it('leaves the population metrics empty when population is 0', () => {
    const r = calculateMarketSize(sample);
    expect(r.spendPerPerson).toBeNull();
    expect(r.customersPerMillion).toBeNull();
    expect(r.tamAtLaunch).toBe(r.tam);
  });
});

describe('etf-investment-simulator: salary and salary growth affect the projection', () => {
  const base: EtfSimulationInput = {
    initialAmount: 0, monthlyContribution: 1000, contributionFrequency: 'monthly', annualReturn: 0, dividendYield: 0,
    reinvestDividends: true, investmentPeriod: 3, contributionIncrease: 0, contributionIncreaseFrequency: 'yearly',
  };

  it('raises contributions each year by the salary growth rate', () => {
    const { years, summary } = simulateEtf({ ...base, salaryGrowthRate: 10 });
    expect(years.map((y) => y.yearlyContribution)).toEqual([12000, 13200, 14520]);
    expect(summary.totalContributed).toBe(39720);
  });

  it('applies the fixed increase on top of salary growth', () => {
    const { years } = simulateEtf({ ...base, salaryGrowthRate: 10, contributionIncrease: 100 });
    // year 2: 1,000 x 1.1 + 100 = 1,200 a month
    expect(years[1].yearlyContribution).toBe(14400);
  });

  it('reports the first-year contribution as a share of salary', () => {
    expect(simulateEtf({ ...base, salary: 60000 }).summary.contributionPercentOfSalary).toBe(20);
    expect(simulateEtf(base).summary.contributionPercentOfSalary).toBeNull();
  });
});

describe('database-backup-generator: names are escaped for SQL Server and Oracle', () => {
  const cfg = (over: Partial<BackupConfig>): BackupConfig => ({
    dbType: 'sqlserver', host: 'localhost', port: '1433', database: "o'brien", username: 'app',
    includeTables: true, includeData: true, compression: false, customOptions: '', ...over,
  });

  it('keeps a single quote in a SQL Server database name out of the N\'...\' disk path', () => {
    const s = generateBackupScripts(cfg({}));
    expect(s.backup).not.toContain("N'$BACKUP_DIR/o'brien");
    expect(s.backup).toContain('FILE="$BACKUP_DIR/o_brien_');
    expect(s.backup).toContain("DB_NAME='o'\\''brien'");
    expect(s.backup).toContain("BACKUP DATABASE [o'brien] TO DISK = N'$FILE_SQL'");
    expect(s.backup).toContain(`FILE_SQL=$(printf '%s' "$FILE" | sed "s/'/''/g")`);
    expect(s.restore).toContain("RESTORE DATABASE [o'brien] FROM DISK = N'$FILE_SQL'");
    expect(s.restore).toContain(`FILE_SQL=$(printf '%s' "$FILE" | sed "s/'/''/g")`);
  });

  it('escapes ] for T-SQL and $, " and ` for the bash double-quoted -Q argument', () => {
    const s = generateBackupScripts(cfg({ database: 'we]ird$x"y`z' }));
    expect(s.backup).toContain('BACKUP DATABASE [we]]ird\\$x\\"y\\`z] TO DISK');
    expect(s.restore).toContain('RESTORE DATABASE [we]]ird\\$x\\"y\\`z] FROM DISK');
  });

  it('quotes an Oracle schema that is not a plain identifier in a Data Pump parameter file', () => {
    const s = generateBackupScripts(cfg({ dbType: 'oracle', port: '1521', database: "orcl'pdb", username: "app'user" }));
    expect(s.backup).toContain("DB_SERVICE='orcl'\\''pdb'");
    expect(s.backup).toContain(`SCHEMAS="app'user"`);
    expect(s.backup).toContain('PARFILE="$PARFILE"');
    expect(s.restore).toContain(`SCHEMAS="app'user"`);
    expect(s.backup).not.toMatch(/SCHEMAS="\$SCHEMA"/);
  });

  it('upper-cases a plain Oracle schema name, as Oracle does for unquoted identifiers', () => {
    const s = generateBackupScripts(cfg({ dbType: 'oracle', database: 'ORCLPDB1', username: 'app_user' }));
    expect(s.backup).toContain('SCHEMAS=APP_USER');
    expect(s.backup).toContain('CONTENT=ALL');
  });

  it('uses a filesystem-safe backup file name', () => {
    expect(generateBackupScripts(cfg({})).backupFileName).toBe('o_brien_backup.sh');
  });
});
