import { balancedGroup, splitTopLevel, stripSqlComments } from './database-erd-generator';

export type Dialect = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'oracle';

export const DIALECTS: { id: Dialect; name: string }[] = [
  { id: 'mysql', name: 'MySQL' },
  { id: 'postgresql', name: 'PostgreSQL' },
  { id: 'sqlite', name: 'SQLite' },
  { id: 'oracle', name: 'Oracle' },
  { id: 'sqlserver', name: 'SQL Server' },
];

/** Dialect-neutral type the converter maps through. */
type Canonical =
  | { kind: 'tinyint' | 'smallint' | 'mediumint' | 'int' | 'bigint'; unsigned?: boolean }
  | { kind: 'decimal'; p?: number; s?: number }
  | { kind: 'real' | 'double' | 'bool' | 'text' | 'date' | 'time' | 'datetime' | 'timestamptz' | 'blob' | 'json' | 'uuid' }
  | { kind: 'char' | 'varchar' | 'binary' | 'varbinary'; n?: number }
  | { kind: 'enum'; values: string }
  | { kind: 'unknown'; raw: string };

export interface ConversionResult {
  sql: string;
  notes: string[];
}

const argsOf = (type: string): number[] => {
  const m = type.match(/\(([^)]*)\)/);
  if (!m) return [];
  return m[1].split(',').map((s) => (/^\s*max\s*$/i.test(s) ? Infinity : parseInt(s, 10)));
};

