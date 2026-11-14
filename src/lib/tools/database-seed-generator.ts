import { msg } from '../msg';
import { parseSchema, type ParsedColumn, type ParsedTable } from './database-erd-generator';

export type SeedValue = string | number | boolean | null;
export type SeedRow = Record<string, SeedValue>;

export interface SeedOptions {
  count: number;
  format: 'sql' | 'json';
  /** Seed for the pseudo-random generator, so output can be reproduced. */
  seed?: number;
  /** Fixed reference date for generated timestamps (defaults to now). */
  now?: Date;
}

export const MAX_RECORDS = 1000;

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara', 'Dennis', 'Frances', 'Ken', 'Radia', 'Tim', 'Shafi', 'Seán', 'Zoë'];
const LAST = ['Lovelace', 'Hopper', 'Torvalds', 'Hamilton', 'Turing', 'Liskov', 'Ritchie', 'Allen', "O'Brien", 'Perlman', "D'Souza", 'Goldwasser'];
const CITIES = ['Lisbon', 'Toronto', 'Osaka', 'Nairobi', 'Austin', 'Kraków', 'Melbourne', 'Bogotá'];
const COUNTRIES = ['PT', 'CA', 'JP', 'KE', 'US', 'PL', 'AU', 'CO'];
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];
const STATUSES = ['active', 'inactive', 'pending'];

