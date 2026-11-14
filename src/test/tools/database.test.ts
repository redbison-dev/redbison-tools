import { describe, expect, it } from 'vitest';
import { buildSqlQuery, quoteLiteral } from '@/lib/tools/sql-query-builder';
import { formatDefault, generateSchemaSql, removeTableFromRelations, renameTableInRelations, type DesignerColumn } from '@/lib/tools/database-schema-designer';
import { analyzeSqlQuery } from '@/lib/tools/sql-query-analyzer';
import { parseExplainPlan, analyzePerformance, generateRecommendations } from '@/lib/tools/sql-explain-visualizer';
import { parseSchema, relationshipCardinality } from '@/lib/tools/database-erd-generator';
import { suggestIndexes } from '@/lib/tools/sql-index-optimizer';
import { generateBackupScripts, shellQuote, type BackupConfig } from '@/lib/tools/database-backup-generator';
import { convertSchema } from '@/lib/tools/sql-data-type-converter';
import { generateSeedData, generateSeedRows, sqlLiteral } from '@/lib/tools/database-seed-generator';

const base = { fields: [], conditions: [] };

describe('sql-query-builder', () => {
  it('escapes single quotes in string literals', () => {
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'");
    const q = buildSqlQuery({ ...base, queryType: 'SELECT', tableName: 'users', conditions: [{ field: 'last_name', operator: '=', value: "O'Brien" }] });
    expect(q).toContain("WHERE last_name = 'O''Brien'");
  });

  it('keeps IS NULL conditions, which have no value', () => {
    const q = buildSqlQuery({ ...base, queryType: 'SELECT', tableName: 'users', conditions: [{ field: 'deleted_at', operator: 'IS NULL', value: '' }] });
    expect(q).toBe('SELECT *\nFROM users\nWHERE deleted_at IS NULL;');
  });

  it('turns an IN list into a parenthesised list of literals', () => {
    const q = buildSqlQuery({ ...base, queryType: 'SELECT', tableName: 'users', conditions: [{ field: 'status', operator: 'IN', value: 'active, trial' }] });
    expect(q).toContain("status IN ('active', 'trial')");
  });

  it('builds INSERT, UPDATE and DELETE instead of an empty statement', () => {
    expect(buildSqlQuery({ ...base, queryType: 'INSERT', tableName: 't', fields: [{ field: 'a', alias: "x'y" }, { field: 'b', alias: 'null' }] })).toBe(
      "INSERT INTO t (a, b)\nVALUES ('x''y', NULL);",
    );
    expect(
      buildSqlQuery({ ...base, queryType: 'UPDATE', tableName: 't', fields: [{ field: 'a', alias: '1' }], conditions: [{ field: 'id', operator: '=', value: '7' }] }),
    ).toBe("UPDATE t\nSET a = '1'\nWHERE id = '7';");
    expect(buildSqlQuery({ ...base, queryType: 'DELETE', tableName: 't' })).toMatch(/^-- Warning: no WHERE clause[\s\S]*DELETE FROM t;$/);
  });

  it('skips empty field rows and rejects a bad LIMIT', () => {
    expect(buildSqlQuery({ ...base, queryType: 'SELECT', tableName: 't', fields: [{ field: '' }, { field: 'id' }] })).toBe('SELECT id\nFROM t;');
    expect(() => buildSqlQuery({ ...base, queryType: 'SELECT', tableName: 't', limit: '-5' })).toThrow(/LIMIT/);
  });
});

