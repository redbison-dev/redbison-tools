/**
 * Edge, corner and negative cases for the SQL data type converter, the
 * PostgreSQL EXPLAIN visualizer and the SQL query builder. Type mappings are
 * checked against the vendor documentation cited next to each case:
 *  - MySQL 8.0 Reference Manual, 13.1 Numeric / 13.3 String / 13.2 Date types
 *  - PostgreSQL 16 docs, chapter 8 (Data Types) and 14.1 (Using EXPLAIN)
 *  - SQL Server docs: int/tinyint, float and real, nchar/nvarchar, rowversion
 *  - Oracle Database SQL Language Reference, "Data Types"
 *  - SQLite "Datatypes In SQLite" and "CREATE TABLE ... ROWID / AUTOINCREMENT"
 */
import { describe, expect, it } from 'vitest';
import { convertSchema, fromCanonical, toCanonical, type Dialect } from '@/lib/tools/sql-data-type-converter';
import {
  analyzePerformance,
  generateRecommendations,
  getOperationType,
  parseExplainPlan,
  type ExecutionNode,
} from '@/lib/tools/sql-explain-visualizer';
import { buildSqlQuery, quoteLiteral, type BuilderInput } from '@/lib/tools/sql-query-builder';

/** Converts one column definition and returns the converted column line. */
const col = (def: string, from: Dialect, to: Dialect) => {
  const { sql } = convertSchema(`CREATE TABLE t (${def});`, from, to);
  return sql.split('\n').find((l) => l.startsWith('  '))!.trim();
};

describe('sql-data-type-converter: integer widths', () => {
  it('positive: MySQL integer family to PostgreSQL (PG has no TINYINT/MEDIUMINT; SMALLINT is 2 bytes, INTEGER 4)', () => {
    expect(col('a TINYINT', 'mysql', 'postgresql')).toBe('a SMALLINT');
    expect(col('a MEDIUMINT', 'mysql', 'postgresql')).toBe('a INTEGER');
    expect(col('a BIGINT', 'mysql', 'postgresql')).toBe('a BIGINT');
  });

  it('edge: UNSIGNED needs the next size up outside MySQL; BIGINT UNSIGNED (max 18446744073709551615, 20 digits) becomes NUMERIC(20,0)', () => {
    expect(col('a SMALLINT UNSIGNED', 'mysql', 'postgresql')).toBe('a INTEGER');
    expect(col('a MEDIUMINT UNSIGNED', 'mysql', 'sqlserver')).toBe('a INT');
    expect(col('a INT UNSIGNED', 'mysql', 'sqlserver')).toBe('a BIGINT');
    expect(col('a BIGINT UNSIGNED', 'mysql', 'postgresql')).toBe('a NUMERIC(20,0)');
    expect(col('a BIGINT UNSIGNED', 'mysql', 'oracle')).toBe('a NUMBER(20,0)');
  });

  it('edge: SQL Server TINYINT is 0..255 and MySQL TINYINT is -128..127, so they map to each other with the sign fixed', () => {
    expect(col('a TINYINT', 'sqlserver', 'mysql')).toBe('a TINYINT UNSIGNED');
    expect(col('a TINYINT', 'mysql', 'sqlserver')).toBe('a SMALLINT');
    expect(col('a TINYINT UNSIGNED', 'mysql', 'sqlserver')).toBe('a TINYINT');
    expect(col('a TINYINT', 'sqlserver', 'postgresql')).toBe('a SMALLINT');
  });

  it('edge: Oracle NUMBER(p) picks the smallest integer that holds p digits (9999 < 32767 < 99999; 999,999,999 < 2^31; 18 digits < 2^63)', () => {
    expect(col('a NUMBER(4)', 'oracle', 'postgresql')).toBe('a SMALLINT');
    expect(col('a NUMBER(5)', 'oracle', 'postgresql')).toBe('a INTEGER');
    expect(col('a NUMBER(9)', 'oracle', 'postgresql')).toBe('a INTEGER');
    expect(col('a NUMBER(10)', 'oracle', 'postgresql')).toBe('a BIGINT');
    expect(col('a NUMBER(18,0)', 'oracle', 'postgresql')).toBe('a BIGINT');
    expect(col('a NUMBER(19)', 'oracle', 'postgresql')).toBe('a NUMERIC(19)');
    expect(col('a NUMBER(10,2)', 'oracle', 'mysql')).toBe('a DECIMAL(10,2)');
    expect(col('a NUMBER', 'oracle', 'postgresql')).toBe('a NUMERIC');
    expect(col('a NUMBER(1)', 'oracle', 'postgresql')).toBe('a BOOLEAN');
  });

  it('positive: every integer kind has an Oracle NUMBER(p) wide enough (TINYINT 3, SMALLINT 5, INT 10, BIGINT 19 digits)', () => {
    expect(col('a TINYINT UNSIGNED', 'mysql', 'oracle')).toBe('a NUMBER(5)');
    expect(col('a SMALLINT', 'postgresql', 'oracle')).toBe('a NUMBER(5)');
    expect(col('a INTEGER', 'postgresql', 'oracle')).toBe('a NUMBER(10)');
    expect(col('a BIGINT', 'postgresql', 'oracle')).toBe('a NUMBER(19)');
    expect(col('a INT', 'mysql', 'sqlite')).toBe('a INTEGER');
  });
});

