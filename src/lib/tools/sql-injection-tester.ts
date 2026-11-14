/**
 * Static pattern review of SQL text for signs of unsafe query construction.
 * Heuristic only: it flags string-built queries and known injection
 * signatures so a developer can switch to parameterised queries.
 */

import { msg } from '../msg';

export type Severity ='Critical' | 'High' | 'Medium' | 'Low';

export interface VulnerabilityResult {
  type: string;
  severity: Severity;
  description: string;
  example: string;
  mitigation: string;
}

export interface TestResult {
  securityScore: number;
  vulnerabilities: VulnerabilityResult[];
  recommendations: string[];
  totalTests: number;
  passedTests: number;
}

interface InjectionPattern extends VulnerabilityResult {
  pattern: RegExp;
}

export const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    pattern: /'\s*OR\s+1\s*=\s*1/i,
    type: msg('Classic OR Injection'),
    severity: 'Critical',
    description: msg('Query contains the OR 1=1 tautology, a classic sign that injected input already reached the SQL text'),
    example: "' OR 1=1--",
    mitigation: msg('Use parameterized queries or prepared statements'),
  },
  {
    pattern: /'\s*;.*DROP\s+TABLE/i,
    type: msg('Stacked Query (DROP TABLE)'),
    severity: 'Critical',
    description: msg('A quote followed by a second statement that drops a table'),
    example: "'; DROP TABLE users;--",
    mitigation: msg('Use parameterized queries and disable multi-statement execution in the driver'),
  },
  {
    pattern: /'\s*UNION\s+(ALL\s+)?SELECT/i,
    type: msg('UNION-based Injection'),
    severity: 'High',
    description: msg('A quote closed early and followed by UNION SELECT'),
    example: "' UNION SELECT ...",
    mitigation: msg('Use parameterized queries; never build SQL from request input'),
  },
  {
    pattern: /'\s*AND\s+.*=.*--/i,
    type: msg('Comment-terminated Condition'),
    severity: 'High',
    description: msg('An injected condition followed by a comment that cuts off the rest of the query'),
    example: "' AND 1=1--",
    mitigation: msg('Use prepared statements so quotes and comments in input stay data'),
  },
  {
    pattern: /'\s*;\s*INSERT\s+INTO/i,
    type: msg('Stacked Query (INSERT)'),
    severity: 'High',
    description: msg('A quote followed by a second INSERT statement'),
    example: "'; INSERT INTO ...",
    mitigation: msg('Use parameterized queries and input validation'),
  },
  {
    pattern: /'\s*OR\s+.*LIKE\s*'%/i,
    type: msg('Wildcard Injection'),
    severity: 'Medium',
    description: msg('An OR ... LIKE wildcard condition after a quote'),
    example: "' OR name LIKE '%",
    mitigation: msg('Bind the value as a parameter and escape % and _ when LIKE input comes from users'),
  },
  {
    pattern: /\$\{[^}]+\}|\{[A-Za-z_][\w.]*\}|['"]%(\([A-Za-z_]\w*\))?s['"]/,
    type: msg('Interpolated Value'),
    severity: 'Critical',
    description: msg("A template placeholder (${x}, {x} or a quoted '%s') builds the SQL text from a variable instead of binding it. Exception: libraries that turn interpolation into parameters, such as EF Core FromSqlInterpolated"),
    example: "WHERE id = '${userId}'",
    mitigation: msg('Replace the placeholder with a bound parameter (?, $1, :name or @name) and pass the value separately'),
  },
  {
    pattern: /(?<![\w$])\$[A-Za-z_]\w*/,
    type: msg('Unescaped Variable'),
    severity: 'High',
    description: msg('A $variable (PHP or shell style) is written straight into the SQL text'),
    example: "WHERE id = $user_id",
    mitigation: msg('Always use parameterized queries for user input'),
  },
  {
    pattern: /['"]\s*\+\s*[A-Za-z_$][\w.$]*|[A-Za-z_$][\w.$\])]*\s*\+\s*['"]|['"]\s*\.\s*\$\w+|\$\w+\s*\.\s*['"]/,
    type: msg('String Concatenation'),
    severity: 'High',
    description: msg('SQL text is concatenated with a variable (+ in JavaScript, Java or C#, . in PHP)'),
    example: '"... WHERE name = \'" + name + "\'"',
    mitigation: msg('Use parameterized queries instead of string concatenation'),
  },
  {
    pattern: /WHERE\s+.*=\s*'[^']*'\s*;?\s*$/im,
    type: msg('Literal String Comparison'),
    severity: 'Low',
    description: msg('A WHERE clause compares against a quoted literal. Fine for constants; a problem if that literal ever comes from input'),
    example: "WHERE username = 'input'",
    mitigation: msg('If the value comes from a user, bind it as a parameter'),
  },
  {
    pattern: /--.*$/m,
    type: msg('SQL Comments'),
    severity: 'Low',
    description: msg('A -- comment is present. Harmless in source files, suspicious inside a logged runtime query'),
    example: 'SELECT * FROM users -- comment',
    mitigation: msg('Check whether the comment came from input; parameterize any user-supplied values'),
  },
];

export function testSqlSecurity(query: string): TestResult {
  const vulnerabilities: VulnerabilityResult[] = [];
  const recommendations: string[] = [];
  let passedTests = 0;

  for (const { pattern, ...info } of INJECTION_PATTERNS) {
    if (pattern.test(query)) vulnerabilities.push(info);
    else passedTests++;
  }

  const usesPlaceholders = /\?|\$\d+\b|:[A-Za-z_]\w*|@[A-Za-z_]\w*|(?<!['"])%(\([A-Za-z_]\w*\))?s(?!['"])/.test(query);
  if (query.includes("'") && !usesPlaceholders) {
    recommendations.push(msg('Consider using parameterized queries instead of string literals'));
  }
  if (usesPlaceholders && !vulnerabilities.some((v) => v.severity === 'Critical' || v.severity === 'High')) {
    recommendations.push(msg('Bound parameters detected (?, $1, :name, @name or an unquoted %s). Keep passing values separately from the SQL text'));
  }
  const upper = query.toUpperCase();
  if (upper.includes('SELECT *')) recommendations.push(msg('Avoid SELECT * - specify exact columns needed'));
  if (!upper.includes('LIMIT') && upper.includes('SELECT')) recommendations.push(msg('Consider adding LIMIT clauses to prevent data leakage'));
  if (/\b(admin|root)\b/i.test(query)) recommendations.push(msg('Be cautious with admin/root related queries'));
  if (/\bORDER\s+BY\s+[$#]?\{|\bORDER\s+BY\s+\$\w/i.test(query)) {
    recommendations.push(msg('Column names in ORDER BY cannot be bound as parameters; map user input to an allow-list of column names'));
  }

  const weight: Record<Severity, number> = { Critical: 30, High: 20, Medium: 10, Low: 5 };
  const securityScore = Math.max(0, 100 - vulnerabilities.reduce((n, v) => n + weight[v.severity], 0));

  return { securityScore, vulnerabilities, recommendations, totalTests: INJECTION_PATTERNS.length, passedTests };
}
