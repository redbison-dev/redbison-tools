/**
 * The colour scheme.
 *
 * The shape of this interface, and the palette it ships with, are owed to the
 * open-source terminal applications that showed what command line UX can be —
 * k9s above all, whose default skin (`internal/config/styles.go`) these
 * colours follow: aqua tables, a dodgerblue frame, fuchsia number keys,
 * cadetblue body text. Credit where it is due. The one departure is the logo,
 * which is RedBison's own red rather than k9s's orange.
 *
 * Four levels, because a palette that only works on one terminal is a palette
 * that fails on somebody's machine:
 *
 *   truecolor  the exact RGB, when COLORTERM says the terminal can take it
 *   256        a hand-picked xterm index per colour, not a computed match,
 *              because the computed nearest neighbour for cadetblue is a
 *              muddy grey and the point of the scheme is that it is legible
 *   terminal   the 16 ANSI colours, which every terminal maps to the theme
 *              its user chose, so the picker takes on Dracula, Gruvbox,
 *              Solarized or whatever else the shell is already wearing
 *   none       NO_COLOR, a dumb terminal, or output that is not a terminal
 *
 * `terminal` is also what a light background gets, because a palette designed
 * against black is unreadable on white and the terminal's own 16 colours are
 * the only ones guaranteed to suit the background they are drawn on.
 *
 * Styles are composed as whole strings rather than left open, so every piece
 * of text resets itself. A cursor row that forgets to reset paints the rest of
 * the terminal aqua, and that survives the process.
 */

export type Level = 'none' | 'terminal' | '256' | 'true';

type Colour = { rgb: [number, number, number]; xterm: number; ansi: number };

/**
 * The named colours, with what each becomes on a poorer terminal.
 *
 * The `ansi` column is not a nearest-colour match, it is a role decision. The
 * near-whites all become 39, "default foreground", because that is the only
 * code guaranteed to be legible against the terminal's own background: bright
 * white text is invisible on a Solarized-light terminal, which is exactly the
 * case this level exists to serve.
 */
const PALETTE = {
  black: { rgb: [0, 0, 0], xterm: 0, ansi: 30 },
  white: { rgb: [255, 255, 255], xterm: 15, ansi: 39 },
  aqua: { rgb: [0, 255, 255], xterm: 51, ansi: 36 },
  cadetblue: { rgb: [95, 158, 160], xterm: 73, ansi: 39 },
  dodgerblue: { rgb: [30, 144, 255], xterm: 33, ansi: 34 },
  fuchsia: { rgb: [255, 0, 255], xterm: 201, ansi: 35 },
  orange: { rgb: [255, 165, 0], xterm: 214, ansi: 33 },
  lightskyblue: { rgb: [135, 206, 250], xterm: 117, ansi: 94 },
  papayawhip: { rgb: [255, 239, 213], xterm: 223, ansi: 39 },
  seagreen: { rgb: [46, 139, 87], xterm: 29, ansi: 32 },
  palegreen: { rgb: [152, 251, 152], xterm: 120, ansi: 92 },
  greenyellow: { rgb: [173, 255, 47], xterm: 154, ansi: 92 },
  darkorange: { rgb: [255, 140, 0], xterm: 208, ansi: 33 },
  orangered: { rgb: [255, 69, 0], xterm: 202, ansi: 91 },
  lightslategray: { rgb: [119, 136, 153], xterm: 102, ansi: 90 },
  steelblue: { rgb: [70, 130, 180], xterm: 67, ansi: 94 },
  mediumpurple: { rgb: [147, 112, 219], xterm: 141, ansi: 95 },
  /*
   * Not k9s's. This is RedBison's own red, the one the site uses for every
   * link and for the bison, and the logo is the one place the product should
   * look like itself rather than like the program it borrowed its shape from.
   * 124 is the closest xterm index that is still the same red rather than a
   * brown.
   */
  brandred: { rgb: [179, 32, 32], xterm: 124, ansi: 31 },
} satisfies Record<string, Colour>;

export type ColourName = keyof typeof PALETTE;

const RESET = '\x1b[0m';

function fg(name: ColourName, level: Level): string {
  if (level === 'none') return '';
  const c = PALETTE[name];
  if (level === 'true') return `\x1b[38;2;${c.rgb[0]};${c.rgb[1]};${c.rgb[2]}m`;
  if (level === '256') return `\x1b[38;5;${c.xterm}m`;
  return `\x1b[${c.ansi}m`;
}

function bg(name: ColourName, level: Level): string {
  if (level === 'none') return '';
  const c = PALETTE[name];
  if (level === 'true') return `\x1b[48;2;${c.rgb[0]};${c.rgb[1]};${c.rgb[2]}m`;
  if (level === '256') return `\x1b[48;5;${c.xterm}m`;
  // Background is the foreground code plus ten, for the normal set (30→40)
  // and the bright one alike (90→100).
  return `\x1b[${c.ansi + 10}m`;
}

/** Paints a string and closes every attribute it opened. */
export type Paint = (s: string) => string;