describe('database-schema-designer', () => {
  const table = (cols: DesignerColumn[]) => [{ id: '1', name: 'users', columns: cols }];

  it('does not quote CURRENT_TIMESTAMP and escapes quotes in text defaults', () => {
    const sql = generateSchemaSql(
      table([
        { id: 'a', name: 'created_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, defaultValue: 'CURRENT_TIMESTAMP' },
        { id: 'b', name: 'nick', type: 'VARCHAR', length: '20', nullable: true, primaryKey: false, defaultValue: "it's" },
      ]),
      [],
    );
    expect(sql).toContain('created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    expect(sql).toContain("nick VARCHAR(20) DEFAULT 'it''s'");
    expect(formatDefault('0')).toBe('0');
    expect(formatDefault('now()')).toBe('now()');
  });

  it('emits one composite PRIMARY KEY instead of two inline ones', () => {
    const sql = generateSchemaSql(
      table([
        { id: 'a', name: 'post_id', type: 'INT', nullable: false, primaryKey: true },
        { id: 'b', name: 'tag_id', type: 'INT', nullable: false, primaryKey: true },
      ]),
      [],
    );
    expect(sql.match(/PRIMARY KEY/g)).toHaveLength(1);
    expect(sql).toContain('PRIMARY KEY (post_id, tag_id)');
  });

  it('gives each foreign key a distinct constraint name', () => {
    const rel = (fromColumn: string) => ({ id: fromColumn, fromTable: 'msg', fromColumn, toTable: 'users', toColumn: 'id', type: 'one-to-many' as const });
    const sql = generateSchemaSql([], [rel('sender_id'), rel('recipient_id')]);
    expect(sql).toContain('fk_msg_sender_id');
    expect(sql).toContain('fk_msg_recipient_id');
  });

  it('drops and renames relations by table name', () => {
    const rels = [{ id: 'r', fromTable: 'posts', fromColumn: 'user_id', toTable: 'users', toColumn: 'id', type: 'one-to-many' as const }];
    expect(removeTableFromRelations(rels, 'users')).toEqual([]);
    expect(renameTableInRelations(rels, 'users', 'accounts')[0].toTable).toBe('accounts');
  });
});

describe('sql-query-analyzer', () => {
  it('does not report OR conditions because of ORDER BY or an orders table', () => {
    const r = analyzeSqlQuery("SELECT o.id FROM orders o WHERE o.a = 1 AND o.b = 2 AND o.c = 3 AND o.d = 4 ORDER BY o.id LIMIT 5");
    expect(r.issues.join(' ')).not.toMatch(/OR/);
  });

  it('ignores keywords inside string literals and comments', () => {
    const r = analyzeSqlQuery("SELECT id FROM t WHERE note = 'SELECT * FROM x JOIN y' -- JOIN z\nLIMIT 1");
    expect(r.metrics.joins).toBe(0);
    expect(r.issues).toEqual([]);
  });

  it('flags leading wildcards, NOT IN subqueries and missing limits', () => {
    const r = analyzeSqlQuery("SELECT * FROM a JOIN b ON a.id = b.a_id WHERE b.email LIKE '%@x.com' AND a.id NOT IN (SELECT a_id FROM c)");
    expect(r.issues.some((i) => i.includes('Leading wildcard'))).toBe(true);
    expect(r.issues.some((i) => i.includes('NOT IN'))).toBe(true);
    expect(r.issues.some((i) => i.includes('row limit'))).toBe(true);
  });
});

describe('sql-explain-visualizer', () => {
  const pg = JSON.stringify([
    {
      Plan: {
        'Node Type': 'Nested Loop',
        'Total Cost': 2000,
        'Plan Rows': 10,
        'Actual Total Time': 5,
        'Actual Rows': 900,
        'Actual Loops': 1,
        Plans: [
          { 'Node Type': 'Seq Scan', 'Relation Name': 'users', 'Total Cost': 50, 'Plan Rows': 10, 'Actual Total Time': 1, 'Actual Rows': 10, 'Actual Loops': 1 },
          { 'Node Type': 'Index Scan', 'Relation Name': 'orders', 'Index Name': 'orders_user_id_idx', 'Total Cost': 8, 'Plan Rows': 1, 'Actual Total Time': 0.05, 'Actual Rows': 90, 'Actual Loops': 10 },
        ],
      },
      'Execution Time': 5.2,
    },
  ]);

  it('reads the array that EXPLAIN (FORMAT JSON) prints', () => {
    const plan = parseExplainPlan(pg);
    expect(plan?.operation).toBe('Nested Loop');
    expect(plan?.children).toHaveLength(2);
  });

  it('multiplies per-loop actual time and rows by loops', () => {
    const inner = parseExplainPlan(pg)!.children[1];
    expect(inner.time).toBeCloseTo(0.5);
    expect(inner.actualRows).toBe(900);
  });

  it('flags misestimated rows', () => {
    const plan = parseExplainPlan(pg)!;
    expect(analyzePerformance(plan).some((i) => i.includes('Row estimate off by 90x'))).toBe(true);
    expect(generateRecommendations(plan).some((r) => r.includes('ANALYZE'))).toBe(true);
  });

  it('rejects JSON that is not a PostgreSQL plan', () => {
    expect(parseExplainPlan('{"query_block": {"select_id": 1}}')).toBeNull();
    expect(parseExplainPlan('not json')).toBeNull();
  });
});

describe('database-erd-generator: parseSchema', () => {
  it('reads composite primary keys and CONSTRAINT ... FOREIGN KEY lines', () => {
    const { tables, relationships } = parseSchema(`
      CREATE TABLE post_categories (
        post_id INT NOT NULL,
        category_id INT NOT NULL,
        PRIMARY KEY (post_id, category_id),
        CONSTRAINT fk_pc_post FOREIGN KEY (post_id) REFERENCES posts(id),
        UNIQUE KEY uq (category_id, post_id),
        KEY idx_cat (category_id)
      );`);
    expect(tables[0].primaryKey).toEqual(['post_id', 'category_id']);
    expect(tables[0].columns.map((c) => c.name)).toEqual(['post_id', 'category_id']);
    expect(relationships).toEqual([{ from: 'post_categories', to: 'posts', fromColumn: 'post_id', toColumn: 'id' }]);
  });

  it('handles IF NOT EXISTS, schema prefixes and double-quoted names', () => {
    const { tables } = parseSchema('CREATE TABLE IF NOT EXISTS public."Users" ("Id" SERIAL PRIMARY KEY, email TEXT);');
    expect(tables[0].name).toBe('Users');
    expect(tables[0].columns[0]).toMatchObject({ name: 'Id', type: 'SERIAL', autoIncrement: true });
  });

  it('reads ALTER TABLE ADD FOREIGN KEY without a constraint name', () => {
    const { relationships } = parseSchema('CREATE TABLE a (id INT); CREATE TABLE b (a_id INT); ALTER TABLE b ADD FOREIGN KEY (a_id) REFERENCES a (id);');
    expect(relationships).toEqual([{ from: 'b', to: 'a', fromColumn: 'a_id', toColumn: 'id' }]);
  });

  it('labels a unique foreign key 1:1 and an ordinary one N:1', () => {
    const { tables } = parseSchema('CREATE TABLE profiles (user_id INT PRIMARY KEY REFERENCES users(id)); CREATE TABLE posts (id INT PRIMARY KEY, user_id INT REFERENCES users(id));');
    expect(relationshipCardinality(tables[0], 'user_id')).toBe('1:1');
    expect(relationshipCardinality(tables[1], 'user_id')).toBe('N:1');
  });

  it('keeps ENUM values in their original case', () => {
    const { tables } = parseSchema("CREATE TABLE t (status ENUM('draft','published'));");
    expect(tables[0].columns[0].type).toBe("ENUM('draft','published')");
  });
});

describe('sql-index-optimizer', () => {
  it('suggests indexes on the real tables and columns of the query', () => {
    const s = suggestIndexes("SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE u.status = 'active' ORDER BY o.created_at DESC");
    expect(s.map((x) => x.sql)).toEqual([
      'CREATE INDEX idx_users_status ON users (status);',
      'CREATE INDEX idx_orders_user_id_created_at ON orders (user_id, created_at);',
    ]);
  });

  it('puts equality columns before the sort column', () => {
    const [s] = suggestIndexes("SELECT id FROM orders WHERE customer_id = 42 AND status = 'paid' ORDER BY created_at DESC LIMIT 20");
    expect(s.columns).toEqual(['customer_id', 'status', 'created_at']);
  });

  it('uses a range column when there is no sort, and ignores NOT IN', () => {
    const [s] = suggestIndexes("SELECT * FROM events WHERE created_at BETWEEN '2026-01-01' AND '2026-02-01' AND type NOT IN ('x')");
    expect(s.columns).toEqual(['created_at']);
  });

  it('returns nothing for a query without filters, joins or sorts', () => {
    expect(suggestIndexes('SELECT 1')).toEqual([]);
    expect(suggestIndexes('SELECT * FROM t')).toEqual([]);
  });
});

describe('database-backup-generator', () => {
  const cfg = (over: Partial<BackupConfig>): BackupConfig => ({
    dbType: 'postgresql', host: 'localhost', port: '5432', database: 'shop', username: 'app',
    includeTables: true, includeData: true, compression: false, customOptions: '', ...over,
  });

  it('never emits the non-existent pg_dump --no-indexes flag', () => {
    expect(generateBackupScripts(cfg({})).backup).not.toContain('--no-indexes');
  });

  it('uses custom format with a .dump file and pg_restore when compression is on', () => {
    const s = generateBackupScripts(cfg({ compression: true }));
    expect(s.backup).toContain('--format=custom');
    expect(s.backup).toContain('.dump"');
    expect(s.restore).toContain('pg_restore');
  });

  it('keeps the MySQL password off the command line and adds --single-transaction', () => {
    const s = generateBackupScripts(cfg({ dbType: 'mysql', port: '3306' }));
    expect(s.backup).not.toMatch(/-p\$DB_PASS/);
    expect(s.backup).toContain('--defaults-extra-file="$CNF"');
    expect(s.backup).toContain('--single-transaction');
    expect(s.backup).not.toContain('--skip-triggers');
  });

  it('maps structure-only and data-only to real flags', () => {
    expect(generateBackupScripts(cfg({ dbType: 'mysql', includeData: false })).backup).toContain('--no-data');
    expect(generateBackupScripts(cfg({ dbType: 'mysql', includeTables: false })).backup).toContain('--no-create-info');
    expect(generateBackupScripts(cfg({ includeTables: false })).backup).toContain('--data-only');
    expect(() => generateBackupScripts(cfg({ includeTables: false, includeData: false }))).toThrow();
  });

  it('uses the SQLite online backup command and supports SQL Server and Oracle', () => {
    expect(generateBackupScripts(cfg({ dbType: 'sqlite' })).backup).toContain('.backup');
    expect(generateBackupScripts(cfg({ dbType: 'sqlserver', compression: true })).backup).toContain('BACKUP DATABASE [shop] TO DISK');
    expect(generateBackupScripts(cfg({ dbType: 'oracle', includeData: false })).backup).toContain('CONTENT=METADATA_ONLY');
  });

  it('shell-quotes user input', () => {
    expect(shellQuote("my db's")).toBe("'my db'\\''s'");
  });
});

describe('sql-data-type-converter', () => {
  const mysql = "CREATE TABLE `users` (`id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `active` TINYINT(1) NOT NULL DEFAULT 1, `status` ENUM('on','off'), `seen` DATETIME, `ts` TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB;";

  it('converts MySQL to PostgreSQL types, identity and boolean defaults', () => {
    const { sql } = convertSchema(mysql, 'mysql', 'postgresql');
    expect(sql).toContain('"id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL');
    expect(sql).toContain('"active" BOOLEAN NOT NULL DEFAULT TRUE');
    expect(sql).toContain(`CHECK ("status" IN ('on','off'))`);
    expect(sql).toContain('"seen" TIMESTAMP');
    expect(sql).toContain('"ts" TIMESTAMPTZ');
    expect(sql).not.toMatch(/\) ENGINE=InnoDB;/);
    expect(sql).toMatch(/\n\);\n$/);
  });

  it('handles pairs the old mapping table did not cover', () => {
    expect(convertSchema(mysql, 'mysql', 'sqlserver').sql).toContain('"active" BIT NOT NULL DEFAULT 1');
    expect(convertSchema(mysql, 'mysql', 'oracle').sql).toContain('"id" NUMBER(19) GENERATED BY DEFAULT AS IDENTITY');
    const pg = convertSchema('CREATE TABLE t (id SERIAL PRIMARY KEY, ok BOOLEAN DEFAULT false, j JSONB, u UUID)', 'postgresql', 'sqlserver').sql;
    expect(pg).toContain('id INT IDENTITY(1,1) PRIMARY KEY');
    expect(pg).toContain('ok BIT DEFAULT 0');
    expect(pg).toContain('u UNIQUEIDENTIFIER');
  });

  it('does not rewrite column names that look like types', () => {
    const { sql } = convertSchema('CREATE TABLE t (text TEXT, date DATE, int INT);', 'mysql', 'postgresql');
    expect(sql).toContain('text TEXT');
    expect(sql).toContain('date DATE');
    expect(sql).toContain('int INTEGER');
  });

  it('treats FLOAT and REAL by source dialect', () => {
    expect(convertSchema('CREATE TABLE t (a FLOAT);', 'mysql', 'postgresql').sql).toContain('a REAL');
    expect(convertSchema('CREATE TABLE t (a FLOAT);', 'sqlserver', 'postgresql').sql).toContain('a DOUBLE PRECISION');
    expect(convertSchema('CREATE TABLE t (a DECIMAL(10,2));', 'mysql', 'sqlite').sql).toContain('a NUMERIC');
  });

  it('turns SQLite INTEGER PRIMARY KEY into an identity column', () => {
    expect(convertSchema('CREATE TABLE t (id INTEGER PRIMARY KEY, n TEXT);', 'sqlite', 'mysql').sql).toContain('id INT AUTO_INCREMENT PRIMARY KEY');
  });
});

