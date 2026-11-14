/**
 * JavaScript and TypeScript beautify / minify.
 *
 * Beautify uses js-beautify (the same engine as beautifier.io). Minify is a
 * token-level whitespace and comment remover built on the lexer below: it never
 * renames, reorders or rewrites code, and it keeps a line break wherever
 * removing it could change automatic semicolon insertion. Both directions are
 * checked by re-lexing the output and comparing tokens with the input.
 *
 * No React, no "@/" imports: this file is also bundled into the MCP server.
 */
import jsBeautifyLib from 'js-beautify';
import { msg } from '../../msg';

export type JsTokenType = 'ident' | 'num' | 'str' | 'template' | 'regex' | 'punct' | 'comment' | 'hashbang';

export interface JsToken {
  type: JsTokenType;
  text: string;
  start: number;
  end: number;
  /** Whitespace (spaces, tabs, line breaks) between the previous token and this one. */
  gap: string;
}

export class JsLexError extends Error {
  line: number;
  column: number;
  constructor(message: string, src: string, pos: number) {
    const before = src.slice(0, pos);
    const line = before.split(/\r\n|\r|\n|\u2028|\u2029/).length;
    const column = pos - Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) ;
    super(`${message} (line ${line}, column ${column})`);
    this.line = line;
    this.column = column;
  }
}

const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=', '.', '@',
];
const PUNCT_SET = new Set(PUNCTUATORS);

/** Keywords after which a "/" starts a regular expression, not a division. */
const REGEX_AFTER_KEYWORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

const isWs = (c: string) => c === ' ' || c === '\t' || c === '\v' || c === '\f' || c === '\u00a0' || c === '\ufeff' || /[\u1680\u2000-\u200a\u202f\u205f\u3000]/.test(c);
const isNl = (c: string) => c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';
const isIdStart = (c: string) => /[A-Za-z_$\\]/.test(c) || c.charCodeAt(0) > 0x7f;
const isIdPart = (c: string) => /[\w$\\]/.test(c) || c.charCodeAt(0) > 0x7f;
const isDigit = (c: string) => c >= '0' && c <= '9';

/** ")" tokens that close the condition of if/while/for/with, after which "/" starts a regex: if (x) /re/.test(y). */
const controlParens = new WeakSet<JsToken>();
const CONTROL_KEYWORDS = new Set(['if', 'while', 'for', 'with']);

function regexAllowedAfter(prev: JsToken | undefined): boolean {
  if (!prev) return true;
  if (controlParens.has(prev)) return true;
  switch (prev.type) {
    case 'num':
    case 'str':
    case 'template':
    case 'regex':
      return false;
    case 'ident':
      return REGEX_AFTER_KEYWORD.has(prev.text);
    case 'punct':
      return !(prev.text === ')' || prev.text === ']' || prev.text === '++' || prev.text === '--');
    default:
      return true;
  }
}

/** Reads a quoted string starting at `pos` (the opening quote). Returns the end index. */
function readString(src: string, pos: number): number {
  const q = src[pos];
  let i = pos + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += src[i + 1] === '\r' && src[i + 2] === '\n' ? 3 : 2;
      continue;
    }
    if (c === q) return i + 1;
    if (c === '\n' || c === '\r') break;
    i++;
  }
  throw new JsLexError('Unterminated string literal', src, pos);
}

/** Reads a template literal including nested ${ } expressions. Returns the end index. */
function readTemplate(src: string, pos: number): number {
  let i = pos + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') return i + 1;
    if (c === '$' && src[i + 1] === '{') {
      i = skipExpression(src, i + 2);
      continue;
    }
    i++;
  }
  throw new JsLexError('Unterminated template literal', src, pos);
}

/** Skips a ${ ... } expression body; `pos` is just after "${". Returns the index after the closing brace. */
function skipExpression(src: string, pos: number): number {
  let depth = 0;
  let i = pos;
  let prev: JsToken | undefined;
  while (i < src.length) {
    const c = src[i];
    if (isWs(c) || isNl(c)) {
      i++;
      continue;
    }
    if (c === '}' && depth === 0) return i + 1;
    const tok = lexOne(src, i, prev);
    if (tok.type === 'punct') {
      if (tok.text === '{') depth++;
      else if (tok.text === '}') depth--;
    }
    if (tok.type !== 'comment') prev = tok;
    i = tok.end;
  }
  throw new JsLexError('Unterminated template expression', src, pos);
}

