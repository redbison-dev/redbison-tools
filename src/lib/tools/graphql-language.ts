/**
 * A small GraphQL lexer and parser that follows the October 2021 GraphQL
 * specification closely enough for the RedBison GraphQL tools (validator,
 * formatter, TypeScript generator, complexity analyzer). The `graphql`
 * package is not a dependency of this app, so this module keeps the grammar
 * in one tested place instead of each tool guessing with regular expressions.
 *
 * It parses both type system definitions (SDL) and executable definitions
 * (operations and fragments). `#` comments are kept and attached to the next
 * definition, field, argument or enum value so the formatter can keep them.
 */

export type Loc = { line: number; column: number };

export class GraphQLSyntaxError extends Error {
  line: number;
  column: number;
  constructor(message: string, loc: Loc) {
    super(`Syntax Error: ${message} (line ${loc.line}, column ${loc.column})`);
    this.name = 'GraphQLSyntaxError';
    this.line = loc.line;
    this.column = loc.column;
  }
}

/* ------------------------------------------------------------------ */
/* Lexer                                                               */
/* ------------------------------------------------------------------ */

type TokenKind =
  | 'Punct' | 'Spread' | 'Name' | 'Int' | 'Float' | 'String' | 'BlockString' | 'Comment' | 'EOF';

export type Token = {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
  /** Line on which the previous significant token ended (comments only). */
  prevLine?: number;
};

const PUNCT = new Set(['!', '$', '&', '(', ')', ':', '=', '@', '[', ']', '{', '|', '}']);

function isNameStart(c: string) {
  return /[_A-Za-z]/.test(c);
}
function isNameContinue(c: string) {
  return /[_0-9A-Za-z]/.test(c);
}

