/**
 * Inspects an SQLite database file: the 100-byte header, the schema read
 * from the sqlite_schema B-tree (tables, indexes, views, triggers with
 * their SQL), and a real row count per table from walking each table's
 * B-tree — the count jmap users would call exact, not an estimate.
 *
 * Implemented straight from the file-format document at sqlite.org
 * (fileformat2.html): page/cell layouts, record serial types, and the
 * overflow-page threshold arithmetic for large schema rows. WAL files are
 * a sidecar this does not read; when the header says the database is in
 * WAL mode the output says counts exclude un-checkpointed changes rather
 * than letting the number quietly lie.
 *
 * Dependency-free on purpose: the CLI bundles it, and the site parses in
 * the browser so the database never leaves the machine.
 */

export type SqliteObject = {
  type: 'table' | 'index' | 'view' | 'trigger';
  name: string;
  tableName: string;
  rootPage: number;
  sql?: string;
  /** Exact rows (tables only), from walking the B-tree. */
  rowCount?: number;
  /** Pages visited in that walk. */
  pageCount?: number;
};

export type SqliteSummary = {
  pageSize: number;
  pageCount: number;
  fileBytes: number;
  encoding: string;
  walMode: boolean;
  sqliteVersion: string;
  schemaFormat: number;
  userVersion: number;
  applicationId: number;
  freelistPages: number;
  freelistBytes: number;
  objects: SqliteObject[];
  tables: SqliteObject[];
  totalRows: number;
};

const dec = new TextDecoder();

function varint(buf: Uint8Array, pos: number): [value: number, next: number] {
  let v = 0;
  for (let i = 0; i < 8; i++) {
    const b = buf[pos + i];
    v = v * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) return [v, pos + i + 1];
  }
  return [v * 256 + buf[pos + 8], pos + 9];
}

const serialSize = (t: number): number => {
  if (t <= 4) return t; // 0 null, 1..4 = that many bytes
  if (t === 5) return 6;
  if (t === 6 || t === 7) return 8;
  if (t === 8 || t === 9) return 0;
  return Math.floor((t - 12) / 2);
};

export class SqliteFile {
  private view: DataView;
  readonly pageSize: number;
  readonly usable: number;

  constructor(private readonly bytes: Uint8Array) {
    if (bytes.length < 100 || dec.decode(bytes.subarray(0, 16)) !== 'SQLite format 3\u0000') {
      throw new Error('Not an SQLite database: the "SQLite format 3" header is missing.');
    }
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const raw = this.view.getUint16(16);
    this.pageSize = raw === 1 ? 65536 : raw;
    this.usable = this.pageSize - this.view.getUint8(20);
  }

  private page(n: number): Uint8Array {
    const start = (n - 1) * this.pageSize;
    if (n < 1 || start >= this.bytes.length) throw new Error(`Page ${n} is outside the file: it is truncated or corrupt.`);
    return this.bytes.subarray(start, start + this.pageSize);
  }

  /** Reads a cell payload, following the overflow chain when needed. */
  private payload(page: Uint8Array, pos: number, total: number): Uint8Array {
    const U = this.usable;
    const X = U - 35; // leaf table page threshold, per fileformat2.html §B-tree Pages
    if (total <= X) return page.subarray(pos, pos + total);
    const M = Math.floor(((U - 12) * 32) / 255) - 23;
    const K = M + ((total - M) % (U - 4));
    const local = K <= X ? K : M;
    const out = new Uint8Array(total);
    out.set(page.subarray(pos, pos + local));
    let written = local;
    const pv = new DataView(page.buffer, page.byteOffset, page.byteLength);
    let next = pv.getUint32(pos + local);
    while (next && written < total) {
      const op = this.page(next);
      const ov = new DataView(op.buffer, op.byteOffset, op.byteLength);
      const take = Math.min(U - 4, total - written);
      out.set(op.subarray(4, 4 + take), written);
      written += take;
      next = ov.getUint32(0);
    }
    return out;
  }

  /** Walks a table B-tree; yields decoded records on leaves. */
  private walkTable(root: number, onRecord?: (fields: unknown[]) => void): { rows: number; pages: number } {
    let rows = 0;
    let pages = 0;
    const visit = (n: number): void => {
      const pg = this.page(n);
      pages += 1;
      const base = n === 1 ? 100 : 0;
      const v = new DataView(pg.buffer, pg.byteOffset, pg.byteLength);
      const type = v.getUint8(base);
      const cells = v.getUint16(base + 3);
      if (type === 5) {
        // interior table page: left children + right-most pointer
        for (let i = 0; i < cells; i++) {
          const cp = v.getUint16(base + 12 + i * 2);
          visit(v.getUint32(cp));
        }
        visit(v.getUint32(base + 8));
        return;
      }
      if (type !== 13) throw new Error(`Page ${n}: expected a table B-tree page, found type ${type}. The root page in the schema does not match the file.`);
      rows += cells;
      if (!onRecord) return;
      for (let i = 0; i < cells; i++) {
        const cp = v.getUint16(base + 8 + i * 2);
        let [plen, p] = varint(pg, cp);
        [, p] = varint(pg, p); // rowid
        const rec = this.payload(pg, p, plen);
        onRecord(decodeRecord(rec));
      }
    };
    visit(root);
    return { rows, pages };
  }