function readRegex(src: string, pos: number): number {
  let i = pos + 1;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (isNl(c)) break;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      i++;
      while (i < src.length && isIdPart(src[i])) i++;
      return i;
    }
    i++;
  }
  throw new JsLexError('Unterminated regular expression', src, pos);
}

const NUM_RE = /^(?:0[xX][\da-fA-F_]+n?|0[oO][0-7_]+n?|0[bB][01_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?)/;

/** Lexes one token at `pos` (which must not be whitespace). */
function lexOne(src: string, pos: number, prev: JsToken | undefined): JsToken {
  const c = src[pos];
  const mk = (type: JsTokenType, end: number): JsToken => ({ type, text: src.slice(pos, end), start: pos, end, gap: '' });
  if (c === '/' && src[pos + 1] === '/') {
    let i = pos + 2;
    while (i < src.length && !isNl(src[i])) i++;
    return mk('comment', i);
  }
  if (c === '/' && src[pos + 1] === '*') {
    const e = src.indexOf('*/', pos + 2);
    if (e < 0) throw new JsLexError('Unterminated block comment', src, pos);
    return mk('comment', e + 2);
  }
  if (c === '"' || c === "'") return mk('str', readString(src, pos));
  if (c === '`') return mk('template', readTemplate(src, pos));
  if (isDigit(c) || (c === '.' && isDigit(src[pos + 1] ?? ''))) {
    const m = NUM_RE.exec(src.slice(pos, pos + 400));
    if (m) return mk('num', pos + m[0].length);
  }
  if (isIdStart(c) || (c === '#' && isIdStart(src[pos + 1] ?? ''))) {
    let i = pos + 1;
    while (i < src.length && isIdPart(src[i])) i++;
    return mk('ident', i);
  }
  if (c === '/' && regexAllowedAfter(prev)) return mk('regex', readRegex(src, pos));
  for (const p of PUNCTUATORS) {
    if (src.startsWith(p, pos)) {
      // "a?.5:b" is a conditional, not optional chaining.
      if (p === '?.' && isDigit(src[pos + 2] ?? '')) continue;
      return mk('punct', pos + p.length);
    }
  }
  throw new JsLexError(`Unexpected character "${c}"`, src, pos);
}

/** Splits JavaScript or TypeScript source into tokens. Throws JsLexError on unterminated literals. */
export function tokenizeJs(src: string): JsToken[] {
  const out: JsToken[] = [];
  let i = 0;
  let prev: JsToken | undefined;
  if (src.startsWith('#!')) {
    let e = 2;
    while (e < src.length && !isNl(src[e])) e++;
    out.push({ type: 'hashbang', text: src.slice(0, e), start: 0, end: e, gap: '' });
    i = e;
  }
  let gapStart = i;
  // For each open "(", whether it starts a control-statement condition.
  const parens: boolean[] = [];
  let beforePrev: JsToken | undefined;
  while (i < src.length) {
    const c = src[i];
    if (isWs(c) || isNl(c)) {
      i++;
      continue;
    }
    const tok = lexOne(src, i, prev);
    tok.gap = src.slice(gapStart, i);
    out.push(tok);
    if (tok.type === 'punct' && tok.text === '(') {
      const keyword = (t: JsToken | undefined) => t?.type === 'ident' && CONTROL_KEYWORDS.has(t.text);
      const notMember = (t: JsToken | undefined) => !(t?.type === 'punct' && (t.text === '.' || t.text === '?.'));
      // "for await (" counts too; "obj.if(" is a method call.
      parens.push((keyword(prev) && notMember(beforePrev)) || (prev?.type === 'ident' && prev.text === 'await' && keyword(beforePrev)));
    } else if (tok.type === 'punct' && tok.text === ')') {
      if (parens.pop()) controlParens.add(tok);
    }
    if (tok.type !== 'comment') {
      beforePrev = prev;
      prev = tok;
    }
    i = tok.end;
    gapStart = i;
  }
  return out;
}

const hasNl = (s: string) => /[\n\r\u2028\u2029]/.test(s);

/* ------------------------------------------------------------------ */
/* Minify                                                              */
/* ------------------------------------------------------------------ */

/** Punctuators after which a line break can never end a statement. */
const JOIN_AFTER = new Set([
  '{', '(', '[', ',', ';', ':', '?', '.', '?.', '...', '=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=',
  '==', '!=', '===', '!==', '<', '>', '<=', '>=', '<<', '>>', '>>>', '+', '-', '*', '/', '%', '**', '&', '|', '^', '!', '~', '&&', '||', '??', '=>',
]);
const JOIN_AFTER_KEYWORD = new Set(['else', 'typeof', 'void', 'delete', 'new', 'instanceof', 'in', 'case', 'var', 'const', 'extends', 'do']);
/** Tokens that can only continue the previous expression, so no semicolon is ever inserted before them. */
const JOIN_BEFORE = new Set([
  ')', ']', '}', ',', ';', ':', '.', '?.', '?', '=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=',
  '==', '!=', '===', '!==', '<', '>', '<=', '>=', '<<', '>>', '>>>', '*', '/', '%', '**', '&', '|', '^', '&&', '||', '??',
]);
const NEVER_JOIN_AFTER = new Set(['return', 'throw', 'break', 'continue', 'yield', 'async', 'let', 'get', 'set', 'static']);

function lineBreakRemovable(prev: JsToken, next: JsToken): boolean {
  if (prev.type === 'comment' || next.type === 'comment' || prev.type === 'hashbang') return false;
  if (prev.type === 'ident' && NEVER_JOIN_AFTER.has(prev.text)) return false;
  if (prev.type === 'punct' && (prev.text === '++' || prev.text === '--')) return false;
  if (prev.type === 'punct' && prev.text === '}') {
    // After a block or a function expression body, only closing tokens are safe.
    if (next.type === 'punct' && ['}', ')', ']', ',', ';', ':'].includes(next.text)) return true;
    return next.type === 'ident' && ['else', 'catch', 'finally', 'while'].includes(next.text);
  }
  if (prev.type === 'punct' && JOIN_AFTER.has(prev.text)) return true;
  if (prev.type === 'ident' && JOIN_AFTER_KEYWORD.has(prev.text)) return true;
  if (next.type === 'punct' && JOIN_BEFORE.has(next.text)) return true;
  // "a\n(b)", "a\n[0]" and tagged templates never get a semicolon: the grammar allows them to continue.
  if (next.type === 'punct' && (next.text === '(' || next.text === '[') && prev.type !== 'punct') return true;
  if (next.type === 'punct' && (next.text === '(' || next.text === '[') && (prev.text === ')' || prev.text === ']')) return true;
  return false;
}

const wordLike = (ch: string) => /[\w$\\]/.test(ch) || ch.charCodeAt(0) > 0x7f;

/** True when writing `a` and `b` with nothing between them would lex differently. */
function needsSpace(a: JsToken, b: JsToken): boolean {
  const last = a.text[a.text.length - 1];
  const first = b.text[0];
  if (wordLike(last) && (wordLike(first) || (b.type === 'ident' && first === '#'))) return true;
  if (a.type === 'num' && first === '.') return true;
  if (a.type === 'punct' && b.type === 'punct') {
    for (let k = 1; k <= b.text.length; k++) if (PUNCT_SET.has(a.text + b.text.slice(0, k)) && (a.text + b.text.slice(0, k)).length > a.text.length) return true;
    if (a.text === '<' && first === '!') return true;
    if (a.text === '--' && first === '>') return true;
  }
  if (a.type === 'punct' && (b.type === 'num' || b.type === 'regex') && PUNCT_SET.has(a.text + first)) return true;
  if (last === '/' && (first === '/' || first === '*')) return true;
  if ((a.type === 'punct' || a.type === 'regex') && last === '/' && b.type === 'regex') return true;
  return false;
}

export interface JsMinifyOptions {
  /** Keep comments that start with /*! or contain @license / @preserve. */
  keepLicense?: boolean;
}

export interface MinifyStats {
  inputBytes: number;
  outputBytes: number;
  savedPercent: number;
}

const utf8Len = (s: string) => new TextEncoder().encode(s).length;

export function sizeStats(input: string, output: string): MinifyStats {
  const a = utf8Len(input);
  const b = utf8Len(output);
  return { inputBytes: a, outputBytes: b, savedPercent: a === 0 ? 0 : Math.round(((a - b) / a) * 1000) / 10 };
}

const isLicense = (t: JsToken) => t.type === 'comment' && (t.text.startsWith('/*!') || /@license|@preserve/.test(t.text));

/** Removes comments and whitespace without changing any token. */
export function minifyJs(src: string, opts: JsMinifyOptions = {}): { code: string; stats: MinifyStats } {
  const keepLicense = opts.keepLicense ?? true;
  const tokens = tokenizeJs(src).filter((t) => t.type !== 'comment' || (keepLicense && isLicense(t)));
  let out = '';
  let prev: JsToken | undefined;
  // Track whether any line break existed since `prev` (comments that were removed may have held one).
  const all = tokenizeJs(src);
  const nlBefore = new Map<number, boolean>();
  let pendingNl = false;
  for (const t of all) {
    if (hasNl(t.gap)) pendingNl = true;
    if (t.type === 'comment' && !(keepLicense && isLicense(t))) {
      if (t.text.startsWith('//') || hasNl(t.text)) pendingNl = true;
      continue;
    }
    nlBefore.set(t.start, pendingNl);
    pendingNl = false;
  }
  for (const t of tokens) {
    if (!prev) {
      out += t.text;
      prev = t;
      continue;
    }
    const nl = nlBefore.get(t.start) ?? false;
    if (prev.type === 'comment' && prev.text.startsWith('//')) out += '\n';
    else if (nl && !lineBreakRemovable(prev, t)) out += '\n';
    else if (prev.type === 'comment' && t.type !== 'comment' && prev.text.startsWith('/*!')) out += '\n';
    else if (needsSpace(prev, t)) out += ' ';
    out += t.text;
    prev = t;
  }
  return { code: out, stats: sizeStats(src, out) };
}

/* ------------------------------------------------------------------ */
/* Beautify                                                            */
/* ------------------------------------------------------------------ */

export type JsLanguage = 'javascript' | 'typescript' | 'jsx';
export type BraceStyle = 'collapse' | 'expand' | 'end-expand' | 'collapse,preserve-inline';

export interface JsBeautifyOptions {
  language?: JsLanguage;
  /** Spaces per level, or 0 for tabs. */
  indentSize?: number;
  braceStyle?: BraceStyle;
  /** Keep up to this many blank lines from the input (0 removes them). */
  maxBlankLines?: number;
  /** Wrap lines longer than this (0 = never). */
  wrapLineLength?: number;
  /** Put each chained method call (.then().catch()) on its own line. */
  breakChainedMethods?: boolean;
  endWithNewline?: boolean;
}

export interface BeautifyResult {
  code: string;
  warnings: string[];
}

const significant = (toks: JsToken[]) => toks.filter((t) => t.type !== 'comment');

/** Compares the code tokens (comments ignored) of two sources. Returns the first differing index or -1. */
export function firstTokenDifference(a: string, b: string): number {
  const ta = significant(tokenizeJs(a));
  const tb = significant(tokenizeJs(b));
  const n = Math.max(ta.length, tb.length);
  for (let i = 0; i < n; i++) if (ta[i]?.text !== tb[i]?.text) return i;
  return -1;
}

/**
 * TypeScript fix-ups around js-beautify, which was written for JavaScript:
 * `Promise<T>=>` is split as `>=` + `>` and would print as `>= >`, so it is
 * pre-split into `> =>`; afterwards the spaces js-beautify puts around generic
 * angle brackets and optional `?:` markers are removed wherever the input had
 * none, and `;`-separated members of interface and type literals go on their own lines.
 */
function preSplitArrows(src: string): string {
  const toks = tokenizeJs(src);
  let out = '';
  let last = 0;
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i];
    const n = toks[i + 1];
    if (t.type === 'punct' && /^>+=$/.test(t.text) && n.type === 'punct' && n.text.startsWith('>') && n.gap === '') {
      out += src.slice(last, t.start) + t.text.slice(0, -1) + ' =';
      last = t.end;
    }
  }
  return out + src.slice(last);
}