describe('sql-data-type-converter: floating point and decimals', () => {
  it('edge: MySQL FLOAT(p) is 4-byte for p 0-24 and DOUBLE for p 25-53 (MySQL 13.1.4)', () => {
    expect(col('a FLOAT(24)', 'mysql', 'postgresql')).toBe('a REAL');
    expect(col('a FLOAT(25)', 'mysql', 'postgresql')).toBe('a DOUBLE PRECISION');
    expect(col('a FLOAT(53)', 'mysql', 'sqlserver')).toBe('a FLOAT');
    // FLOAT(M,D) is the deprecated two-argument single-precision form.
    expect(col('a FLOAT(7,4)', 'mysql', 'postgresql')).toBe('a REAL');
  });

  it('edge: SQL Server and PostgreSQL FLOAT(n) is REAL for n <= 24 and double above', () => {
    expect(col('a FLOAT(24)', 'sqlserver', 'postgresql')).toBe('a REAL');
    expect(col('a FLOAT(25)', 'sqlserver', 'postgresql')).toBe('a DOUBLE PRECISION');
    expect(col('a FLOAT(1)', 'postgresql', 'mysql')).toBe('a FLOAT');
  });

  it('positive: REAL is DOUBLE in MySQL and SQLite but 4-byte elsewhere', () => {
    expect(col('a REAL', 'mysql', 'postgresql')).toBe('a DOUBLE PRECISION');
    expect(col('a REAL', 'sqlite', 'postgresql')).toBe('a DOUBLE PRECISION');
    expect(col('a REAL', 'postgresql', 'oracle')).toBe('a BINARY_FLOAT');
    expect(col('a DOUBLE PRECISION', 'postgresql', 'oracle')).toBe('a BINARY_DOUBLE');
    expect(col('a FLOAT8', 'postgresql', 'sqlite')).toBe('a REAL');
  });

  it('positive: SQL Server MONEY is DECIMAL(19,4) and SMALLMONEY DECIMAL(10,4)', () => {
    expect(col('a MONEY', 'sqlserver', 'postgresql')).toBe('a NUMERIC(19,4)');
    expect(col('a SMALLMONEY', 'sqlserver', 'mysql')).toBe('a DECIMAL(10,4)');
    expect(col('a DECIMAL', 'mysql', 'postgresql')).toBe('a NUMERIC');
    expect(col('a NUMERIC(38,10)', 'postgresql', 'sqlite')).toBe('a NUMERIC');
  });
});

