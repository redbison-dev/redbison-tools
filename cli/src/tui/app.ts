/**
 * The part that is allowed to touch the terminal.
 *
 * Everything decided lives in state.ts and everything drawn lives in
 * render.ts, so what is left here is the loop: keys in, frames out, effects
 * performed. It is written against injected dependencies rather than against
 * process directly, which is what lets a test drive the whole interface —
 * filter, select, run a real tool, read the output — with no pty at all.
 *
 * Two rules the terminal is unforgiving about:
 *
 *   The alternate screen is entered and left in a pair, and the cursor is
 *   shown again whatever happens. A crash that skips the teardown leaves the
 *   user with an invisible cursor in a shell that looks broken.
 *
 *   A frame is exactly as many lines as the terminal is tall, each cleared to
 *   the end of the line. Writing fewer leaves the previous frame's tail on
 *   screen; writing more scrolls the window and smears every frame after it.
 */
import { spawn, spawnSync } from 'node:child_process';
import { runTool, RunError } from '../run';
import { applyResult, extraTickMs, initialState, reduce, runCommand, tickExtra, type Effect, type Key, type State } from './state';
import { pageSize, render, type Size } from './render';
import { colourLevel, makeTheme, type Theme } from './theme';

export type RunResult = { text: string; failed: boolean; ms: number };

export type AppDeps = {
  write: (s: string) => void;
  size: () => Size;
  run: (
    tool: string,
    input: string,
    options: Record<string, string | number | boolean>,
    offline: boolean,
  ) => Promise<RunResult>;
  open: (url: string) => void;
  copy: (text: string) => boolean;
  theme: Theme;
  version: string;
  quit: () => void;
  /** What the command line already decided, e.g. --offline. */
  start?: Partial<State>;
};

export type App = {
  state: () => State;
  frame: () => string[];
  draw: () => void;
  key: (key: Key) => Promise<void>;
  /** Advance the extra on screen to `now` and redraw. */
  tick: (now: number) => void;
  /** How often tick wants calling right now, or null for not at all. */
  tickMs: () => number | null;
  /** Run a `:` command as if typed, for starting on a given screen. */
  command: (text: string) => void;
};

export function createApp(deps: AppDeps): App {
  let state: State = { ...initialState(), ...deps.start };

  const frame = () => render(state, deps.theme, deps.size(), deps.version);

  const draw = () => {
    const lines = frame();
    // Home, then every line cleared to its end. No full clear: that flashes.
    deps.write(`\x1b[H${lines.map((l) => `${l}\x1b[K`).join('\r\n')}`);
  };

  const perform = async (effect: Effect) => {
    switch (effect.kind) {
      case 'quit':
        deps.quit();
        return;
      case 'open':
        deps.open(effect.url);
        return;
      case 'copy': {
        const ok = deps.copy(effect.text);
        if (!ok) {
          state = { ...state, status: { text: 'No clipboard command here (pbcopy, wl-copy, xclip).', kind: 'warn' } };
        }
        return;
      }
      case 'run': {
        draw(); // show "Running…" before the wait, not after it
        const result = await deps.run(effect.tool, effect.input, effect.options, effect.offline);
        state = applyResult(state, result);
        return;
      }
    }
  };

  return {
    state: () => state,
    frame,
    draw,
    async key(key: Key) {
      /*
       * Nothing thrown in here may escape. The alternate screen and the
       * hidden cursor are process-wide state restored by one line in
       * startTui, and an unhandled rejection skips it: the user is returned
       * to a shell with no cursor and the picker's last frame still on it.
       * Better to show the fault in the status bar and keep drawing.
       */
      try {
        const step = reduce(state, key, pageSize(deps.size()));
        state = step.state;
        if (step.effect) await perform(step.effect);
      } catch (e) {
        state = { ...state, running: false, status: { text: `That went wrong: ${(e as Error).message}`, kind: 'error' } };
      }
      draw();
    },
    tick(now: number) {
      // Same containment rule as key(): a game's bug may cost a frame, never
      // the terminal.
      try {
        state = tickExtra(state, now);
      } catch (e) {
        state = { ...state, status: { text: `That went wrong: ${(e as Error).message}`, kind: 'error' } };
      }
      draw();
    },
    tickMs: () => extraTickMs(state),
    command(text: string) {
      state = runCommand(state, text, pageSize(deps.size())).state;
    },
  };
}

/** The real runner, timed, with a refusal reported rather than thrown. */
export async function runOnce(
  tool: string,
  input: string,
  options: Record<string, string | number | boolean>,
  offline: boolean,
): Promise<RunResult> {
  const started = Date.now();
  try {
    const text = await runTool(tool, input, options, { offline });
    return { text, failed: false, ms: Date.now() - started };
  } catch (e) {
    const message = e instanceof RunError ? e.message : `${tool} failed: ${(e as Error).message}`;
    return { text: message, failed: true, ms: Date.now() - started };
  }
}

/** Hand the text to whatever this machine calls a clipboard. */
export function copyToClipboard(text: string): boolean {
  const candidates: [string, string[]][] =
    process.platform === 'darwin'
      ? [['pbcopy', []]]
      : process.platform === 'win32'
        ? [['clip', []]]
        : [
            ['wl-copy', []],
            ['xclip', ['-selection', 'clipboard']],
            ['xsel', ['--clipboard', '--input']],
          ];
  for (const [cmd, args] of candidates) {
    const res = spawnSync(cmd, args, { input: text });
    if (!res.error && res.status === 0) return true;
  }
  return false;
}

export function openInBrowser(url: string): void {
  // Nothing of ours goes with it, and the child is detached so closing the
  // TUI does not close the browser.
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* No opener on this machine; the URL is on screen anyway. */
  }
}

