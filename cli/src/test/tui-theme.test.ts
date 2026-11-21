/**
 * The palette, and the four terminals it has to work on.
 *
 * The default colours follow k9s's own default skin, read out of its
 * `internal/config/styles.go` rather than remembered, so they are pinned
 * here: if someone "tidies" aqua into cyan the scheme stops being the one
 * it claims to be. The rest is about not colouring things that cannot take
 * it — a pipe, NO_COLOR, TERM=dumb — because escape codes in a redirected
 * file are worse than no colour at all, and about the `terminal` level,
 * whose whole job is to be legible on a background it cannot see.
 */
import { describe, it, expect } from 'vitest';
import { colourLevel, looksLight, makeTheme, plain } from '../tui/theme';

describe('deciding how much colour the terminal can take', () => {
  it('none of it when the output is not a terminal', () => {
    expect(colourLevel({ TERM: 'xterm-256color', COLORTERM: 'truecolor' }, false)).toBe('none');
  });

  it('none of it when NO_COLOR is set, whatever its value', () => {
    expect(colourLevel({ TERM: 'xterm', NO_COLOR: '' }, true)).toBe('none');
    expect(colourLevel({ TERM: 'xterm', NO_COLOR: '0' }, true)).toBe('none');
  });

  it('none of it on a dumb terminal or with no TERM at all', () => {
    expect(colourLevel({ TERM: 'dumb' }, true)).toBe('none');
    expect(colourLevel({}, true)).toBe('none');
  });

  it('24-bit when the terminal says so, 256 otherwise', () => {
    expect(colourLevel({ TERM: 'xterm-256color', COLORTERM: 'truecolor' }, true)).toBe('true');
    expect(colourLevel({ TERM: 'xterm-256color', COLORTERM: '24bit' }, true)).toBe('true');
    expect(colourLevel({ TERM: 'xterm-truecolor' }, true)).toBe('true');
    expect(colourLevel({ TERM: 'xterm-256color' }, true)).toBe('256');
    expect(colourLevel({ TERM: 'screen' }, true)).toBe('256');
  });
});

describe('wearing the terminal\'s own scheme', () => {
  const term = { TERM: 'xterm-256color', COLORTERM: 'truecolor' };

  it('is what REDBISON_THEME=terminal asks for', () => {
    for (const asked of ['terminal', 'ansi', 'shell', 'TERMINAL']) {
      expect(colourLevel({ ...term, REDBISON_THEME: asked }, true)).toBe('terminal');
    }
  });

  it('uses only the sixteen ANSI codes, which the terminal themes itself', () => {
    const t = makeTheme('terminal');
    // No 38;2 and no 38;5: those pick a colour the user's scheme cannot
    // touch, which is the whole thing this level exists to avoid.
    for (const paint of [t.row, t.logo, t.border, t.body, t.local, t.server, t.cursor, t.crumb]) {
      expect(paint('x')).not.toMatch(/38;[25]/);
      expect(paint('x')).toMatch(/\x1b\[(?:1m\x1b\[)?(?:3|4|9|10)\d/);
    }
    expect(t.row('x')).toBe('\x1b[36mx\x1b[0m');
    expect(t.logo('x')).toBe('\x1b[1m\x1b[31mx\x1b[0m');
    expect(t.cursor('x')).toBe('\x1b[1m\x1b[30m\x1b[46mx\x1b[0m');
  });

  it('never paints near-white text, which a light terminal would swallow', () => {
    /*
     * This is the bug the level was added to fix: on Solarized light, bright
     * white labels on cream were invisible. 39 is "default foreground", the
     * one colour the terminal guarantees against its own background.
     */
    const t = makeTheme('terminal');
    for (const paint of [t.infoKey, t.header, t.body, t.docVal, t.counter, t.menuText]) {
      expect(paint('x')).toMatch(/\x1b\[(?:1m\x1b\[)?39m/);
    }
  });

  it('reads a light background out of COLORFGBG', () => {
    expect(looksLight({ COLORFGBG: '0;15' })).toBe(true);
    expect(looksLight({ COLORFGBG: '11;7' })).toBe(true);
    expect(looksLight({ COLORFGBG: '15;0' })).toBe(false);
    expect(looksLight({ COLORFGBG: '7;default' })).toBe(false);
    expect(looksLight({})).toBe(false);
  });

  it('is what a light terminal gets without asking', () => {
    expect(colourLevel({ ...term, COLORFGBG: '0;15' }, true)).toBe('terminal');
    // Unless it asked for the designed palette anyway.
    expect(colourLevel({ ...term, COLORFGBG: '0;15', REDBISON_THEME: 'default' }, true)).toBe('true');
  });

  it('still answers to NO_COLOR and to none', () => {
    expect(colourLevel({ ...term, REDBISON_THEME: 'terminal', NO_COLOR: '1' }, true)).toBe('none');
    expect(colourLevel({ ...term, REDBISON_THEME: 'none' }, true)).toBe('none');
    expect(colourLevel({ ...term, COLORFGBG: '0;15' }, false)).toBe('none');
  });
});

describe('the default palette', () => {
  it('is the default skin, colour for colour', () => {
    const t = makeTheme('true');
    // aqua table rows, a black-on-aqua cursor, a dodgerblue frame, fuchsia
    // number keys: k9s newTable/newBorder/newMenu. The logo is the one
    // deliberate departure — k9s paints its own orange, this paints the
    // product's red.
    expect(t.row('x')).toContain('38;2;0;255;255');
    expect(t.cursor('x')).toContain('48;2;0;255;255');
    expect(t.cursor('x')).toContain('38;2;0;0;0');
    expect(t.border('x')).toContain('38;2;30;144;255');
    expect(t.menuNumKey('x')).toContain('38;2;255;0;255');
    expect(t.logo('x')).toContain('38;2;179;32;32');
    expect(t.crumb('x')).toContain('48;2;0;255;255');
    expect(t.body('x')).toContain('38;2;95;158;160');
  });

  it('falls back to picked 256-colour indexes, not computed ones', () => {
    const t = makeTheme('256');
    expect(t.row('x')).toBe('\x1b[38;5;51mx\x1b[0m');
    expect(t.menuNumKey('x')).toBe('\x1b[38;5;201mx\x1b[0m');
    expect(t.logo('x')).toBe('\x1b[1m\x1b[38;5;124mx\x1b[0m');
  });

  it('paints nothing at all when there is no colour', () => {
    const t = makeTheme('none');
    for (const paint of [t.row, t.cursor, t.logo, t.border, t.error]) {
      expect(paint('hello')).toBe('hello');
    }
  });

  it('closes every attribute it opens', () => {
    const t = makeTheme('true');
    for (const paint of [t.row, t.cursor, t.logo, t.crumbActive, t.error, t.body]) {
      expect(paint('hello').endsWith('\x1b[0m')).toBe(true);
      expect(plain(paint('hello'))).toBe('hello');
    }
  });

  it('leaves an empty string empty, so padding never carries a colour', () => {
    const t = makeTheme('true');
    expect(t.cursor('')).toBe('');
  });
});

describe('measuring a painted string', () => {
  it('counts what the terminal shows, not what it sends', () => {
    const t = makeTheme('true');
    expect(plain(t.row('abc')).length).toBe(3);
    expect(plain(`${t.border('│')}${t.cursor('ab')}${t.border('│')}`).length).toBe(4);
  });
});