describe('sql-data-type-converter: strings and binary', () => {
  it('edge: SQL Server NVARCHAR(n) allows n <= 4000, otherwise NVARCHAR(MAX)', () => {
    expect(col('a VARCHAR(4000)', 'mysql', 'sqlserver')).toBe('a NVARCHAR(4000)');
    expect(col('a VARCHAR(4001)', 'mysql', 'sqlserver')).toBe('a NVARCHAR(MAX)');
  });

  it('edge: Oracle VARCHAR2 is limited to 4000 bytes by default, so longer columns become CLOB with a note', () => {
    expect(col('a VARCHAR(4000)', 'postgresql', 'oracle')).toBe('a VARCHAR2(4000)');
    const r = convertSchema('CREATE TABLE t (a VARCHAR(4001));', 'postgresql', 'oracle');
    expect(r.sql).toContain('a CLOB');
    expect(r.notes[0]).toMatch(/VARCHAR\(4001\) became CLOB/);
  });

  it('edge: a MySQL VARCHAR wider than 16383 characters fails in strict mode with utf8mb4 (max row 65,535 bytes / 4), so it becomes LONGTEXT', () => {
    expect(col('a VARCHAR(16383)', 'postgresql', 'mysql')).toBe('a VARCHAR(16383)');
    const r = convertSchema('CREATE TABLE t (a VARCHAR(100000));', 'postgresql', 'mysql');
    expect(r.sql).toContain('a LONGTEXT');
    expect(r.notes.some((n) => /VARCHAR\(100000\) became LONGTEXT/.test(n))).toBe(true);
  });

  it('edge: VARCHAR without a length and (MAX) forms', () => {
    expect(col('a VARCHAR', 'postgresql', 'mysql')).toBe('a VARCHAR(255)');
    expect(col('a CHARACTER VARYING', 'postgresql', 'sqlserver')).toBe('a NVARCHAR(255)');
    expect(col('a NVARCHAR(MAX)', 'sqlserver', 'postgresql')).toBe('a TEXT');
    expect(col('a VARBINARY(MAX)', 'sqlserver', 'postgresql')).toBe('a BYTEA');
    expect(col('a CHAR', 'mysql', 'postgresql')).toBe('a CHAR(1)');
  });

  it('edge: VARBINARY limits - SQL Server 8000 bytes, Oracle RAW 2000 bytes', () => {
    expect(col('a VARBINARY(8000)', 'mysql', 'sqlserver')).toBe('a VARBINARY(8000)');
    expect(col('a VARBINARY(8001)', 'mysql', 'sqlserver')).toBe('a VARBINARY(MAX)');
    expect(col('a VARBINARY(2000)', 'mysql', 'oracle')).toBe('a RAW(2000)');
    expect(col('a VARBINARY(2001)', 'mysql', 'oracle')).toBe('a BLOB');
    expect(col('a BINARY(16)', 'mysql', 'postgresql')).toBe('a BYTEA');
    expect(col('a RAW(16)', 'oracle', 'sqlserver')).toBe('a VARBINARY(16)');
  });

  it('positive: text, json, uuid and blob families', () => {
    expect(col('a LONGTEXT', 'mysql', 'sqlserver')).toBe('a NVARCHAR(MAX)');
    expect(col('a CLOB', 'oracle', 'postgresql')).toBe('a TEXT');
    expect(col('a JSONB', 'postgresql', 'mysql')).toBe('a JSON');
    expect(col('a UNIQUEIDENTIFIER', 'sqlserver', 'postgresql')).toBe('a UUID');
    expect(col('a UUID', 'postgresql', 'mysql')).toBe('a CHAR(36)');
    expect(col('a BYTEA', 'postgresql', 'oracle')).toBe('a BLOB');
    expect(col('a LONG RAW', 'oracle', 'mysql')).toBe('a LONGBLOB');
  });
});

describe('sql-data-type-converter: dates and times', () => {
  it('positive: Oracle DATE carries a time of day, so it maps to a timestamp', () => {
    expect(col('a DATE', 'oracle', 'postgresql')).toBe('a TIMESTAMP');
    expect(col('a DATE', 'mysql', 'oracle')).toBe('a DATE');
  });

  it('edge: MySQL TIMESTAMP is UTC-normalised (timestamptz); PostgreSQL TIMESTAMP is without time zone', () => {
    expect(col('a TIMESTAMP', 'mysql', 'postgresql')).toBe('a TIMESTAMPTZ');
    expect(col('a TIMESTAMP', 'postgresql', 'mysql')).toBe('a DATETIME');
    expect(col('a TIMESTAMP(6) WITH TIME ZONE', 'postgresql', 'sqlserver')).toBe('a DATETIMEOFFSET');
    expect(col('a TIMESTAMP(3) WITHOUT TIME ZONE', 'postgresql', 'sqlserver')).toBe('a DATETIME2');
    expect(col('a DATETIMEOFFSET(7)', 'sqlserver', 'oracle')).toBe('a TIMESTAMP WITH TIME ZONE');
  });

  it('edge: SQL Server TIMESTAMP is a synonym for ROWVERSION, an 8-byte binary counter, not a date', () => {
    expect(col('a TIMESTAMP', 'sqlserver', 'postgresql')).toBe('a BYTEA');
    expect(col('a TIMESTAMP', 'sqlserver', 'mysql')).toBe('a BINARY(8)');
    expect(col('a ROWVERSION', 'sqlserver', 'mysql')).toBe('a BINARY(8)');
  });

  it('edge: Oracle has no TIME type', () => {
    const r = convertSchema('CREATE TABLE t (a TIME);', 'mysql', 'oracle');
    expect(r.sql).toContain('a INTERVAL DAY(0) TO SECOND');
    expect(r.notes).toContain('Oracle has no TIME type; TIME columns became INTERVAL DAY(0) TO SECOND.');
  });

  it('positive: SQLite stores dates as TEXT', () => {
    expect(col('a DATETIME', 'mysql', 'sqlite')).toBe('a TEXT');
    expect(col('a DATE', 'postgresql', 'sqlite')).toBe('a TEXT');
  });
});

