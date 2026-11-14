/**
 * Lightweight CREATE TABLE / ALTER TABLE parser shared by the ERD generator
 * and the seed generator. It is deliberately forgiving: it understands the
 * common MySQL, PostgreSQL, SQLite and SQL Server DDL shapes (quoted
 * identifiers, schema prefixes, IF NOT EXISTS, table-level and inline keys)
 * and skips anything it does not recognise instead of throwing.
 */

export interface ParsedColumn {
  name: string;
  /** Upper-cased type as written, including arguments, e.g. VARCHAR(255). */
  type: string;
  /** Everything after the type, as written. */
  rest: string;
  nullable: boolean;
  unique: boolean;
  autoIncrement: boolean;
}

export interface ParsedForeignKey {
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
  primaryKey: string[];
  foreignKeys: ParsedForeignKey[];
}

export interface ParsedRelationship {
  from: string;
  to: string;
  fromColumn: string;
  toColumn: string;
}

const IDENT = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\]|[\\w$]+)';
const QUALIFIED = `${IDENT}(?:\\s*\\.\\s*${IDENT})*`;

/** Strips quoting and any schema prefix: `public`."Users" -> Users. */
export function cleanIdentifier(raw: string): string {
  const parts = raw.trim().match(new RegExp(IDENT, 'g'));
  if (!parts) return raw.trim();
  return parts[parts.length - 1].replace(/^[`"[]|[`"\]]$/g, '');
}

function splitIdentifierList(list: string): string[] {
  return list
    .split(',')
    .map((s) => cleanIdentifier(s.trim().split(/\s+/)[0] ?? ''))
    .filter(Boolean);
}

/** Removes -- and /* *\/ comments while leaving string literals intact. */
export function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`') {
      const end = findClosingQuote(sql, i, c);
      out += sql.slice(i, end + 1);
      i = end + 1;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function findClosingQuote(sql: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i;
    }
    if (sql[i] === '\\' && quote === "'") {
      i += 2;
      continue;
    }
    i++;
  }
  return sql.length - 1;
}

/** Splits on a separator at parenthesis depth 0, ignoring separators inside quotes. */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      const end = findClosingQuote(text, i, c);
      current += text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Returns the text inside the first balanced parenthesis group starting at or after `from`. */
export function balancedGroup(text: string, from: number): { inner: string; end: number } | null {
  const open = text.indexOf('(', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      i = findClosingQuote(text, i, c);
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return { inner: text.slice(open + 1, i), end: i };
    }
  }
  return null;
}

const CONSTRAINT_START = /^(?:CONSTRAINT\s+\S+\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE(?:\s+(?:KEY|INDEX))?|KEY|INDEX|CHECK|FULLTEXT|SPATIAL|EXCLUDE)\b/i;

export function parseSchema(schema: string): { tables: ParsedTable[]; relationships: ParsedRelationship[] } {
  const tables: ParsedTable[] = [];
  const relationships: ParsedRelationship[] = [];
  const statements = splitTopLevel(stripSqlComments(schema), ';');
  // Foreign keys written as REFERENCES parent with no column list point at the
  // parent's primary key (SQL standard); resolved once every table is known.
  const unresolved: { fk: ParsedForeignKey; rel: ParsedRelationship; index: number }[] = [];
  const addForeignKey = (table: ParsedTable | undefined, from: string, column: string, to: string, toCols: string[], index: number) => {
    const fk = { column, referencedTable: to, referencedColumn: toCols[index] ?? toCols[0] ?? 'id' };
    const rel = { from, to, fromColumn: column, toColumn: fk.referencedColumn };
    table?.foreignKeys.push(fk);
    relationships.push(rel);
    if (!toCols.length) unresolved.push({ fk, rel, index });
  };

  const createRe = new RegExp(
    `^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:GLOBAL\\s+|LOCAL\\s+)?(?:TEMPORARY|TEMP)\\s+|UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED})\\s*\\(`,
    'i',
  );

  for (const statement of statements) {
    const m = statement.match(createRe);
    if (!m) continue;
    const tableName = cleanIdentifier(m[1]);
    const group = balancedGroup(statement, m[0].length - 1);
    if (!group) continue;

    const table: ParsedTable = { name: tableName, columns: [], primaryKey: [], foreignKeys: [] };
    for (const def of splitTopLevel(group.inner, ',')) {
      const constraint = def.match(CONSTRAINT_START);
      if (constraint) {
        const kind = constraint[1].toUpperCase().replace(/\s+/g, ' ');
        const cols = balancedGroup(def, constraint.index! + constraint[0].length);
        if (kind === 'PRIMARY KEY' && cols) {
          table.primaryKey.push(...splitIdentifierList(cols.inner));
        } else if (kind === 'FOREIGN KEY' && cols) {
          const ref = def.slice(cols.end + 1).match(new RegExp(`REFERENCES\\s+(${QUALIFIED})(?:\\s*\\(([^)]*)\\))?`, 'i'));
          if (ref) {
            const toCols = ref[2] ? splitIdentifierList(ref[2]) : [];
            const toTable = cleanIdentifier(ref[1]);
            splitIdentifierList(cols.inner).forEach((col, i) => addForeignKey(table, tableName, col, toTable, toCols, i));
          }
        } else if (kind.startsWith('UNIQUE') && cols) {
          const uniqueCols = splitIdentifierList(cols.inner);
          if (uniqueCols.length === 1) {
            const col = table.columns.find((c) => c.name === uniqueCols[0]);
            if (col) col.unique = true;
          }
        }
        continue;
      }

      const colMatch = def.match(new RegExp(`^(${IDENT})\\s+([\\s\\S]*)$`));
      if (!colMatch) continue;
      const name = cleanIdentifier(colMatch[1]);
      const { type, rest } = splitType(colMatch[2]);
      const column: ParsedColumn = {
        name,
        type,
        rest,
        nullable: !/\bNOT\s+NULL\b/i.test(rest) && !/\bPRIMARY\s+KEY\b/i.test(rest),
        unique: /\bUNIQUE\b/i.test(rest) || /\bPRIMARY\s+KEY\b/i.test(rest),
        autoIncrement:
          /\b(AUTO_INCREMENT|AUTOINCREMENT|IDENTITY|GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY)\b/i.test(rest) ||
          /^(SMALL|BIG)?SERIAL\b/i.test(type),
      };
      if (/\bPRIMARY\s+KEY\b/i.test(rest)) table.primaryKey.push(name);
      const ref = rest.match(new RegExp(`REFERENCES\\s+(${QUALIFIED})(?:\\s*\\(([^)]*)\\))?`, 'i'));
      if (ref) addForeignKey(table, tableName, name, cleanIdentifier(ref[1]), ref[2] ? splitIdentifierList(ref[2]).slice(0, 1) : [], 0);
      table.columns.push(column);
    }
    for (const pk of table.primaryKey) {
      const col = table.columns.find((c) => c.name === pk);
      if (col) col.nullable = false;
    }
    if (table.primaryKey.length === 1) {
      const col = table.columns.find((c) => c.name === table.primaryKey[0]);
      if (col) col.unique = true;
    }
    tables.push(table);
  }

  const alterRe = new RegExp(
    `^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:IF\\s+EXISTS\\s+)?(${QUALIFIED})\\s+ADD\\s+(?:CONSTRAINT\\s+${IDENT}\\s+)?FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*REFERENCES\\s+(${QUALIFIED})(?:\\s*\\(([^)]*)\\))?`,
    'i',
  );
  for (const statement of statements) {
    const m = statement.match(alterRe);
    if (!m) continue;
    const from = cleanIdentifier(m[1]);
    const to = cleanIdentifier(m[3]);
    const fromCols = splitIdentifierList(m[2]);
    const toCols = m[4] ? splitIdentifierList(m[4]) : [];
    const table = tables.find((t) => t.name === from);
    fromCols.forEach((col, i) => addForeignKey(table, from, col, to, toCols, i));
  }

  for (const { fk, rel, index } of unresolved) {
    const pk = tables.find((t) => t.name === fk.referencedTable)?.primaryKey;
    const column = pk?.[index] ?? pk?.[0];
    if (column) fk.referencedColumn = rel.toColumn = column;
  }

  return { tables, relationships };
}

/** Splits "VARCHAR(255) NOT NULL" into the type (with arguments) and the remainder. */
function splitType(text: string): { type: string; rest: string } {
  const multiWord = text.match(
    /^(DOUBLE\s+PRECISION|CHARACTER\s+VARYING|CHAR\s+VARYING|NATIONAL\s+CHARACTER(?:\s+VARYING)?|TIMESTAMP(?:\s*\(\s*\d+\s*\))?\s+WITH(?:OUT)?\s+TIME\s+ZONE|TIME(?:\s*\(\s*\d+\s*\))?\s+WITH(?:OUT)?\s+TIME\s+ZONE|INTERVAL\s+(?:DAY|YEAR)\b[^,]*?\bTO\s+\w+(?:\s*\(\s*\d+\s*\))?|LONG\s+RAW|BIT\s+VARYING)/i,
  );
  let type: string;
  let rest: string;
  if (multiWord) {
    type = multiWord[1];
    rest = text.slice(multiWord[0].length);
  } else {
    const word = text.match(/^[\w$]+/);
    type = word ? word[0] : '';
    rest = text.slice(type.length);
  }
  type = type.replace(/\s+/g, ' ').toUpperCase();
  const args = rest.match(/^\s*\(/);
  if (args) {
    const group = balancedGroup(rest, 0);
    if (group) {
      type += `(${group.inner.trim()})`;
      rest = rest.slice(group.end + 1);
    }
  }
  const arrays = rest.match(/^(\s*\[\s*\d*\s*\])+/);
  if (arrays) {
    type += arrays[0].replace(/\s+/g, '');
    rest = rest.slice(arrays[0].length);
  }
  // Arguments keep their case so ENUM('draft') values survive.
  return { type, rest: rest.trim() };
}

export type Cardinality = '1:1' | 'N:1';

/**
 * Cardinality of a foreign key read from the child side: a foreign key column
 * that is also unique (or the whole primary key) can only point at one parent
 * row once, so it is one-to-one; otherwise many child rows share a parent.
 */
export function relationshipCardinality(table: ParsedTable | undefined, column: string): Cardinality {
  if (!table) return 'N:1';
  if (table.primaryKey.length === 1 && table.primaryKey[0] === column) return '1:1';
  const col = table.columns.find((c) => c.name === column);
  return col?.unique ? '1:1' : 'N:1';
}