/** Reads a source column type (upper-cased, with arguments) into a canonical type. */
export function toCanonical(rawType: string, from: Dialect, extra = ''): Canonical {
  const type = rawType.replace(/\s+/g, ' ').trim();
  const base = type.replace(/\(.*\)/, '').trim().toUpperCase();
  const args = argsOf(type);
  const unsigned = /\bUNSIGNED\b/i.test(extra);

  switch (base) {
    case 'TINYINT':
      if (from === 'mysql' && args[0] === 1) return { kind: 'bool' };
      // SQL Server TINYINT is unsigned (0 to 255); MySQL TINYINT is signed unless UNSIGNED.
      return { kind: 'tinyint', unsigned: from === 'sqlserver' || unsigned };
    case 'SMALLINT':
    case 'INT2':
    case 'SMALLSERIAL':
      return { kind: 'smallint', unsigned };
    case 'MEDIUMINT':
      return { kind: 'mediumint', unsigned };
    case 'INT':
    case 'INTEGER':
    case 'INT4':
    case 'SERIAL':
      return { kind: 'int', unsigned };
    case 'BIGINT':
    case 'INT8':
    case 'BIGSERIAL':
      return { kind: 'bigint', unsigned };
    case 'DECIMAL':
    case 'NUMERIC':
    case 'DEC':
    case 'MONEY':
    case 'SMALLMONEY':
      if (base === 'MONEY') return { kind: 'decimal', p: 19, s: 4 };
      if (base === 'SMALLMONEY') return { kind: 'decimal', p: 10, s: 4 };
      return { kind: 'decimal', p: args[0], s: args[1] };
    case 'NUMBER': {
      const [p, s] = args;
      if (p !== undefined && (s === undefined || s === 0)) {
        if (p === 1) return { kind: 'bool' };
        if (p <= 4) return { kind: 'smallint' };
        if (p <= 9) return { kind: 'int' };
        if (p <= 18) return { kind: 'bigint' };
      }
      return { kind: 'decimal', p, s };
    }
    case 'FLOAT': {
      // MySQL FLOAT is 4 bytes. In SQL Server, PostgreSQL and Oracle FLOAT
      // means double precision unless a precision of 24 bits or less is given.
      // MySQL FLOAT(p) with p from 25 to 53 is DOUBLE; FLOAT(M,D) stays single precision.
      if (from === 'mysql') return { kind: args.length === 1 && args[0] > 24 ? 'double' : 'real' };
      if (args[0] !== undefined && args[0] <= 24) return { kind: 'real' };
      return { kind: 'double' };
    }
    case 'REAL':
    case 'FLOAT4':
    case 'BINARY_FLOAT':
      // MySQL REAL is DOUBLE by default; SQLite REAL is an 8-byte float.
      return { kind: from === 'mysql' || from === 'sqlite' ? 'double' : 'real' };
    case 'DOUBLE':
    case 'DOUBLE PRECISION':
    case 'FLOAT8':
    case 'BINARY_DOUBLE':
      return { kind: 'double' };
    case 'BOOLEAN':
    case 'BOOL':
      return { kind: 'bool' };
    case 'BIT':
      if (from === 'sqlserver' || args[0] === undefined || args[0] === 1) return { kind: 'bool' };
      return { kind: 'unknown', raw: rawType };
    case 'CHAR':
    case 'CHARACTER':
    case 'NCHAR':
    case 'NATIONAL CHARACTER':
      return { kind: 'char', n: args[0] ?? 1 };
    case 'VARCHAR':
    case 'CHARACTER VARYING':
    case 'CHAR VARYING':
    case 'NVARCHAR':
    case 'VARCHAR2':
    case 'NVARCHAR2':
    case 'NATIONAL CHARACTER VARYING':
      if (args[0] === Infinity) return { kind: 'text' };
      return { kind: 'varchar', n: args[0] };
    case 'TEXT':
    case 'TINYTEXT':
    case 'MEDIUMTEXT':
    case 'LONGTEXT':
    case 'NTEXT':
    case 'CLOB':
    case 'NCLOB':
    case 'CITEXT':
      return { kind: 'text' };
    case 'DATE':
      // Oracle DATE carries a time of day down to the second.
      return { kind: from === 'oracle' ? 'datetime' : 'date' };
    case 'TIME':
    case 'TIME WITHOUT TIME ZONE':
      return { kind: 'time' };
    case 'DATETIME':
    case 'DATETIME2':
    case 'SMALLDATETIME':
    case 'TIMESTAMP WITHOUT TIME ZONE':
      return { kind: 'datetime' };
    case 'TIMESTAMP':
      // SQL Server TIMESTAMP is a synonym for ROWVERSION, an 8-byte row counter.
      if (from === 'sqlserver') return { kind: 'binary', n: 8 };
      // MySQL TIMESTAMP stores an instant (converted to UTC), like timestamptz.
      return { kind: from === 'mysql' ? 'timestamptz' : 'datetime' };
    case 'ROWVERSION':
      return { kind: 'binary', n: 8 };
    case 'TIMESTAMPTZ':
    case 'TIMESTAMP WITH TIME ZONE':
    case 'DATETIMEOFFSET':
      return { kind: 'timestamptz' };
    case 'BLOB':
    case 'TINYBLOB':
    case 'MEDIUMBLOB':
    case 'LONGBLOB':
    case 'BYTEA':
    case 'IMAGE':
    case 'LONG RAW':
      return { kind: 'blob' };
    case 'BINARY':
      return { kind: 'binary', n: args[0] ?? 1 };
    case 'VARBINARY':
    case 'RAW':
      if (args[0] === Infinity || args[0] === undefined) return { kind: 'blob' };
      return { kind: 'varbinary', n: args[0] };
    case 'JSON':
    case 'JSONB':
      return { kind: 'json' };
    case 'UUID':
    case 'UNIQUEIDENTIFIER':
      return { kind: 'uuid' };
    case 'YEAR':
      return { kind: 'smallint' };
    case 'ENUM':
      return { kind: 'enum', values: (type.match(/\((.*)\)/) ?? ['', ''])[1] };
    default:
      return { kind: 'unknown', raw: rawType };
  }
}

const sized = (name: string, p?: number, s?: number) =>
  p === undefined || !Number.isFinite(p) ? name : s === undefined ? `${name}(${p})` : `${name}(${p},${s})`;