export function blockStringValue(raw: string): string {
  // GraphQL spec "BlockStringValue": strip common indentation and blank
  // leading/trailing lines.
  const lines = raw.split(/\r\n|[\n\r]/g);
  let common: number | null = null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.length - line.replace(/^[\t ]*/, '').length;
    if (indent < line.length && (common === null || indent < common)) common = indent;
  }
  if (common !== null && common > 0) {
    for (let i = 1; i < lines.length; i++) lines[i] = lines[i].slice(common);
  }
  while (lines.length > 0 && /^[\t ]*$/.test(lines[0])) lines.shift();
  while (lines.length > 0 && /^[\t ]*$/.test(lines[lines.length - 1])) lines.pop();
  return lines.join('\n');
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let lastSignificantLine = 0;
  const len = source.length;
  const loc = (pos: number): Loc => ({ line, column: pos - lineStart + 1 });
  const fail = (msg: string, pos: number): never => {
    throw new GraphQLSyntaxError(msg, loc(pos));
  };

  if (source.charCodeAt(0) === 0xfeff) i = 1;

  while (i < len) {
    const c = source[i];
    if (c === ' ' || c === '\t' || c === ',') { i++; continue; }
    if (c === '\n') { i++; line++; lineStart = i; continue; }
    if (c === '\r') {
      i += source[i + 1] === '\n' ? 2 : 1;
      line++; lineStart = i; continue;
    }
    const start = i;
    const column = i - lineStart + 1;
    if (c === '#') {
      let j = i + 1;
      while (j < len && source[j] !== '\n' && source[j] !== '\r') j++;
      tokens.push({ kind: 'Comment', value: source.slice(i + 1, j).trim(), line, column, prevLine: lastSignificantLine });
      i = j;
      continue;
    }
    if (PUNCT.has(c)) {
      tokens.push({ kind: 'Punct', value: c, line, column });
      lastSignificantLine = line;
      i++;
      continue;
    }
    if (c === '.') {
      if (source.startsWith('...', i)) {
        tokens.push({ kind: 'Spread', value: '...', line, column });
        lastSignificantLine = line;
        i += 3;
        continue;
      }
      fail('Unexpected character ".". Did you mean "..."?', i);
    }
    if (isNameStart(c)) {
      let j = i + 1;
      while (j < len && isNameContinue(source[j])) j++;
      tokens.push({ kind: 'Name', value: source.slice(i, j), line, column });
      lastSignificantLine = line;
      i = j;
      continue;
    }
    if (c === '-' || /[0-9]/.test(c)) {
      const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(source.slice(i));
      if (!m) fail(`Invalid number, expected digit but got ${JSON.stringify(source[i + 1] ?? '<EOF>')}.`, i);
      const text = m![0];
      const next = source[i + text.length];
      if (next !== undefined && (next === '.' || isNameStart(next) || /[0-9]/.test(next))) {
        fail(`Invalid number, unexpected character ${JSON.stringify(next)} after "${text}".`, i + text.length);
      }
      tokens.push({ kind: m![2] || m![3] ? 'Float' : 'Int', value: text, line, column });
      lastSignificantLine = line;
      i += text.length;
      continue;
    }
    if (c === '"') {
      if (source.startsWith('"""', i)) {
        let j = i + 3;
        let raw = '';
        const startLine = line;
        for (;;) {
          if (j >= len) fail('Unterminated block string.', start);
          if (source.startsWith('\\"""', j)) { raw += '"""'; j += 4; continue; }
          if (source.startsWith('"""', j)) { j += 3; break; }
          const ch = source[j];
          if (ch === '\n' || (ch === '\r' && source[j + 1] !== '\n')) { line++; lineStart = j + 1; }
          else if (ch === '\r') { /* handled by the following \n */ }
          raw += ch;
          j++;
        }
        tokens.push({ kind: 'BlockString', value: blockStringValue(raw), line: startLine, column });
        lastSignificantLine = line;
        i = j;
        continue;
      }
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= len || source[j] === '\n' || source[j] === '\r') fail('Unterminated string.', start);
        const ch = source[j];
        if (ch === '"') { j++; break; }
        if (ch === '\\') {
          const e = source[j + 1];
          const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
          if (e in map) { value += map[e]; j += 2; continue; }
          if (e === 'u') {
            // Spec 2.9.4: \u{HexDigit+} or \uXXXX, which must form a Unicode
            // scalar value (a surrogate pair is allowed only as \uXXXX\uXXXX).
            const braced = /^\{([0-9a-fA-F]*)\}/.exec(source.slice(j + 2, j + 2 + 12));
            if (braced) {
              const cp = braced[1] ? parseInt(braced[1], 16) : NaN;
              if (!(cp <= 0x10ffff) || (cp >= 0xd800 && cp <= 0xdfff)) fail(`Invalid Unicode escape sequence "\\u{${braced[1]}}".`, j);
              value += String.fromCodePoint(cp);
              j += 4 + braced[1].length;
              continue;
            }
            const hex = source.slice(j + 2, j + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(`Invalid Unicode escape sequence "\\u${hex}".`, j);
            const code = parseInt(hex, 16);
            if (code >= 0xdc00 && code <= 0xdfff) fail(`Invalid Unicode escape sequence "\\u${hex}".`, j);
            if (code >= 0xd800 && code <= 0xdbff) {
              const low = /^\\u([dD][c-fC-F][0-9a-fA-F]{2})/.exec(source.slice(j + 6, j + 12));
              if (!low) fail(`Invalid Unicode escape sequence "\\u${hex}".`, j);
              value += String.fromCharCode(code, parseInt(low![1], 16));
              j += 12;
              continue;
            }
            value += String.fromCharCode(code);
            j += 6;
            continue;
          }
          fail(`Invalid character escape sequence "\\${e ?? ''}".`, j);
        }
        value += ch;
        j++;
      }
      tokens.push({ kind: 'String', value, line, column });
      lastSignificantLine = line;
      i = j;
      continue;
    }
    fail(`Unexpected character ${JSON.stringify(c)}.`, i);
  }
  tokens.push({ kind: 'EOF', value: '<EOF>', line, column: i - lineStart + 1 });
  return tokens;
}

/* ------------------------------------------------------------------ */
/* AST                                                                 */
/* ------------------------------------------------------------------ */

export type TypeRef =
  | { kind: 'Named'; name: string; loc: Loc }
  | { kind: 'List'; ofType: TypeRef; loc: Loc }
  | { kind: 'NonNull'; ofType: TypeRef; loc: Loc };

export type Value =
  | { kind: 'Variable'; name: string }
  | { kind: 'Int'; value: string }
  | { kind: 'Float'; value: string }
  | { kind: 'String'; value: string; block: boolean }
  | { kind: 'Boolean'; value: boolean }
  | { kind: 'Null' }
  | { kind: 'Enum'; value: string }
  | { kind: 'List'; values: Value[] }
  | { kind: 'Object'; fields: { name: string; value: Value }[] };

export type Argument = { name: string; value: Value; loc: Loc };
export type Directive = { name: string; args: Argument[]; loc: Loc };

type Commented = { comments?: string[]; trailingComment?: string };

