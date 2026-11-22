/**
 * The CLI end to end: what it prints, where it prints it, and what it exits
 * with.
 *
 * The stream a message goes to is part of the contract. The answer belongs on
 * standard output so `redbison hash x | pbcopy` copies a digest and not a
 * sentence about the digest; everything else belongs on standard error so the
 * pipe never sees it. Exit codes matter for the same reason: 0 worked, 1 the
 * tool refused, 2 the command line was wrong.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../index';
import { TOOLS } from '../catalog';
import { optionsFor } from '../options';

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
  // isTTY stops the CLI waiting on a pipe that is not coming.
  const was = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  try {
    const code = await main(args);
    return { code, out: cap.out(), err: cap.err() };
  } finally {
    cap.restore();
    Object.defineProperty(process.stdin, 'isTTY', { value: was, configurable: true });
  }
}

afterEach(() => vi.restoreAllMocks());

describe('searching for a tool', () => {
  it('finds one by what it does and prints only the answer', async () => {
    const r = await run(['search', 'unix', 'timestamp']);
    expect(r.code).toBe(0);
    expect(r.out.split('\n')[0]).toMatch(/^epoch\s+local/);
    // The count and the hint are not the answer, so a pipe must not see them.
    expect(r.out).not.toMatch(/--help explains/);
    expect(r.err).toContain('--help explains');
  });

  it('takes the same query as a flag', async () => {
    const r = await run(['--search', 'pretty print json']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('json-format');
  });

  it('exits 1 and says where else to look when nothing matches', async () => {
    const r = await run(['search', 'qr', 'code']);
    expect(r.code).toBe(1);
    expect(r.out).toBe('');
    expect(r.err).toContain('redbison.dev');
  });

  it('asks for a query rather than listing everything', async () => {
    const r = await run(['search']);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toContain('search for');
  });

  it('answers in JSON when asked, for a script', async () => {
    const r = await run(['search', '--json', 'uuid']);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out) as { id: string; offline: boolean; matched: string }[];
    expect(parsed[0].id).toBe('uuid');
    expect(parsed[0].offline).toBe(true);
    expect(parsed[0].matched).toBe('name');
  });

  it('explains itself, and does not shadow a tool called find', async () => {
    const r = await run(['search', '--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('find a tool by what it does');
    expect(r.err).toBe('');
    const hash = await run(['hash', 'find']);
    expect(hash.code).toBe(0);
    expect(hash.out.trim()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('running a tool', () => {
  it('writes the answer to stdout and nothing else', async () => {
    const r = await run(['json-format', '{"a":1}']);
    expect(r.code).toBe(0);
    expect(r.out).toBe('{\n  "a": 1\n}\n');
    expect(r.err).toBe('');
  });

  it('ends the answer with exactly one newline', async () => {
    const r = await run(['rot13', 'abc']);
    expect(r.out).toBe('nop\n');
  });

  it('does not add a second newline when the answer has one', async () => {
    const r = await run(['comma-to-lines', 'a,b']);
    expect(r.out.endsWith('\n')).toBe(true);
    expect(r.out.endsWith('\n\n')).toBe(false);
  });

  it('honours an option', async () => {
    const r = await run(['case-convert', '--style', 'snake', 'helloWorld']);
    expect(r.out).toBe('hello_world\n');
  });

  it('takes a generator with no input at all', async () => {
    const r = await run(['uuid', '--variant', 'nil']);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('wraps the run in JSON when asked', async () => {
    const r = await run(['rot13', '--json', 'abc']);
    const parsed = JSON.parse(r.out);
    expect(parsed).toMatchObject({ tool: 'rot13', input: 'abc', output: 'nop' });
  });
});

describe('exit codes', () => {
  it('0 when the tool worked', async () => {
    expect((await run(['rot13', 'abc'])).code).toBe(0);
  });

  it('1 when the tool refused the input', async () => {
    const r = await run(['json-format', 'not json']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/JSON/);
    expect(r.out).toBe('');
  });

  it('2 when the command line was wrong', async () => {
    expect((await run(['hash', '--nope', 'x', 'abc'])).code).toBe(2);
  });

  it('2 for an unknown tool', async () => {
    expect((await run(['nope'])).code).toBe(2);
  });

  it('2 when a tool that needs input got none', async () => {
    const r = await run(['json-format']);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/needs some input/);
  });
});

describe('diagnostics go to stderr', () => {
  it('an unknown tool does not pollute stdout', async () => {
    const r = await run(['nope']);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/No tool called/);
  });

  it('suggests a near miss', async () => {
    expect((await run(['json-formt'])).err).toMatch(/json-format/);
  });

  it('a refused input does not pollute stdout', async () => {
    expect((await run(['from-hex', 'abc'])).out).toBe('');
  });
});

describe('help', () => {
  it('--help exits 0 and lists the groups', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Data and JSON:/);
    expect(r.out).toMatch(new RegExp(`${TOOLS.length} developer tools`));
  });

  it('no arguments at all prints help but exits non-zero', async () => {
    const r = await run([]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Usage:/);
  });

  it('--list prints one line per tool', async () => {
    const r = await run(['--list']);
    expect(r.out.trim().split('\n')).toHaveLength(TOOLS.length);
  });

  it('--version prints just the version', async () => {
    const r = await run(['--version']);
    expect(r.out).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it('every tool has a help page naming its options', async () => {
    const broken: string[] = [];
    for (const t of TOOLS) {
      const r = await run([t.id, '--help']);
      if (r.code !== 0) { broken.push(`${t.id}: exit ${r.code}`); continue; }
      if (!r.out.includes(t.title)) broken.push(`${t.id}: no title`);
      for (const o of optionsFor(t.id)) {
        if (!r.out.includes(`--${o.key}`)) broken.push(`${t.id}: --${o.key} missing from help`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('a tool help page says whether it uses the network', async () => {
    expect((await run(['json-format', '--help'])).out).toMatch(/No network/);
    expect((await run(['js-beautify', '--help'])).out).toMatch(/Sends the input/);
  });

  it('a tool help page shows a worked example', async () => {
    expect((await run(['hash', '--help'])).out).toMatch(/Example:/);
  });
});

describe('what is sent is measured before it is sent', () => {
  it('counts option text, not only the input', async () => {
    // json-schema-validate takes its schema as an option, and a text option
    // reads a file, so
    // a guard that looked only at the input would have waved through
    // megabytes.
    const { runTool, RunError } = await import('../run');
    await expect(
      runTool('json-schema-validate', '{}', { schema: 'x'.repeat(1_200_000) }),
    ).rejects.toBeInstanceOf(RunError);
  });

  it('says how big it was and what the limit is', async () => {
    const { runTool } = await import('../run');
    await expect(runTool('json-schema-validate', '{}', { schema: 'x'.repeat(1_200_000) })).rejects.toThrow(
      /1\.2MB.*limit is 1MB/s,
    );
  });
});

describe('--offline', () => {
  it('refuses a server tool and says so', async () => {
    const r = await run(['js-beautify', '--offline', 'var a=1']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/nothing was sent/);
  });

  it('does not affect a local tool', async () => {
    expect((await run(['rot13', '--offline', 'abc'])).code).toBe(0);
  });
});

/*
 * Every name in `bin` has to actually start the CLI.
 *
 * `rb` shipped broken in 0.1.0: the entry guard tested process.argv[1] for
 * "redbison" only, so invoking the other symlink exited 0 and printed
 * nothing. A silent success is the one failure no smoke test catches, so
 * this runs the built file under each name the manifest declares.
 */
