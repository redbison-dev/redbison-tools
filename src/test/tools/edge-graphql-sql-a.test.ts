/**
 * Edge, corner and negative cases for the GraphQL lexer/parser and the SDL
 * validator. The `graphql` package is not installed, so expected values come
 * from the GraphQL specification (October 2021 edition) and the rules
 * graphql-js applies in buildSchema/validateSchema, cited per test.
 */
import { describe, expect, it } from 'vitest';
import {
  GraphQLSyntaxError,
  blockStringValue,
  namedType,
  parseGraphQL,
  printBlockString,
  printDirectives,
  printTypeRef,
  printValue,
  tokenize,
  type FieldDefinition,
  type ObjectTypeDefinition,
  type OperationDefinition,
} from '@/lib/tools/graphql-language';
import { mergeSchema, validateSchemaSDL } from '@/lib/tools/graphql-schema-validator';

const syntaxError = (src: string): GraphQLSyntaxError => {
  try {
    parseGraphQL(src);
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLSyntaxError);
    return e as GraphQLSyntaxError;
  }
  throw new Error(`expected a syntax error for ${JSON.stringify(src)}`);
};

const stringValue = (literal: string) => {
  const t = tokenize(literal)[0];
  expect(t.kind).toMatch(/String/);
  return t.value;
};

describe('graphql-language: lexer', () => {
  it('positive: tokenizes punctuators, names, numbers and the spread', () => {
    const kinds = tokenize('query Q($a: Int = -12) { ...F x(f: 1.5e3) }').map((t) => `${t.kind}:${t.value}`);
    expect(kinds).toEqual([
      'Name:query', 'Name:Q', 'Punct:(', 'Punct:$', 'Name:a', 'Punct::', 'Name:Int', 'Punct:=', 'Int:-12', 'Punct:)',
      'Punct:{', 'Spread:...', 'Name:F', 'Name:x', 'Punct:(', 'Name:f', 'Punct::', 'Float:1.5e3', 'Punct:)', 'Punct:}', 'EOF:<EOF>',
    ]);
  });

  it('edge: commas and a leading BOM are ignored tokens (spec 2.1.1, 2.1.4)', () => {
    expect(tokenize('\uFEFF,,,a,,b').filter((t) => t.kind === 'Name').map((t) => t.value)).toEqual(['a', 'b']);
  });

  it('edge: CR, LF and CRLF each count as one line terminator (spec 2.1.2)', () => {
    const toks = tokenize('a\r\nb\rc\nd');
    expect(toks.filter((t) => t.kind === 'Name').map((t) => t.line)).toEqual([1, 2, 3, 4]);
  });

  it('edge: number grammar - 0, -0, exponents with signs are valid (spec 2.1.7, 2.1.8)', () => {
    expect(tokenize('0 -0 1e10 1E-2 6.0221413e+23').slice(0, 5).map((t) => `${t.kind}:${t.value}`)).toEqual([
      'Int:0', 'Int:-0', 'Float:1e10', 'Float:1E-2', 'Float:6.0221413e+23',
    ]);
  });

  it('negative: leading zeros, a trailing dot, a dangling exponent or a letter after a number are syntax errors (spec 2.1.7)', () => {
    for (const bad of ['00', '01', '1.', '.5', '1e', '1.2.3', '123abc', '-', '- 1']) {
      expect(() => tokenize(bad), bad).toThrow(GraphQLSyntaxError);
    }
  });

  it('positive: string escapes \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX (spec 2.9.4)', () => {
    expect(stringValue('"a\\"b\\\\c\\/d\\b\\f\\n\\r\\t\\u00e9"')).toBe('a"b\\c/d\b\f\n\r\té');
  });

  it('corner: a fixed-width surrogate pair decodes to one astral code point', () => {
    expect(stringValue('"\\uD83D\\uDE00"')).toBe('😀');
  });

  it('corner: braced \\u{...} escapes from the October 2021 spec decode to the code point', () => {
    // EscapedUnicode :: { HexDigit+ } — U+1F600 GRINNING FACE, U+0041 "A".
    expect(stringValue('"\\u{1F600}"')).toBe('😀');
    expect(stringValue('"\\u{41}"')).toBe('A');
  });

  it('negative: braced escapes outside the Unicode scalar range and lone surrogates are rejected (spec 2.9.4 static semantics)', () => {
    expect(() => tokenize('"\\u{110000}"')).toThrow(/Invalid Unicode escape/);
    expect(() => tokenize('"\\u{}"')).toThrow(/Invalid Unicode escape/);
    expect(() => tokenize('"\\uD800"')).toThrow(/Invalid Unicode escape/);
    expect(() => tokenize('"\\uDE00x"')).toThrow(/Invalid Unicode escape/);
  });

  it('corner: raw Unicode, emoji and RTL text are allowed inside strings', () => {
    expect(stringValue('"שלום 😀 Zoë"')).toBe('שלום 😀 Zoë');
  });

  it('negative: unknown escapes, short \\u, newline inside a string and EOF are syntax errors with a position', () => {
    expect(() => tokenize('"\\x"')).toThrow(/Invalid character escape/);
    expect(() => tokenize('"\\u12"')).toThrow(/Invalid Unicode escape/);
    expect(() => tokenize('"abc\ndef"')).toThrow(/Unterminated string/);
    expect(() => tokenize('"abc')).toThrow(/Unterminated string/);
    expect(() => tokenize('"""abc')).toThrow(/Unterminated block string/);
    expect(() => tokenize('a ; b')).toThrow(/Unexpected character ";"/);
    expect(() => tokenize('a . b')).toThrow(/Did you mean "\.\.\."/);
  });

  it('negative: a non-ASCII name is not a GraphQL Name (spec 2.1.9 Name is [_A-Za-z][_0-9A-Za-z]*)', () => {
    expect(() => tokenize('type Café { a: Int }')).toThrow(GraphQLSyntaxError);
  });

  it('positive: comments become Comment tokens and run to the end of the line', () => {
    const toks = tokenize('# hello\na # trailing\r\nb');
    expect(toks.filter((t) => t.kind === 'Comment').map((t) => t.value)).toEqual(['hello', 'trailing']);
  });
});