export type Description = { value: string; block: boolean };

export type InputValueDefinition = Commented & {
  kind: 'InputValueDefinition';
  name: string;
  description?: Description;
  type: TypeRef;
  defaultValue?: Value;
  directives: Directive[];
  loc: Loc;
};

export type FieldDefinition = Commented & {
  kind: 'FieldDefinition';
  name: string;
  description?: Description;
  args: InputValueDefinition[];
  type: TypeRef;
  directives: Directive[];
  loc: Loc;
};

export type EnumValueDefinition = Commented & {
  kind: 'EnumValueDefinition';
  name: string;
  description?: Description;
  directives: Directive[];
  loc: Loc;
};

type TypeDefBase = Commented & {
  name: string;
  description?: Description;
  directives: Directive[];
  extend: boolean;
  loc: Loc;
  /** Comments found just before the closing brace. */
  endComments?: string[];
};

export type ScalarTypeDefinition = TypeDefBase & { kind: 'ScalarTypeDefinition' };
export type ObjectTypeDefinition = TypeDefBase & { kind: 'ObjectTypeDefinition'; interfaces: string[]; fields: FieldDefinition[] };
export type InterfaceTypeDefinition = TypeDefBase & { kind: 'InterfaceTypeDefinition'; interfaces: string[]; fields: FieldDefinition[] };
export type UnionTypeDefinition = TypeDefBase & { kind: 'UnionTypeDefinition'; types: string[] };
export type EnumTypeDefinition = TypeDefBase & { kind: 'EnumTypeDefinition'; values: EnumValueDefinition[] };
export type InputObjectTypeDefinition = TypeDefBase & { kind: 'InputObjectTypeDefinition'; fields: InputValueDefinition[] };

export type TypeDefinition =
  | ScalarTypeDefinition
  | ObjectTypeDefinition
  | InterfaceTypeDefinition
  | UnionTypeDefinition
  | EnumTypeDefinition
  | InputObjectTypeDefinition;

export type SchemaDefinition = Commented & {
  kind: 'SchemaDefinition';
  description?: Description;
  directives: Directive[];
  operationTypes: { operation: 'query' | 'mutation' | 'subscription'; type: string; loc: Loc }[];
  extend: boolean;
  loc: Loc;
};

export type DirectiveDefinition = Commented & {
  kind: 'DirectiveDefinition';
  name: string;
  description?: Description;
  args: InputValueDefinition[];
  repeatable: boolean;
  locations: string[];
  loc: Loc;
};

export type FieldSelection = Commented & {
  kind: 'Field';
  alias?: string;
  name: string;
  args: Argument[];
  directives: Directive[];
  selectionSet?: Selection[];
  loc: Loc;
};
export type FragmentSpread = Commented & { kind: 'FragmentSpread'; name: string; directives: Directive[]; loc: Loc };
export type InlineFragment = Commented & { kind: 'InlineFragment'; typeCondition?: string; directives: Directive[]; selectionSet: Selection[]; loc: Loc };
export type Selection = FieldSelection | FragmentSpread | InlineFragment;

export type VariableDefinition = { name: string; type: TypeRef; defaultValue?: Value; directives: Directive[]; loc: Loc };

export type OperationDefinition = Commented & {
  kind: 'OperationDefinition';
  operation: 'query' | 'mutation' | 'subscription';
  /** True for the `{ ... }` query shorthand. */
  shorthand: boolean;
  name?: string;
  variableDefinitions: VariableDefinition[];
  directives: Directive[];
  selectionSet: Selection[];
  loc: Loc;
};

export type FragmentDefinition = Commented & {
  kind: 'FragmentDefinition';
  name: string;
  typeCondition: string;
  directives: Directive[];
  selectionSet: Selection[];
  loc: Loc;
};

export type Definition =
  | TypeDefinition
  | SchemaDefinition
  | DirectiveDefinition
  | OperationDefinition
  | FragmentDefinition;

export type DocumentNode = { definitions: Definition[]; endComments?: string[] };

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

export const DIRECTIVE_LOCATIONS = new Set([
  'QUERY', 'MUTATION', 'SUBSCRIPTION', 'FIELD', 'FRAGMENT_DEFINITION', 'FRAGMENT_SPREAD', 'INLINE_FRAGMENT',
  'VARIABLE_DEFINITION', 'SCHEMA', 'SCALAR', 'OBJECT', 'FIELD_DEFINITION', 'ARGUMENT_DEFINITION', 'INTERFACE',
  'UNION', 'ENUM', 'ENUM_VALUE', 'INPUT_OBJECT', 'INPUT_FIELD_DEFINITION',
]);