describe('database-seed-generator', () => {
  const schema = `CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, created_at TIMESTAMP);
CREATE TABLE posts (id INT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id), status ENUM('draft','published'));`;
  const opts = { count: 5, seed: 7, now: new Date('2026-10-24T12:00:00Z') };

  it('uses the tables and columns from the schema, not a fixed template', () => {
    const out = generateSeedData(schema, { ...opts, format: 'sql' });
    expect(out).not.toContain('table_name');
    expect(out).toContain('INSERT INTO users (id, name, email, created_at) VALUES (1,');
    expect(out).not.toContain('NOW()');
    expect(out.indexOf('INSERT INTO users')).toBeLessThan(out.indexOf('INSERT INTO posts'));
  });

  it('escapes single quotes and keeps foreign keys within the parent ids', () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral(null)).toBe('NULL');
    const [users, posts] = generateSeedRows(schema, opts);
    expect(new Set(users.rows.map((r) => r.email)).size).toBe(5);
    for (const r of posts.rows) {
      expect(r.user_id).toBeGreaterThanOrEqual(1);
      expect(r.user_id).toBeLessThanOrEqual(5);
      expect(['draft', 'published']).toContain(r.status);
    }
  });

  it('clamps the record count and is reproducible with a seed', () => {
    expect(generateSeedRows(schema, { ...opts, count: 5000 })[0].rows).toHaveLength(1000);
    expect(generateSeedRows(schema, { ...opts, count: -3 })[0].rows).toHaveLength(1);
    expect(generateSeedData(schema, { ...opts, format: 'json' })).toBe(generateSeedData(schema, { ...opts, format: 'json' }));
  });

  it('throws a clear error when there is no CREATE TABLE', () => {
    expect(() => generateSeedData('hello', { ...opts, format: 'sql' })).toThrow(/CREATE TABLE/);
  });
});
