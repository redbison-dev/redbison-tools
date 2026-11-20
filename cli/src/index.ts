#!/usr/bin/env node
/**
 * redbison — the command line front end.
 *
 * Reads the selection the way a Unix tool does: an argument, a file, or
 * standard input, in that order. Writes the answer to standard output and
 * nothing else, so it composes. Everything that is not the answer —
 * diagnostics, hints, the fact that a tool ran on the server — goes to
 * standard error, where a pipe will not pick it up.
 */
import { readFileSync } from 'node:fs';
import { version as VERSION } from '../package.json';
import { parseArgs, ArgError } from './args';
import { byId, TOOLS } from './catalog';
import { overviewHelp, toolHelp, listPlain } from './help';
import { runTool, RunError } from './run';

/*
 * Read from the manifest rather than written twice. A hand-kept copy went
 * stale the first time the version moved: `npm pkg set version` bumped the
 * package while `--version` kept reporting 0.1.0, which is the one number a
 * bug report relies on being true.
 */

/** Nearest tool ids, so a typo gets an answer rather than a shrug. */
function didYouMean(given: string): string {
  const score = (a: string, b: string) => {
    if (b.includes(a) || a.includes(b)) return 0;
    let hits = 0;
    for (const ch of new Set(a)) if (b.includes(ch)) hits += 1;
    return a.length - hits;
  };
  const near = TOOLS.map((t) => ({ id: t.id, d: score(given.toLowerCase(), t.id) }))
    .sort((a, b) => a.d - b.d)
    .filter((x) => x.d <= 2)
    .slice(0, 4)
    .map((x) => x.id);
  return near.length ? `\n\nDid you mean:\n${near.map((n) => `  ${n}`).join('\n')}` : '';
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as ArgError).message}\n`);
    return 2;
  }

  if (parsed.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (parsed.list) {
    process.stdout.write(`${listPlain()}\n`);
    return 0;
  }

  if (!parsed.tool) {
    process.stdout.write(`${overviewHelp()}\n`);
    return parsed.help ? 0 : 1;
  }

  const tool = byId(parsed.tool);
  if (!tool) {
    process.stderr.write(`No tool called "${parsed.tool}".${didYouMean(parsed.tool)}\n\nredbison --list shows all ${TOOLS.length}.\n`);
    return 2;
  }

  if (parsed.help) {
    process.stdout.write(`${toolHelp(tool)}\n`);
    return 0;
  }

  // Input: an argument, then a file, then standard input. A generator takes
  // none, so it never waits on a pipe that is not coming.
  let input = '';
  if (tool.kind !== 'insert') {
    if (parsed.input !== undefined) input = parsed.input;
    else if (parsed.file) {
      try {
        input = readFileSync(parsed.file, 'utf8');
      } catch (e) {
        process.stderr.write(`Could not read ${parsed.file}: ${(e as Error).message}\n`);
        return 2;
      }
    } else input = await readStdin();

    if (!input) {
      process.stderr.write(
        `${tool.id} needs some input. Give it as an argument, with --file, or on a pipe:\n` +
          `  redbison ${tool.id} "text"\n  cat file | redbison ${tool.id}\n\n` +
          `redbison ${tool.id} --help explains the options.\n`,
      );
      return 2;
    }
  }

  // An option that carries a second body of text can name a file too.
  const options = { ...parsed.options };
  for (const [k, v] of Object.entries(options)) {
    if (typeof v === 'string' && v.startsWith('@')) {
      try {
        options[k] = readFileSync(v.slice(1), 'utf8');
      } catch (e) {
        process.stderr.write(`Could not read ${v.slice(1)}: ${(e as Error).message}\n`);
        return 2;
      }
    }
  }

  try {
    const out = await runTool(tool.id, input, options, { offline: parsed.offline });
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ tool: tool.id, input, options, output: out })}\n`);
    } else {
      process.stdout.write(out.endsWith('\n') ? out : `${out}\n`);
    }
    return 0;
  } catch (e) {
    if (e instanceof RunError) {
      process.stderr.write(`${e.message}\n`);
      return 1;
    }
    process.stderr.write(`${tool.id} failed: ${(e as Error).message}\n`);
    return 1;
  }
}

/*
 * Only run when invoked, so the tests can import main().
 *
 * Ask Node whether this module is the entry point rather than guessing from
 * the path. 0.1.0 guessed — it tested process.argv[1] against
 * /redbison|cli[/\\](dist|src)[/\\]index/ — and npm installs one symlink per
 * `bin` entry, so invoking `rb` matched nothing: main() never ran, nothing
 * was printed, and the exit code was 0. A silent success is the failure no
 * smoke test catches, which is how it shipped.
 *
 * Matching the two names instead was the obvious repair and still wrong in
 * the same way: running the file by its own path from a directory not called
 * `cli` (npm's own tarball unpacks to package/dist/index.js) went silent too.
 * `require.main === module` is true exactly when Node executed this file,
 * whatever it or its directory is named.
 *
 * The name check stays as a fallback for the bundled CJS, since the tests
 * import this module under vitest's ESM loader where `require` is undefined
 * and the comparison has to be skipped rather than throw.
 */
const invokedAs = process.argv[1] ?? '';
const isEntryModule =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;
const BIN_NAMES = ['redbison', 'rb'];
const ranAsBin =
  isEntryModule ||
  BIN_NAMES.some((n) => new RegExp(`(?:^|[/\\\\])${n}(\\.(js|cmd|exe))?$`).test(invokedAs)) ||
  /cli[/\\](dist|src)[/\\]index/.test(invokedAs);
if (ranAsBin) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write(`${e?.message ?? e}\n`);
      process.exit(1);
    });
}