function describeToken(t: Token) {
  if (t.kind === 'EOF') return '<EOF>';
  if (t.kind === 'Name') return `Name "${t.value}"`;
  if (t.kind === 'String' || t.kind === 'BlockString') return 'String';
  if (t.kind === 'Int' || t.kind === 'Float') return `${t.kind} "${t.value}"`;
  return `"${t.value}"`;
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  private pendingComments: Token[] = [];

  constructor(source: string) {
    this.tokens = tokenize(source);
    this.skipComments();
  }

  private skipComments() {
    while (this.tokens[this.pos]?.kind === 'Comment') {
      this.pendingComments.push(this.tokens[this.pos]);
      this.pos++;
    }
  }

  private get tok(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    this.skipComments();
    return t;
  }

  private loc(t: Token = this.tok): Loc {
    return { line: t.line, column: t.column };
  }

  private fail(message: string, t: Token = this.tok): never {
    throw new GraphQLSyntaxError(message, this.loc(t));
  }

  private peek(kind: TokenKind, value?: string) {
    const t = this.tok;
    return t.kind === kind && (value === undefined || t.value === value);
  }

  private expectPunct(value: string): Token {
    if (this.peek('Punct', value)) return this.advance();
    return this.fail(`Expected "${value}", found ${describeToken(this.tok)}.`);
  }

  private expectName(): Token {
    if (this.peek('Name')) return this.advance();
    return this.fail(`Expected Name, found ${describeToken(this.tok)}.`);
  }

  private expectKeyword(value: string) {
    if (this.peek('Name', value)) return this.advance();
    return this.fail(`Expected "${value}", found ${describeToken(this.tok)}.`);
  }

  private optionalPunct(value: string) {
    if (this.peek('Punct', value)) { this.advance(); return true; }
    return false;
  }

  /**
   * Comments seen since the last consumed token. A comment that sits on the
   * same line as the previous token is returned separately as `trailing`.
   */
  private takeComments(): { leading: string[]; trailing?: string } {
    const comments = this.pendingComments;
    this.pendingComments = [];
    let trailing: string | undefined;
    const leading: string[] = [];
    comments.forEach((c, idx) => {
      if (idx === 0 && c.prevLine === c.line && this.pos > 1) trailing = c.value;
      else leading.push(c.value);
    });
    return { leading, trailing };
  }

  /** Attach comments to a node: leading ones to this node, a same-line one to `previous`. */
  private attach<T extends Commented>(node: T, previous?: Commented): T {
    const { leading, trailing } = this.takeComments();
    if (trailing !== undefined) {
      if (previous) previous.trailingComment = trailing;
      else leading.unshift(trailing);
    }
    if (leading.length) node.comments = leading;
    return node;
  }

  private endComments(previous?: Commented): string[] | undefined {
    const { leading, trailing } = this.takeComments();
    if (trailing !== undefined) {
      if (previous) previous.trailingComment = trailing;
      else leading.unshift(trailing);
    }
    return leading.length ? leading : undefined;
  }

  parseDocument(): DocumentNode {
    const definitions: Definition[] = [];
    let previous: Definition | undefined;
    if (this.peek('EOF')) this.fail('Unexpected <EOF>. The document is empty.');
    while (!this.peek('EOF')) {
      const holder: Commented = {};
      this.attach(holder, previous);
      const def = this.parseDefinition();
      if (holder.comments) def.comments = holder.comments;
      definitions.push(def);
      previous = def;
    }
    const endComments = this.endComments(previous);
    return { definitions, ...(endComments ? { endComments } : {}) };
  }

  private parseDescription(): Description | undefined {
    if (this.peek('String')) return { value: this.advance().value, block: false };
    if (this.peek('BlockString')) return { value: this.advance().value, block: true };
    return undefined;
  }

  private parseDefinition(): Definition {
    const t = this.tok;
    if (this.peek('Punct', '{')) return this.parseOperation();
    const hasDescription = t.kind === 'String' || t.kind === 'BlockString';
    const keywordToken = hasDescription ? this.tokens[this.pos + 1 + this.countCommentsAt(this.pos + 1)] : t;
    if (keywordToken.kind === 'Name') {
      switch (keywordToken.value) {
        case 'query': case 'mutation': case 'subscription': case 'fragment':
          if (hasDescription) this.fail('Descriptions are only allowed on type system definitions.', t);
          return keywordToken.value === 'fragment' ? this.parseFragment() : this.parseOperation();
        case 'schema': case 'scalar': case 'type': case 'interface': case 'union': case 'enum': case 'input': case 'directive':
          return this.parseTypeSystemDefinition();
        case 'extend':
          if (hasDescription) this.fail('Type system extensions cannot have descriptions.', t);
          return this.parseExtension();
      }
    }
    return this.fail(`Unexpected ${describeToken(keywordToken)}. Expected a definition such as "type", "query" or "fragment".`, keywordToken);
  }

  private countCommentsAt(p: number) {
    let n = 0;
    while (this.tokens[p + n]?.kind === 'Comment') n++;
    return n;
  }

  private parseTypeSystemDefinition(): Definition {
    const description = this.parseDescription();
    const kw = this.tok;
    switch (kw.value) {
      case 'schema': return this.parseSchema(false, description);
      case 'directive': return this.parseDirectiveDefinition(description);
      default: return this.parseTypeDefinition(false, description);
    }
  }

  private parseExtension(): Definition {
    this.expectKeyword('extend');
    const kw = this.tok;
    if (kw.kind === 'Name' && kw.value === 'schema') return this.parseSchema(true);
    if (kw.kind === 'Name' && ['scalar', 'type', 'interface', 'union', 'enum', 'input'].includes(kw.value)) {
      return this.parseTypeDefinition(true);
    }
    return this.fail(`Unexpected ${describeToken(kw)} after "extend".`);
  }

  private parseSchema(extend: boolean, description?: Description): SchemaDefinition {
    const start = this.expectKeyword('schema');
    const directives = this.parseDirectives(true);
    const operationTypes: SchemaDefinition['operationTypes'] = [];
    if (this.peek('Punct', '{')) {
      this.advance();
      while (!this.optionalPunct('}')) {
        const op = this.expectName();
        if (!['query', 'mutation', 'subscription'].includes(op.value)) {
          this.fail(`Unexpected Name "${op.value}". Expected query, mutation or subscription.`, op);
        }
        this.expectPunct(':');
        const type = this.expectName();
        operationTypes.push({ operation: op.value as 'query', type: type.value, loc: this.loc(type) });
      }
    } else if (!extend) {
      this.fail(`Expected "{", found ${describeToken(this.tok)}.`);
    }
    return { kind: 'SchemaDefinition', description, directives, operationTypes, extend, loc: this.loc(start) };
  }

  private parseDirectiveDefinition(description?: Description): DirectiveDefinition {
    const start = this.expectKeyword('directive');
    this.expectPunct('@');
    const name = this.expectName().value;
    const args = this.peek('Punct', '(') ? this.parseArgumentDefinitions() : [];
    let repeatable = false;
    if (this.peek('Name', 'repeatable')) { this.advance(); repeatable = true; }
    this.expectKeyword('on');
    this.optionalPunct('|');
    const locations: string[] = [];
    do {
      const l = this.expectName();
      if (!DIRECTIVE_LOCATIONS.has(l.value)) this.fail(`Unexpected Name "${l.value}". Expected a directive location such as FIELD_DEFINITION.`, l);
      locations.push(l.value);
    } while (this.optionalPunct('|'));
    return { kind: 'DirectiveDefinition', name, description, args, repeatable, locations, loc: this.loc(start) };
  }

  private parseTypeDefinition(extend: boolean, description?: Description): TypeDefinition {
    const kw = this.advance();
    const nameTok = this.expectName();
    const base = { name: nameTok.value, description, extend, loc: this.loc(kw) };
    switch (kw.value) {
      case 'scalar': {
        const directives = this.parseDirectives(true);
        if (extend && directives.length === 0) this.fail(`Expected "@", found ${describeToken(this.tok)}.`);
        return { kind: 'ScalarTypeDefinition', ...base, directives };
      }
      case 'type':
      case 'interface': {
        const interfaces: string[] = [];
        if (this.peek('Name', 'implements')) {
          this.advance();
          this.optionalPunct('&');
          do { interfaces.push(this.expectName().value); } while (this.optionalPunct('&'));
        }
        const directives = this.parseDirectives(true);
        let fields: FieldDefinition[] = [];
        let endComments: string[] | undefined;
        if (this.peek('Punct', '{')) ({ items: fields, endComments } = this.parseFieldsBlock(() => this.parseFieldDefinition()));
        else if (extend && interfaces.length === 0 && directives.length === 0) this.fail(`Expected "{", found ${describeToken(this.tok)}.`);
        const kind = kw.value === 'type' ? 'ObjectTypeDefinition' : 'InterfaceTypeDefinition';
        return { kind, ...base, interfaces, directives, fields, ...(endComments ? { endComments } : {}) } as ObjectTypeDefinition | InterfaceTypeDefinition;
      }
      case 'union': {
        const directives = this.parseDirectives(true);
        const types: string[] = [];
        if (this.optionalPunct('=')) {
          this.optionalPunct('|');
          do { types.push(this.expectName().value); } while (this.optionalPunct('|'));
        } else if (extend && directives.length === 0) this.fail(`Expected "=", found ${describeToken(this.tok)}.`);
        return { kind: 'UnionTypeDefinition', ...base, directives, types };
      }
      case 'enum': {
        const directives = this.parseDirectives(true);
        let values: EnumValueDefinition[] = [];
        let endComments: string[] | undefined;
        if (this.peek('Punct', '{')) {
          ({ items: values, endComments } = this.parseFieldsBlock(() => {
            const d = this.parseDescription();
            const v = this.expectName();
            if (['true', 'false', 'null'].includes(v.value)) this.fail(`Name "${v.value}" is reserved and cannot be used for an enum value.`, v);
            return { kind: 'EnumValueDefinition', name: v.value, description: d, directives: this.parseDirectives(true), loc: this.loc(v) } as EnumValueDefinition;
          }));
        } else if (extend && directives.length === 0) this.fail(`Expected "{", found ${describeToken(this.tok)}.`);
        return { kind: 'EnumTypeDefinition', ...base, directives, values, ...(endComments ? { endComments } : {}) };
      }
      case 'input': {
        const directives = this.parseDirectives(true);
        let fields: InputValueDefinition[] = [];
        let endComments: string[] | undefined;
        if (this.peek('Punct', '{')) ({ items: fields, endComments } = this.parseFieldsBlock(() => this.parseInputValueDefinition()));
        else if (extend && directives.length === 0) this.fail(`Expected "{", found ${describeToken(this.tok)}.`);
        return { kind: 'InputObjectTypeDefinition', ...base, directives, fields, ...(endComments ? { endComments } : {}) };
      }
    }
    return this.fail(`Unexpected ${describeToken(kw)}.`, kw);
  }

  private parseFieldsBlock<T extends Commented>(parseItem: () => T): { items: T[]; endComments?: string[] } {
    this.expectPunct('{');
    const items: T[] = [];
    let previous: T | undefined;
    if (this.peek('Punct', '}')) this.fail('Expected Name, found "}". A block must define at least one field or value.');
    while (!this.peek('Punct', '}')) {
      if (this.peek('EOF')) this.fail('Expected "}", found <EOF>.');
      const holder: Commented = {};
      this.attach(holder, previous);
      const item = parseItem();
      if (holder.comments) item.comments = holder.comments;
      items.push(item);
      previous = item;
    }
    const endComments = this.endComments(previous);
    this.expectPunct('}');
    return { items, endComments };
  }

  private parseFieldDefinition(): FieldDefinition {
    const description = this.parseDescription();
    const nameTok = this.expectName();
    const args = this.peek('Punct', '(') ? this.parseArgumentDefinitions() : [];
    this.expectPunct(':');
    const type = this.parseTypeRef();
    const directives = this.parseDirectives(true);
    return { kind: 'FieldDefinition', name: nameTok.value, description, args, type, directives, loc: this.loc(nameTok) };
  }

  private parseArgumentDefinitions(): InputValueDefinition[] {
    this.expectPunct('(');
    const args: InputValueDefinition[] = [];
    let previous: InputValueDefinition | undefined;
    if (this.peek('Punct', ')')) this.fail('Expected Name, found ")". Remove the empty parentheses.');
    while (!this.optionalPunct(')')) {
      const holder: Commented = {};
      this.attach(holder, previous);
      const a = this.parseInputValueDefinition();
      if (holder.comments) a.comments = holder.comments;
      args.push(a);
      previous = a;
    }
    return args;
  }

  private parseInputValueDefinition(): InputValueDefinition {
    const description = this.parseDescription();
    const nameTok = this.expectName();
    this.expectPunct(':');
    const type = this.parseTypeRef();
    let defaultValue: Value | undefined;
    if (this.optionalPunct('=')) defaultValue = this.parseValue(true);
    const directives = this.parseDirectives(true);
    return { kind: 'InputValueDefinition', name: nameTok.value, description, type, defaultValue, directives, loc: this.loc(nameTok) };
  }

  private parseTypeRef(): TypeRef {
    const start = this.tok;
    let type: TypeRef;
    if (this.optionalPunct('[')) {
      const inner = this.parseTypeRef();
      this.expectPunct(']');
      type = { kind: 'List', ofType: inner, loc: this.loc(start) };
    } else {
      type = { kind: 'Named', name: this.expectName().value, loc: this.loc(start) };
    }
    if (this.optionalPunct('!')) type = { kind: 'NonNull', ofType: type, loc: this.loc(start) };
    return type;
  }

  private parseDirectives(isConst: boolean): Directive[] {
    const directives: Directive[] = [];
    while (this.peek('Punct', '@')) {
      const at = this.advance();
      const name = this.expectName().value;
      const args = this.peek('Punct', '(') ? this.parseArguments(isConst) : [];
      directives.push({ name, args, loc: this.loc(at) });
    }
    return directives;
  }

  private parseArguments(isConst: boolean): Argument[] {
    this.expectPunct('(');
    const args: Argument[] = [];
    if (this.peek('Punct', ')')) this.fail('Expected Name, found ")". Remove the empty parentheses.');
    while (!this.optionalPunct(')')) {
      const n = this.expectName();
      this.expectPunct(':');
      args.push({ name: n.value, value: this.parseValue(isConst), loc: this.loc(n) });
    }
    return args;
  }

  private parseValue(isConst: boolean): Value {
    const t = this.tok;
    switch (t.kind) {
      case 'Punct':
        if (t.value === '[') {
          this.advance();
          const values: Value[] = [];
          while (!this.optionalPunct(']')) values.push(this.parseValue(isConst));
          return { kind: 'List', values };
        }
        if (t.value === '{') {
          this.advance();
          const fields: { name: string; value: Value }[] = [];
          while (!this.optionalPunct('}')) {
            const n = this.expectName().value;
            this.expectPunct(':');
            fields.push({ name: n, value: this.parseValue(isConst) });
          }
          return { kind: 'Object', fields };
        }
        if (t.value === '$') {
          if (isConst) this.fail('Unexpected variable in a constant value.', t);
          this.advance();
          return { kind: 'Variable', name: this.expectName().value };
        }
        break;
      case 'Int': this.advance(); return { kind: 'Int', value: t.value };
      case 'Float': this.advance(); return { kind: 'Float', value: t.value };
      case 'String': this.advance(); return { kind: 'String', value: t.value, block: false };
      case 'BlockString': this.advance(); return { kind: 'String', value: t.value, block: true };
      case 'Name':
        this.advance();
        if (t.value === 'true' || t.value === 'false') return { kind: 'Boolean', value: t.value === 'true' };
        if (t.value === 'null') return { kind: 'Null' };
        return { kind: 'Enum', value: t.value };
    }
    return this.fail(`Unexpected ${describeToken(t)}. Expected a value.`, t);
  }

  private parseOperation(): OperationDefinition {
    const start = this.tok;
    if (this.peek('Punct', '{')) {
      return { kind: 'OperationDefinition', operation: 'query', shorthand: true, variableDefinitions: [], directives: [], selectionSet: this.parseSelectionSet(), loc: this.loc(start) };
    }
    const op = this.expectName().value as OperationDefinition['operation'];
    const name = this.peek('Name') ? this.advance().value : undefined;
    const variableDefinitions: VariableDefinition[] = [];
    if (this.optionalPunct('(')) {
      if (this.peek('Punct', ')')) this.fail('Expected "$", found ")". Remove the empty parentheses.');
      while (!this.optionalPunct(')')) {
        const v = this.expectPunct('$');
        const vname = this.expectName().value;
        this.expectPunct(':');
        const type = this.parseTypeRef();
        const defaultValue = this.optionalPunct('=') ? this.parseValue(true) : undefined;
        variableDefinitions.push({ name: vname, type, defaultValue, directives: this.parseDirectives(true), loc: this.loc(v) });
      }
    }
    const directives = this.parseDirectives(false);
    return { kind: 'OperationDefinition', operation: op, shorthand: false, name, variableDefinitions, directives, selectionSet: this.parseSelectionSet(), loc: this.loc(start) };
  }

  private parseFragment(): FragmentDefinition {
    const start = this.expectKeyword('fragment');
    const name = this.expectName();
    if (name.value === 'on') this.fail('Unexpected Name "on". A fragment needs a name before "on".', name);
    this.expectKeyword('on');
    const typeCondition = this.expectName().value;
    const directives = this.parseDirectives(false);
    return { kind: 'FragmentDefinition', name: name.value, typeCondition, directives, selectionSet: this.parseSelectionSet(), loc: this.loc(start) };
  }

  private parseSelectionSet(): Selection[] {
    this.expectPunct('{');
    const selections: Selection[] = [];
    let previous: Selection | undefined;
    if (this.peek('Punct', '}')) this.fail('Expected Name, found "}". A selection set cannot be empty.');
    while (!this.peek('Punct', '}')) {
      if (this.peek('EOF')) this.fail('Expected "}", found <EOF>.');
      const holder: Commented = {};
      this.attach(holder, previous);
      const s = this.parseSelection();
      if (holder.comments) s.comments = holder.comments;
      selections.push(s);
      previous = s;
    }
    const end = this.endComments(previous);
    if (end && previous) previous.trailingComment = [previous.trailingComment, ...end].filter(Boolean).join(' ');
    this.expectPunct('}');
    return selections;
  }

  private parseSelection(): Selection {
    const start = this.tok;
    if (this.optionalSpread()) {
      if (this.peek('Name') && this.tok.value !== 'on') {
        const name = this.advance().value;
        return { kind: 'FragmentSpread', name, directives: this.parseDirectives(false), loc: this.loc(start) };
      }
      let typeCondition: string | undefined;
      if (this.peek('Name', 'on')) { this.advance(); typeCondition = this.expectName().value; }
      const directives = this.parseDirectives(false);
      return { kind: 'InlineFragment', typeCondition, directives, selectionSet: this.parseSelectionSet(), loc: this.loc(start) };
    }
    const first = this.expectName();
    let alias: string | undefined;
    let name = first.value;
    if (this.optionalPunct(':')) { alias = first.value; name = this.expectName().value; }
    const args = this.peek('Punct', '(') ? this.parseArguments(false) : [];
    const directives = this.parseDirectives(false);
    const selectionSet = this.peek('Punct', '{') ? this.parseSelectionSet() : undefined;
    return { kind: 'Field', alias, name, args, directives, selectionSet, loc: this.loc(first) };
  }

  private optionalSpread() {
    if (this.peek('Spread')) { this.advance(); return true; }
    return false;
  }
}