/** Writes a canonical type in the target dialect. */
export function fromCanonical(c: Canonical, to: Dialect, notes: string[]): string {
  // Unsigned integers need the next size up outside MySQL.
  if ('unsigned' in c && c.unsigned && to !== 'mysql') {
    const wider: Record<string, Canonical> = {
      tinyint: { kind: 'smallint' },
      smallint: { kind: 'int' },
      mediumint: { kind: 'int' },
      int: { kind: 'bigint' },
      bigint: { kind: 'decimal', p: 20, s: 0 },
    };
    if (!(c.kind === 'tinyint' && to === 'sqlserver')) return fromCanonical(wider[c.kind], to, notes);
  }
  const u = 'unsigned' in c && c.unsigned && to === 'mysql' ? ' UNSIGNED' : '';

  switch (c.kind) {
    case 'tinyint':
      return { mysql: `TINYINT${u}`, postgresql: 'SMALLINT', sqlite: 'INTEGER', sqlserver: c.unsigned ? 'TINYINT' : 'SMALLINT', oracle: 'NUMBER(3)' }[to];
    case 'smallint':
      return { mysql: `SMALLINT${u}`, postgresql: 'SMALLINT', sqlite: 'INTEGER', sqlserver: 'SMALLINT', oracle: 'NUMBER(5)' }[to];
    case 'mediumint':
      return { mysql: `MEDIUMINT${u}`, postgresql: 'INTEGER', sqlite: 'INTEGER', sqlserver: 'INT', oracle: 'NUMBER(7)' }[to];
    case 'int':
      return { mysql: `INT${u}`, postgresql: 'INTEGER', sqlite: 'INTEGER', sqlserver: 'INT', oracle: 'NUMBER(10)' }[to];
    case 'bigint':
      return { mysql: `BIGINT${u}`, postgresql: 'BIGINT', sqlite: 'INTEGER', sqlserver: 'BIGINT', oracle: 'NUMBER(19)' }[to];
    case 'decimal':
      return {
        mysql: sized('DECIMAL', c.p, c.s),
        postgresql: sized('NUMERIC', c.p, c.s),
        sqlite: 'NUMERIC',
        sqlserver: sized('DECIMAL', c.p, c.s),
        oracle: sized('NUMBER', c.p, c.s),
      }[to];
    case 'real':
      return { mysql: 'FLOAT', postgresql: 'REAL', sqlite: 'REAL', sqlserver: 'REAL', oracle: 'BINARY_FLOAT' }[to];
    case 'double':
      return { mysql: 'DOUBLE', postgresql: 'DOUBLE PRECISION', sqlite: 'REAL', sqlserver: 'FLOAT', oracle: 'BINARY_DOUBLE' }[to];
    case 'bool':
      return { mysql: 'BOOLEAN', postgresql: 'BOOLEAN', sqlite: 'INTEGER', sqlserver: 'BIT', oracle: 'NUMBER(1)' }[to];
    case 'char':
      return { mysql: `CHAR(${c.n})`, postgresql: `CHAR(${c.n})`, sqlite: 'TEXT', sqlserver: `NCHAR(${c.n})`, oracle: `CHAR(${c.n})` }[to];
    case 'varchar': {
      const n = c.n;
      if (n === undefined) {
        return { mysql: 'VARCHAR(255)', postgresql: 'VARCHAR', sqlite: 'TEXT', sqlserver: 'NVARCHAR(255)', oracle: 'VARCHAR2(255)' }[to];
      }
      if (to === 'sqlserver' && n > 4000) return 'NVARCHAR(MAX)';
      if (to === 'oracle' && n > 4000) {
        notes.push(`VARCHAR(${n}) became CLOB: Oracle VARCHAR2 is limited to 4000 bytes unless MAX_STRING_SIZE=EXTENDED.`);
        return 'CLOB';
      }
      // MySQL rows are limited to 65,535 bytes; with utf8mb4 (4 bytes a character)
      // VARCHAR above 16383 fails in strict mode.
      if (to === 'mysql' && n > 16383) {
        notes.push(`VARCHAR(${n}) became LONGTEXT: MySQL VARCHAR holds at most 16383 utf8mb4 characters.`);
        return 'LONGTEXT';
      }
      return { mysql: `VARCHAR(${n})`, postgresql: `VARCHAR(${n})`, sqlite: 'TEXT', sqlserver: `NVARCHAR(${n})`, oracle: `VARCHAR2(${n})` }[to];
    }
    case 'text':
      return { mysql: 'LONGTEXT', postgresql: 'TEXT', sqlite: 'TEXT', sqlserver: 'NVARCHAR(MAX)', oracle: 'CLOB' }[to];
    case 'date':
      return { mysql: 'DATE', postgresql: 'DATE', sqlite: 'TEXT', sqlserver: 'DATE', oracle: 'DATE' }[to];
    case 'time':
      if (to === 'oracle') notes.push('Oracle has no TIME type; TIME columns became INTERVAL DAY(0) TO SECOND.');
      return { mysql: 'TIME', postgresql: 'TIME', sqlite: 'TEXT', sqlserver: 'TIME', oracle: 'INTERVAL DAY(0) TO SECOND' }[to];
    case 'datetime':
      return { mysql: 'DATETIME', postgresql: 'TIMESTAMP', sqlite: 'TEXT', sqlserver: 'DATETIME2', oracle: 'TIMESTAMP' }[to];
    case 'timestamptz':
      return {
        mysql: 'TIMESTAMP',
        postgresql: 'TIMESTAMPTZ',
        sqlite: 'TEXT',
        sqlserver: 'DATETIMEOFFSET',
        oracle: 'TIMESTAMP WITH TIME ZONE',
      }[to];
    case 'blob':
      return { mysql: 'LONGBLOB', postgresql: 'BYTEA', sqlite: 'BLOB', sqlserver: 'VARBINARY(MAX)', oracle: 'BLOB' }[to];
    case 'binary':
      return { mysql: `BINARY(${c.n})`, postgresql: 'BYTEA', sqlite: 'BLOB', sqlserver: `BINARY(${c.n})`, oracle: `RAW(${c.n})` }[to];
    case 'varbinary':
      if (to === 'oracle' && (c.n ?? 0) > 2000) return 'BLOB';
      if (to === 'sqlserver' && (c.n ?? 0) > 8000) return 'VARBINARY(MAX)';
      return { mysql: `VARBINARY(${c.n})`, postgresql: 'BYTEA', sqlite: 'BLOB', sqlserver: `VARBINARY(${c.n})`, oracle: `RAW(${c.n})` }[to];
    case 'json':
      return { mysql: 'JSON', postgresql: 'JSONB', sqlite: 'TEXT', sqlserver: 'NVARCHAR(MAX)', oracle: 'CLOB' }[to];
    case 'uuid':
      return { mysql: 'CHAR(36)', postgresql: 'UUID', sqlite: 'TEXT', sqlserver: 'UNIQUEIDENTIFIER', oracle: 'VARCHAR2(36)' }[to];
    case 'enum':
      if (to === 'mysql') return `ENUM(${c.values})`;
      notes.push(`ENUM(${c.values}) became VARCHAR(255) with a CHECK constraint.`);
      return { postgresql: 'VARCHAR(255)', sqlite: 'TEXT', sqlserver: 'NVARCHAR(255)', oracle: 'VARCHAR2(255)' }[to];
    case 'unknown':
      notes.push(`Unrecognised type ${c.raw} was left unchanged.`);
      return c.raw;
  }
}

