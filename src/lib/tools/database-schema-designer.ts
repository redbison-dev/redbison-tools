export interface DesignerColumn {
  id: string;
  name: string;
  type: string;
  length?: string;
  nullable: boolean;
  primaryKey: boolean;
  foreignKey?: string;
  defaultValue?: string;
}

export interface DesignerTable {
  id: string;
  name: string;
  columns: DesignerColumn[];
}

export interface DesignerRelation {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

const SIZED_TYPES = ['VARCHAR', 'CHAR', 'DECIMAL'];

/**
 * Renders a DEFAULT clause. Numbers, NULL, TRUE/FALSE, CURRENT_* keywords,
 * function calls such as now() and values the user already quoted are
 * emitted as written; anything else becomes a string literal with single
 * quotes doubled.
 */
export function formatDefault(value: string): string {
  const v = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  if (/^(NULL|TRUE|FALSE|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|LOCALTIMESTAMP|LOCALTIME)$/i.test(v)) return v.toUpperCase();
  if (/^[A-Za-z_][\w.]*\s*\(.*\)$/.test(v)) return v;
  if (/^'.*'$/.test(v)) return v;
  return `'${v.replace(/'/g, "''")}'`;
}

/** Generates MySQL-flavoured CREATE TABLE and ALTER TABLE ... FOREIGN KEY statements. */
export function generateSchemaSql(tables: DesignerTable[], relations: DesignerRelation[]): string {
  let sql = '-- Database Schema\n\n';
  const usedNames = new Set<string>();

  for (const table of tables) {
    const defs = table.columns.map((col) => {
      let def = `  ${col.name} ${col.type}`;
      if (col.length && SIZED_TYPES.includes(col.type)) def += `(${col.length})`;
      if (!col.nullable || col.primaryKey) def += ' NOT NULL';
      if (col.defaultValue?.trim()) def += ` DEFAULT ${formatDefault(col.defaultValue)}`;
      return def;
    });
    const pk = table.columns.filter((c) => c.primaryKey).map((c) => c.name);
    if (pk.length) defs.push(`  PRIMARY KEY (${pk.join(', ')})`);
    sql += `CREATE TABLE ${table.name} (\n${defs.join(',\n')}\n);\n\n`;
  }

  for (const rel of relations) {
    if (!rel.fromColumn || !rel.toColumn) continue;
    if (rel.type === 'many-to-many') {
      sql += `-- ${rel.fromTable}.${rel.fromColumn} <-> ${rel.toTable}.${rel.toColumn} is many-to-many:\n`;
      sql += `-- model it with a junction table holding a foreign key to each side.\n`;
    }
    let name = `fk_${rel.fromTable}_${rel.fromColumn}`;
    for (let n = 2; usedNames.has(name); n++) name = `fk_${rel.fromTable}_${rel.fromColumn}_${n}`;
    usedNames.add(name);
    sql += `ALTER TABLE ${rel.fromTable}\n`;
    sql += `ADD CONSTRAINT ${name}\n`;
    sql += `FOREIGN KEY (${rel.fromColumn}) REFERENCES ${rel.toTable}(${rel.toColumn});\n\n`;
  }

  return sql;
}

/** Relations reference tables by name, so they must follow renames and deletions. */
export function renameTableInRelations(relations: DesignerRelation[], oldName: string, newName: string): DesignerRelation[] {
  if (oldName === newName) return relations;
  return relations.map((r) => ({
    ...r,
    fromTable: r.fromTable === oldName ? newName : r.fromTable,
    toTable: r.toTable === oldName ? newName : r.toTable,
  }));
}

export function removeTableFromRelations(relations: DesignerRelation[], tableName: string): DesignerRelation[] {
  return relations.filter((r) => r.fromTable !== tableName && r.toTable !== tableName);
}
