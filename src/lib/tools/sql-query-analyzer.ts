import { stripSqlComments } from './database-erd-generator';
import { msg } from '../msg';

export interface QueryAnalysis {
  complexity: 'Low' | 'Medium' | 'High';
  score: number;
  issues: string[];
  suggestions: string[];
  metrics: {
    joins: number;
    subqueries: number;
    aggregates: number;
    conditions: number;
  };
}

/**
 * Replaces the contents of string literals so keywords inside them are not
 * counted. A literal that starts with % keeps that %, so a leading-wildcard
 * LIKE pattern can still be detected.
 */
export function maskStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, (lit) => (lit.startsWith("'%") ? "'%'" : "'?'"));
}

/**
 * Heuristic, text-based review of a SQL statement. It counts constructs and
 * flags common anti-patterns; it never sees table sizes, indexes or the
 * planner's choices, so it cannot predict real performance.
 */
export function analyzeSqlQuery(query: string): QueryAnalysis {
  const sql = maskStringLiterals(stripSqlComments(query));

  const joins = (sql.match(/\bJOIN\b/gi) || []).length;
  const subqueries = (sql.match(/\(\s*SELECT\b/gi) || []).length;
  const aggregates = (sql.match(/\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT|STRING_AGG|ARRAY_AGG)\s*\(/gi) || []).length;
  const orCount = (sql.match(/\bOR\b/gi) || []).length;
  const conditions = (sql.match(/\b(WHERE|AND)\b/gi) || []).length + orCount;

  const score = joins * 10 + subqueries * 15 + aggregates * 5 + conditions * 3;
  const complexity: QueryAnalysis['complexity'] = score < 20 ? 'Low' : score < 50 ? 'Medium' : 'High';

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (/\bSELECT\s+(?:DISTINCT\s+)?(?:\w+\.)?\*/i.test(sql)) {
    issues.push(msg('Using SELECT * - specify only needed columns'));
    suggestions.push(msg('Replace SELECT * with specific column names so covering indexes can be used and less data is sent'));
  }

  const hasRowLimit = /\b(LIMIT|TOP|FETCH\s+(?:FIRST|NEXT)|ROWNUM)\b/i.test(sql);
  if (!hasRowLimit && /^\s*SELECT\b/i.test(sql) && (/\bORDER\s+BY\b/i.test(sql) || joins > 0)) {
    issues.push(msg('No row limit on a query that sorts or joins'));
    suggestions.push(msg('Add LIMIT (or TOP / FETCH FIRST on SQL Server and Oracle) if the caller only needs the first rows'));
  }

  if (orCount > 0 && conditions > 3) {
    issues.push(msg('OR conditions mixed with other filters may prevent index usage'));
    suggestions.push(msg('Consider IN (...) for OR on one column, or UNION ALL of indexed queries for OR across columns'));
  }

  if (subqueries > 2) {
    issues.push(msg('Multiple subqueries detected - may impact performance'));
    suggestions.push(msg('Consider JOINs or common table expressions where a subquery runs once per row'));
  }

  if (/\bLIKE\s+'%/i.test(sql)) {
    issues.push(msg('Leading wildcard in LIKE prevents index usage'));
    suggestions.push(msg("Avoid patterns like '%term'; use a trigram or full-text index if you need substring search"));
  }

  if (/\bWHERE\b[\s\S]*\b(LOWER|UPPER|DATE|YEAR|MONTH|SUBSTRING|SUBSTR|CAST|COALESCE)\s*\(\s*[\w.]+/i.test(sql)) {
    issues.push(msg('Function applied to a column in the WHERE clause'));
    suggestions.push(msg('Wrapping a column in a function usually stops a plain index on it being used; compare against a range or add an expression index'));
  }

  if (/\bNOT\s+IN\s*\(\s*SELECT\b/i.test(sql)) {
    issues.push(msg('NOT IN with a subquery returns no rows if the subquery yields a NULL'));
    suggestions.push(msg('Use NOT EXISTS instead of NOT IN (SELECT ...) when the subquery column is nullable'));
  }

  if (joins > 3) {
    issues.push(msg('Many JOINs detected - verify all are necessary'));
    suggestions.push(msg('Review JOIN conditions and make sure every join column is indexed'));
  }

  return {
    complexity,
    score: Math.min(100, score),
    issues,
    suggestions,
    metrics: { joins, subqueries, aggregates, conditions },
  };
}