const IDENT_TOKEN = /^(`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+)/;

function quoteIdent(raw: string, to: Dialect): string {
  const bare = raw.replace(/^[`"[]|[`"\]]$/g, '');
  const quoted = /^[`"[]/.test(raw);
  if (!quoted) return bare;
  return to === 'mysql' ? `\`${bare}\`` : `"${bare}"`;
}

/** Converts quoted identifiers outside string literals to the target dialect's quote style. */
function convertQuotes(text: string, to: Dialect): string {
  return text.replace(/'(?:[^']|'')*'|`[^`]+`|"[^"]+"|\[[^\]]+\]/g, (tok) => (tok.startsWith("'") ? tok : quoteIdent(tok, to)));
}

const TYPE_RE =
  /^(DOUBLE\s+PRECISION|CHARACTER\s+VARYING|CHAR\s+VARYING|NATIONAL\s+CHARACTER(?:\s+VARYING)?|TIMESTAMP(?:\s*\(\s*\d+\s*\))?\s+WITH(?:OUT)?\s+TIME\s+ZONE|TIME(?:\s*\(\s*\d+\s*\))?\s+WITHOUT\s+TIME\s+ZONE|LONG\s+RAW|[\w$]+)/i;

const CONSTRAINT_RE = /^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|KEY|INDEX|CHECK|FULLTEXT|SPATIAL)\b/i;

