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
import { overviewHelp, toolHelp, listPlain, searchHelp } from './help';
import { formatHits, searchTools } from './search';
import { runTool, RunError } from './run';
import { runExtrasCommand } from './extrasCommands';

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

/** The words that mean "search" when they appear where a tool name goes. */
const SEARCH_WORDS = new Set(['search', 'find']);

/** How many matches `redbison search` prints before it asks you to narrow. */
const SEARCH_LIMIT = 20;

/**
 * Whether a full-screen interface would work here at all.
 *
 * Both ends have to be a terminal: a picker on a pipe would paint escape
 * codes into somebody's file, and one reading a pipe could never see a
 * keystroke. CI is excluded because a build that waits for a key waits
 * forever, and that failure looks like a hang rather than an error.
 */
export function uiPossible(
  env: NodeJS.ProcessEnv,
  tty: { stdin?: boolean; stdout?: boolean },
  platform: string = process.platform,
): boolean {
  if (!tty.stdin || !tty.stdout) return false;
  if (env.REDBISON_NO_UI) return false;
  if (env.CI) return false;
  if (env.TERM === 'dumb') return false;
  // cmd.exe and PowerShell set no TERM at all, so requiring one refused the
  // picker on every Windows machine — the exact wall of help it exists to
  // replace. Windows Terminal and the modern console host both handle the
  // escape sequences used here.
  if (!env.TERM && platform !== 'win32') return false;
  return true;
}

/** `redbison ui`, `redbison --ui`, or `redbison` with nothing after it. */
export function wantsUi(parsed: {
  ui: boolean;
  noUi: boolean;
  tool?: string;
  help: boolean;
  list: boolean;
  version: boolean;
}): boolean {
  if (parsed.noUi || parsed.help || parsed.list || parsed.version) return false;
  if (parsed.ui) return true;
  if (parsed.tool === 'ui' || parsed.tool === 'tui') return true;
  return !parsed.tool && !parsed.help;
}

export async function main(argv: string[], opts: { tty?: boolean } = {}): Promise<number> {
  // The extras answer first — `redbison snake`, `redbison coin` — but never
  // over a real tool's name; runExtrasCommand checks the catalogue itself.
  if (argv[0] && !argv[0].startsWith('-')) {
    const code = await runExtrasCommand(argv[0], argv.slice(1), opts);
    if (code !== null) return code;
  }

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

  /*
   * `redbison search <words>`, and `--search <words>` for the same thing.
   *
   * The names are no use to someone who does not know them, and `--list |
   * grep` only finds the word they happened to guess. This matches the
   * keywords the website's own search box matches on, so the terminal stops
   * being the one place where finding a tool requires knowing it already.
   */
  const query = parsed.search ?? (SEARCH_WORDS.has(parsed.tool ?? '') ? parsed.input ?? '' : undefined);
  if (query !== undefined) {
    if (parsed.help) {
      process.stdout.write(`${searchHelp()}\n`);
      return 0;
    }
    if (!query.trim()) {
      process.stderr.write('What would you like to search for?\n  redbison search unix timestamp\n');
      return 2;
    }
    const hits = searchTools(query);
    if (!hits.length) {
      process.stderr.write(
        `Nothing in the ${TOOLS.length} command line tools matches "${query}".\n` +
          `redbison.dev carries many more: https://redbison.dev/all-tools\n`,
      );
      return 1;
    }
    if (parsed.json) {
      process.stdout.write(
        `${JSON.stringify(
          hits.map((h) => ({
            id: h.tool.id,
            title: h.tool.title,
            summary: h.tool.summary,
            group: h.tool.group,
            offline: h.tool.offline,
            url: h.tool.url,
            matched: h.why,
          })),
        )}\n`,
      );
      return 0;
    }
    process.stdout.write(`${formatHits(hits)}\n`);
    // The count and the hint are not the answer, so they go to standard
    // error and a pipe never sees them.
    if (hits.length > SEARCH_LIMIT) {
      process.stderr.write(`\n${hits.length} matches, showing ${SEARCH_LIMIT}. Narrow it with another word.\n`);
    }
    process.stderr.write(`\nredbison <tool> --help explains any of them.\n`);
    return 0;
  }

  if (wantsUi(parsed)) {
    if (opts.tty) {
      // Loaded only when it is going to be used: the picker pulls in the
      // renderer and the theme, and `redbison json-format` should not pay for
      // either.
      const { startTui } = await import('./tui/app');
      // Whatever was asked for on the command line is how the picker starts.
      // Dropping --offline meant someone who explicitly refused the network
      // got a picker reporting "Offline: off" that would send on the first
      // server-backed tool.
      return startTui(VERSION, { theme: parsed.theme, offline: parsed.offline });
    }
    if (parsed.ui || parsed.tool === 'ui' || parsed.tool === 'tui') {
      process.stderr.write(
        'The picker needs an interactive terminal, and this is not one.\n' +
          'Run it from a shell, or use the commands directly:\n' +
          '  redbison --list\n  redbison <tool> --help\n',
      );
      return 2;
    }
  }

  if (!parsed.tool || parsed.tool === 'ui' || parsed.tool === 'tui') {
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
  main(process.argv.slice(2), {
    tty: uiPossible(process.env, { stdin: Boolean(process.stdin.isTTY), stdout: Boolean(process.stdout.isTTY) }),
  })
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write(`${e?.message ?? e}\n`);
      process.exit(1);
    });
}