describe('every declared bin starts the CLI', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
  ) as { bin: Record<string, string> };
  const dist = resolve(__dirname, '../../dist/index.js');

  for (const name of Object.keys(pkg.bin)) {
    it(`prints output when invoked as ${name}`, () => {
      if (!existsSync(dist)) return; // built artefact only; `bun run cli:build` first
      const link = join(mkdtempSync(join(tmpdir(), 'rb-bin-')), name);
      symlinkSync(dist, link);
      const out = execFileSync(process.execPath, [link, 'uuid'], { encoding: 'utf8' });
      expect(out.trim(), `${name} produced no output`).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  }
});

/*
 * ...and under a name that is in no manifest at all.
 *
 * Matching the two bin names fixed `rb` but left the same hole: npm's own
 * tarball unpacks to package/dist/index.js, and running that went silent
 * because the directory is not called `cli`. The guard asks Node whether this
 * module is the entry point, so the file's name stops mattering.
 */
it('starts the CLI even when the file has an unrelated name', () => {
  const dist = resolve(__dirname, '../../dist/index.js');
  if (!existsSync(dist)) return;
  const dir = mkdtempSync(join(tmpdir(), 'rb-anon-'));
  const copied = join(dir, 'totally-unrelated-name.js');
  copyFileSync(dist, copied);
  const out = execFileSync(process.execPath, [copied, 'base64-encode', 'hello'], {
    encoding: 'utf8',
  });
  expect(out.trim()).toBe('aGVsbG8=');
});
