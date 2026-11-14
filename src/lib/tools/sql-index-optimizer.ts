import { cleanIdentifier, stripSqlComments } from './database-erd-generator';
import { maskStringLiterals } from './sql-query-analyzer';
import { msg } from '../msg';

/** A translate function (the page's t); English by default. */
type Translate = (source: string, vars?: Record<string, string | number>) => string;
const english: Translate = (s, v) => s.replace(/\{(\w+)\}/g, (all, k: string) => (v?.[k] === undefined ? all : String(v[k])));

export interface IndexSuggestion {
  table: string;
  columns: string[];
  sql: string;
  reason: string;
}

const KEYWORDS = new Set([
  'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'USING', 'GROUP', 'ORDER', 'LIMIT',
  'HAVING', 'UNION', 'SET', 'VALUES', 'NATURAL', 'OFFSET', 'FETCH', 'WINDOW', 'FOR', 'AS', 'SELECT', 'AND', 'OR',
  'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS', 'TRUE', 'FALSE', 'ASC', 'DESC',
]);

const REF = '((?:[\\w$]+\\.)?[\\w$]+)';

interface TableUse {
  eq: string[];
  range: string[];
  join: string[];
  order: string[];
}

function clause(sql: string, start: RegExp, ends: string[]): string {
  const m = sql.match(start);
  if (!m || m.index === undefined) return '';
  const rest = sql.slice(m.index + m[0].length);
  const endRe = new RegExp(`\\b(${ends.join('|')})\\b`, 'i');
  const e = rest.match(endRe);
  return e && e.index !== undefined ? rest.slice(0, e.index) : rest;
}

const pushUnique = (list: string[], v: string) => {
  if (!list.includes(v)) list.push(v);
};

/**
 * Suggests B-tree indexes for a single SELECT by reading which columns it
 * filters, joins and sorts on. Equality columns go first, then sort columns,
 * otherwise one range column, following the usual composite index rule.
 * This is a text heuristic: it cannot see existing indexes, data
 * distribution or the planner, so treat every suggestion as a candidate to
 * test with EXPLAIN.
 */