  summary(): SqliteSummary {
    const v = this.view;
    const objects: SqliteObject[] = [];
    this.walkTable(1, (f) => {
      const [type, name, tableName, rootPage, sql] = f as [string, string, string, number, string | null];
      if (type === 'table' || type === 'index' || type === 'view' || type === 'trigger') {
        objects.push({ type, name, tableName, rootPage: Number(rootPage ?? 0), sql: sql ?? undefined });
      }
    });
    for (const o of objects) {
      if (o.type === 'table' && o.rootPage > 0 && !o.sql?.includes('WITHOUT ROWID')) {
        const { rows, pages } = this.walkTable(o.rootPage);
        o.rowCount = rows;
        o.pageCount = pages;
      }
    }
    const verNum = v.getUint32(96);
    const tables = objects.filter((o) => o.type === 'table');
    return {
      pageSize: this.pageSize,
      pageCount: v.getUint32(28),
      fileBytes: this.bytes.length,
      encoding: ({ 1: 'UTF-8', 2: 'UTF-16le', 3: 'UTF-16be' } as Record<number, string>)[v.getUint32(56)] ?? 'unknown',
      walMode: v.getUint8(18) === 2,
      sqliteVersion: `${Math.floor(verNum / 1_000_000)}.${Math.floor(verNum / 1000) % 1000}.${verNum % 1000}`,
      schemaFormat: v.getUint32(44),
      userVersion: v.getInt32(60),
      applicationId: v.getUint32(68),
      freelistPages: v.getUint32(36),
      freelistBytes: v.getUint32(36) * this.pageSize,
      objects,
      tables,
      totalRows: tables.reduce((s, t) => s + (t.rowCount ?? 0), 0),
    };
  }
}

function decodeRecord(rec: Uint8Array): unknown[] {
  let [hlen, p] = varint(rec, 0);
  const types: number[] = [];
  while (p < hlen) {
    let t: number;
    [t, p] = varint(rec, p);
    types.push(t);
  }
  const view = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
  const out: unknown[] = [];
  let q = hlen;
  for (const t of types) {
    const size = serialSize(t);
    if (t === 0) out.push(null);
    else if (t >= 1 && t <= 6) {
      let val = 0;
      for (let i = 0; i < size; i++) val = val * 256 + rec[q + i];
      // sign-extend
      const bits = size * 8;
      if (bits < 53 && val >= 2 ** (bits - 1)) val -= 2 ** bits;
      out.push(val);
    } else if (t === 7) out.push(view.getFloat64(q));
    else if (t === 8) out.push(0);
    else if (t === 9) out.push(1);
    else if (t >= 13 && t % 2 === 1) out.push(dec.decode(rec.subarray(q, q + size)));
    else out.push(rec.subarray(q, q + size));
    q += size;
  }
  return out;
}

export function inspectSqlite(bytes: Uint8Array): SqliteSummary {
  return new SqliteFile(bytes).summary();
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let v = n;
  let u = -1;
  do { v /= 1024; u += 1; } while (v >= 1024 && u < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
};

export function renderSqliteSummary(s: SqliteSummary): string {
  const lines = [
    `SQLite ${s.sqliteVersion}  ·  ${iec(s.fileBytes)}  ·  ${s.pageCount.toLocaleString('en-US')} pages of ${iec(s.pageSize)}  ·  ${s.encoding}${s.walMode ? '  ·  WAL mode' : ''}`,
  ];
  if (s.walMode) lines.push('(WAL mode: row counts exclude changes not yet checkpointed from the -wal file)');
  if (s.freelistPages) lines.push(`freelist: ${s.freelistPages} pages (${iec(s.freelistBytes)}) reusable — VACUUM would return them`);
  const idx = s.objects.filter((o) => o.type === 'index');
  const views = s.objects.filter((o) => o.type === 'view');
  const trig = s.objects.filter((o) => o.type === 'trigger');
  lines.push('', `tables (${s.tables.length})  ·  ${s.totalRows.toLocaleString('en-US')} rows in all`);
  const w = Math.max(0, ...s.tables.map((t) => t.name.length));
  for (const t of [...s.tables].sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0))) {
    const rows = t.rowCount === undefined ? 'WITHOUT ROWID — not counted' : `${t.rowCount.toLocaleString('en-US')} rows`;
    const pagesTxt = t.pageCount ? `, ${t.pageCount} page${t.pageCount === 1 ? '' : 's'}` : '';
    lines.push(`  ${t.name.padEnd(w)}  ${rows}${pagesTxt}`);
  }
  if (idx.length) {
    lines.push('', `indexes (${idx.length})`);
    for (const i of idx) lines.push(`  ${i.name}  on ${i.tableName}`);
  }
  if (views.length) {
    lines.push('', `views (${views.length})`);
    for (const vw of views) lines.push(`  ${vw.name}`);
  }
  if (trig.length) lines.push('', `triggers (${trig.length}): ${trig.map((t) => t.name).join(', ')}`);
  return lines.join('\n');
}
