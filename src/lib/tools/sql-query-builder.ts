import { msg } from '../msg';

export type QueryType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface BuilderField {
  field: string;
  /** Column alias for SELECT, or the value for INSERT and UPDATE. */
  alias?: string;
}

export interface BuilderCondition {
  field: string;
  operator: string;
  value: string;
}

export interface BuilderInput {
  queryType: QueryType;
  tableName: string;
  fields: BuilderField[];
  conditions: BuilderCondition[];
  joinType?: string;
  joinTable?: string;
  joinCondition?: string;
  orderBy?: string;
  limit?: string;
}

const NO_WHERE = '-- Warning: no WHERE clause, this affects every row in the table\n';

export const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'];

/** Standard SQL string literal: wrap in single quotes and double any single quote inside. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Literal for an INSERT or UPDATE value: NULL, TRUE and FALSE stay keywords, everything else is quoted. */
function valueLiteral(value: string): string {
  const trimmed = value.trim();
  if (/^(NULL|TRUE|FALSE)$/i.test(trimmed)) return trimmed.toUpperCase();
  return quoteLiteral(value);
}

function conditionSql(c: BuilderCondition): string | null {
  const field = c.field.trim();
  if (!field) return null;
  if (c.operator === 'IS NULL' || c.operator === 'IS NOT NULL') return `${field} ${c.operator}`;
  if (c.operator === 'IN' || c.operator === 'NOT IN') {
    const items = c.value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (items.length === 0) return null;
    return `${field} ${c.operator} (${items.map(quoteLiteral).join(', ')})`;
  }
  if (c.value === '') return null;
  return `${field} ${c.operator} ${quoteLiteral(c.value)}`;
}

function whereClause(conditions: BuilderCondition[]): string {
  const parts = conditions.map(conditionSql).filter((p): p is string => Boolean(p));
  return parts.length ? `\nWHERE ${parts.join('\n  AND ')}` : '';
}

/**
 * Builds a query in the common MySQL / PostgreSQL / SQLite dialect
 * (LIMIT rather than TOP or FETCH FIRST). Identifiers are written as typed.
 */
export function buildSqlQuery(input: BuilderInput): string {
  const table = input.tableName.trim();
  if (!table) throw new Error(msg('Please enter a table name'));
  const fields = input.fields.filter((f) => f.field.trim());
  const where = whereClause(input.conditions);

  if (input.queryType === 'SELECT') {
    const list = fields.length
      ? fields.map((f) => (f.alias?.trim() ? `${f.field.trim()} AS ${f.alias.trim()}` : f.field.trim())).join(', ')
      : '*';
    let query = `SELECT ${list}\nFROM ${table}`;
    if (input.joinTable?.trim() && input.joinCondition?.trim()) {
      query += `\n${input.joinType || 'INNER'} JOIN ${input.joinTable.trim()} ON ${input.joinCondition.trim()}`;
    }
    query += where;
    if (input.orderBy?.trim()) query += `\nORDER BY ${input.orderBy.trim()}`;
    const limit = input.limit?.trim();
    if (limit) {
      if (!/^\d+$/.test(limit) || Number(limit) < 1) throw new Error(msg('LIMIT must be a whole number of 1 or more'));
      // Strip leading zeros on the digits themselves: Number() prints 1e+21 for large values.
      query += `\nLIMIT ${limit.replace(/^0+/, '')}`;
    }
    return `${query};`;
  }

  if (input.queryType === 'INSERT') {
    if (!fields.length) throw new Error(msg('Add at least one column and value to insert'));
    const cols = fields.map((f) => f.field.trim()).join(', ');
    const vals = fields.map((f) => valueLiteral(f.alias ?? '')).join(', ');
    return `INSERT INTO ${table} (${cols})\nVALUES (${vals});`;
  }

  if (input.queryType === 'UPDATE') {
    if (!fields.length) throw new Error(msg('Add at least one column and value to update'));
    const sets = fields.map((f) => `${f.field.trim()} = ${valueLiteral(f.alias ?? '')}`).join(',\n    ');
    return `${where ? '' : NO_WHERE}UPDATE ${table}\nSET ${sets}${where};`;
  }

  return `${where ? '' : NO_WHERE}DELETE FROM ${table}${where};`;
}