/** SQL string literal with single quotes doubled (the standard escape). */
export function sqlLiteral(value: SeedValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const isoTime = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

function typeLength(type: string): number | undefined {
  const m = type.match(/^\w[\w ]*\(\s*(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

function enumValues(type: string): string[] {
  const m = type.match(/^(?:ENUM|SET)\((.*)\)$/i);
  if (!m) return [];
  return [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
}

function checkInValues(column: ParsedColumn): string[] {
  const m = column.rest.match(/CHECK\s*\(\s*[\w"`]+\s+IN\s*\(([^)]*)\)/i);
  if (!m) return [];
  return [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
}

/** Orders tables so that referenced (parent) tables come before the tables that point at them. */
export function orderByDependencies(tables: ParsedTable[]): ParsedTable[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: ParsedTable[] = [];
  const visit = (t: ParsedTable) => {
    if (done.has(t.name) || visiting.has(t.name)) return;
    visiting.add(t.name);
    for (const fk of t.foreignKeys) {
      const parent = byName.get(fk.referencedTable);
      if (parent && parent !== t) visit(parent);
    }
    visiting.delete(t.name);
    done.add(t.name);
    out.push(t);
  };
  tables.forEach(visit);
  return out;
}

function generateValue(
  table: ParsedTable,
  column: ParsedColumn,
  i: number,
  rand: () => number,
  now: Date,
  generated: Map<string, SeedRow[]>,
  current: SeedRow,
  soFar: SeedRow[],
): SeedValue {
  const name = column.name.toLowerCase();
  const type = column.type.toUpperCase();
  const base = type.replace(/\(.*$/, '').trim();
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const isPk = table.primaryKey.includes(column.name);

  const fk = table.foreignKeys.find((f) => f.column === column.name);
  if (fk) {
    const parentRows = fk.referencedTable === table.name ? undefined : generated.get(fk.referencedTable);
    if (parentRows?.length) {
      // Composite primary keys of junction tables need distinct pairs, so walk
      // the parent rows in order for the first key column.
      const idx = isPk && table.primaryKey[0] === column.name ? (i - 1) % parentRows.length : int(1, parentRows.length) - 1;
      // Use the parent's actual key value, so UUID and text keys match too.
      return parentRows[idx][fk.referencedColumn] ?? idx + 1;
    }
    if (fk.referencedTable === table.name && !column.nullable) {
      // A required self-reference points at an earlier row, or the first row at itself.
      const pool = [...soFar, current];
      return pool[int(1, pool.length) - 1][fk.referencedColumn] ?? i;
    }
    return column.nullable ? null : int(1, 10);
  }

  if (isPk && table.primaryKey.length === 1) {
    if (/UUID|UNIQUEIDENTIFIER/.test(base)) return uuid(rand);
    if (/INT|SERIAL|NUMBER|NUMERIC|DECIMAL/.test(base)) return i;
    const key = `${table.name}_${i}`;
    const keyMax = typeLength(type);
    return keyMax && key.length > keyMax ? String(i) : key;
  }

  // DECIMAL(p,s) holds |v| < 10^(p-s); a missing scale is 0 (SQL standard).
  const precision = type.match(/^(?:DECIMAL|NUMERIC|NUMBER|DEC)\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)/);
  const intDigits = precision ? Number(precision[1]) - Number(precision[2] ?? 0) : undefined;

  const options = enumValues(column.type).length ? enumValues(column.type) : checkInValues(column);
  if (options.length) return pick(options);

  if (/^(BOOL|BOOLEAN|BIT)$/.test(base) || type === 'TINYINT(1)') {
    return /^(is_|has_)?(active|enabled|verified|published)$/.test(name) ? rand() < 0.8 : rand() < 0.5;
  }
  if (/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|INT2|INT4|INT8|SERIAL|BIGSERIAL|SMALLSERIAL|YEAR)$/.test(base) || (base === 'NUMBER' && !/,\s*[1-9]/.test(type))) {
    const cap = (v: number) => (intDigits !== undefined ? Math.min(v, 10 ** intDigits - 1) : v);
    if (column.unique) return i;
    if (/age/.test(name)) return cap(int(18, 80));
    if (/year/.test(name)) return int(now.getUTCFullYear() - 10, now.getUTCFullYear());
    if (/(qty|quantity|count|stock)/.test(name)) return cap(int(0, 100));
    if (/(rating|score|stars)/.test(name)) return int(1, 5);
    if (/position|sort|order|rank/.test(name)) return i;
    return base === 'TINYINT' ? int(0, 100) : cap(int(1, 1000));
  }
  if (/^(DECIMAL|NUMERIC|NUMBER|FLOAT|DOUBLE|DOUBLE PRECISION|REAL|MONEY|FLOAT4|FLOAT8)$/.test(base)) {
    const scale = precision ? Number(precision[2] ?? 0) : Number(type.match(/,\s*(\d+)\)/)?.[1] ?? 2);
    const digits = Math.min(scale, 6);
    const limit = intDigits !== undefined ? 10 ** intDigits : Infinity;
    const wanted = /(rate|ratio|percent|pct)/.test(name) ? 1 : /(lat)/.test(name) ? 90 : /(lng|lon)/.test(name) ? 180 : 500;
    const max = Math.min(wanted, limit);
    const value = /(lat|lng|lon)/.test(name) ? (rand() * 2 - 1) * max : rand() * max;
    const rounded = Number(value.toFixed(digits));
    // Rounding must not reach 10^(p-s), which the column cannot hold.
    if (Math.abs(rounded) >= limit) return Math.sign(rounded) * Number((limit - 10 ** -digits).toFixed(digits));
    return rounded;
  }
  if (/^(DATE)$/.test(base)) {
    return isoDate(new Date(now.getTime() - int(0, 3650) * 86400000));
  }
  if (/^(TIME)$/.test(base)) return isoTime(new Date(int(0, 86399) * 1000));
  if (/^(DATETIME|DATETIME2|TIMESTAMP|TIMESTAMPTZ|TIMESTAMP WITH TIME ZONE|TIMESTAMP WITHOUT TIME ZONE|SMALLDATETIME)$/.test(base)) {
    const d = new Date(now.getTime() - int(0, 365 * 86400) * 1000);
    return `${isoDate(d)} ${isoTime(d)}`;
  }
  if (/^(UUID|UNIQUEIDENTIFIER)$/.test(base)) return uuid(rand);
  if (/^(JSON|JSONB)$/.test(base)) return JSON.stringify({ seed: i, tag: pick(WORDS) });
  if (/^(BLOB|BYTEA|BINARY|VARBINARY|LONGBLOB|MEDIUMBLOB|TINYBLOB|RAW|IMAGE)$/.test(base)) return column.nullable ? null : '';

  const isText = /CHAR|TEXT|CLOB|STRING|CITEXT|VARCHAR2/.test(base) || base === '';
  if (!isText) return column.nullable ? null : `${column.name}_${i}`;

  const first = pick(FIRST);
  const last = pick(LAST);
  let value: string;
  if (/e?mail/.test(name)) value = `user${i}@example.com`;
  else if (/^(user_?name|login|handle)$/.test(name)) value = `user_${i}`;
  else if (/first_?name|given_?name/.test(name)) value = first;
  else if (/last_?name|surname|family_?name/.test(name)) value = last;
  else if (/(^|_)name$|full_?name|display_?name|author/.test(name) && !/(file|host|table)/.test(name)) value = `${first} ${last}`;
  else if (/phone|mobile|tel/.test(name)) value = `+1-555-01${pad(int(0, 99))}`;
  else if (/city/.test(name)) value = pick(CITIES);
  else if (/country/.test(name)) value = pick(COUNTRIES);
  else if (/(zip|postal|postcode)/.test(name)) value = String(int(10000, 99999));
  else if (/address|street/.test(name)) value = `${int(1, 999)} ${pick(WORDS)} Street`;
  else if (/(url|website|link|homepage)/.test(name)) value = `https://example.com/${pick(WORDS)}/${i}`;
  else if (/slug/.test(name)) value = `${pick(WORDS)}-${pick(WORDS)}-${i}`;
  else if (/status|state/.test(name)) value = pick(STATUSES);
  else if (/(password|hash|token|secret)/.test(name)) value = `$2b$10$${Array.from({ length: 53 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[int(0, 35)]).join('')}`;
  else if (/(color|colour)/.test(name)) value = `#${int(0, 0xffffff).toString(16).padStart(6, '0')}`;
  else if (/(title|subject|headline)/.test(name)) value = `${cap(pick(WORDS))} ${pick(WORDS)} ${i}`;
  else if (/(description|content|body|bio|notes?|comment|summary|text)/.test(name)) {
    value = `${first} ${last}'s note about ${pick(WORDS)} and ${pick(WORDS)}.`;
  } else value = `${column.name}_${i}`;

  // UNIQUE text columns get the row number so repeated picks cannot collide.
  const suffix = column.unique && !value.includes(String(i)) ? ` ${i}` : '';
  const max = typeLength(type);
  if (max && value.length + suffix.length > max) {
    // Truncating must not cut off the row number that keeps a UNIQUE value unique.
    if (column.unique) return value.slice(0, Math.max(0, max - String(i).length)) + String(i);
    value = value.slice(0, Math.max(0, max - suffix.length));
  }
  return value + suffix;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function uuid(rand: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Generates rows for every CREATE TABLE in the schema, parents first. */
export function generateSeedRows(schema: string, options: Pick<SeedOptions, 'count' | 'seed' | 'now'>): { table: ParsedTable; rows: SeedRow[] }[] {
  const { tables } = parseSchema(schema);
  if (!tables.length) throw new Error(msg('No CREATE TABLE statements found in the schema.'));
  const count = Math.min(MAX_RECORDS, Math.max(1, Math.floor(options.count) || 1));
  const rand = mulberry32(options.seed ?? Date.now());
  const now = options.now ?? new Date();
  const generated = new Map<string, SeedRow[]>();
  const result: { table: ParsedTable; rows: SeedRow[] }[] = [];

  for (const table of orderByDependencies(tables)) {
    const rows: SeedRow[] = [];
    for (let i = 1; i <= count; i++) {
      const row: SeedRow = {};
      for (const column of table.columns) {
        // Leave database-generated columns that are not keys to their defaults.
        if (column.autoIncrement && !table.primaryKey.includes(column.name)) continue;
        row[column.name] = generateValue(table, column, i, rand, now, generated, row, rows);
      }
      rows.push(row);
    }
    generated.set(table.name, rows);
    result.push({ table, rows });
  }
  return result;
}

export function generateSeedData(schema: string, options: SeedOptions): string {
  const data = generateSeedRows(schema, options);
  if (options.format === 'json') {
    if (data.length === 1) return JSON.stringify(data[0].rows, null, 2);
    return JSON.stringify(Object.fromEntries(data.map((d) => [d.table.name, d.rows])), null, 2);
  }
  const total = data.reduce((n, d) => n + d.rows.length, 0);
  let out = `-- Generated seed data: ${total} rows across ${data.length} table${data.length === 1 ? '' : 's'}\n`;
  out += '-- Parent tables come first so foreign keys resolve. Strings use standard SQL quoting.\n';
  for (const { table, rows } of data) {
    out += `\n-- ${table.name}\n`;
    for (const row of rows) {
      const cols = Object.keys(row);
      out += `INSERT INTO ${table.name} (${cols.join(', ')}) VALUES (${cols.map((c) => sqlLiteral(row[c])).join(', ')});\n`;
    }
  }
  return out;
}
