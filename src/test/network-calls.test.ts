/**
 * Enforces the "Calls to external domains and APIs" rule in CONTRIBUTING.md:
 * every tool whose component can reach the network must be documented on the
 * privacy page, so that page stays the complete list.
 *
 * If this test fails for a tool you added, you either need a row in
 * NETWORK_TOOLS (src/pages/Privacy.tsx) or, if the match is network code shown
 * to the user as text rather than executed, an entry in SAMPLE_ONLY below with
 * a note saying why.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalog } from '@/catalog';

const SRC = resolve(__dirname, '..');

/** Components where a network pattern is sample code displayed to the user, never run. */
const SAMPLE_ONLY: Record<string, string> = {
  'javascript-beautifier': 'the default input is a JS snippet containing fetch(), shown as text to beautify',
  'curl-converter': 'generates request code as text for other languages; it never sends the request',
  'json-to-typescript-generator': 'sample payloads mention API URLs as strings',
};

const NETWORK_RE = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|navigator\.sendBeacon|\.open\s*\(\s*['"](GET|POST|PUT|DELETE)/;

/** tool id -> component file, parsed from the generated route map. */
function componentPaths(): Record<string, string> {
  const text = readFileSync(resolve(SRC, 'toolRoutes.tsx'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/'([a-z0-9-]+)':\s*lazy\(\(\)\s*=>\s*import\('@\/([^']+)'\)\)/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const PRIVACY_CONTENT = 'components/layout/privacyContent.tsx';

function documentedTools(): string[] {
  const text = readFileSync(resolve(SRC, PRIVACY_CONTENT), 'utf8');
  // The array literal of the NETWORK_TOOLS declaration, not the doc comment
  // above it or the uses below it.
  const decl = text.match(/export const NETWORK_TOOLS[^=]*=\s*\[([\s\S]*?)\n\];/);
  expect(decl, `NETWORK_TOOLS declaration not found in ${PRIVACY_CONTENT}`).toBeTruthy();
  return [...decl![1].matchAll(/id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
}

describe('network calls are documented', () => {
  const paths = componentPaths();
  const documented = new Set(documentedTools());

  it('maps every catalog tool to a component file', () => {
    for (const tool of catalog) expect(paths[tool.id], tool.id).toBeTruthy();
  });

  it('every tool that can reach the network is listed on the privacy page', () => {
    const undocumented: string[] = [];
    for (const tool of catalog) {
      const file = resolve(SRC, `${paths[tool.id]}.tsx`);
      if (!existsSync(file)) continue;
      if (!NETWORK_RE.test(readFileSync(file, 'utf8'))) continue;
      if (documented.has(tool.id) || tool.id in SAMPLE_ONLY) continue;
      undocumented.push(tool.id);
    }
    expect(
      undocumented,
      `These tools can reach the network but are not on the privacy page: ${undocumented.join(', ')}. ` +
        `Add a NETWORK_TOOLS row in src/${PRIVACY_CONTENT} (see CONTRIBUTING.md).`,
    ).toEqual([]);
  });

  it('the privacy page documents only real tools, and no stale rows', () => {
    for (const id of documented) {
      expect(catalog.some((t) => t.id === id), `privacy page lists unknown tool ${id}`).toBe(true);
      const file = resolve(SRC, `${paths[id]}.tsx`);
      expect(NETWORK_RE.test(readFileSync(file, 'utf8')), `${id} no longer makes network calls; remove its privacy row`).toBe(true);
    }
  });

  it('the sample-only allowlist stays justified', () => {
    for (const [id, why] of Object.entries(SAMPLE_ONLY)) {
      expect(catalog.some((t) => t.id === id), `allowlist names unknown tool ${id}`).toBe(true);
      expect(why.length, id).toBeGreaterThan(20);
    }
  });

  it('CONTRIBUTING.md states the disclosure rule', () => {
    const doc = readFileSync(resolve(SRC, '../CONTRIBUTING.md'), 'utf8');
    expect(doc).toContain('Calls to external domains and APIs');
    expect(doc).toContain('NETWORK_TOOLS');
  });
});
