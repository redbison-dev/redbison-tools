/**
 * The shared case table, run through the CLI.
 *
 * ide/test-cases.json is already read by the VS Code and IntelliJ suites.
 * Running it here too means the three front ends are held to one description
 * of what each tool does, and the CLI cannot quietly answer differently
 * because it reached the implementation by another path.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runTool, RunError } from '../run';
import { TOOLS } from '../catalog';

type Case = {
  name: string;
  input: string;
  options?: Record<string, string | number | boolean>;
  expect?: string;
  contains?: string;
  matches?: string;
  matchesNot?: string;
  throws?: string;
  maxLineLength?: number;
  joinedEquals?: string;
  sameMultisetAs?: string;
  differsFrom?: { input: string; options?: Record<string, string | number | boolean> };
};

const raw = JSON.parse(
  readFileSync(resolve(__dirname, '../../../ide/test-cases.json'), 'utf8'),
) as Record<string, unknown>;

const cases = Object.fromEntries(
  Object.entries(raw).filter(([k]) => !k.startsWith('_')),
) as Record<string, Case[]>;

describe('shared behaviour cases', () => {
  it('covers the local catalog', () => {
    // parquet-inspect reads bytes, so the text case table cannot hold it;
    // its end-to-end coverage is src/test/format-viewers.test.ts.
    const local = TOOLS.filter((t) => t.offline && !['parquet-inspect', 'hprof-inspect', 'heap-snapshot-inspect', 'sqlite-inspect', 'zip-inspect', 'wasm-inspect', 'pprof-inspect', 'binary-inspect', 'font-inspect', 'pcap-inspect', 'arrow-inspect'].includes(t.id)).map((t) => t.id);
    const missing = local.filter((id) => !cases[id]?.length);
    expect(missing, 'local tools with no cases').toEqual([]);
  });

  for (const [toolId, list] of Object.entries(cases)) {
    describe(toolId, () => {
      for (const c of list) {
        it(c.name, async () => {
          const run = () => runTool(toolId, c.input, c.options ?? {}, { offline: true });

          if (c.throws !== undefined) {
            await expect(run()).rejects.toBeInstanceOf(RunError);
            if (c.throws) {
              await expect(run()).rejects.toThrow(new RegExp(escapeRe(c.throws), 'i'));
            }
            return;
          }

          const out = await run();
          if (c.expect !== undefined) expect(out).toBe(c.expect);
          if (c.contains !== undefined) expect(out).toContain(c.contains);
          if (c.matches !== undefined) expect(out).toMatch(new RegExp(c.matches));
          if (c.matchesNot !== undefined) expect(out).not.toMatch(new RegExp(c.matchesNot));
          if (c.maxLineLength !== undefined)
            expect(out.split('\n').every((l) => l.length <= c.maxLineLength!)).toBe(true);
          if (c.joinedEquals !== undefined) expect(out.replace(/\n/g, ' ')).toBe(c.joinedEquals);
          if (c.sameMultisetAs !== undefined)
            expect(out.split('\n').sort()).toEqual(c.sameMultisetAs.split('\n').sort());
          if (c.differsFrom !== undefined) {
            const other = await runTool(toolId, c.differsFrom.input, c.differsFrom.options ?? {}, { offline: true });
            expect(out).not.toBe(other);
          }
        });
      }
    });
  }
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