function convertColumn(def: string, from: Dialect, to: Dialect, notes: string[]): string {
  const nameMatch = def.match(IDENT_TOKEN);
  if (!nameMatch) return def;
  const name = quoteIdent(nameMatch[1], to);
  let rest = def.slice(nameMatch[0].length).trimStart();

  const typeMatch = rest.match(TYPE_RE);
  if (!typeMatch) return def;
  let rawType = typeMatch[1].replace(/\s+/g, ' ');
  rest = rest.slice(typeMatch[0].length);
  if (/^\s*\(/.test(rest)) {
    const g = balancedGroup(rest, 0);
    if (g) {
      rawType += `(${g.inner.trim()})`;
      rest = rest.slice(g.end + 1);
    }
  }
  // Strip TIMESTAMP(6) style fractional precision so the base name matches.
  const normalized = rawType.replace(/^(TIMESTAMP|TIME|DATETIME2|DATETIMEOFFSET)\s*\(\s*\d+\s*\)/i, '$1');
  const modifiers = rest.match(/^(\s+(UNSIGNED|SIGNED|ZEROFILL))+/i)?.[0] ?? '';
  rest = rest.slice(modifiers.length);

  const canonical = toCanonical(normalized, from, modifiers);
  const sqliteRowid = from === 'sqlite' && /^INTEGER$/i.test(normalized) && /\bPRIMARY\s+KEY\b/i.test(rest);
  const autoInc =
    sqliteRowid ||
    /\b(AUTO_INCREMENT|AUTOINCREMENT)\b/i.test(rest) ||
    /\bIDENTITY\s*(\(\s*\d+\s*,\s*\d+\s*\))?/i.test(rest) ||
    /^(SMALL|BIG)?SERIAL$/i.test(normalized);
  rest = rest
    .replace(/\s*\bAUTO_INCREMENT\b/gi, '')
    .replace(/\s*\bAUTOINCREMENT\b/gi, '')
    .replace(/\s*\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)(\s+ON\s+NULL)?\s+AS\s+IDENTITY(\s*\([^)]*\))?/gi, '')
    .replace(/\s*\bIDENTITY\s*(\(\s*\d+\s*,\s*\d+\s*\))?/gi, '');

  if (to !== 'mysql') {
    if (/\bON\s+UPDATE\s+CURRENT_TIMESTAMP(\(\d*\))?/i.test(rest)) {
      notes.push(`${name}: ON UPDATE CURRENT_TIMESTAMP is MySQL-only; use a trigger or set the value in application code.`);
      rest = rest.replace(/\s*\bON\s+UPDATE\s+CURRENT_TIMESTAMP(\(\d*\))?/gi, '');
    }
    rest = rest
      .replace(/\s*\bCOMMENT\s+'(?:[^']|'')*'/gi, '')
      .replace(/\s*\b(CHARACTER\s+SET|CHARSET)\s+\w+/gi, '')
      .replace(/\s*\bCOLLATE\s+\w+/gi, '');
  }

  if (from === 'postgresql') {
    // PostgreSQL casts in defaults, e.g. 'draft'::character varying.
    rest = rest.replace(/::\s*[a-z_]+(?:\s+(?:varying|precision|without\s+time\s+zone|with\s+time\s+zone))?(?:\s*\[\])?/gi, '');
  }

  // Default expressions that differ between dialects.
  // CURRENT_TIMESTAMP is the one spelling every target accepts.
  rest = rest.replace(/\bDEFAULT\s+\(?(NOW\(\)|GETDATE\(\)|SYSDATETIME\(\)|SYSDATE|SYSTIMESTAMP|CURRENT_TIMESTAMP(\(\d*\))?)\)?/gi, 'DEFAULT CURRENT_TIMESTAMP');
  if (canonical.kind === 'bool') {
    if (to === 'postgresql' || to === 'mysql') {
      rest = rest.replace(/\bDEFAULT\s+(?:\(\(\s*([01])\s*\)\)|'([01])'|b'([01])'|([01])(?![\d.]))/i, (_m, a, b, c, d) =>
        `DEFAULT ${(a ?? b ?? c ?? d) === '1' ? 'TRUE' : 'FALSE'}`,
      );
    } else {
      rest = rest.replace(/\bDEFAULT\s+TRUE\b/i, 'DEFAULT 1').replace(/\bDEFAULT\s+FALSE\b/i, 'DEFAULT 0');
    }
  }

  let typeOut = fromCanonical(canonical, to, notes);
  if (canonical.kind === 'enum' && to !== 'mysql') {
    rest += ` CHECK (${name} IN (${canonical.values}))`;
  }

  let identity = '';
  if (autoInc) {
    const isPk = /\bPRIMARY\s+KEY\b/i.test(rest);
    switch (to) {
      case 'mysql':
        identity = ' AUTO_INCREMENT';
        break;
      case 'postgresql':
      case 'oracle':
        identity = ' GENERATED BY DEFAULT AS IDENTITY';
        break;
      case 'sqlserver':
        identity = ' IDENTITY(1,1)';
        break;
      case 'sqlite':
        if (isPk) {
          typeOut = 'INTEGER';
          rest = rest.replace(/\bPRIMARY\s+KEY\b/i, 'PRIMARY KEY AUTOINCREMENT');
        } else {
          notes.push(`${name}: SQLite only auto-increments a column declared INTEGER PRIMARY KEY.`);
        }
        break;
    }
  }

  return `${name} ${typeOut}${identity}${rest.replace(/\s+$/, '')}`.replace(/\s{2,}/g, ' ');
}