/**
 * Start the interface on the real terminal. Resolves with the exit code.
 */
export async function startTui(
  version: string,
  opts: { theme?: string; offline?: boolean; screen?: string } = {},
): Promise<number> {
  const { stdin, stdout } = process;
  const readline = await import('node:readline');

  // A --theme on the command line is the same choice REDBISON_THEME makes,
  // so it goes through the same decision rather than a second one beside it.
  const env = opts.theme ? { ...process.env, REDBISON_THEME: opts.theme } : process.env;
  const palette = makeTheme(colourLevel(env, Boolean(stdout.isTTY)));

  let done: (code: number) => void = () => undefined;
  const finished = new Promise<number>((resolve) => {
    done = resolve;
  });

  const app = createApp({
    write: (s) => stdout.write(s),
    size: () => ({ width: stdout.columns || 80, height: stdout.rows || 24 }),
    run: runOnce,
    open: openInBrowser,
    copy: copyToClipboard,
    theme: palette,
    version,
    quit: () => done(0),
    start: { offline: Boolean(opts.offline) },
  });

  const enter = () => {
    stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J');
    if (stdin.isTTY) stdin.setRawMode(true);
    readline.emitKeypressEvents(stdin);
    stdin.resume();
  };

  const leave = () => {
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    stdout.write('\x1b[?25h\x1b[?1049l');
  };

  /*
   * The extras' clock. The reducer stays pure; this is the one place a timer
   * exists, re-matched to whatever is on screen after every keystroke so the
   * clock stops the moment the game is left. A rate change mid-screen never
   * happens (tickMs is a constant per extra), so start/stop is the whole job.
   */
  let timer: ReturnType<typeof setInterval> | null = null;
  let timerMs: number | null = null;
  const syncTimer = () => {
    const ms = app.tickMs();
    if (ms === timerMs) return;
    if (timer) clearInterval(timer);
    timer = ms ? setInterval(() => app.tick(Date.now()), ms) : null;
    timerMs = ms;
  };

  const onKey = (seq: string, key: { name?: string; ctrl?: boolean; shift?: boolean; meta?: boolean } | undefined) => {
    void app
      .key({
        name: key?.name ?? seq ?? '',
        ctrl: key?.ctrl,
        shift: key?.shift,
        meta: key?.meta,
        seq,
      })
      .then(syncTimer);
  };

  const onResize = () => app.draw();

  /*
   * The terminal is restored whatever happens on the way out, including the
   * ways that skip the code below: an exception from somewhere this loop does
   * not own, or a signal. Leaving it unrestored hands back a shell with no
   * cursor, which looks like the shell is broken rather than this.
   */
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    leave();
  };
  const onFatal = (e: unknown) => {
    restore();
    process.stderr.write(`redbison: ${(e as Error)?.message ?? e}\n`);
    process.exit(1);
  };
  const onSignal = () => {
    restore();
    process.exit(130);
  };

  enter();
  stdin.on('keypress', onKey);
  stdout.on('resize', onResize);
  process.on('uncaughtException', onFatal);
  process.on('unhandledRejection', onFatal);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('exit', restore);
  // `redbison snake` lands straight on the game, through the same command
  // the picker's `:` prompt runs, so there is exactly one way in.
  if (opts.screen) app.command(opts.screen);
  syncTimer();
  app.draw();

  const code = await finished;
  if (timer) clearInterval(timer);

  stdin.off('keypress', onKey);
  stdout.off('resize', onResize);
  process.off('uncaughtException', onFatal);
  process.off('unhandledRejection', onFatal);
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  restore();
  return code;
}
