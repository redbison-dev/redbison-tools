/**
 * Draw the picker's frames without a terminal.
 *
 *   bunx tsx scripts/preview.ts               the tool list, 120x32, in colour
 *   bunx tsx scripts/preview.ts --plain       no escape codes, for reading a diff
 *   bunx tsx scripts/preview.ts --size 80x24  another terminal
 *   bunx tsx scripts/preview.ts --html out.html   every screen, as a page
 *
 * It exists because the interface is a picture, and a picture is checked by
 * looking at it. The frames come from the same pure render() the real loop
 * uses, so what this prints is what the terminal gets.
 */
import { writeFileSync } from 'node:fs';
import { version as VERSION } from '../package.json';
import { render } from '../src/tui/render';
import { makeTheme, plain } from '../src/tui/theme';
import { initialState, reduce, applyResult, type Key, type State } from '../src/tui/state';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const [w, h] = (arg('--size') ?? '120x32').split('x').map(Number);
const size = { width: w, height: h };
const theme = makeTheme(args.includes('--plain') ? 'none' : 'true');

const key = (name: string, extra: Partial<Key> = {}): Key => ({ name, seq: name, ...extra });

const press = (state: State, keys: Key[]): State => {
  let s = state;
  for (const k of keys) s = reduce(s, k, 20).state;
  return s;
};

const screens: [string, State][] = [];

const list = initialState();
screens.push(['The catalogue', press(list, [key('down'), key('down')])]);
screens.push(['Filtered with /', press(list, [key('/'), key('b'), key('6'), key('4')])]);
screens.push(['Categories (f)', press(list, [key('f'), key('down'), key('down')])]);
screens.push(['One category (2)', press(list, [key('2'), key('down')])]);
screens.push(['Documentation (d)', press(list, [key('/'), key('j'), key('s'), key('o'), key('n'), key('escape'), key('return'), key('escape'), key('d')])]);

const docs = press(list, [key('d')]);
screens.push(['Editing the input (e)', press(docs, [key('e')])]);
screens.push([
  'Output',
  applyResult(press(docs, [key('e')]), {
    text: '{\n  "a": 2,\n  "b": 1\n}',
    failed: false,
    ms: 3,
  }),
]);
screens.push(['Help (?)', press(list, [key('?')])]);
screens.push(['Command bar (:)', press(list, [key(':'), key('o'), key('f'), key('f')])]);

if (args.includes('--html')) {
  const out = args[args.indexOf('--html') + 1] ?? 'preview.html';
  writeFileSync(out, html(screens));
  console.log(`wrote ${out}`);
} else {
  for (const [name, state] of screens) {
    console.log(`\n── ${name} ${'─'.repeat(Math.max(0, size.width - name.length - 4))}`);
    console.log(render(state, theme, size, VERSION).join('\n'));
  }
}

/** ANSI to HTML, enough of it for 24-bit and 256-colour foregrounds. */
function toHtml(line: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '';
  let open = 0;
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) {
    out += esc(line.slice(last, match.index));
    last = re.lastIndex;
    const codes = match[1].split(';').map(Number);
    if (codes[0] === 0) {
      out += '</span>'.repeat(open);
      open = 0;
      continue;
    }
    const styles: string[] = [];
    for (let i = 0; i < codes.length; i += 1) {
      if (codes[i] === 1) styles.push('font-weight:700');
      if (codes[i] === 38 && codes[i + 1] === 2) {
        styles.push(`color:rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`);
        i += 4;
      }
      if (codes[i] === 48 && codes[i + 1] === 2) {
        styles.push(`background:rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`);
        i += 4;
      }
    }
    out += `<span style="${styles.join(';')}">`;
    open += 1;
  }
  out += esc(line.slice(last));
  out += '</span>'.repeat(open);
  return out;
}

function html(all: [string, State][]): string {
  const blocks = all
    .map(
      ([name, state]) =>
        `<h2>${name}</h2><pre>${render(state, theme, size, VERSION).map(toHtml).join('\n')}</pre>`,
    )
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>redbison picker</title>
<style>
 body{background:#111;color:#ccc;font-family:-apple-system,system-ui,sans-serif;padding:24px}
 h2{font-size:14px;color:#888;font-weight:600;margin:28px 0 8px}
 pre{background:#000;padding:14px;border-radius:8px;overflow:auto;
     font-family:"SF Mono",Menlo,Consolas,monospace;font-size:12px;line-height:1.25;margin:0}
</style>
${blocks}`;
}

export { plain };
