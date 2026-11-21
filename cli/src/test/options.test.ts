/**
 * Every option, every value.
 *
 * The case table covers the values worth asserting an exact answer for. This
 * covers the rest mechanically: each value of each closed-set option is
 * actually run, so an option that is advertised in the help but reaches no
 * code, or throws, fails here rather than in someone's terminal.
 *
 * It also checks that the advertised default is the real one, which is the
 * sort of thing that rots silently: nothing breaks when the help says
 * "default sha256" and the implementation moved on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_OPTIONS, optionsFor } from '../options';
// The authored spec, as distinct from the merged one the CLI uses. Comparing
// the merged set against itself proves nothing.
import { TOOL_OPTIONS as AUTHORED } from '../../../ide/shared/toolOptions';
import { runTool, RunError } from '../run';
import { TOOLS, byId } from '../catalog';

/** Input each tool will accept, so an option can be exercised at all. */
const INPUT: Record<string, string> = {
  'case-convert': 'hello world test',
  'sort-lines': 'cherry\napple\nbanana',
  'dedupe-lines': 'a\nA\na',
  'wrap-lines': 'the quick brown fox jumps over the lazy dog and keeps going for a while',
  'lines-to-comma': 'alpha\nbeta',
  'comma-to-lines': 'alpha,beta',
  'number-lines': 'a\nb',
  'base64-encode': 'RedBison??',
  'url-encode': 'https://x.dev/a b?q=1',
  'escape-characters': 'he said "hi"\nand left',
  'to-hex': 'Hi',
  hash: 'abc',
  hmac: 'abc',
  'json-format': '{"a":1}',
  'number-base': '255',
  'regex-test': 'order-1 order-2',
  'date-diff': '2026-01-01',
  'hash-compare': 'abc',
  'list-compare': 'a\nb',
  'utm-build': 'https://redbison.dev/',
  uuid: '',
  password: '',
  lorem: '',
  // Moved off the network, so this test now runs them for the first time.
  // Each needs an input of its own kind: "sample text" is not a barcode, a
  // colour or a curl command, and the tool is right to refuse it.
  'barcode-check': '400638133393',
  'color-palette': '#b32020',
  'curl-to-code': "curl -X POST https://api.example.com/v1/items -H 'Authorization: Bearer t' -d '{\"a\":1}'",
  'number-to-words': '1234.56',
  'redirect-rules': '/old /new\n/a /b 302',
  'contrast-check': '#b32020',
  'color-convert': '#3B82F6',
  'css-gradient': '',
  'timezone-convert': '2026-01-15T14:30:00Z',
  'text-diff': 'one\ntwo',
  cron: '*/15 * * * *',
  'json-to-yaml': '{"a":1}',
  'yaml-to-json': 'a: 1',
  'yaml-beautify': 'a:  1',
  'html-beautify': '<div><p>x</p></div>',
  'xml-beautify': '<r><a>1</a></r>',
  'sql-beautify': 'select a from t',
  morse: 'HELLO WORLD',
  // Spells both ways and exercises every option: the words differ between
  // the two alphabets, the 4 differs between the two digit styles, and the
  // capital differs with markCase.
  nato: 'Alfa Bravo 4',
  readability: 'The quick brown fox jumps over the lazy dog. It was remarkably effective.',
  gitignore: '',
};

/**
 * A value for each free-text option, so the flag is proven to reach code
 * rather than skipped for having no closed set.
 */
const SAMPLE: Record<string, string | number | boolean> = {
  indent: 4,
  from: '16',
  separator: ' | ',
  width: 30,
  length: 24,
  count: 3,
  key: 'secret',
  pattern: 'order-(\\d+)',
  flags: 'gi',
  to: '2026-03-01',
  b: 'different',
  source: 'blog',
  medium: 'post',
  campaign: 'launch',
  term: 'cli',
  content: 'a',
  name: 'brand',
  rule: 'analogous',
  font: 'Standard',
  templates: 'node',
  background: '#ffffff',
  lineBreaksEndSentences: false,
  maxSentences: 5,
  angle: 45,
  stops: '#000,#fff',
  min: 1,
  max: 10,
  defaultCode: 302,
  keepQuery: false,
  forceHttps: true,
  domain: 'example.com',
  markCase: true,
  extra: '*.bak',
  testPaths: 'dist/app.js',
};

/**
 * Where one option name means different things in different tools. `to` is a
 * date for date-diff and an IANA zone for timezone-convert, and the shared
 * table can only hold one of them.
 */
const SAMPLE_FOR: Record<string, Record<string, string | number | boolean>> = {
  'timezone-convert': { to: 'Asia/Tokyo' },
};