describe('graphql-language: block strings (spec 2.9.5 BlockStringValue)', () => {
  it('positive: removes the common indentation of lines after the first and blank first/last lines', () => {
    // Spec algorithm: commonIndent over lines 2..n = 2, so "  a" -> "a", "    b" -> "  b".
    expect(blockStringValue('\n  a\n    b\n  ')).toBe('a\n  b');
  });

  it('edge: the first line keeps its indentation; whitespace-only lines do not set the common indent', () => {
    expect(blockStringValue('  first\n      \n    second')).toBe('  first\n  \nsecond');
  });

  it('edge: an all-blank block string is the empty string', () => {
    expect(blockStringValue('\n   \n\t\n')).toBe('');
  });

  it('corner: CRLF line endings inside block strings normalise to \\n', () => {
    expect(stringValue('"""\r\n  a\r\n  b\r\n"""')).toBe('a\nb');
  });

  it('edge: \\""" inside a block string is an escaped triple quote; other escapes stay raw', () => {
    expect(stringValue('"""a \\""" b \\n"""')).toBe('a """ b \\n');
  });

  it('positive: printBlockString round-trips through the lexer, including """ and trailing quote', () => {
    for (const v of ['simple', 'line1\nline2', 'ends with "', 'has """ inside', 'back\\slash\\']) {
      expect(stringValue(printBlockString(v, ''))).toBe(v);
      expect(stringValue(printBlockString(v, '    '))).toBe(v);
    }
  });
});

