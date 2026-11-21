/**
 * Help text, generated from the catalog so it cannot drift from the tools.
 *
 * Two pages: the overview, which has to stay short enough to read in a
 * terminal, and the per-tool page, which has room to show every option with
 * its values and a worked example taken from the real implementation.
 */
import { optionsFor, type ToolOption } from './options';
import { TOOLS, type CliTool } from './catalog';
import { EXAMPLES } from './examples';

const BIN = 'redbison';

/** Pad to a column without counting ANSI codes, which we do not emit. */
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

function optionLines(tool: CliTool): string[] {
  const opts = optionsFor(tool.id);
  if (!opts.length) return [];
  const width = Math.max(...opts.map((o) => flagLabel(o).length));
  const lines = ['', 'Options:'];
  for (const o of opts) {
    const bits: string[] = [o.describe];
    if (o.values?.length) bits.push(`one of: ${o.values.map((v) => v.value).join(', ')}`);
    if (o.defaultValue !== undefined) bits.push(`default ${JSON.stringify(o.defaultValue)}`);
    if (o.required) bits.push('required');
    lines.push(`  ${pad(flagLabel(o), width)}  ${bits.join('; ')}`);
    // A value worth a word of its own gets one, indented under the flag.
    for (const v of o.values ?? []) {
      if (v.describe) lines.push(`  ${pad('', width)}    ${pad(v.value, 14)}${v.describe}`);
    }
  }
  return lines;
}

function flagLabel(o: ToolOption): string {
  if (o.type === 'boolean') return `--${o.key}`;
  return `--${o.key} <${o.type === 'number' ? 'n' : o.key === 'b' ? 'text' : 'value'}>`;
}

/** `redbison <tool> --help`. */
export function toolHelp(tool: CliTool): string {
  const lines: string[] = [
    `${BIN} ${tool.id}: ${tool.title}`,
    '',
    tool.summary,
    '',
    'Usage:',
    tool.kind === 'insert'
      ? `  ${BIN} ${tool.id} [options]`
      : `  ${BIN} ${tool.id} [options] [text]\n  cat file | ${BIN} ${tool.id} [options]\n  ${BIN} ${tool.id} [options] --file path`,
  ];

  lines.push(...optionLines(tool));

  const ex = EXAMPLES[tool.id];
  if (ex) {
    lines.push('', 'Example:');
    const flags = Object.entries(ex.args ?? {})
      .map(([k, v]) => `--${k} ${shellQuote(String(v))}`)
      .join(' ');
    const cmd = tool.kind === 'insert'
      ? `${BIN} ${tool.id}${flags ? ` ${flags}` : ''}`
      : `${BIN} ${tool.id}${flags ? ` ${flags}` : ''} ${shellQuote(firstLine(ex.input))}`;
    lines.push(`  $ ${cmd}`);
    for (const l of ex.output.split('\n').slice(0, 6)) lines.push(`  ${l}`);
    if (ex.output.split('\n').length > 6) lines.push('  …');
  }

  lines.push(
    '',
    tool.offline
      ? 'Runs on your machine. No network.'
      : 'Sends the input to redbison.dev to be processed. --offline refuses instead.',
    `Online: ${tool.url}`,
  );

  return lines.join('\n');
}

function firstLine(s: string): string {
  const [one] = s.split('\n');
  return one.length > 60 ? `${one.slice(0, 57)}...` : one;
}

function shellQuote(s: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** `redbison --help`. */
export function overviewHelp(): string {
  const local = TOOLS.filter((t) => t.offline).length;
  const groups = new Map<string, CliTool[]>();
  for (const t of TOOLS) {
    const g = t.group ?? 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(t);
  }

  const lines = [
    `${BIN}: ${TOOLS.length} developer tools in your terminal`,
    '',
    'Usage:',
    `  ${BIN}                    the picker: browse, search and run them`,
    `  ${BIN} <tool> [options] [text]`,
    `  cat file | ${BIN} <tool> [options]`,
    `  ${BIN} <tool> --help      what one tool does, and every option it takes`,
    `  ${BIN} search <words>      find a tool by what it does, not its name`,
    `  ${BIN} --list             every tool, one per line, for grep`,
    '',
    'The picker needs a terminal, so this page is what you get on a pipe or in',
    `CI. ${BIN} --no-ui prints it in a terminal too, and --theme terminal makes`,
    "the picker wear your shell's own colours.",
    '',
    `${local} of the ${TOOLS.length} run entirely on your machine. The rest send the`,
    'input to redbison.dev; --offline refuses rather than sending anything.',
    '',
  ];

  for (const [group, tools] of groups) {
    lines.push(`${group}:`);
    const width = Math.min(22, Math.max(...tools.map((t) => t.id.length)));
    // Two columns where the names are short, one where they are not.
    for (const t of tools) lines.push(`  ${pad(t.id, width)}  ${t.title}`);
    lines.push('');
  }

  lines.push(
    'Examples:',
    `  echo '{"b":1,"a":2}' | ${BIN} json-format`,
    `  ${BIN} uuid --variant v7`,
    `  ${BIN} hash --algorithm sha512 --encoding base64 hello`,
    `  ${BIN} sort-lines --order natural --file names.txt`,
    '',
    'Docs: https://redbison.dev/cli',
  );
  return lines.join('\n');
}

/** `redbison search --help`. */
export function searchHelp(): string {
  return [
    `${BIN} search: find a tool by what it does`,
    '',
    'Usage:',
    `  ${BIN} search <words>`,
    `  ${BIN} --search "<words>"`,
    '',
    'It matches the same keywords the search box on redbison.dev matches, so',
    'you can describe the job rather than name the tool:',
    '',
    `  ${BIN} search unix timestamp      epoch`,
    `  ${BIN} search pretty print json   json-format`,
    `  ${BIN} search uuid v7             uuid`,
    `  ${BIN} search b64                 base64-encode, base64-decode`,
    '',
    'The matches go to standard output in the same shape as --list, so they',
    'pipe; everything else goes to standard error. --json gives the full',
    'record of each match for a script.',
    '',
    'Exit codes: 0 found something, 1 nothing matched, 2 no query given.',
  ].join('\n');
}

/** `redbison --list`, one tool per line, made for grep and completion. */
export function listPlain(): string {
  return TOOLS.map((t) => `${pad(t.id, 24)}${t.offline ? 'local ' : 'server'}  ${t.title}`).join('\n');
}