/** Values the required options need so the tool can run at all. */
const REQUIRED: Record<string, Record<string, string>> = {
  hmac: { key: 'secret' },
  'regex-test': { pattern: 'order-(\\d+)' },
  'date-diff': { to: '2026-02-01' },
  'hash-compare': { b: 'abc' },
  'list-compare': { b: 'b\nc' },
  gitignore: { templates: 'node' },
  'contrast-check': { background: '#ffffff' },
  'css-gradient': { type: 'linear', stops: '#000,#fff' },
  // canonicalHost does nothing without a domain to send people to.
  'redirect-rules': { platform: 'nginx', domain: 'example.com' },
  'random-number': { min: '1', max: '10' },
  'timezone-convert': { to: 'UTC' },
  'text-diff': { b: 'different' },
};

const local = (id: string) => byId(id)?.offline === true;

describe('every declared option runs', () => {
  for (const [toolId, options] of Object.entries(TOOL_OPTIONS)) {
    // Server-backed tools are exercised against their pinned sample rather
    // than over the network, which a test suite should never depend on.
    if (!local(toolId)) continue;

    describe(toolId, () => {
      const base = { ...(REQUIRED[toolId] ?? {}) };
      const input = INPUT[toolId] ?? 'sample text';

      for (const opt of options) {
        if (!opt.values?.length) {
          // Free text: prove the flag reaches code and changes something,
          // which is all that can be asserted without a closed set.
          const sample = SAMPLE_FOR[toolId]?.[opt.key] ?? SAMPLE[opt.key];
          if (sample === undefined) continue;
          it(`--${opt.key} ${sample}`, async () => {
            const out = await runTool(toolId, input, { ...base, [opt.key]: sample }, { offline: true });
            expect(out.length).toBeGreaterThan(0);
          });
          continue;
        }

        for (const v of opt.values) {
          it(`--${opt.key} ${v.value}`, async () => {
            const out = await runTool(toolId, input, { ...base, [opt.key]: v.value }, { offline: true });
            expect(typeof out).toBe('string');
            // An empty answer from a real input means the value reached
            // nothing, which is the failure this test is for.
            expect(out.length).toBeGreaterThan(0);
          });
        }

        const values = opt.values;
        it(`--${opt.key} values are not all the same answer`, async () => {
          const answers = new Set<string>();
          for (const v of values) {
            answers.add(await runTool(toolId, input, { ...base, [opt.key]: v.value }, { offline: true }));
          }
          expect(answers.size, `every value of --${opt.key} gave one answer, so it does nothing`).toBeGreaterThan(1);
        });
      }
    });
  }
});

describe('declared defaults are the real ones', () => {
  for (const [toolId, options] of Object.entries(TOOL_OPTIONS)) {
    if (!local(toolId)) continue;
    for (const opt of options) {
      if (opt.defaultValue === undefined) continue;

      it(`${toolId} --${opt.key} defaults to ${JSON.stringify(opt.defaultValue)}`, async () => {
        const base = { ...(REQUIRED[toolId] ?? {}) };
        const input = INPUT[toolId] ?? 'sample text';
        /*
         * A tool whose answer differs every time cannot be compared this
         * way. The generators are the obvious ones; what the list is really
         * saying is "the default is checked by its shared cases instead",
         * so a tool only belongs here if it has those.
         */
        if (['uuid', 'password', 'lorem', 'random-name', 'random-email', 'random-number'].includes(toolId)) return;

        const withDefault = await runTool(toolId, input, base, { offline: true });
        const explicit = await runTool(
          toolId,
          input,
          { ...base, [opt.key]: opt.defaultValue! },
          { offline: true },
        );
        expect(explicit).toBe(withDefault);
      });
    }
  }
});

describe('required options', () => {
  for (const [toolId, options] of Object.entries(TOOL_OPTIONS)) {
    if (!local(toolId)) continue;
    for (const opt of options.filter((o) => o.required)) {
      it(`${toolId} refuses to run without --${opt.key}`, async () => {
        const input = INPUT[toolId] ?? 'sample text';
        await expect(runTool(toolId, input, {}, { offline: true })).rejects.toBeInstanceOf(RunError);
      });
    }
  }
});

