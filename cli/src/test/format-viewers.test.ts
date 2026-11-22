/**
 * The file-based viewers end to end: parquet-inspect and avro-check read
 * bytes through --file, the trees read text like every other tool, and the
 * refusals land on standard error with the right exit codes.
 *
 * The Avro fixture is built byte-by-byte from the 1.11 spec; the Parquet
 * happy path is pinned at the reader level in the main repo's
 * src/test/tools/dataformats.test.ts and format-viewers.test.ts, so here the
 * CLI contract is what is under test.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../index';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const o = vi.spyOn(process.stdout, 'write').mockImplementation((c) => { out.push(String(c)); return true; });
  const e = vi.spyOn(process.stderr, 'write').mockImplementation((c) => { err.push(String(c)); return true; });
  return {
    out: () => out.join(''),
    err: () => err.join(''),
    restore: () => { o.mockRestore(); e.mockRestore(); },
  };
}

async function run(args: string[]) {
  const cap = capture();
  const was = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  try {
    const code = await main(args);
    return { code, out: cap.out(), err: cap.err() };
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', { value: was, configurable: true });
    cap.restore();
  }
}

/** An Avro object container per the 1.11 spec: 2 blocks, 5 rows, codec null. */
function buildAvro(): Uint8Array {
  const enc = new TextEncoder();
  const out: number[] = [0x4f, 0x62, 0x6a, 0x01];
  const zigzag = (n: number) => {
    let v = (n << 1) ^ (n >> 31);
    do {
      let b = v & 0x7f;
      v >>>= 7;
      if (v) b |= 0x80;
      out.push(b);
    } while (v);
  };
  const str = (s: string) => {
    const b = enc.encode(s);
    zigzag(b.length);
    out.push(...b);
  };
  zigzag(2);
  str('avro.schema');
  str('{"type":"record","name":"User","fields":[{"name":"id","type":"long"}]}');
  str('avro.codec');
  str('null');
  zigzag(0);
  const sync = Array.from({ length: 16 }, (_, i) => i * 5);
  out.push(...sync);
  zigzag(3); zigzag(3); zigzag(1); zigzag(2); zigzag(3);
  out.push(...sync);
  zigzag(2); zigzag(2); zigzag(4); zigzag(5);
  out.push(...sync);
  return new Uint8Array(out);
}

describe('avro-check', () => {
  it('summarises a .avro container from --file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rb-avro-'));
    const file = join(dir, 'users.avro');
    writeFileSync(file, buildAvro());
    const r = await run(['avro-check', '--file', file]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Avro object container  ·  5 rows  ·  2 blocks  ·  codec null');
    expect(r.out).toContain('schema: record User');
    expect(r.out).toContain('"name": "User"');
  });

  it('checks a schema given as text', async () => {
    const r = await run(['avro-check', '{"type":"record","name":"User","fields":[{"name":"id","type":"long"}]}']);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('Valid Avro schema: record User');
  });

  it('reports schema faults on stderr with exit 1', async () => {
    const r = await run(['avro-check', '{"type":"record","name":"9bad","fields":[]}']);
    expect(r.code).toBe(1);
    expect(r.out).toBe('');
    expect(r.err).toContain('Not a valid Avro schema');
  });
});

describe('parquet-inspect', () => {
  it('refuses a non-Parquet file by naming the missing magic', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rb-parquet-'));
    const file = join(dir, 'data.csv');
    writeFileSync(file, 'id,name\n1,Ada\n');
    const r = await run(['parquet-inspect', '--file', file]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('PAR1');
  });

  it('asks for a file when given nothing', async () => {
    const r = await run(['parquet-inspect']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--file');
  });
});

describe('the trees', () => {
  it('json-tree draws the selection as a tree', async () => {
    const r = await run(['json-tree', '{"a":[1,2]}']);
    expect(r.code).toBe(0);
    expect(r.out).toBe('{} 1 key\n└─ a: [] 2 items\n   ├─ [0]: 1\n   └─ [1]: 2\n');
  });

  it('xml-tree outlines elements and refuses mismatches', async () => {
    const ok = await run(['xml-tree', '<r><a/></r>']);
    expect(ok.code).toBe(0);
    expect(ok.out).toBe('<r>  1 child\n└─ <a>\n');
    const bad = await run(['xml-tree', '<a><b></a>']);
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('Expected </b>');
  });
});