/**
 * Converts the column types of CREATE TABLE statements from one SQL dialect
 * to another. Other statements are passed through with identifier quotes
 * converted. Returns the SQL plus notes about anything that needs a human.
 */
export function convertSchema(input: string, from: Dialect, to: Dialect): ConversionResult {
  for (const d of [from, to]) if (!DIALECTS.some((x) => x.id === d)) throw new Error(`Unsupported database "${d}".`);
  if (from === to) throw new Error('Source and target databases cannot be the same.');
  const notes: string[] = [];
  const statements = splitTopLevel(stripSqlComments(input), ';');
  const out: string[] = [];

  for (const stmt of statements) {
    const head = stmt.match(/^CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[^(]+\(/i);
    if (!head) {
      out.push(`${convertQuotes(stmt, to)};`);
      continue;
    }
    const group = balancedGroup(stmt, head[0].length - 1);
    if (!group) {
      notes.push(`A CREATE TABLE statement could not be parsed (unbalanced parentheses) and was left unchanged.`);
      out.push(`${stmt};`);
      continue;
    }
    const defs = splitTopLevel(group.inner, ',').map((def) => {
      if (CONSTRAINT_RE.test(def)) {
        let d = convertQuotes(def, to);
        if (to !== 'mysql' && /^(KEY|INDEX|FULLTEXT|SPATIAL)\b/i.test(def)) {
          notes.push(`Inline index "${def.slice(0, 40)}" was removed: create it with a separate CREATE INDEX statement.`);
          return null;
        }
        if (to !== 'mysql') d = d.replace(/^UNIQUE\s+(KEY|INDEX)\s+[\w`"]+\s*/i, 'UNIQUE ');
        return d;
      }
      return convertColumn(def, from, to, notes);
    });
    let tail = stmt.slice(group.end + 1).trim();
    if (to !== 'mysql' && tail) {
      notes.push(`Table options "${tail}" were removed (MySQL-only).`);
      tail = '';
    }
    const kept = defs.filter((d): d is string => d !== null);
    out.push(`${convertQuotes(head[0].slice(0, -1).trimEnd(), to)} (\n  ${kept.join(',\n  ')}\n)${tail ? ` ${tail}` : ''};`);
  }

  const uniqueNotes = [...new Set(notes)];
  const header = uniqueNotes.length ? `${uniqueNotes.map((n) => `-- Note: ${n}`).join('\n')}\n\n` : '';
  return { sql: `${header}${out.join('\n\n')}\n`, notes: uniqueNotes };
}
