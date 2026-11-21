/**
 * The loop, driven end to end with no terminal.
 *
 * createApp takes its terminal, its clock-free runner, its clipboard and its
 * browser as arguments, so a test can press the same keys a person would and
 * read the frames that come back — including running a real tool and seeing
 * its real answer. That is the test that would have caught a wiring mistake
 * between the three pure pieces, which is the one place they cannot catch
 * themselves.
 */
import { describe, it, expect, vi } from 'vitest';
import { createApp, runOnce, type AppDeps } from '../tui/app';
import { uiPossible, wantsUi, main } from '../index';
import { parseArgs } from '../args';
import { makeTheme, plain } from '../tui/theme';
import type { Key } from '../tui/state';

function harness(over: Partial<AppDeps> = {}) {
  const written: string[] = [];
  const opened: string[] = [];
  const copied: string[] = [];
  const app = createApp({
    write: (s) => written.push(s),
    size: () => ({ width: 120, height: 32 }),
    run: runOnce,
    open: (url) => opened.push(url),
    copy: (text) => {
      copied.push(text);
      return true;
    },
    theme: makeTheme('none'),
    version: '0.0.0-test',
    quit: vi.fn(),
    ...over,
  });
  return { app, written, opened, copied, screen: () => plain(app.frame().join('\n')) };
}

const key = (name: string, extra: Partial<Key> = {}): Key => ({ name, seq: name, ...extra });

async function press(app: ReturnType<typeof harness>['app'], keys: (string | Key)[]) {
  for (const k of keys) await app.key(typeof k === 'string' ? key(k) : k);
}

const type = (text: string): Key[] => [...text].map((c) => ({ name: c, seq: c }));

