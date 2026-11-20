/**
 * Runs ide/test-cases.json against the local implementations.
 *
 * The same file is read by the IntelliJ suite for the tools it implements, so
 * a case written once holds both editors to the same behaviour. That is the
 * point: the two plugins share a catalog, and a shared command that answers
 * differently in each is a bug nobody would notice until a user hit it.
 *
 * Every option a tool offers has a case, and so do the edges that bite:
 * empty input, whitespace, characters outside the basic plane, already
 * encoded input, and the malformed input each tool is most likely to meet.
 * A tool that refuses clearly is behaving correctly, so "throws" is an
 * assertion like any other.
 */
import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { runLocal } from '../../local';
import { TOOLS } from '../../catalog';

const EXTENSION_ID = 'redbison.redbison-tools';

type Case = {
  name: string;
  input: string;
  options?: Record<string, unknown>;
  expect?: string;
  contains?: string;
  matches?: string;
  matchesNot?: string;
  throws?: string;
  maxLineLength?: number;
  joinedEquals?: string;
  sameMultisetAs?: string;
  differsFrom?: { input: string; options?: Record<string, unknown> };
};

function loadCases(): Record<string, Case[]> {
  // Read from the repository rather than a copy, so there is one table.
  const root = vscode.extensions.getExtension(EXTENSION_ID)!.extensionUri.fsPath;
  const raw = JSON.parse(readFileSync(resolve(root, '../test-cases.json'), 'utf8')) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(raw).filter(([k]) => !k.startsWith('_')),
  ) as Record<string, Case[]>;
}

const cases = loadCases();

suite('Behaviour cases', () => {
  test('the table covers a good share of the local catalog', () => {
    const local = TOOLS.filter((t) => t.offline).map((t) => t.id);
    const covered = local.filter((id) => cases[id]?.length);
    assert.ok(
      covered.length >= 45,
      `only ${covered.length} of ${local.length} local tools have behaviour cases`,
    );
  });

  test('every case names a tool that exists', () => {
    const ids = new Set(TOOLS.map((t) => t.id));
    const unknown = Object.keys(cases).filter((id) => !ids.has(id));
    assert.deepStrictEqual(unknown, [], 'cases for tools not in the catalog');
  });

  for (const [toolId, list] of Object.entries(cases)) {
    suite(toolId, () => {
      for (const c of list) {
        test(c.name, () => {
          const run = () => runLocal(toolId, c.input, c.options ?? {});

          if (c.throws !== undefined) {
            let threw = false;
            try {
              run();
            } catch (e) {
              threw = true;
              if (c.throws) {
                const message = e instanceof Error ? e.message : String(e);
                assert.ok(
                  message.toLowerCase().includes(c.throws.toLowerCase()),
                  `message should mention "${c.throws}", got: ${message}`,
                );
              }
            }
            assert.ok(threw, 'should have refused this input rather than returning something');
            return;
          }

          const out = run();
          assert.ok(out !== undefined, `${toolId} is not answered locally`);

          if (c.expect !== undefined) assert.strictEqual(out, c.expect);
          if (c.contains !== undefined) assert.ok(out.includes(c.contains), `should contain ${JSON.stringify(c.contains)}, got: ${out.slice(0, 300)}`);
          if (c.matches !== undefined) assert.ok(new RegExp(c.matches).test(out), `should match /${c.matches}/, got: ${out.slice(0, 200)}`);
          if (c.matchesNot !== undefined) assert.ok(!new RegExp(c.matchesNot).test(out), `should not match /${c.matchesNot}/, got: ${out.slice(0, 200)}`);
          if (c.maxLineLength !== undefined)
            assert.ok(out.split('\n').every((l) => l.length <= c.maxLineLength!), `a line exceeded ${c.maxLineLength}: ${out}`);
          if (c.joinedEquals !== undefined) assert.strictEqual(out.replace(/\n/g, ' '), c.joinedEquals);
          if (c.sameMultisetAs !== undefined)
            assert.deepStrictEqual(out.split('\n').sort(), c.sameMultisetAs.split('\n').sort());
          if (c.differsFrom !== undefined) {
            const other = runLocal(toolId, c.differsFrom.input, c.differsFrom.options ?? {});
            assert.notStrictEqual(out, other, 'two calls should not produce the same value');
          }
        });
      }
    });
  }
});