describe('graphql-language: parser', () => {
  it('positive: parses every type system definition kind with locations', () => {
    const doc = parseGraphQL(`schema { query: Q mutation: M }
scalar Date @specifiedBy(url: "https://tools.ietf.org/html/rfc3339")
interface Node { id: ID! }
type Q implements Node { id: ID! }
type M { a: Int }
union U = Q | M
enum E { A B }
input I { a: Int = 1 }
directive @d(x: Int) repeatable on FIELD_DEFINITION | OBJECT`);
    expect(doc.definitions.map((d) => d.kind)).toEqual([
      'SchemaDefinition', 'ScalarTypeDefinition', 'InterfaceTypeDefinition', 'ObjectTypeDefinition', 'ObjectTypeDefinition',
      'UnionTypeDefinition', 'EnumTypeDefinition', 'InputObjectTypeDefinition', 'DirectiveDefinition',
    ]);
    expect(doc.definitions[3].loc).toEqual({ line: 4, column: 1 });
  });

  it('edge: leading | in unions and directive locations, and leading & in implements are optional (spec 3.8, 3.13, 3.6)', () => {
    const doc = parseGraphQL('union U = | A | B\ndirective @d on | FIELD\ntype T implements & A & B { a: Int }');
    expect((doc.definitions[0] as { types: string[] }).types).toEqual(['A', 'B']);
    expect((doc.definitions[1] as { locations: string[] }).locations).toEqual(['FIELD']);
    expect((doc.definitions[2] as ObjectTypeDefinition).interfaces).toEqual(['A', 'B']);
  });

  it('edge: a type with no field block is grammatical (FieldsDefinition is optional in spec 3.6)', () => {
    const doc = parseGraphQL('type Empty');
    expect((doc.definitions[0] as ObjectTypeDefinition).fields).toEqual([]);
  });

  it('positive: type references nest lists and non-null in order', () => {
    const f = (parseGraphQL('type Q { f: [[Int!]]! }').definitions[0] as ObjectTypeDefinition).fields[0];
    expect(printTypeRef(f.type)).toBe('[[Int!]]!');
    expect(namedType(f.type)).toBe('Int');
  });

  it('positive: parses operations, variables with defaults, aliases, fragments and inline fragments', () => {
    const doc = parseGraphQL(`query Q($id: ID! = "1", $n: [Int] = [1, 2]) @live {
  me: user(id: $id) { ...F ... on User { name } ... @include(if: true) { id } }
}
fragment F on User { id }`);
    const op = doc.definitions[0] as OperationDefinition;
    expect(op.variableDefinitions.map((v) => v.name)).toEqual(['id', 'n']);
    expect(printValue(op.variableDefinitions[1].defaultValue!)).toBe('[1, 2]');
    const field = op.selectionSet[0];
    expect(field.kind === 'Field' && field.alias).toBe('me');
    expect(field.kind === 'Field' && field.selectionSet!.map((s) => s.kind)).toEqual(['FragmentSpread', 'InlineFragment', 'InlineFragment']);
  });

  it('edge: the { ... } shorthand is an anonymous query', () => {
    const op = parseGraphQL('{ a }').definitions[0] as OperationDefinition;
    expect(op.operation).toBe('query');
    expect(op.shorthand).toBe(true);
  });

  it('positive: values print back in GraphQL syntax (objects, lists, enums, null, block strings)', () => {
    const doc = parseGraphQL('{ f(a: {x: 1, y: [true, null, RED], z: """b""", e: {}}) }');
    const field = (doc.definitions[0] as OperationDefinition).selectionSet[0];
    expect(field.kind === 'Field' && printDirectives([{ name: 'd', args: field.args, loc: field.loc }])).toBe(
      ' @d(a: { x: 1, y: [true, null, RED], z: "b", e: {} })',
    );
  });

  it('corner: comment-only and whitespace-only documents are rejected as empty, not parsed to nothing', () => {
    expect(syntaxError('# only a comment\n# another').message).toMatch(/document is empty/);
    expect(syntaxError('   \r\n\t ').message).toMatch(/document is empty/);
    expect(syntaxError('').message).toMatch(/document is empty/);
  });

  it('corner: comments are attached to the following field, and same-line comments as trailing', () => {
    const t = parseGraphQL('type Q {\n  # lead\n  a: Int # tail\n  b: Int\n  # end\n}').definitions[0] as ObjectTypeDefinition;
    expect(t.fields[0].comments).toEqual(['lead']);
    expect(t.fields[0].trailingComment).toBe('tail');
    expect(t.endComments).toEqual(['end']);
  });

  it('negative: errors carry the line and column of the offending token (spec: Syntax Error)', () => {
    const e = syntaxError('type Q {\n  a Int\n}');
    expect([e.line, e.column]).toEqual([2, 5]);
    expect(e.message).toMatch(/Expected ":", found Name "Int"/);
  });

  it('negative: empty field blocks, argument lists, selection sets and variable lists are syntax errors', () => {
    expect(syntaxError('type Q {}').message).toMatch(/at least one field/);
    expect(syntaxError('type Q { a(): Int }').message).toMatch(/empty parentheses/);
    expect(syntaxError('{ }').message).toMatch(/selection set cannot be empty/);
    expect(syntaxError('query Q() { a }').message).toMatch(/empty parentheses/);
    expect(syntaxError('{ a(): Int }').message).toMatch(/empty parentheses/);
  });

  it('negative: true, false and null cannot be enum values (spec 3.9 EnumValue)', () => {
    for (const v of ['true', 'false', 'null']) expect(syntaxError(`enum E { ${v} }`).message).toMatch(/reserved/);
  });

  it('negative: variables are not allowed in const contexts (default values, SDL directives)', () => {
    expect(syntaxError('query Q($a: Int = $b) { f }').message).toMatch(/variable in a constant/);
    expect(syntaxError('type Q { a(x: Int = $v): Int }').message).toMatch(/variable in a constant/);
    expect(syntaxError('type Q @d(x: $v) { a: Int }').message).toMatch(/variable in a constant/);
  });

  it('negative: descriptions on operations or extensions are rejected', () => {
    expect(syntaxError('"doc" query { a }').message).toMatch(/only allowed on type system/);
    expect(syntaxError('"doc" extend type Q { a: Int }').message).toMatch(/cannot have descriptions/);
  });

  it('negative: unknown directive locations, unknown schema operations and stray keywords fail clearly', () => {
    expect(syntaxError('directive @d on FIELDS').message).toMatch(/directive location/);
    expect(syntaxError('schema { read: Q }').message).toMatch(/query, mutation or subscription/);
    expect(syntaxError('extend foo X').message).toMatch(/after "extend"/);
    expect(syntaxError('typo Q { a: Int }').message).toMatch(/Expected a definition/);
    expect(syntaxError('fragment on on T { a }').message).toMatch(/needs a name/);
  });

  it('negative: an extension must add something (spec 3.6.3 ObjectTypeExtension)', () => {
    expect(() => parseGraphQL('extend type Q')).toThrow(/Expected "\{"/);
    expect(() => parseGraphQL('extend scalar S')).toThrow(/Expected "@"/);
    expect(() => parseGraphQL('extend union U')).toThrow(/Expected "="/);
    expect(() => parseGraphQL('extend enum E')).toThrow(/Expected "\{"/);
    expect(() => parseGraphQL('extend input I')).toThrow(/Expected "\{"/);
    expect(() => parseGraphQL('type Q { a: Int }\nextend schema @d')).not.toThrow();
  });

  it('negative: truncated input (unclosed block, list or object) is a syntax error, not a hang', () => {
    for (const src of ['type Q { a: Int', '{ a(x: [1, 2) }', '{ a(x: {y: 1) }', 'type Q { a: [Int }', 'query Q($a: Int']) {
      expect(() => parseGraphQL(src), src).toThrow(GraphQLSyntaxError);
    }
  });

  it('corner: huge input - 2,000 fields parse in one pass', () => {
    const src = `type Q {\n${Array.from({ length: 2000 }, (_, i) => `  f${i}: Int`).join('\n')}\n}`;
    const t = parseGraphQL(src).definitions[0] as ObjectTypeDefinition;
    expect(t.fields).toHaveLength(2000);
    expect((t.fields[1999] as FieldDefinition).loc.line).toBe(2001);
  });
});