export function suggestIndexes(query: string, tx: Translate = english): IndexSuggestion[] {
  const sql = maskStringLiterals(stripSqlComments(query)).replace(/\s+/g, ' ');

  const aliases = new Map<string, string>();
  const tables: string[] = [];
  const tableRe = /\b(?:FROM|JOIN|UPDATE)\s+((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+)(?:\.(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+))?)(?:\s+(?:AS\s+)?([\w$]+))?/gi;
  for (const m of sql.matchAll(tableRe)) {
    if (m[1].startsWith('(')) continue;
    const name = cleanIdentifier(m[1]);
    if (KEYWORDS.has(name.toUpperCase()) || name.toUpperCase() === 'SELECT') continue;
    if (!tables.includes(name)) tables.push(name);
    aliases.set(name.toLowerCase(), name);
    if (m[2] && !KEYWORDS.has(m[2].toUpperCase())) aliases.set(m[2].toLowerCase(), name);
  }
  if (!tables.length) return [];

  const resolve = (ref: string): { table: string; column: string } | null => {
    const parts = ref.split('.');
    if (KEYWORDS.has(ref.toUpperCase())) return null;
    if (parts.length === 2) {
      const table = aliases.get(parts[0].toLowerCase());
      return table ? { table, column: parts[1] } : null;
    }
    if (tables.length === 1 && !/^\d/.test(ref) && !KEYWORDS.has(ref.toUpperCase())) return { table: tables[0], column: ref };
    return null;
  };

  const uses = new Map<string, TableUse>(tables.map((t) => [t, { eq: [], range: [], join: [], order: [] }]));
  const add = (ref: string, kind: keyof TableUse) => {
    const r = resolve(ref);
    if (r) pushUnique(uses.get(r.table)![kind], r.column);
  };

  const where = clause(sql, /\bWHERE\b/i, ['GROUP\\s+BY', 'ORDER\\s+BY', 'LIMIT', 'HAVING', 'UNION', 'OFFSET', 'FETCH', 'WINDOW']);
  const LITERAL = "(?:'\\?'|-?\\d|\\$\\d|\\?|:\\w|@\\w|TRUE\\b|FALSE\\b)";
  const eqRe = new RegExp(`${REF}\\s*(?:=\\s*${LITERAL}|\\bIN\\s*\\(|\\bIS\\s+NULL\\b)`, 'gi');
  for (const m of where.matchAll(eqRe)) add(m[1], 'eq');
  const rangeRe = new RegExp(`${REF}\\s*(?:<=|>=|<(?!>)|>|\\bBETWEEN\\b|\\bLIKE\\s+'\\?')`, 'gi');
  for (const m of where.matchAll(rangeRe)) {
    const r = resolve(m[1]);
    if (r && !uses.get(r.table)!.eq.includes(r.column)) add(m[1], 'range');
  }

  for (const m of sql.matchAll(new RegExp(`\\bON\\s+${REF}\\s*=\\s*${REF}`, 'gi'))) {
    for (const ref of [m[1], m[2]]) {
      const r = resolve(ref);
      if (r && r.column.toLowerCase() !== 'id') add(ref, 'join');
    }
  }
  for (const m of sql.matchAll(/\bJOIN\s+[^\s]+(?:\s+(?:AS\s+)?[\w$]+)?\s+USING\s*\(([^)]*)\)/gi)) {
    for (const col of m[1].split(',')) for (const t of tables.slice(1)) pushUnique(uses.get(t)!.join, col.trim());
  }

  const orderBy = clause(sql, /\bORDER\s+BY\b/i, ['LIMIT', 'OFFSET', 'FETCH', 'UNION', 'FOR']);
  const groupBy = clause(sql, /\bGROUP\s+BY\b/i, ['HAVING', 'ORDER\\s+BY', 'LIMIT', 'UNION', 'OFFSET', 'FETCH', 'WINDOW']);
  const sortList = orderBy || groupBy;
  const sortLabel = orderBy ? 'ORDER BY' : 'GROUP BY';
  const sortRefs = sortList
    .split(',')
    .map((s) => s.trim().split(/\s+/)[0])
    .filter((s) => s && new RegExp(`^${REF}$`).test(s));
  const sortTargets = new Set(sortRefs.map((s) => resolve(s)?.table).filter(Boolean));
  if (sortTargets.size === 1) for (const ref of sortRefs) add(ref, 'order');

  const suggestions: IndexSuggestion[] = [];
  for (const table of tables) {
    const u = uses.get(table)!;
    const eq = [...u.eq, ...u.join.filter((c) => !u.eq.includes(c))];
    let columns = [...eq];
    const reasons: string[] = [];
    if (u.eq.length) reasons.push(tx(msg('equality filter on {columns}'), { columns: u.eq.join(', ') }));
    if (u.join.length) reasons.push(tx(msg('join on {columns}'), { columns: u.join.join(', ') }));
    const sortCols = u.order.filter((c) => !columns.includes(c));
    if (sortCols.length) {
      columns.push(...sortCols);
      reasons.push(tx(msg('{clause} on {columns}'), { clause: sortLabel, columns: sortCols.join(', ') }));
      if (u.range.length) reasons.push(tx(msg('range filter on {column} left out: an index can serve the sort or the range, not both'), { column: u.range[0] }));
    } else if (u.range.length) {
      columns.push(u.range[0]);
      reasons.push(tx(msg('range filter on {column}'), { column: u.range[0] }));
    }
    columns = columns.slice(0, 4);
    if (!columns.length) continue;
    const safe = (s: string) => s.replace(/[^\w]+/g, '_').toLowerCase();
    const name = `idx_${safe(table)}_${columns.map(safe).join('_')}`.slice(0, 63);
    suggestions.push({
      table,
      columns,
      sql: `CREATE INDEX ${name} ON ${table} (${columns.join(', ')});`,
      reason: reasons.join('; '),
    });
  }
  return suggestions;
}