function tightenTypeScript(input: string, output: string): string {
  let ti: JsToken[];
  let to: JsToken[];
  try {
    ti = tokenizeJs(input);
    to = tokenizeJs(output);
  } catch {
    return output;
  }
  if (ti.length !== to.length) return output;
  for (let i = 0; i < ti.length; i++) if (ti[i].type !== to[i].type || (ti[i].type !== 'comment' && ti[i].text !== to[i].text)) return output;
  const angle = (t: JsToken) => t.type === 'punct' && /^(<|>+)$/.test(t.text);
  const gaps = to.map((t) => t.gap);
  for (let i = 1; i < to.length; i++) {
    const a = to[i - 1];
    const b = to[i];
    const tight = ti[i].gap === '';
    if (!tight || hasNl(gaps[i]) || a.type === 'comment' || b.type === 'comment') continue;
    const isOptional = a.text === '?' && (b.text === ':' || b.text === '(');
    const isNonNull = a.text === '!' && b.type === 'punct' && ['.', ')', ';', ',', ']', '['].includes(b.text);
    const n = to[i + 1];
    const beforeOptional = b.text === '?' && b.type === 'punct' && n !== undefined && (n.text === ':' || n.text === '(') && ti[i + 1].gap === '' && a.type === 'ident';
    if (angle(a) || angle(b) || isOptional || isNonNull || beforeOptional) gaps[i] = '';
  }
  // Split "a: number;b: string" (members js-beautify left on one line) at bracket depth 0.
  let depth = 0;
  const lineIndent = (pos: number) => {
    const ls = output.lastIndexOf('\n', pos - 1) + 1;
    return /^[ \t]*/.exec(output.slice(ls))![0];
  };
  for (let i = 0; i < to.length; i++) {
    const t = to[i];
    if (t.type === 'punct') {
      if (t.text === '(' || t.text === '[') depth++;
      else if (t.text === ')' || t.text === ']') depth = Math.max(0, depth - 1);
      else if (t.text === ';' && depth === 0 && i + 1 < to.length) {
        const n = to[i + 1];
        if (!hasNl(gaps[i + 1]) && !(n.type === 'punct' && n.text === '}') && n.type !== 'comment') gaps[i + 1] = '\n' + lineIndent(t.start);
      }
    }
  }
  let s = '';
  for (let i = 0; i < to.length; i++) s += gaps[i] + to[i].text;
  const tail = to.length ? output.slice(to[to.length - 1].end) : output;
  return s + tail;
}