describe('finding a tool and running it', () => {
  it('filters, opens, runs, and shows the real answer', async () => {
    const h = harness();
    await press(h.app, ['/', ...type('json-format'), 'return']);
    expect(h.screen()).toContain('json-format');

    await press(h.app, ['d']);
    expect(h.app.state().selected).toBe('json-format');

    // The example input is already loaded, so enter twice is a whole run.
    await press(h.app, ['return', 'return']);
    const out = h.app.state().output;
    expect(out?.failed).toBe(false);
    expect(out?.text).toContain('\n  ');
    expect(JSON.parse(out!.text)).toEqual(JSON.parse(h.app.state().input));
    expect(h.screen()).toContain('answered in');
  });

  it('honours an option the user changed', async () => {
    const h = harness();
    await press(h.app, ['/', ...type('json-format'), 'return', 'd', 'p']);
    await press(h.app, [{ name: 'u', ctrl: true }, ...type('indent=6'), 'return']);
    await press(h.app, ['return']);
    expect(h.app.state().output?.text.split('\n')[1]).toMatch(/^ {6}\S/);
  });

  it('reports a refusal as a refusal, and carries on', async () => {
    const h = harness();
    await press(h.app, ['/', ...type('json-validate'), 'return', 'return']);
    await press(h.app, [{ name: 'u', ctrl: true }, ...type('{not json'), 'return']);
    expect(h.app.state().output?.failed).toBe(true);
    expect(h.screen()).toContain('refused the input');
    await press(h.app, ['escape']);
    expect(h.app.state().mode).toBe('docs');
  });

  it('runs a generator with no input at all', async () => {
    const h = harness();
    await press(h.app, ['/', ...type('uuid'), 'return', 'return']);
    expect(h.app.state().output?.failed).toBe(false);
    expect(h.app.state().output?.text).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('refuses to send anything when offline is on', async () => {
    const h = harness();
    await press(h.app, ['x', '/', ...type('js-beautify'), 'return', 'return', 'return']);
    const out = h.app.state().output;
    expect(out?.failed).toBe(true);
    expect(out?.text).toContain('--offline');
  });

  it('copies the answer and opens the web page', async () => {
    const h = harness();
    await press(h.app, ['/', ...type('uuid'), 'return', 'return', 'y']);
    expect(h.copied[0]).toBe(h.app.state().output?.text);
    await press(h.app, ['o']);
    expect(h.opened[0]).toContain('https://redbison.dev/');
  });

  it('says so when there is no clipboard rather than claiming it copied', async () => {
    const h = harness({ copy: () => false });
    await press(h.app, ['/', ...type('uuid'), 'return', 'return', 'y']);
    expect(h.screen()).toContain('No clipboard command');
  });

  it('survives a failure instead of leaving the terminal wrecked', async () => {
    /*
     * The alternate screen and the hidden cursor are restored by one line on
     * the way out. An unhandled rejection skips it, and the user is returned
     * to a shell with no cursor and the last frame still painted. Anything
     * thrown has to come back as a message instead.
     */
    const h = harness({
      run: () => Promise.reject(new Error('the runner exploded')),
    });
    await expect(press(h.app, ['/', ...type('uuid'), 'return', 'return'])).resolves.toBeUndefined();
    expect(h.app.state().running).toBe(false);
    expect(h.screen()).toContain('the runner exploded');
    // Still usable afterwards.
    await press(h.app, ['escape', 'down']);
    expect(h.app.state().mode).not.toBe('output');
  });

  it('quits on q', async () => {
    const quit = vi.fn();
    const h = harness({ quit });
    await press(h.app, ['q']);
    expect(quit).toHaveBeenCalled();
  });
});

describe('what it writes to the terminal', () => {
  it('redraws in place, never scrolling the window', async () => {
    const h = harness();
    h.app.draw();
    const out = h.written.join('');
    expect(out.startsWith('\x1b[H')).toBe(true);
    expect(out).toContain('\x1b[K');
    // One frame is exactly height-1 line breaks: one more and the terminal
    // scrolls, leaving a trail of half-frames behind.
    expect(out.split('\r\n')).toHaveLength(32);
  });

  it('draws once per keystroke, and once more when a run finishes', async () => {
    const h = harness();
    h.written.length = 0;
    await press(h.app, ['down']);
    expect(h.written).toHaveLength(1);
    h.written.length = 0;
    await press(h.app, ['/', ...type('uuid'), 'return', 'return']);
    // The last keystroke draws "Running…" and then the answer.
    expect(h.written.length).toBeGreaterThan(type('uuid').length + 2);
  });
});

describe('when the picker should start at all', () => {
  const tty = { stdin: true, stdout: true };

  it('needs both ends to be a terminal', () => {
    expect(uiPossible({ TERM: 'xterm' }, tty)).toBe(true);
    expect(uiPossible({ TERM: 'xterm' }, { stdin: true, stdout: false })).toBe(false);
    expect(uiPossible({ TERM: 'xterm' }, { stdin: false, stdout: true })).toBe(false);
  });

  it('stays out of CI and dumb terminals, where it would look like a hang', () => {
    expect(uiPossible({ TERM: 'xterm', CI: 'true' }, tty)).toBe(false);
    expect(uiPossible({ TERM: 'dumb' }, tty)).toBe(false);
    expect(uiPossible({}, tty)).toBe(false);
  });

  it('can be turned off for good with an environment variable', () => {
    expect(uiPossible({ TERM: 'xterm', REDBISON_NO_UI: '1' }, tty)).toBe(false);
  });

  it('starts on Windows, which sets no TERM at all', () => {
    // cmd.exe and PowerShell have no TERM, so requiring one refused the
    // picker on every Windows machine and printed the wall of help it was
    // built to replace.
    expect(uiPossible({}, tty, 'win32')).toBe(true);
    expect(uiPossible({ TERM: 'dumb' }, tty, 'win32')).toBe(false);
    expect(uiPossible({ CI: '1' }, tty, 'win32')).toBe(false);
    expect(uiPossible({}, tty, 'darwin')).toBe(false);
  });

  it('carries the flags the command line already set into the picker', () => {
    // Someone who typed --offline and got a picker saying "Offline: off"
    // would have had their input posted by the first server-backed tool.
    const h = harness({ start: { offline: true } });
    expect(h.app.state().offline).toBe(true);
    expect(plain(h.app.frame().join('\n'))).toContain('on, nothing is sent');
  });

  it('refuses a theme it does not know instead of ignoring it', () => {
    expect(() => parseArgs(['--theme', 'termnial'])).toThrow(/takes one of/);
    expect(parseArgs(['--theme', 'TERMINAL']).theme).toBe('terminal');
  });

  it('starts for a bare redbison, and for ui, and never for a tool', () => {
    expect(wantsUi(parseArgs([]))).toBe(true);
    expect(wantsUi(parseArgs(['ui']))).toBe(true);
    expect(wantsUi(parseArgs(['--ui']))).toBe(true);
    expect(wantsUi(parseArgs(['json-format']))).toBe(false);
    expect(wantsUi(parseArgs(['--list']))).toBe(false);
    expect(wantsUi(parseArgs(['--version']))).toBe(false);
  });

  it('gets out of the way for --help and --no-ui', () => {
    expect(wantsUi(parseArgs(['--help']))).toBe(false);
    expect(wantsUi(parseArgs(['--no-ui']))).toBe(false);
    expect(wantsUi(parseArgs(['--no-tui']))).toBe(false);
  });
});

describe('without a terminal', () => {
  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((c) => { out.push(String(c)); return true; });
    const e = vi.spyOn(process.stderr, 'write').mockImplementation((c) => { err.push(String(c)); return true; });
    return { out: () => out.join(''), err: () => err.join(''), restore: () => { o.mockRestore(); e.mockRestore(); } };
  }

  it('a bare redbison still prints the help it always printed', async () => {
    const cap = capture();
    const code = await main([], { tty: false });
    cap.restore();
    expect(code).toBe(1);
    expect(cap.out()).toContain('developer tools in your terminal');
  });

  it('asking for the picker explicitly says why it cannot start', async () => {
    const cap = capture();
    const code = await main(['ui'], { tty: false });
    cap.restore();
    expect(code).toBe(2);
    expect(cap.err()).toContain('interactive terminal');
    expect(cap.out()).toBe('');
  });

  it('--list and --version are untouched by any of this', async () => {
    const cap = capture();
    const list = await main(['--list'], { tty: true });
    const version = await main(['--version'], { tty: true });
    cap.restore();
    expect(list).toBe(0);
    expect(version).toBe(0);
    expect(cap.out()).toContain('json-format');
  });
});
