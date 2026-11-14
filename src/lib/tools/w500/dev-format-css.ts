/**
 * CSS, SCSS and Less: beautify (js-beautify's CSS engine), minify and
 * cascade-safe property sorting.
 *
 * The minifier only removes comments and whitespace that CSS ignores. It does
 * not rewrite values (no colour shortening or 0px to 0), because those
 * rewrites are where minifiers break things, for example `calc(0px + 5%)` becomes invalid as `calc(0 + 5%)`.
 *
 * No React, no "@/" imports: this file is also bundled into the MCP server.
 */
import jsBeautifyLib from 'js-beautify';
import { msg } from '../../msg';

export type CssSyntax = 'css' | 'scss' | 'less';

type CssTokType = 'ws' | 'comment' | 'string' | 'url' | 'punct' | 'word';
interface CssTok {
  type: CssTokType;
  text: string;
}

export class CssSyntaxError extends Error {}

/** Tokenises CSS; `//` line comments are recognised for SCSS and Less only. */
export function tokenizeCss(src: string, syntax: CssSyntax = 'css'): CssTok[] {
  const out: CssTok[] = [];
  let i = 0;
  const lineComments = syntax !== 'css';
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      out.push({ type: 'ws', text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) throw new CssSyntaxError('Unterminated /* comment');
      out.push({ type: 'comment', text: src.slice(i, e + 2) });
      i = e + 2;
      continue;
    }
    if (lineComments && c === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < src.length && src[j] !== '\n') j++;
      out.push({ type: 'comment', text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n') throw new CssSyntaxError('Unterminated string');
        j++;
      }
      if (j >= src.length) throw new CssSyntaxError('Unterminated string');
      out.push({ type: 'string', text: src.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/^url\(/i.test(src.slice(i, i + 4)) && !/["']/.test(src.slice(i + 4).trimStart()[0] ?? '')) {
      const e = src.indexOf(')', i);
      if (e < 0) throw new CssSyntaxError('Unterminated url(');
      out.push({ type: 'url', text: src.slice(i, e + 1) });
      i = e + 1;
      continue;
    }
    if ('{}();:,>+~'.includes(c)) {
      out.push({ type: 'punct', text: c });
      i++;
      continue;
    }
    let j = i;
    while (j < src.length) {
      const d = src[j];
      if (/\s/.test(d) || '{}();:,>+~"\''.includes(d)) break;
      if (d === '/' && (src[j + 1] === '*' || (lineComments && src[j + 1] === '/'))) break;
      if (d === '\\') j++;
      j++;
    }
    if (j === i) j = i + 1;
    out.push({ type: 'word', text: src.slice(i, j) });
    i = j;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tree                                                                */
/* ------------------------------------------------------------------ */

type Node =
  | { kind: 'decl'; prop: string; value: string; comments: string[] }
  | { kind: 'stmt'; text: string } // @import ...;  @include x;  $var: 1; (barrier for sorting)
  | { kind: 'comment'; text: string }
  | { kind: 'block'; prelude: string; children: Node[] };

/** Joins tokens with whitespace collapsed to single spaces. */
const joinToks = (toks: CssTok[]) =>
  toks
    .map((t) => (t.type === 'ws' ? ' ' : t.text))
    .join('')
    .replace(/ +/g, ' ')
    .trim();

function parseTree(src: string, syntax: CssSyntax): Node[] {
  const toks = tokenizeCss(src, syntax);
  let pos = 0;
  const parseBlock = (top: boolean): Node[] => {
    const nodes: Node[] = [];
    let buf: CssTok[] = [];
    let pending: string[] = [];
    let paren = 0;
    const flushStatement = () => {
      const text = joinToks(buf);
      buf = [];
      if (!text) return;
      const colon = findTopColon(text);
      const name = colon > 0 ? text.slice(0, colon).trim() : '';
      const isProp = /^-?[A-Za-z][\w-]*$/.test(name) || /^--[\w-]+$/.test(name);
      if (isProp) {
        nodes.push({ kind: 'decl', prop: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim(), comments: pending });
      } else {
        for (const c of pending) nodes.push({ kind: 'comment', text: c });
        nodes.push({ kind: 'stmt', text });
      }
      pending = [];
    };
    while (pos < toks.length) {
      const t = toks[pos++];
      if (t.type === 'comment') {
        if (buf.every((b) => b.type === 'ws')) {
          buf = [];
          pending.push(t.text);
        } else buf.push(t);
        continue;
      }
      if (t.type === 'punct' && t.text === '(') paren++;
      if (t.type === 'punct' && t.text === ')') paren = Math.max(0, paren - 1);
      if (paren === 0 && t.type === 'punct' && t.text === ';') {
        flushStatement();
        continue;
      }
      if (paren === 0 && t.type === 'punct' && t.text === '{') {
        // SCSS interpolation #{...} stays part of the selector or value.
        const prevTok = buf[buf.length - 1];
        if (prevTok && prevTok.type === 'word' && prevTok.text.endsWith('#')) {
          let depth = 1;
          buf.push(t);
          while (pos < toks.length && depth > 0) {
            const u = toks[pos++];
            if (u.type === 'punct' && u.text === '{') depth++;
            if (u.type === 'punct' && u.text === '}') depth--;
            buf.push(u);
          }
          continue;
        }
        const prelude = joinToks(buf);
        buf = [];
        for (const c of pending) nodes.push({ kind: 'comment', text: c });
        pending = [];
        nodes.push({ kind: 'block', prelude, children: parseBlock(false) });
        continue;
      }
      if (paren === 0 && t.type === 'punct' && t.text === '}') {
        if (top) throw new CssSyntaxError('Unexpected "}" with no matching "{"');
        flushStatement();
        for (const c of pending) nodes.push({ kind: 'comment', text: c });
        return nodes;
      }
      buf.push(t);
    }
    if (!top) throw new CssSyntaxError('Missing "}": a block is not closed');
    flushStatement();
    for (const c of pending) nodes.push({ kind: 'comment', text: c });
    return nodes;
  };
  return parseBlock(true);
}

function findTopColon(text: string): number {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ':' && depth === 0) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Cascade-safe sort                                                   */
/* ------------------------------------------------------------------ */

const unprefix = (p: string) => p.toLowerCase().replace(/^-(webkit|moz|ms|o)-/, '');

/** Longhands that a shorthand resets but whose names do not contain the shorthand's words. */
const EXTRA_COVERS: Record<string, string[]> = {
  font: ['line-height'],
  inset: ['top', 'right', 'bottom', 'left'],
  gap: ['row-gap', 'column-gap'],
  'grid-gap': ['row-gap', 'column-gap', 'grid-row-gap', 'grid-column-gap'],
  'place-items': ['align-items', 'justify-items'],
  'place-content': ['align-content', 'justify-content'],
  'place-self': ['align-self', 'justify-self'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  columns: ['column-width', 'column-count'],
  'grid-area': ['grid-row-start', 'grid-row-end', 'grid-column-start', 'grid-column-end', 'grid-row', 'grid-column'],
  grid: ['grid-template', 'grid-template-rows', 'grid-template-columns', 'grid-template-areas', 'grid-auto-rows', 'grid-auto-columns', 'grid-auto-flow'],
  overflow: ['overflow-x', 'overflow-y'],
  'text-decoration': ['text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-decoration-thickness'],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
  'border-block': ['border-top', 'border-bottom'],
  'border-inline': ['border-left', 'border-right'],
};

/** True when `a`'s words appear in order in `b` and they share the first word (border covers border-top-color). */
function covers(a: string, b: string): boolean {
  if (EXTRA_COVERS[a]?.some((x) => x === b || b.startsWith(x + '-'))) return true;
  const pa = a.split('-');
  const pb = b.split('-');
  if (pa[0] !== pb[0] || pa.length >= pb.length) return false;
  let k = 0;
  for (const w of pb) if (w === pa[k]) k++;
  return k === pa.length;
}

const PHYSICAL_SIDES = ['top', 'right', 'bottom', 'left'];
const BORDER_ASPECTS = ['width', 'style', 'color'];

/**
 * Which physical sides (and, for borders, which of width/style/color) a box
 * property sets. Logical sides (block, inline-start, ...) map to physical
 * sides only through the writing mode, so they count as every side.
 */
function boxReach(p: string): { family: string; sides: string[]; aspects: string[] } | null {
  const m = /^(margin|padding|scroll-margin|scroll-padding|border|inset)(?:-(top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-(width|style|color))?$/.exec(p)
    ?? /^()(top|right|bottom|left)()$/.exec(p);
  if (!m) return null;
  const family = m[1] || 'inset';
  if (m[3] && family !== 'border') return null;
  const side = m[2];
  const sides = !side || side === 'block' || side === 'inline' ? PHYSICAL_SIDES : [side];
  const logical = side === 'block' || side === 'inline' || /-(block|inline)/.test(p);
  return { family, sides: logical ? PHYSICAL_SIDES : sides, aspects: family === 'border' ? (m[3] ? [m[3]] : BORDER_ASPECTS) : [''] };
}

/** width/height and their logical inline-size/block-size forms (with min- and max- variants). */
function sizeReach(p: string): { family: string; axes: string[] } | null {
  const m = /^(min-|max-)?(width|height|inline-size|block-size)$/.exec(p);
  if (!m) return null;
  return { family: m[1] ?? '', axes: m[2] === 'width' ? ['x'] : m[2] === 'height' ? ['y'] : ['x', 'y'] };
}

/** Declarations whose relative order matters for the cascade. */
export function propertiesConflict(p: string, q: string): boolean {
  const a = unprefix(p);
  const b = unprefix(q);
  if (p.startsWith('--') || q.startsWith('--')) return p === q;
  if (a === b || a === 'all' || b === 'all') return true;
  if (covers(a, b) || covers(b, a)) return true;
  // border-top vs border-color both set border-top-color; margin-left vs margin-inline-start can be the same side.
  const ra = boxReach(a);
  const rb = boxReach(b);
  if (ra && rb && ra.family === rb.family) return ra.sides.some((x) => rb.sides.includes(x)) && ra.aspects.some((x) => rb.aspects.includes(x));
  const sa = sizeReach(a);
  const sb = sizeReach(b);
  if (sa && sb && sa.family === sb.family) return sa.axes.some((x) => sb.axes.includes(x));
  return false;
}

const sortKey = (p: string) => {
  const u = unprefix(p);
  return `${u}\u0000${p.toLowerCase() === u ? '1' : '0'}${p.toLowerCase()}`;
};

/**
 * Sorts declarations alphabetically (vendor-prefixed copies just before the
 * standard property) while keeping any pair that overrides each other, such
 * as `border-top` then `border`, in its original order.
 */
export function sortDeclarations<T extends { prop: string }>(decls: T[]): T[] {
  const n = decls.length;
  const placed = new Array<boolean>(n).fill(false);
  const out: T[] = [];
  for (let step = 0; step < n; step++) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (placed[i]) continue;
      let blocked = false;
      for (let j = 0; j < i; j++) {
        if (!placed[j] && propertiesConflict(decls[j].prop, decls[i].prop)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (best < 0 || sortKey(decls[i].prop) < sortKey(decls[best].prop)) best = i;
    }
    placed[best] = true;
    out.push(decls[best]);
  }
  return out;
}

function sortTree(nodes: Node[]): { nodes: Node[]; moved: number } {
  let moved = 0;
  const out: Node[] = [];
  let run: Extract<Node, { kind: 'decl' }>[] = [];
  const flush = () => {
    const sorted = sortDeclarations(run);
    sorted.forEach((d, k) => {
      if (d !== run[k]) moved++;
    });
    out.push(...sorted);
    run = [];
  };
  for (const n of nodes) {
    if (n.kind === 'decl' && !n.prop.startsWith('--')) {
      run.push(n);
      continue;
    }
    flush();
    if (n.kind === 'block') {
      const r = sortTree(n.children);
      moved += r.moved;
      out.push({ ...n, children: r.nodes });
    } else out.push(n);
  }
  flush();
  return { nodes: out, moved };
}

function serialize(nodes: Node[]): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case 'decl':
          return `${n.comments.join('\n')}${n.comments.length ? '\n' : ''}${n.prop}: ${n.value};`;
        case 'stmt':
          return `${n.text};`;
        case 'comment':
          return n.text;
        case 'block':
          return `${n.prelude} {\n${serialize(n.children)}\n}`;
      }
    })
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* Minify                                                              */
/* ------------------------------------------------------------------ */

export interface CssMinifyOptions {
  syntax?: CssSyntax;
  /** Keep /*! comments (licence headers). */
  keepLicense?: boolean;
}

/** Compacts a prelude or value: single spaces, none around , { } ; and selector combinators at depth 0. */
function compactPart(toks: CssTok[], isSelector: boolean): string {
  let out = '';
  let depth = 0;
  let bracket = 0;
  const parts: CssTok[] = [];
  const nameEnd = /[\w\-\u0080-\uffff]$/;
  const nameStart = /^[\w\-\u0080-\uffff]/;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.type === 'comment') {
      // "1px/**/2px" is two tokens; dropping the comment must not glue them into "1px2px".
      const prev = parts[parts.length - 1];
      const next = toks.slice(k + 1).find((x) => x.type !== 'comment');
      if (prev && next && prev.type !== 'ws' && next.type !== 'ws' && nameEnd.test(prev.text) && nameStart.test(next.text)) parts.push({ type: 'ws', text: ' ' });
      continue;
    }
    if (t.type === 'ws') {
      if (parts.length && parts[parts.length - 1].type !== 'ws') parts.push({ type: 'ws', text: ' ' });
      continue;
    }
    parts.push(t);
  }
  while (parts.length && parts[parts.length - 1].type === 'ws') parts.pop();
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (t.type === 'punct' && t.text === '(') depth++;
    if (t.type === 'punct' && t.text === ')') depth--;
    if (t.type === 'word') {
      bracket += (t.text.match(/\[/g) ?? []).length - (t.text.match(/\]/g) ?? []).length;
    }
    if (t.type === 'ws') {
      const prev = parts[i - 1];
      const next = parts[i + 1];
      const tight = (x: CssTok | undefined) => {
        if (!x || x.type !== 'punct') return false;
        if (x.text === ',') return true;
        if (x.text === '(' ) return false;
        if (x.text === ')') return false;
        if (x.text === ':') return false;
        if (isSelector && depth === 0 && bracket === 0 && (x.text === '>' || x.text === '+' || x.text === '~')) return true;
        return false;
      };
      if (tight(prev) || tight(next)) continue;
      if (prev?.type === 'punct' && prev.text === '(' ) continue;
      if (next?.type === 'punct' && next.text === ')') continue;
      if (!isSelector && prev?.type === 'punct' && prev.text === ':' && depth > 0) continue;
      if (next?.type === 'word' && next.text.startsWith('!')) continue;
      out += ' ';
      continue;
    }
    out += t.text;
  }
  return out;
}

export function minifyCss(src: string, opts: CssMinifyOptions = {}): string {
  const syntax = opts.syntax ?? 'css';
  const keepLicense = opts.keepLicense ?? true;
  const toks = tokenizeCss(src, syntax);
  let out = '';
  let buf: CssTok[] = [];
  let paren = 0;
  const license: string[] = [];
  const openStack: { start: number; isAt: boolean }[] = [];
  const emitDecl = (terminator: string) => {
    const meaningful = buf.filter((t) => t.type !== 'ws' && t.type !== 'comment');
    if (!meaningful.length) {
      buf = [];
      if (terminator === '}') out += '}';
      return;
    }
    // Split at the first top-level colon for declarations; at-rules like @import keep their spacing.
    const first = meaningful[0];
    let colonIdx = -1;
    let depth = 0;
    for (let k = 0; k < buf.length; k++) {
      const t = buf[k];
      if (t.type === 'punct' && t.text === '(') depth++;
      if (t.type === 'punct' && t.text === ')') depth--;
      if (depth === 0 && t.type === 'punct' && t.text === ':') {
        colonIdx = k;
        break;
      }
    }
    if (first.type === 'word' && !first.text.startsWith('@') && colonIdx >= 0) {
      const prop = compactPart(buf.slice(0, colonIdx), false);
      const value = compactPart(buf.slice(colonIdx + 1), false);
      out += `${prop}:${value === '' ? ' ' : value}`;
    } else {
      out += compactPart(buf, false);
    }
    buf = [];
    out += terminator;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === 'comment') {
      if (keepLicense && t.text.startsWith('/*!')) {
        if (buf.some((b) => b.type !== 'ws')) license.push(t.text);
        else out += t.text;
      } else if (buf.some((b) => b.type !== 'ws' && b.type !== 'comment')) buf.push(t); // compactPart decides if it separates tokens
      continue;
    }
    if (t.type === 'punct' && t.text === '(') paren++;
    if (t.type === 'punct' && t.text === ')') paren = Math.max(0, paren - 1);
    if (paren === 0 && t.type === 'punct' && t.text === '{') {
      const prev = buf.filter((b) => b.type !== 'ws' && b.type !== 'comment').pop();
      if (prev && prev.type === 'word' && prev.text.endsWith('#')) {
        // #{interpolation}: copy through to the matching brace.
        let depth = 1;
        buf.push(t);
        while (++i < toks.length && depth > 0) {
          const u = toks[i];
          if (u.type === 'punct' && u.text === '{') depth++;
          if (u.type === 'punct' && u.text === '}') depth--;
          buf.push(u);
        }
        i--;
        continue;
      }
      const isAt = buf.find((b) => b.type !== 'ws' && b.type !== 'comment')?.text.startsWith('@') ?? false;
      openStack.push({ start: out.length, isAt });
      out += compactPart(buf, !isAt) + '{';
      buf = [];
      continue;
    }
    if (paren === 0 && t.type === 'punct' && (t.text === ';' || t.text === '}')) {
      if (t.text === ';') {
        emitDecl(';');
      } else {
        emitDecl('');
        const open = openStack.pop();
        // Drop empty rules such as "a{}"; empty at-rules are kept.
        if (open && !open.isAt && out.endsWith('{')) out = out.slice(0, open.start);
        else out = out.replace(/;$/, '') + '}';
      }
      continue;
    }
    buf.push(t);
  }
  if (buf.some((b) => b.type !== 'ws' && b.type !== 'comment')) emitDecl('');
  return license.join('\n') + (license.length ? '\n' : '') + out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface CssFormatOptions {
  syntax?: CssSyntax;
  mode?: 'beautify' | 'minify';
  sort?: boolean;
  indentSize?: number; // 0 = tab
  /** Put each selector of a comma list on its own line. */
  selectorPerLine?: boolean;
  blankLineBetweenRules?: boolean;
  keepLicense?: boolean;
}

export interface CssFormatResult {
  code: string;
  warnings: string[];
  /** Declarations that changed position when sorting. */
  moved: number;
}

export function formatCss(src: string, opts: CssFormatOptions = {}): CssFormatResult {
  const syntax = opts.syntax ?? 'css';
  const warnings: string[] = [];
  let text = src;
  let moved = 0;
  if (opts.sort) {
    const tree = parseTree(src, syntax);
    const r = sortTree(tree);
    moved = r.moved;
    text = serialize(r.nodes);
  } else {
    // Throws CssSyntaxError for unbalanced braces or unterminated strings, so errors surface the same way.
    parseTree(src, syntax);
  }
  if (opts.mode === 'minify') {
    return { code: minifyCss(text, { syntax, keepLicense: opts.keepLicense }), warnings, moved };
  }
  const indentSize = opts.indentSize ?? 2;
  const code = jsBeautifyLib.css(text, {
    indent_size: indentSize === 0 ? 1 : indentSize,
    indent_char: indentSize === 0 ? '\t' : ' ',
    indent_with_tabs: indentSize === 0,
    selector_separator_newline: opts.selectorPerLine ?? true,
    newline_between_rules: opts.blankLineBetweenRules ?? true,
    space_around_combinator: true,
    end_with_newline: true,
    preserve_newlines: false,
  });
  try {
    if (minifyCss(code, { syntax, keepLicense: false }) !== minifyCss(text, { syntax, keepLicense: false })) {
      warnings.push(msg('The formatted stylesheet differs from the input after whitespace is removed. Compare the output before using it.'));
    }
  } catch {
    /* comparison is best effort */
  }
  return { code, warnings, moved };
}