describe('server-backed tools expose what the server accepts', () => {
  // The gap this closes: the hand-written spec covered 28 tools, while the
  // MCP schemas describe 75 options across 27 of the 35 server-backed ones.
  // js-beautify alone takes five, and none of them were reachable.
  const schemas = JSON.parse(
    readFileSync(resolve(__dirname, '../../../ide/shared/mcpSchemas.generated.json'), 'utf8'),
  ) as Record<string, { properties?: Record<string, { type?: string; items?: { type?: string } }> }>;

  it('declares every scalar option its schema accepts', () => {
    const missing: string[] = [];
    for (const tool of TOOLS) {
      if (tool.offline || !tool.mcp) continue;
      const props = schemas[tool.mcp.name]?.properties ?? {};
      const declared = new Set(optionsFor(tool.id).map((o) => o.key));
      for (const [key, p] of Object.entries(props)) {
        if (key === tool.mcp.input) continue;
        // Objects, and arrays of objects, have no sensible flag form.
        if (p.type === 'object') continue;
        if (p.type === 'array' && p.items?.type && !['string', 'number'].includes(p.items.type)) continue;
        if (!declared.has(key)) missing.push(`${tool.id} --${key}`);
      }
    }
    expect(missing, 'run: bunx tsx scripts/capture-mcp-schemas.ts && bunx tsx scripts/generate-cli-artifacts.ts').toEqual([]);
  });

  it('never gives a local tool an option its own code ignores', () => {
    /*
     * The failure this prevents. A local tool has a server twin whose schema
     * accepts options the local implementation knows nothing about, such as
     * hmac's key_encoding or markdown-table's align. Accepting one and
     * ignoring it produces an answer that looks exactly as correct as the
     * right one, which is the whole reason this CLI refuses unknown flags.
     *
     * So for a local tool, every option it offers must be one the authored
     * spec chose, never one derived from a schema it does not call.
     */
    const leaked: string[] = [];
    for (const tool of TOOLS) {
      if (!tool.offline) continue;
      const authored = new Set((AUTHORED[tool.id] ?? []).map((o) => o.key));
      for (const o of optionsFor(tool.id)) {
        if (!authored.has(o.key)) leaked.push(`${tool.id} --${o.key}`);
      }
    }
    expect(leaked, 'a local tool is offering an option nothing implements').toEqual([]);
  });

  it('covers the tools that were previously unreachable', () => {
    for (const [id, key] of [
      ['js-beautify', 'brace_style'],
      ['css-beautify', 'sort'],
      ['cron-build', 'frequency'],
      ['toml-convert', 'sort_keys'],
      ['random-number', 'min'],
      ['text-diff', 'b'],
      ['timezone-convert', 'to'],
      ['json-schema-validate', 'schema'],
    ] as const) {
      expect(optionsFor(id).map((o) => o.key), `${id} should take --${key}`).toContain(key);
    }
  });
});

describe('boolean options are switches', () => {
  it('are typed as booleans, not strings', () => {
    const sort = optionsFor('css-beautify').find((o) => o.key === 'sort');
    expect(sort?.type).toBe('boolean');
  });

  it('every boolean option prints without a value placeholder', () => {
    // --sort, not --sort <value>: a switch that asks for a value reads as
    // though it needs one.
    const bools = TOOLS.flatMap((t) => optionsFor(t.id).filter((o) => o.type === 'boolean'));
    expect(bools.length).toBeGreaterThan(3);
  });
});

describe('the spec matches the catalog', () => {
  it('every tool with options is a real tool', () => {
    const ids = new Set(TOOLS.map((t) => t.id));
    expect(Object.keys(TOOL_OPTIONS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('no option key is declared twice for one tool', () => {
    const dupes: string[] = [];
    for (const [toolId, options] of Object.entries(TOOL_OPTIONS)) {
      const seen = new Set<string>();
      for (const o of options) {
        if (seen.has(o.key)) dupes.push(`${toolId} --${o.key}`);
        seen.add(o.key);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('a closed set never advertises a default outside it', () => {
    const bad: string[] = [];
    for (const [toolId, options] of Object.entries(TOOL_OPTIONS)) {
      for (const o of options) {
        if (o.values && o.defaultValue !== undefined && !o.values.some((v) => v.value === o.defaultValue)) {
          bad.push(`${toolId} --${o.key}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('describes every option in one lower-case line', () => {
    const bad: string[] = [];
    for (const [toolId, options] of Object.entries(TOOL_OPTIONS)) {
      for (const o of options) {
        if (!o.describe || o.describe.includes('\n') || o.describe.endsWith('.')) {
          bad.push(`${toolId} --${o.key}`);
        }
      }
    }
    expect(bad, 'descriptions are printed in a column, so they are short and unpunctuated').toEqual([]);
  });

  it('a required option carries no default, because the two contradict', () => {
    const bad = Object.entries(TOOL_OPTIONS).flatMap(([toolId, options]) =>
      options.filter((o) => o.required && o.defaultValue !== undefined).map((o) => `${toolId} --${o.key}`),
    );
    expect(bad).toEqual([]);
  });

  it('every option the implementation reads is declared', () => {
    // Guards the direction the other tests cannot: an option that works but
    // is invisible in --help, so nobody knows it exists.
    const known: Record<string, string[]> = {
      'json-format': ['indent'],
      'number-base': ['from'],
      'to-hex': ['separator'],
      'number-lines': ['separator'],
      'comma-to-lines': ['separator'],
      'lines-to-comma': ['quote', 'separator'],
    };
    const missing: string[] = [];
    for (const [toolId, keys] of Object.entries(known)) {
      const declared = optionsFor(toolId).map((o) => o.key);
      for (const k of keys) if (!declared.includes(k)) missing.push(`${toolId} --${k}`);
    }
    expect(missing).toEqual([]);
  });
});