describe('graphql-schema-validator: positive and style notes', () => {
  it('positive: a schema using every kind, extensions and a schema block is valid', () => {
    const r = validateSchemaSDL(`"""Root"""
schema { query: Root mutation: Mut }
"""Node"""
interface Node { id: ID! }
"""Root"""
type Root { node(id: ID!): Node search(q: String = "x", kind: Kind = A): [Result!]! }
"""Mut"""
type Mut { add(input: AddInput!): User }
"""User"""
type User implements Node { id: ID! name: String @deprecated(reason: "use fullName") }
"""Post"""
type Post implements Node { id: ID! }
"""Result"""
union Result = User | Post
"""Kind"""
enum Kind { A B }
"""AddInput"""
input AddInput @oneOf { name: String tags: [String!] }
extend type User { fullName: String }`);
    expect(r.errors).toEqual([]);
    expect(r.isValid).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('positive: an object type that only implements a reachable interface is not reported as unreachable', () => {
    const r = validateSchemaSDL('type Query { n: Node }\ninterface Node { id: ID! }\ntype User implements Node { id: ID! }');
    expect(r.isValid).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('edge: an unreferenced type is a warning, not an error', () => {
    const r = validateSchemaSDL('type Query { a: Int }\ntype Orphan { b: Int }');
    expect(r.isValid).toBe(true);
    expect(r.warnings.map((w) => w.message)).toEqual([expect.stringContaining('"Orphan" is never referenced')]);
  });

  it('edge: naming-style suggestions for non-PascalCase types, non-camelCase fields and lower-case enum values', () => {
    const r = validateSchemaSDL('type Query { Bad_Field: my_type }\ntype my_type { a: Int }\nenum E { lower }\nextend type Query { e: E }');
    const msgs = r.suggestions.map((s) => s.message).join('\n');
    expect(msgs).toMatch(/PascalCase; consider renaming "my_type"/);
    expect(msgs).toMatch(/camelCase; consider renaming "Query.Bad_Field"/);
    expect(msgs).toMatch(/SCREAMING_SNAKE_CASE; consider renaming "E.lower"/);
    expect(msgs).toMatch(/No type has a description/);
  });

  it('edge: a line of exactly 120 characters is fine; 121 earns a suggestion at column 121', () => {
    const pad = (n: number) => `type Query { a: Int }${' '.repeat(n - 21)}`;
    expect(pad(120)).toHaveLength(120);
    expect(validateSchemaSDL(pad(120)).suggestions.some((s) => /120 characters/.test(s.message))).toBe(false);
    const long = validateSchemaSDL(pad(121)).suggestions.find((s) => /120 characters/.test(s.message));
    expect(long).toMatchObject({ line: 1, column: 121 });
  });

  it('corner: CRLF and Unicode descriptions validate the same as LF', () => {
    const r = validateSchemaSDL('"""Привет 😀"""\r\ntype Query {\r\n  "مرحبا"\r\n  a: Int\r\n}\r\n');
    expect(r.isValid).toBe(true);
  });

  it('positive: mergeSchema infers roots from Query/Mutation/Subscription names when there is no schema block', () => {
    const s = mergeSchema(parseGraphQL('type Query { a: Int } type Mutation { b: Int } type Subscription { c: Int }'));
    expect(s.roots).toEqual({ query: 'Query', mutation: 'Mutation', subscription: 'Subscription' });
    expect(s.order).toEqual(['Query', 'Mutation', 'Subscription']);
  });
});

describe('graphql-schema-validator: negative (rules from spec section 3 / graphql-js validateSchema)', () => {
  const errorsOf = (sdl: string) => {
    const r = validateSchemaSDL(sdl);
    expect(r.isValid).toBe(false);
    return r.errors.map((e) => e.message).join('\n');
  };

  it('negative: syntax errors come back as one located error instead of throwing', () => {
    const r = validateSchemaSDL('type Query {\n  a:\n}');
    expect(r.isValid).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 3, column: 1 });
  });

  it('negative: comment-only input is invalid with a clear message', () => {
    expect(errorsOf('# nothing here')).toMatch(/document is empty/);
  });

  it('negative: missing Query root, and a schema block without query', () => {
    expect(errorsOf('type Foo { a: Int }')).toMatch(/Query root type must be provided/);
    expect(errorsOf('schema { mutation: M } type M { a: Int }')).toMatch(/must name a query root type/);
  });

  it('negative: root types must exist and be object types', () => {
    expect(errorsOf('schema { query: Missing }')).toMatch(/Unknown type "Missing" used as the query root/);
    expect(errorsOf('schema { query: Q } interface Q { a: Int }')).toMatch(/Query root type must be an object type, but "Q" is a interface type/);
  });

  it('negative: duplicate schema definitions, duplicate root operations and extend schema without a schema', () => {
    expect(errorsOf('schema { query: Q } schema { query: Q } type Q { a: Int }')).toMatch(/only one schema definition/);
    expect(errorsOf('schema { query: Q query: Q } type Q { a: Int }')).toMatch(/only one query type/);
    expect(errorsOf('type Query { a: Int } extend schema { mutation: Query }')).toMatch(/no schema definition exists/);
  });

  it('negative: unknown types in fields, arguments, input fields, implements and unions', () => {
    const msgs = errorsOf('type Query { a: Nope b(x: Missing): Int } input I { f: Gone } type T implements Ghost { a: Int } union U = Phantom');
    expect(msgs).toMatch(/Unknown type "Nope" used by field "Query.a"/);
    expect(msgs).toMatch(/Unknown type "Missing" used by argument/);
    expect(msgs).toMatch(/Unknown type "Gone" used by input field/);
    expect(msgs).toMatch(/Unknown type "Ghost" in the implements list/);
    expect(msgs).toMatch(/Unknown type "Phantom" in union "U"/);
  });

  it('negative: redefining a built-in scalar or a type, and duplicate fields/args/enum values/input fields', () => {
    const msgs = errorsOf(
      'scalar String\ntype Query { a: Int a: Int f(x: Int, x: Int): Int }\ntype Query { b: Int }\nenum E { A A }\ninput I { a: Int a: Int }',
    );
    expect(msgs).toMatch(/Type "String" already exists/);
    expect(msgs).toMatch(/only one type named "Query"/);
    expect(msgs).toMatch(/Field "Query.a" can only be defined once/);
    expect(msgs).toMatch(/Argument "Query.f\(x:\)" can only be defined once/);
    expect(msgs).toMatch(/Enum value "E.A" can only be defined once/);
    expect(msgs).toMatch(/Input field "I.a" can only be defined once/);
  });

  it('negative: names starting with __ are reserved for introspection (spec 3.1 Names)', () => {
    const msgs = errorsOf('type Query { __a: Int } type __T { a: Int } enum E { __V } directive @__d on FIELD');
    expect(msgs).toMatch(/"__a" must not begin with "__"/);
    expect(msgs).toMatch(/"__T" must not begin with "__"/);
    expect(msgs).toMatch(/"__V" must not begin with "__"/);
    expect(msgs).toMatch(/"__d" must not begin with "__"/);
  });

  it('negative: input types in output positions and output types in input positions', () => {
    const msgs = errorsOf('type Query { a: I f(x: Query): Int } input I { o: Query b: Int }');
    expect(msgs).toMatch(/"Query.a" must be an output type/);
    expect(msgs).toMatch(/"Query.f\(x:\)" must be an input type/);
    expect(msgs).toMatch(/"I.o" must be an input type/);
  });

  it('negative: types without fields/values/members (spec 3.6.1, 3.9.1, 3.10.1, 3.8.1)', () => {
    const msgs = errorsOf('type Query { a: Int } type Empty union U enum E input I');
    expect(msgs).toMatch(/Type "Empty" must define one or more fields/);
    expect(msgs).toMatch(/Union type "U" must define one or more member types/);
    expect(msgs).toMatch(/Enum type "E" must define one or more values/);
    expect(msgs).toMatch(/Input Object type "I" must define one or more fields/);
  });

  it('negative: union members must be object types and appear once', () => {
    const msgs = errorsOf('type Query { u: U } type A { a: Int } interface N { a: Int } union U = A | A | N');
    expect(msgs).toMatch(/can only include type "A" once/);
    expect(msgs).toMatch(/can only include object types; "N" is a interface type/);
  });

  it('negative: interface implementation rules (spec 3.6 IsValidImplementation)', () => {
    const msgs = errorsOf(`type Query { n: Node }
interface Node { id: ID! f(a: Int): String }
interface Named implements Node { id: ID! f(a: Int): String name: String }
type A implements Named { id: ID! f(a: Int): String name: String }
type B implements Node { id: String f(a: String, req: Int!): String }
type C implements Node & Node { id: ID! f(a: Int): String }
type D implements Query { a: Int }
interface Self implements Self { a: Int }
type E implements Node { f(a: Int): String }`);
    expect(msgs).toMatch(/Type "A" must implement "Node" because it is implemented by "Named"/);
    expect(msgs).toMatch(/expects type "ID!" but "B.id" is type "String"/);
    expect(msgs).toMatch(/argument "Node.f\(a:\)" expects type "Int" but "B.f\(a:\)" is type "String"/);
    expect(msgs).toMatch(/"B.f\(req:\)" is a required argument/);
    expect(msgs).toMatch(/Type "C" can only implement "Node" once/);
    expect(msgs).toMatch(/must only implement interfaces; "Query" is a object type/);
    expect(msgs).toMatch(/Type "Self" cannot implement itself/);
    expect(msgs).toMatch(/Interface field "Node.id" expected but "E" does not provide it/);
  });

  it('edge: covariant field types are allowed: non-null for nullable, member for union, implementer for interface', () => {
    const r = validateSchemaSDL(`type Query { n: Node }
interface Node { id: ID item: Item other: Node list: [Node] }
type A implements Node { id: ID! item: A other: A list: [A!]! }
union Item = A`);
    expect(r.errors).toEqual([]);
  });

  it('negative: interface field arguments must be present and an extra required argument is not allowed', () => {
    const msgs = errorsOf('type Query { n: Node } interface Node { f(a: Int): Int } type A implements Node { f: Int }');
    expect(msgs).toMatch(/Interface field argument "Node.f\(a:\)" expected but "A.f" does not provide it/);
    expect(validateSchemaSDL('type Query { n: Node } interface Node { f: Int } type A implements Node { f(extra: Int! = 1): Int }').isValid).toBe(true);
  });

  it('negative: extensions of unknown types or of the wrong kind', () => {
    expect(errorsOf('type Query { a: Int } extend type Missing { b: Int }')).toMatch(/Cannot extend type "Missing" because it is not defined/);
    expect(errorsOf('type Query { a: Int } enum E { A } extend input E { b: Int }')).toMatch(/Cannot extend non-input object type "E"/);
  });

  it('negative: unknown, duplicate, redefined and non-repeatable directives', () => {
    const msgs = errorsOf(
      'directive @skip on FIELD\ndirective @x on FIELD_DEFINITION\ndirective @x on FIELD_DEFINITION\ntype Query { a: Int @nope b: Int @x @x }',
    );
    expect(msgs).toMatch(/Directive "@skip" already exists/);
    expect(msgs).toMatch(/only one directive named "@x"/);
    expect(msgs).toMatch(/Unknown directive "@nope"/);
    expect(msgs).toMatch(/"@x" can only be used once/);
    expect(validateSchemaSDL('directive @tag repeatable on FIELD_DEFINITION\ntype Query { a: Int @tag @tag }').isValid).toBe(true);
  });

  it('negative: directives used at a location they do not declare (graphql-js KnownDirectivesRule)', () => {
    // @deprecated is declared on FIELD_DEFINITION | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION | ENUM_VALUE;
    // @skip and @include only on executable locations; @oneOf only on INPUT_OBJECT.
    expect(errorsOf('type Query @deprecated { a: Int }')).toMatch(/Directive "@deprecated" may not be used on OBJECT/);
    expect(errorsOf('type Query { a: Int @skip(if: true) }')).toMatch(/Directive "@skip" may not be used on FIELD_DEFINITION/);
    expect(errorsOf('type Query @oneOf { a: Int }')).toMatch(/Directive "@oneOf" may not be used on OBJECT/);
    expect(errorsOf('directive @f on FIELD_DEFINITION\nenum E @f { A }\ntype Query { e: E }')).toMatch(/Directive "@f" may not be used on ENUM/);
    expect(errorsOf('directive @f on OBJECT\nschema @f { query: Query }\ntype Query { a: Int }')).toMatch(/"@f" may not be used on SCHEMA/);
    const ok = validateSchemaSDL(`directive @f on OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | ENUM_VALUE | INPUT_FIELD_DEFINITION | SCALAR
scalar S @f
type Query @f { a(x: Int @f @deprecated): S @f @deprecated }
enum E { A @f @deprecated }
input I { a: Int @f @deprecated }`);
    expect(ok.errors).toEqual([]);
  });

  it('negative: directive arguments must be known and required ones provided (graphql-js SDL directive argument rules)', () => {
    expect(errorsOf('type Query { a: Int @deprecated(because: "x") }')).toMatch(/Unknown argument "because" on directive "@deprecated"/);
    expect(errorsOf('scalar S @specifiedBy\ntype Query { s: S }')).toMatch(/Directive "@specifiedBy" argument "url" of type "String!" is required/);
    expect(errorsOf('directive @auth(role: String!) on OBJECT\ntype Query @auth { a: Int }')).toMatch(/argument "role" of type "String!" is required/);
    expect(validateSchemaSDL('directive @auth(role: String! = "user") on OBJECT\ntype Query @auth { a: Int }').isValid).toBe(true);
  });

  it('negative: default values of the wrong scalar or enum type, and null for non-null', () => {
    const msgs = errorsOf(`type Query {
  a(x: Int = 1.5): Int
  b(x: Float = "s"): Int
  c(x: String = 1): Int
  d(x: Boolean = 0): Int
  e(x: ID = 1.0): Int
  f(x: Int! = null): Int
  g(x: E = Z): Int
  h(x: E = "A"): Int
}
enum E { A }`);
    for (const f of ['a', 'b', 'c', 'd', 'e']) expect(msgs).toMatch(new RegExp(`"Query.${f}\\(x:\\)" is not a valid`));
    expect(msgs).toMatch(/Default value null is not allowed for non-null "Query.f\(x:\)"/);
    expect(msgs).toMatch(/"Query.g\(x:\)" must be a value of enum "E"/);
    expect(msgs).toMatch(/"Query.h\(x:\)" must be a value of enum "E"/);
  });

  it('edge: Int defaults must fit a signed 32-bit integer (spec 3.5.1: -2^31 .. 2^31-1)', () => {
    expect(validateSchemaSDL('type Query { a(x: Int = 2147483647, y: Int = -2147483648): Int }').isValid).toBe(true);
    expect(errorsOf('type Query { a(x: Int = 2147483648): Int }')).toMatch(/"Query.a\(x:\)" is not a valid Int/);
    expect(errorsOf('input I { n: Int = -2147483649 }\ntype Query { a(i: I): Int }')).toMatch(/"I.n" is not a valid Int/);
  });

  it('edge: valid defaults - Int for Float, Int or String for ID, null for nullable, lists skip the scalar check', () => {
    const r = validateSchemaSDL('type Query { a(x: Float = 1, y: ID = 7, z: ID = "7", n: Int = null, l: [Int] = [1], e: E = A): Int }\nenum E { A }');
    expect(r.errors).toEqual([]);
  });

  it('negative: a cycle of non-null input fields can never be satisfied; a nullable or list link breaks it', () => {
    expect(errorsOf('type Query { a(i: A): Int } input A { b: B! } input B { a: A! }')).toMatch(/A.b -> B.a/);
    expect(errorsOf('type Query { a(i: A): Int } input A { self: A! }')).toMatch(/A.self/);
    expect(validateSchemaSDL('type Query { a(i: A): Int } input A { b: B! } input B { a: A }').isValid).toBe(true);
    expect(validateSchemaSDL('type Query { a(i: A): Int } input A { b: [A!]! }').isValid).toBe(true);
  });

  it('negative: operations and fragments in a schema document are reported, not silently ignored', () => {
    const msgs = errorsOf('type Query { a: Int }\nquery Q { a }\nfragment F on Query { a }\n{ a }');
    expect(msgs).toMatch(/Found a query operation "Q"/);
    expect(msgs).toMatch(/Found a fragment "F"/);
    expect(msgs).toMatch(/Found a query operation\. /);
  });
});