export function parseGraphQL(source: string): DocumentNode {
  return new Parser(source).parseDocument();
}

/* ------------------------------------------------------------------ */
/* Helpers shared by the tools                                         */
/* ------------------------------------------------------------------ */

export const BUILT_IN_SCALARS = ['ID', 'String', 'Int', 'Float', 'Boolean'] as const;

export function namedType(t: TypeRef): string {
  return t.kind === 'Named' ? t.name : namedType(t.ofType);
}

export function printTypeRef(t: TypeRef): string {
  if (t.kind === 'Named') return t.name;
  if (t.kind === 'List') return `[${printTypeRef(t.ofType)}]`;
  return `${printTypeRef(t.ofType)}!`;
}

export function printString(value: string): string {
  // JSON escaping matches GraphQL string escaping for every character we emit.
  return JSON.stringify(value);
}

export function printBlockString(value: string, indent: string): string {
  const escaped = value.replace(/"""/g, '\\"""');
  if (!escaped.includes('\n') && !escaped.endsWith('"') && !escaped.endsWith('\\')) return `"""${escaped}"""`;
  const body = escaped.split('\n').map((l) => (l ? indent + l : '')).join('\n');
  return `"""\n${body}\n${indent}"""`;
}

export function printValue(v: Value): string {
  switch (v.kind) {
    case 'Variable': return `$${v.name}`;
    case 'Int': case 'Float': return v.value;
    case 'String': return printString(v.value);
    case 'Boolean': return String(v.value);
    case 'Null': return 'null';
    case 'Enum': return v.value;
    case 'List': return `[${v.values.map(printValue).join(', ')}]`;
    case 'Object': return v.fields.length ? `{ ${v.fields.map((f) => `${f.name}: ${printValue(f.value)}`).join(', ')} }` : '{}';
  }
}

export function printDirectives(ds: Directive[]): string {
  return ds.map((d) => ` @${d.name}${d.args.length ? `(${d.args.map((a) => `${a.name}: ${printValue(a.value)}`).join(', ')})` : ''}`).join('');
}