export function beautifyJs(src: string, opts: JsBeautifyOptions = {}): BeautifyResult {
  const language = opts.language ?? 'javascript';
  const warnings: string[] = [];
  const indentSize = opts.indentSize ?? 2;
  const input = language === 'typescript' ? safePreSplit(src) : src;
  const options = {
    indent_size: indentSize === 0 ? 1 : indentSize,
    indent_char: indentSize === 0 ? '\t' : ' ',
    indent_with_tabs: indentSize === 0,
    brace_style: (opts.braceStyle ?? 'collapse') as 'collapse',
    preserve_newlines: (opts.maxBlankLines ?? 1) > 0,
    max_preserve_newlines: Math.max(1, (opts.maxBlankLines ?? 1) + 1),
    wrap_line_length: opts.wrapLineLength ?? 0,
    break_chained_methods: opts.breakChainedMethods ?? false,
    end_with_newline: opts.endWithNewline ?? true,
    e4x: language === 'jsx',
    space_before_conditional: true,
    jslint_happy: false,
  };
  let code = jsBeautifyLib.js(input, options);
  if (language === 'typescript') code = tightenTypeScript(input, code);
  if (language !== 'jsx') {
    try {
      if (firstTokenDifference(input, code) >= 0) warnings.push(msg('The formatted code does not have exactly the same tokens as the input. Check the output before using it.'));
    } catch (e) {
      warnings.push(`Could not double-check the output: ${(e as Error).message}. The input may contain a syntax error.`);
    }
  }
  return { code, warnings };
}

function safePreSplit(src: string): string {
  try {
    return preSplitArrows(src);
  } catch {
    return src;
  }
}

/** Counts lines, code tokens and comments for the stats strip. */
export function jsStats(src: string): { lines: number; bytes: number; tokens: number; comments: number } {
  let tokens = 0;
  let comments = 0;
  try {
    for (const t of tokenizeJs(src)) {
      if (t.type === 'comment') comments++;
      else tokens++;
    }
  } catch {
    /* counts stay partial */
  }
  return { lines: src === '' ? 0 : src.split(/\r\n|\r|\n/).length, bytes: utf8Len(src), tokens, comments };
}