describe('sql-data-type-converter: booleans, defaults, identity, enums', () => {
  it('edge: MySQL TINYINT(1) and BIT/BIT(1) are booleans; BIT(8) is not', () => {
    expect(col('a TINYINT(1)', 'mysql', 'postgresql')).toBe('a BOOLEAN');
    expect(col('a BIT', 'mysql', 'postgresql')).toBe('a BOOLEAN');
    const r = convertSchema('CREATE TABLE t (a BIT(8));', 'mysql', 'postgresql');
    expect(r.sql).toContain('a BIT(8)');
    expect(r.notes).toContain('Unrecognised type BIT(8) was left unchanged.');
  });

  it('positive: boolean defaults become TRUE/FALSE in MySQL and PostgreSQL and 1/0 elsewhere', () => {
    expect(col("a BIT DEFAULT ((0))", 'sqlserver', 'postgresql')).toBe('a BOOLEAN DEFAULT FALSE');
    expect(col("a BIT DEFAULT b'1'", 'mysql', 'postgresql')).toBe('a BOOLEAN DEFAULT TRUE');
    expect(col('a BOOLEAN DEFAULT TRUE', 'postgresql', 'oracle')).toBe('a NUMBER(1) DEFAULT 1');
    expect(col('a BOOLEAN DEFAULT FALSE', 'postgresql', 'sqlite')).toBe('a INTEGER DEFAULT 0');
  });

  it('positive: NOW(), GETDATE(), SYSDATE and casts in defaults are normalised', () => {
    expect(col('a DATETIME DEFAULT GETDATE()', 'sqlserver', 'postgresql')).toBe('a TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    expect(col('a TIMESTAMP DEFAULT NOW()', 'postgresql', 'sqlserver')).toBe('a DATETIME2 DEFAULT CURRENT_TIMESTAMP');
    expect(col('a DATE DEFAULT SYSDATE', 'oracle', 'mysql')).toBe('a DATETIME DEFAULT CURRENT_TIMESTAMP');
    expect(col("s VARCHAR(10) DEFAULT 'draft'::character varying", 'postgresql', 'mysql')).toBe("s VARCHAR(10) DEFAULT 'draft'");
  });

  it('positive: identity columns in every target', () => {
    expect(col('id INT IDENTITY(1,1) PRIMARY KEY', 'sqlserver', 'mysql')).toBe('id INT AUTO_INCREMENT PRIMARY KEY');
    expect(col('id BIGSERIAL PRIMARY KEY', 'postgresql', 'oracle')).toBe('id NUMBER(19) GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY');
    expect(col('id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY', 'postgresql', 'sqlserver')).toBe('id INT IDENTITY(1,1) PRIMARY KEY');
    expect(col('id INT AUTO_INCREMENT PRIMARY KEY', 'mysql', 'sqlite')).toBe('id INTEGER PRIMARY KEY AUTOINCREMENT');
  });

  it('edge: SQLite only auto-increments INTEGER PRIMARY KEY, so a non-key identity gets a note', () => {
    const r = convertSchema('CREATE TABLE t (n INT AUTO_INCREMENT, KEY (n));', 'mysql', 'sqlite');
    expect(r.notes).toContain('n: SQLite only auto-increments a column declared INTEGER PRIMARY KEY.');
  });

  it('positive: ENUM becomes VARCHAR + CHECK outside MySQL and stays ENUM in MySQL', () => {
    expect(col("s ENUM('a','b''c')", 'mysql', 'sqlserver')).toBe("s NVARCHAR(255) CHECK (s IN ('a','b''c'))");
    expect(convertSchema("CREATE TABLE t (s ENUM('x'));", 'mysql', 'postgresql').notes).toContain("ENUM('x') became VARCHAR(255) with a CHECK constraint.");
  });

  it('edge: MySQL-only column options are removed with notes', () => {
    const r = convertSchema(
      "CREATE TABLE t (u TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, n VARCHAR(5) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT 'it''s');",
      'mysql',
      'postgresql',
    );
    expect(r.sql).toContain('u TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,');
    expect(r.sql).toContain('n VARCHAR(5)\n');
    expect(r.notes).toContain('u: ON UPDATE CURRENT_TIMESTAMP is MySQL-only; use a trigger or set the value in application code.');
  });
});

describe('sql-data-type-converter: statements, quoting and negatives', () => {
  it('positive: identifier quotes follow the target; string literals are not touched', () => {
    const r = convertSchema("CREATE TABLE [dbo].[Order] ([Key] INT, [Name] NVARCHAR(10) DEFAULT 'a[b]\"c');\nINSERT INTO [Order] VALUES ('[x]');", 'sqlserver', 'mysql');
    expect(r.sql).toContain('CREATE TABLE `dbo`.`Order` (');
    expect(r.sql).toContain('`Key` INT,');
    expect(r.sql).toContain("`Name` VARCHAR(10) DEFAULT 'a[b]\"c'");
    expect(r.sql).toContain("INSERT INTO `Order` VALUES ('[x]');");
  });

  it('edge: inline indexes are removed outside MySQL and UNIQUE KEY becomes UNIQUE', () => {
    const r = convertSchema('CREATE TABLE t (a INT, b INT, KEY idx_a (a), UNIQUE KEY uk_b (b), PRIMARY KEY (a)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;', 'mysql', 'postgresql');
    expect(r.sql).toBe(
      '-- Note: Inline index "KEY idx_a (a)" was removed: create it with a separate CREATE INDEX statement.\n' +
        '-- Note: Table options "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" were removed (MySQL-only).\n\n' +
        'CREATE TABLE t (\n  a INTEGER,\n  b INTEGER,\n  UNIQUE (b),\n  PRIMARY KEY (a)\n);\n',
    );
  });

  it('corner: comments (line and block) are stripped, CRLF and IF NOT EXISTS / TEMPORARY are handled', () => {
    const r = convertSchema('-- header\r\n/* block */CREATE TEMPORARY TABLE IF NOT EXISTS t (\r\n  a INT -- trailing\r\n);', 'mysql', 'postgresql');
    expect(r.sql).toBe('CREATE TEMPORARY TABLE IF NOT EXISTS t (\n  a INTEGER\n);\n');
  });

  it('corner: empty or comment-only input converts to an empty script, with no notes', () => {
    expect(convertSchema('', 'mysql', 'postgresql')).toEqual({ sql: '\n', notes: [] });
    expect(convertSchema('-- nothing\n/* here */', 'mysql', 'postgresql')).toEqual({ sql: '\n', notes: [] });
  });

  it('corner: Unicode identifiers survive', () => {
    expect(col('"prénom_名前" VARCHAR(20)', 'postgresql', 'mysql')).toBe('`prénom_名前` VARCHAR(20)');
  });

  it('negative: the same source and target is a clear error', () => {
    expect(() => convertSchema('CREATE TABLE t (a INT);', 'mysql', 'mysql')).toThrow('Source and target databases cannot be the same.');
  });

  it('negative: an unknown dialect is a clear error, not "undefined" in the SQL', () => {
    expect(() => convertSchema('CREATE TABLE t (a INT);', 'mysql', 'db2' as Dialect)).toThrow(/Unsupported database "db2"/);
    expect(() => convertSchema('CREATE TABLE t (a INT);', 'access' as Dialect, 'mysql')).toThrow(/Unsupported database "access"/);
  });

  it('negative: unknown column types are kept with a note; a truncated CREATE TABLE is kept with a note', () => {
    const r = convertSchema('CREATE TABLE t (g GEOMETRY, x INT);', 'mysql', 'postgresql');
    expect(r.sql).toContain('g GEOMETRY,');
    expect(r.notes).toContain('Unrecognised type GEOMETRY was left unchanged.');
    const cut = convertSchema('CREATE TABLE t (a INT, b VARCHAR(10)', 'mysql', 'postgresql');
    expect(cut.sql).toContain('CREATE TABLE t (a INT, b VARCHAR(10);');
    expect(cut.notes.some((n) => /could not be parsed/.test(n))).toBe(true);
  });

  it('positive: toCanonical/fromCanonical are inverse for a plain type and push notes only when needed', () => {
    const notes: string[] = [];
    expect(fromCanonical(toCanonical('VARCHAR(80)', 'mysql'), 'postgresql', notes)).toBe('VARCHAR(80)');
    expect(fromCanonical(toCanonical('INT', 'mysql', 'UNSIGNED'), 'mysql', notes)).toBe('INT UNSIGNED');
    expect(notes).toEqual([]);
  });

  it('corner: a large schema (500 tables) converts every table', () => {
    const src = Array.from({ length: 500 }, (_, i) => `CREATE TABLE t${i} (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, v TINYINT(1));`).join('\n');
    const out = convertSchema(src, 'mysql', 'postgresql').sql;
    expect(out.match(/BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY/g)).toHaveLength(500);
  });
});

describe('sql-explain-visualizer', () => {
  const node = (over: Partial<ExecutionNode>): ExecutionNode => ({
    id: '0', operation: 'Result', cost: 0, rows: 0, time: 0, loops: 1, children: [], details: '', type: 'other', ...over,
  });

  it('positive: getOperationType classifies PostgreSQL node types', () => {
    expect(['Seq Scan', 'Index Only Scan', 'Bitmap Heap Scan', 'Hash Join', 'Nested Loop', 'Merge Join', 'Sort', 'Incremental Sort',
      'HashAggregate', 'GroupAggregate', 'Group', 'Result', 'ProjectSet', 'Hash', 'Limit'].map(getOperationType)).toEqual([
      'scan', 'scan', 'scan', 'join', 'join', 'join', 'sort', 'sort', 'aggregate', 'aggregate', 'aggregate', 'filter', 'other', 'other', 'other',
    ]);
  });

  it('positive: accepts the EXPLAIN array, a {"Plan"} object and a bare node; reads details and numeric strings', () => {
    const bare = { 'Node Type': 'Sort', 'Total Cost': '12.5', 'Plan Rows': 3.6, 'Sort Key': ['a', 'b DESC'], Filter: '(x > 1)' };
    for (const text of [JSON.stringify([{ Plan: bare }]), JSON.stringify({ Plan: bare }), JSON.stringify(bare)]) {
      const p = parseExplainPlan(text)!;
      expect(p).toMatchObject({ operation: 'Sort', cost: 12.5, rows: 4, details: '(x > 1) | a, b DESC', loops: 1, time: 0, actualRows: undefined, type: 'sort' });
    }
  });

  it('negative: non-JSON, empty arrays, null, scalars, MySQL JSON and nodes without "Node Type" give null', () => {
    for (const text of ['', 'not json', '[]', 'null', '42', '"Seq Scan"', '{"query_block":{}}', '[{"Plan":{"Total Cost":1}}]', '{"Node Type": 5}']) {
      expect(parseExplainPlan(text), text).toBeNull();
    }
  });

  it('corner: non-numeric costs fall back to 0 and missing children to an empty list', () => {
    const p = parseExplainPlan('{"Node Type":"Seq Scan","Total Cost":"abc","Plan Rows":null,"Plans":"x"}')!;
    expect(p).toMatchObject({ cost: 0, rows: 0, children: [] });
  });

  it('edge: thresholds are strict - cost > 1000, Seq Scan rows > 10000, time > 100 ms', () => {
    expect(analyzePerformance(node({ cost: 1000, operation: 'Seq Scan', rows: 10000, time: 100 }))).toEqual([]);
    expect(analyzePerformance(node({ cost: 1000.01, operation: 'Seq Scan', table: 'big', rows: 10001, time: 100.5 }))).toEqual([
      'High cost operation: Seq Scan (1000.01)',
      'Large sequential scan on big (10001 estimated rows)',
      'Slow node: Seq Scan took 100.500 ms',
    ]);
  });

  it('edge: row misestimates are flagged at a 10x ratio either way, compared per loop (PostgreSQL docs 14.1.2)', () => {
    expect(analyzePerformance(node({ rows: 10, actualRows: 99 }))).toEqual([]);
    expect(analyzePerformance(node({ rows: 10, actualRows: 100 }))).toEqual(['Row estimate off by 10x on Result: planned 10, actual 100']);
    expect(analyzePerformance(node({ rows: 100, actualRows: 10, table: 't' }))).toEqual(['Row estimate off by 10x on Result (t): planned 100, actual 10']);
    // actual 0 counts as 1, so 5 planned vs 0 actual is only 5x.
    expect(analyzePerformance(node({ rows: 5, actualRows: 0 }))).toEqual([]);
    expect(analyzePerformance(node({ rows: 0, actualRows: 500 }))).toEqual([]);
  });

  it('corner: an inner index scan that returns 1 row per loop over 1000 loops is not a misestimate', () => {
    // "Plan Rows" and "Actual Rows" are both per-loop averages; the 1000x total comes from loops.
    const plan = parseExplainPlan(JSON.stringify({
      'Node Type': 'Nested Loop', 'Total Cost': 10, 'Plan Rows': 1000, 'Actual Rows': 1000, 'Actual Loops': 1, 'Actual Total Time': 5,
      Plans: [
        { 'Node Type': 'Seq Scan', 'Relation Name': 'a', 'Plan Rows': 1000, 'Actual Rows': 1000, 'Actual Loops': 1 },
        { 'Node Type': 'Index Scan', 'Relation Name': 'b', 'Index Name': 'b_pk', 'Plan Rows': 1, 'Actual Rows': 1, 'Actual Loops': 1000, 'Actual Total Time': 0.002 },
      ],
    }))!;
    const inner = plan.children[1];
    expect(inner.actualRows).toBe(1000);
    expect(inner.time).toBeCloseTo(2);
    expect(inner.index).toBe('b_pk');
    expect(analyzePerformance(plan)).toEqual([]);
    expect(generateRecommendations(plan)).toEqual([]);
  });

  it('positive: recommendations for filtered and unfiltered seq scans, big nested loops, expensive sorts', () => {
    expect(generateRecommendations(node({ operation: 'Seq Scan', table: 'u', rows: 1001, details: '(age > 30)' }))).toEqual([
      'Seq Scan on u applies "(age > 30)": an index on the filtered column may help if the filter is selective',
    ]);
    expect(generateRecommendations(node({ operation: 'Seq Scan', rows: 1001 }))[0]).toMatch(/^Seq Scan on a table reads every row/);
    expect(generateRecommendations(node({ operation: 'Seq Scan', rows: 1000, details: 'x' }))).toEqual([]);
    expect(generateRecommendations(node({ operation: 'Nested Loop', rows: 10001 }))[0]).toMatch(/^Nested Loop over many rows/);
    expect(generateRecommendations(node({ operation: 'Sort', cost: 500 }))).toEqual([]);
    expect(generateRecommendations(node({ operation: 'Sort', cost: 501 }))[0]).toMatch(/^Expensive Sort/);
  });

  it('corner: duplicate recommendations from several children are listed once', () => {
    const child = node({ operation: 'Sort', cost: 600 });
    expect(generateRecommendations(node({ children: [child, { ...child, id: '1' }] }))).toHaveLength(1);
  });
});

describe('sql-query-builder', () => {
  const base: BuilderInput = { queryType: 'SELECT', tableName: 'users', fields: [], conditions: [] };

  it('positive: SELECT with aliases, join, conditions, order and limit', () => {
    expect(
      buildSqlQuery({
        ...base,
        fields: [{ field: 'u.id' }, { field: 'u.name', alias: 'n' }, { field: '  ' }],
        joinType: 'LEFT',
        joinTable: 'orders o',
        joinCondition: 'o.user_id = u.id',
        conditions: [
          { field: 'age', operator: '>=', value: '18' },
          { field: 'name', operator: 'LIKE', value: "O'B%" },
          { field: 'role', operator: 'IN', value: 'admin, , staff' },
          { field: 'deleted_at', operator: 'IS NULL', value: 'ignored' },
        ],
        orderBy: 'u.id DESC',
        limit: '10',
      }),
    ).toBe(
      "SELECT u.id, u.name AS n\nFROM users\nLEFT JOIN orders o ON o.user_id = u.id\nWHERE age >= '18'\n  AND name LIKE 'O''B%'\n  AND role IN ('admin', 'staff')\n  AND deleted_at IS NULL\nORDER BY u.id DESC\nLIMIT 10;",
    );
  });

  it('edge: no fields selects *, a join needs both table and condition, default join is INNER', () => {
    expect(buildSqlQuery(base)).toBe('SELECT *\nFROM users;');
    expect(buildSqlQuery({ ...base, joinTable: 'o' })).toBe('SELECT *\nFROM users;');
    expect(buildSqlQuery({ ...base, joinTable: 'o', joinCondition: 'o.a = users.a' })).toBe('SELECT *\nFROM users\nINNER JOIN o ON o.a = users.a;');
  });

  it('edge: empty values and empty IN lists drop the condition; IS NOT NULL ignores the value', () => {
    const q = buildSqlQuery({ ...base, conditions: [{ field: 'a', operator: '=', value: '' }, { field: 'b', operator: 'NOT IN', value: ' , ' }, { field: '', operator: '=', value: 'x' }] });
    expect(q).toBe('SELECT *\nFROM users;');
    expect(buildSqlQuery({ ...base, conditions: [{ field: 'b', operator: 'IS NOT NULL', value: '' }] })).toBe('SELECT *\nFROM users\nWHERE b IS NOT NULL;');
  });

  it('edge: LIMIT 1 is the minimum; leading zeros are normalised; very large limits stay in plain digits', () => {
    expect(buildSqlQuery({ ...base, limit: '1' })).toMatch(/LIMIT 1;$/);
    expect(buildSqlQuery({ ...base, limit: '007' })).toMatch(/LIMIT 7;$/);
    expect(buildSqlQuery({ ...base, limit: ' 25 ' })).toMatch(/LIMIT 25;$/);
    // Number('1' + '0'.repeat(21)) prints as 1e+21, which is not valid SQL.
    expect(buildSqlQuery({ ...base, limit: `1${'0'.repeat(21)}` })).toMatch(/LIMIT 1000000000000000000000;$/);
  });

  it('negative: LIMIT 0, negative, decimal or text limits are rejected with a clear message', () => {
    for (const limit of ['0', '000', '-1', '1.5', 'ten', '1e3']) {
      expect(() => buildSqlQuery({ ...base, limit }), limit).toThrow('LIMIT must be a whole number of 1 or more');
    }
  });

  it('positive: INSERT and UPDATE quote values but keep NULL/TRUE/FALSE keywords', () => {
    const fields = [{ field: 'a', alias: "it's" }, { field: 'b', alias: ' null ' }, { field: 'c', alias: 'True' }, { field: 'd' }];
    expect(buildSqlQuery({ ...base, queryType: 'INSERT', fields })).toBe("INSERT INTO users (a, b, c, d)\nVALUES ('it''s', NULL, TRUE, '');");
    expect(buildSqlQuery({ ...base, queryType: 'UPDATE', fields: fields.slice(0, 1), conditions: [{ field: 'id', operator: '=', value: '1' }] })).toBe(
      "UPDATE users\nSET a = 'it''s'\nWHERE id = '1';",
    );
  });

  it('edge: UPDATE and DELETE without WHERE carry a warning comment', () => {
    expect(buildSqlQuery({ ...base, queryType: 'DELETE' })).toBe('-- Warning: no WHERE clause, this affects every row in the table\nDELETE FROM users;');
    expect(buildSqlQuery({ ...base, queryType: 'UPDATE', fields: [{ field: 'a', alias: '1' }] })).toMatch(/^-- Warning: no WHERE clause/);
    expect(buildSqlQuery({ ...base, queryType: 'DELETE', conditions: [{ field: 'id', operator: '<', value: '5' }] })).toBe("DELETE FROM users\nWHERE id < '5';");
  });

  it('corner: Unicode and quote-heavy values are escaped by doubling quotes only', () => {
    expect(quoteLiteral("''")).toBe("''''''");
    expect(quoteLiteral('Zoë 😀 \\')).toBe("'Zoë 😀 \\'");
  });

  it('negative: a blank table name and INSERT/UPDATE without columns throw clear errors', () => {
    expect(() => buildSqlQuery({ ...base, tableName: '   ' })).toThrow('Please enter a table name');
    expect(() => buildSqlQuery({ ...base, queryType: 'INSERT', fields: [{ field: ' ' }] })).toThrow('Add at least one column and value to insert');
    expect(() => buildSqlQuery({ ...base, queryType: 'UPDATE' })).toThrow('Add at least one column and value to update');
  });
});