const painter = (level: Level, f?: ColourName, b?: ColourName, bold = false): Paint => {
  if (level === 'none') return (s) => s;
  const open = `${bold ? '\x1b[1m' : ''}${f ? fg(f, level) : ''}${b ? bg(b, level) : ''}`;
  return (s) => (s === '' ? s : `${open}${s}${RESET}`);
};

export type Theme = {
  level: Level;
  /** The ASCII logo, in RedBison's red where k9s puts its orange. */
  logo: Paint;
  /** Header labels and their values: white label, orange value. */
  infoKey: Paint;
  infoVal: Paint;
  /** Key hints: dodgerblue letters, fuchsia digits, white words. */
  menuKey: Paint;
  menuNumKey: Paint;
  menuText: Paint;
  /** The frame around the list. */
  border: Paint;
  borderFocus: Paint;
  title: Paint;
  titleHi: Paint;
  counter: Paint;
  filter: Paint;
  /** The list itself. */
  header: Paint;
  row: Paint;
  cursor: Paint;
  /** Where a tool runs. */
  local: Paint;
  server: Paint;
  /** Footer breadcrumbs: black on aqua, the active one orange. */
  crumb: Paint;
  crumbActive: Paint;
  /** Messages. */
  ok: Paint;
  warn: Paint;
  error: Paint;
  dim: Paint;
  /** Documentation and output panes. */
  docKey: Paint;
  docVal: Paint;
  body: Paint;
  prompt: Paint;
};

export function makeTheme(level: Level): Theme {
  const p = (f?: ColourName, b?: ColourName, bold = false) => painter(level, f, b, bold);
  return {
    level,
    logo: p('brandred', undefined, true),
    infoKey: p('white'),
    infoVal: p('orange'),
    menuKey: p('dodgerblue'),
    menuNumKey: p('fuchsia'),
    menuText: p('white'),
    border: p('dodgerblue'),
    borderFocus: p('lightskyblue'),
    title: p('aqua'),
    titleHi: p('fuchsia'),
    counter: p('papayawhip'),
    filter: p('seagreen'),
    header: p('white', undefined, true),
    row: p('aqua'),
    cursor: p('black', 'aqua', true),
    local: p('palegreen'),
    server: p('darkorange'),
    crumb: p('black', 'aqua'),
    crumbActive: p('black', 'orange'),
    ok: p('greenyellow'),
    warn: p('darkorange'),
    error: p('orangered'),
    dim: p('lightslategray'),
    docKey: p('steelblue'),
    docVal: p('papayawhip'),
    body: p('cadetblue'),
    prompt: p('aqua'),
  };
}

/**
 * Whether the terminal is sitting on a light background.
 *
 * `COLORFGBG` is set by several terminals (rxvt, Konsole, some builds of
 * iTerm2) as `foreground;background`, where the background is an ANSI index:
 * 0-6 and 8 are the dark ones, 7 and 9-15 the light. It is the only signal
 * available without asking the terminal and waiting for an answer, which
 * means writing an OSC query to a terminal that may never reply — not
 * something to do on the way up with the user's keyboard in raw mode.
 *
 * Absent the variable the answer is "assume dark", because that is what the
 * overwhelming majority of terminals are, and because the cost of being wrong
 * is a palette the user can override.
 */
export function looksLight(env: NodeJS.ProcessEnv): boolean {
  const pair = env.COLORFGBG;
  if (!pair) return false;
  const background = Number(pair.split(';').pop());
  if (!Number.isFinite(background)) return false;
  return background === 7 || background >= 9;
}

/**
 * What this terminal can take, and what its owner asked for.
 *
 * `REDBISON_THEME` wins over everything but NO_COLOR:
 *
 *   terminal   the 16 ANSI colours, so the picker wears the terminal's own
 *              scheme — Dracula, Gruvbox, Solarized, whatever is set
 *   default    the designed palette, in 24-bit or 256 colours
 *   none       no colour at all
 *
 * NO_COLOR is honoured whatever its value, per no-color.org: the variable's
 * presence is the signal. TERM=dumb and a non-terminal both fall back to
 * plain text, which is also what makes the render tests readable.
 */
export function colourLevel(env: NodeJS.ProcessEnv, isTTY: boolean): Level {
  if (!isTTY) return 'none';
  if (env.NO_COLOR !== undefined) return 'none';

  const asked = (env.REDBISON_THEME ?? '').toLowerCase();
  if (asked === 'none' || asked === 'mono' || asked === 'plain') return 'none';
  if (env.TERM === 'dumb' || !env.TERM) return 'none';
  if (asked === 'terminal' || asked === 'ansi' || asked === 'shell') return 'terminal';

  // A palette designed against black is unreadable on white, and the 16 ANSI
  // colours are the only ones the terminal guarantees suit its own
  // background, so a light terminal gets those unless it asked otherwise.
  if (asked !== 'default' && looksLight(env)) return 'terminal';

  const ct = (env.COLORTERM ?? '').toLowerCase();
  if (ct === 'truecolor' || ct === '24bit') return 'true';
  if (/-truecolor|-direct/.test(env.TERM)) return 'true';
  return '256';
}

const ANSI = /\x1b\[[0-9;]*m/g;

/** The text without its colours, which is what a width calculation needs. */
export function plain(s: string): string {
  return s.replace(ANSI, '');
}
