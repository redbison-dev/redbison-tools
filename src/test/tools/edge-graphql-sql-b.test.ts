/**
 * Edge, corner and negative cases for the GraphQL formatter, TypeScript
 * generator, complexity analyzer and playground helpers. Expected outputs are
 * written out by hand from the documented rules (two-space indent, one field
 * per line; GraphQL nullability -> `T | null`; cost = sum of page-size
 * products) with the arithmetic shown in comments.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphQLSyntaxError, parseGraphQL, type DocumentNode, type ObjectTypeDefinition } from '@/lib/tools/graphql-language';
import { formatGraphQL } from '@/lib/tools/graphql-schema-formatter';
import { generateTypeScript, tsTypeFor, type TsGeneratorOptions } from '@/lib/tools/graphql-typescript-generator';
import { analyzeComplexity, PAGINATION_ARGS } from '@/lib/tools/graphql-complexity-analyzer';
import { networkErrorMessage, pickOperationName, readGraphqlResponse } from '@/lib/tools/graphql-playground';

/** Strip locations and comments so two documents can be compared structurally. */
const shape = (doc: DocumentNode) =>
  JSON.parse(JSON.stringify(doc, (k, v) => (k === 'loc' || k === 'comments' || k === 'trailingComment' || k === 'endComments' ? undefined : v)));

describe('graphql-schema-formatter', () => {
  it('positive: formats minified SDL with two-space indent and a blank line between definitions', () => {
    expect(formatGraphQL('type Query{a:Int b(x:Int=1,y:[String!]!):String @deprecated}enum E{A B}')).toBe(
      'type Query {\n  a: Int\n  b(x: Int = 1, y: [String!]!): String @deprecated\n}\n\nenum E {\n  A\n  B\n}\n',
    );
  });

  it('positive: every definition kind survives a format round trip with the same AST', () => {
    const src = `"schema doc" schema @a { query: Q mutation: M }
"""multi
line""" scalar Date @specifiedBy(url: "u")
interface Node implements Base & Other @k { id: ID! }
union U @k = A | B
input I @k { "d" a: Int = 1 @k b: [I!] = [{a: 2}] }
directive @a("arg doc" x: Int = 3, y: E = A) repeatable on FIELD_DEFINITION | OBJECT
extend type Q implements Node
extend schema @b
extend enum E { C }
query Op($v: Int = 2 @x, $w: [ID!]!) @q { a: b(c: $v, d: {e: [1, "s", null, true, ENUM]}) @include(if: $w) { ...F ... on T { x } ... @skip(if: false) { y } } }
fragment F on T @f { z }
{ short }`;
    const once = formatGraphQL(src);
    expect(shape(parseGraphQL(once))).toEqual(shape(parseGraphQL(src)));
    expect(formatGraphQL(once)).toBe(once);
  });

  it('edge: argument lists longer than 80 characters wrap one per line', () => {
    const args = Array.from({ length: 6 }, (_, i) => `argument${i}: String`).join(', ');
    // "(argument0: String, ..." is 6 * 18 + 5 * 2 + 2 = 120 characters > 80.
    const out = formatGraphQL(`type Query { f(${args}): Int }`);
    expect(out).toContain('  f(\n    argument0: String\n');
    expect(out).toContain('    argument5: String\n  ): Int\n');
  });

  it('edge: an argument with a description forces the block form even when short', () => {
    expect(formatGraphQL('type Query { f("why" a: Int): Int }')).toBe('type Query {\n  f(\n    "why"\n    a: Int\n  ): Int\n}\n');
  });

  it('corner: comments (leading, trailing, end-of-block, end-of-document) are kept', () => {
    const out = formatGraphQL('# top\ntype Query { # after brace\n  a: Int # trailing a\n  # before end\n}\n# bottom');
    expect(out).toBe('# top\ntype Query {\n  # after brace\n  a: Int # trailing a\n  # before end\n}\n\n# bottom\n');
    expect(formatGraphQL(out)).toBe(out);
  });

  it('corner: CRLF input produces LF output; Unicode descriptions and string values are preserved', () => {
    const out = formatGraphQL('"Zoë 😀 שלום"\r\ntype Query {\r\n  a(s: String = "日本"): Int\r\n}\r\n');
    expect(out).toBe('"Zoë 😀 שלום"\ntype Query {\n  a(s: String = "日本"): Int\n}\n');
  });

  it('corner: block-string descriptions keep their value when re-indented inside a type', () => {
    const src = 'type Query {\n  """\n  Line one\n    indented two\n  """\n  a: Int\n}';
    const out = formatGraphQL(src);
    const field = (d: DocumentNode) => (d.definitions[0] as { fields: { description?: { value: string } }[] }).fields[0].description?.value;
    expect(field(parseGraphQL(out))).toBe('Line one\n  indented two');
  });

  it('edge: strings with quotes, backslashes and control characters are re-escaped validly', () => {
    const out = formatGraphQL('type Query { a(s: String = "q\\"b\\\\n\\t\\u0001"): Int }');
    const arg = (parseGraphQL(out).definitions[0] as { fields: { args: { defaultValue: { value: string } }[] }[] }).fields[0].args[0];
    expect(arg.defaultValue.value).toBe('q"b\\n\t\u0001');
  });

  it('negative: invalid input throws GraphQLSyntaxError instead of producing mangled output', () => {
    for (const bad of ['', '# only comments', 'type Query {', 'type { a: Int }', 'type Query { a: Int }}']) {
      expect(() => formatGraphQL(bad), bad).toThrow(GraphQLSyntaxError);
    }
  });

  it('corner: a large schema formats and is idempotent', () => {
    const src = Array.from({ length: 300 }, (_, i) => `type T${i}{a:Int b:[T${i}!]}`).join('');
    const out = formatGraphQL(src);
    expect(out.split('\n\n')).toHaveLength(300);
    expect(formatGraphQL(out)).toBe(out);
  });
});

describe('graphql-typescript-generator', () => {
  const all: TsGeneratorOptions = { generateInterfaces: true, generateEnums: true, addComments: false, exportAll: true };

  it('positive: tsTypeFor follows GraphQL nullability for every wrapper combination', () => {
    const t = (s: string) => tsTypeFor((parseGraphQL(`type Q { f: ${s} }`).definitions[0] as ObjectTypeDefinition).fields[0].type);
    expect(t('ID')).toBe('string | null');
    expect(t('Float!')).toBe('number');
    expect(t('[Boolean!]')).toBe('Array<boolean> | null');
    expect(t('[[Int]!]!')).toBe('Array<Array<number | null>>');
    expect(t('Custom!')).toBe('Custom');
  });

  it('positive: objects, args, inputs, unions, enums and scalars', () => {
    const out = generateTypeScript(
      `scalar DateTime
enum Role { ADMIN USER }
interface Node { id: ID! }
type User implements Node { id: ID! role: Role posts(first: Int = 10, after: String, filter: PostFilter!): [Post!]! }
type Post implements Node { id: ID! at: DateTime! }
union Result = User | Post
input PostFilter { q: String tag: String! limit: Int! = 5 }`,
      all,
    );
    expect(out).toContain('export type DateTime = unknown;');
    expect(out).toContain("export enum Role {\n  ADMIN = 'ADMIN',\n  USER = 'USER',\n}");
    expect(out).toContain("export interface Node {\n  __typename?: 'User' | 'Post';\n  id: string;\n}");
    expect(out).toContain('  role: Role | null;\n  posts: Array<Post>;');
    // Nullable or defaulted arguments are optional; filter is required.
    expect(out).toContain('export interface UserPostsArgs {\n  first?: number | null;\n  after?: string | null;\n  filter: PostFilter;\n}');
    expect(out).toContain('export type Result = User | Post;');
    expect(out).toContain('export interface PostFilter {\n  q?: string | null;\n  tag: string;\n  limit?: number;\n}');
  });

  it('edge: enums as string unions and no export keyword', () => {
    const out = generateTypeScript('enum Color { RED GREEN }', { ...all, generateEnums: false, exportAll: false });
    expect(out).toBe("type Color = 'RED' | 'GREEN';\n");
  });

  it('edge: generateInterfaces=false omits object, interface and union types but keeps inputs', () => {
    const out = generateTypeScript('type Query { a: Int } union U = Query input I { a: Int }', { ...all, generateInterfaces: false });
    expect(out).not.toContain('interface Query');
    expect(out).not.toContain('type U');
    expect(out).toContain('export interface I {');
  });

  it('edge: an interface with no implementers types __typename as string', () => {
    expect(generateTypeScript('interface Lonely { a: Int }', all)).toContain('  __typename?: string;');
  });

  it('corner: an enum or union with no members still yields valid TypeScript (never)', () => {
    expect(generateTypeScript('enum Empty', { ...all, generateEnums: false })).toBe('export type Empty = never;\n');
    expect(generateTypeScript('union Nothing', all)).toBe('export type Nothing = never;\n');
  });

  it('corner: comments mode adds JSDoc from descriptions, @deprecated reasons and escapes */', () => {
    const out = generateTypeScript(
      '"""A user */ evil"""\ntype User {\n  "multi\\nline"\n  a: Int @deprecated(reason: "use b")\n  b: Int @deprecated\n}',
      { ...all, addComments: true },
    );
    expect(out.startsWith('// TypeScript types generated from a GraphQL schema\n')).toBe(true);
    expect(out).toContain('/** A user *\\/ evil */');
    expect(out).toContain('  /**\n   * multi\n   * line\n   * @deprecated use b\n   */\n  a: number | null;');
    // @deprecated without a reason uses the spec default "No longer supported".
    expect(out).toContain('  /** @deprecated No longer supported */\n  b: number | null;');
  });

  it('corner: extensions are merged into the type before generation', () => {
    const out = generateTypeScript('type User { a: Int } extend type User { b: String! }', all);
    expect(out).toContain("export interface User {\n  __typename?: 'User';\n  a: number | null;\n  b: string;\n}");
  });

  it('corner: custom scalars get a placeholder JSDoc when comments are on', () => {
    expect(generateTypeScript('scalar JSON', { ...all, addComments: true })).toContain(
      '/** Custom scalar JSON. Replace unknown with the type your server serializes it to. */\nexport type JSON = unknown;',
    );
  });

  it('negative: syntax errors throw GraphQLSyntaxError; comment-only input is not silently empty', () => {
    expect(() => generateTypeScript('type User { id: }', all)).toThrow(GraphQLSyntaxError);
    expect(() => generateTypeScript('# nothing', all)).toThrow(GraphQLSyntaxError);
  });
});

describe('graphql-complexity-analyzer', () => {
  it('positive: multiplies field costs by every paginated ancestor (hand calculation)', () => {
    // users(first: 10): 1 at root; children x10: id (10), posts (10);
    // posts(first: 5) children x50: title (50). Total = 1 + 10 + 10 + 50 = 71.
    const r = analyzeComplexity('query { users(first: 10) { id posts(first: 5) { title } } }');
    expect(r.score).toBe(71);
    expect(r.depth).toBe(3);
    expect(r.fieldCount).toBe(4);
    expect(r.complexity).toBe('Low');
    // percent = round(log10(72) / 4 * 100) = round(46.43) = 46.
    expect(r.percent).toBe(46);
  });

  it('edge: level thresholds are exclusive at 100, 1000 and 10000', () => {
    // a(first: N) { b } scores 1 + N.
    const lvl = (n: number) => analyzeComplexity(`{ a(first: ${n}) { b } }`, { maxPageSize: 1e9 });
    expect([lvl(98).score, lvl(98).complexity]).toEqual([99, 'Low']);
    expect([lvl(99).score, lvl(99).complexity]).toEqual([100, 'Medium']);
    expect([lvl(998).complexity, lvl(999).complexity]).toEqual(['Medium', 'High']);
    expect([lvl(9998).complexity, lvl(9999).complexity]).toEqual(['High', 'Critical']);
    // log10(10001)/4 >= 1, so the bar is full; a score of 0 would be 0%.
    expect(lvl(9999).percent).toBe(100);
  });

  it('edge: variables use their default, else assumedListSize; first: 0 or negative counts as 1', () => {
    expect(analyzeComplexity('query($n: Int = 4) { a(first: $n) { b } }').score).toBe(5);
    expect(analyzeComplexity('query($n: Int) { a(first: $n) { b } }', { assumedListSize: 25 }).score).toBe(26);
    expect(analyzeComplexity('{ a(first: 0) { b } }').score).toBe(2);
    expect(analyzeComplexity('{ a(last: -3) { b } }').score).toBe(2);
  });

  it('edge: every listed pagination argument multiplies; other arguments do not', () => {
    for (const arg of PAGINATION_ARGS) expect(analyzeComplexity(`query($x: ID) { a(${arg}: 3, id: $x) { b } }`).score, arg).toBe(4);
    expect(analyzeComplexity('query($x: Int) { a(size: $x) { b } }').score).toBe(2);
  });

  it('edge: depth limit is exclusive (depth == max is fine, max + 1 is flagged)', () => {
    const nest = (d: number) => `{ ${'a { '.repeat(d - 1)}b${' }'.repeat(d - 1)} }`;
    expect(analyzeComplexity(nest(7)).issues.some((i) => /Query depth/.test(i))).toBe(false);
    expect(analyzeComplexity(nest(8)).issues).toContain(
      'Query depth is 8, above 7. Many servers enforce a depth limit, and deep nesting multiplies resolver calls.',
    );
    expect(analyzeComplexity(nest(3), { maxDepth: 2 }).depth).toBe(3);
  });

  it('edge: page size exactly at the cap is fine; one above is flagged with its path', () => {
    expect(analyzeComplexity('{ a(first: 100) { b } }').issues).toEqual([]);
    expect(analyzeComplexity('{ a { c(first: 101) { b } } }').issues).toContain(
      'Large page size at a.c(first: 101). Many APIs cap page sizes at 100 (GitHub requires first or last between 1 and 100).',
    );
  });

  it('corner: fragments are counted once per use, __typename costs nothing, inline fragments keep the level', () => {
    // users x10: F spread twice -> (id) twice -> 20, plus users itself 1 and ... on User { name } 10 => 31.
    const r = analyzeComplexity('{ users(first: 10) { __typename ...F ...F ... on User { name } } } fragment F on User { id }');
    expect(r.score).toBe(31);
    expect(r.fieldCount).toBe(5);
    expect(r.depth).toBe(2);
    expect(r.breakdown).toEqual({ queries: 1, mutations: 0, subscriptions: 0, fragments: 1, nestedLevels: 2 });
  });

  it('negative: unknown fragments, fragment cycles, unused fragments and duplicate fragments', () => {
    const r = analyzeComplexity('{ a { ...Missing ...A } } fragment A on T { ...B } fragment B on T { ...A } fragment Unused on T { x }');
    expect(r.issues).toContain('Unknown fragment "Missing".');
    expect(r.issues.filter((i) => /spreads itself/.test(i))).toHaveLength(1);
    expect(r.issues).toContain('Fragment "Unused" is never used.');
    expect(analyzeComplexity('{ a { ...A } } fragment A on T { x } fragment A on T { y }').issues).toContain('There can be only one fragment named "A".');
  });

  it('negative: undeclared, unused variables (including in directives, lists and objects) and anonymous + named ops', () => {
    const r = analyzeComplexity('query Q($used: Int, $unused: Int, $d: Boolean!) { a(x: [{y: $used}]) @include(if: $d) { b(z: $ghost) } } { c }');
    expect(r.issues).toContain('Variable "$ghost" is used in "Q" but not declared.');
    expect(r.issues).toContain('Variable "$unused" is declared in "Q" but never used.');
    expect(r.issues.some((i) => /\$used|\$d"/.test(i))).toBe(false);
    expect(r.issues).toContain('An anonymous operation must be the only operation in the document.');
  });

  it('negative: duplicate operation names, multi-field subscriptions and SDL input', () => {
    expect(analyzeComplexity('query A { a } query A { b }').issues).toContain('There can be only one operation named "A".');
    expect(analyzeComplexity('subscription S { a b }').issues).toContain('A subscription operation must select exactly one root field.');
    const sdl = analyzeComplexity('type Query { a: Int }');
    expect(sdl.issues[0]).toMatch(/Found a object type definition/);
    expect(sdl.issues).toContain('No operation found. Add a query, mutation or subscription that uses your fragments.');
  });

  it('negative: a syntax error returns score 0 with the error, not a throw', () => {
    const r = analyzeComplexity('{ a(first: ) }');
    expect(r.score).toBe(0);
    expect(r.issues[0]).toMatch(/^Syntax Error:/);
    expect(analyzeComplexity('# just a comment').issues[0]).toMatch(/document is empty/);
  });

  it('corner: huge nested lists reach Critical with a localized count and suggestions', () => {
    // a x100 -> b x100 -> c: 1 + 100 + 10000 = 10101.
    const r = analyzeComplexity('{ a(first: 100) { b(first: 100) { c } } }');
    expect(r.score).toBe(10101);
    expect(r.complexity).toBe('Critical');
    expect(r.issues).toContain('Estimated 10,101 field resolutions. A single request this large can time out or hit rate limits.');
    expect(analyzeComplexity('{ a(first: 50) { b(first: 20) { c } } }').suggestions[0]).toMatch(/Halving the outermost/);
  });

  it('edge: hard-coded non-pagination arguments earn a variables suggestion', () => {
    expect(analyzeComplexity('{ user(id: "1") { name } }').suggestions.some((s) => s.includes('user(id:)'))).toBe(true);
  });
});

describe('graphql-playground helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('positive: GraphQL bodies pass through, including errors with a 4xx/5xx status', () => {
    const body = '{"errors":[{"message":"bad"}],"data":null}';
    expect(readGraphqlResponse(400, 'Bad Request', body)).toEqual({ errors: [{ message: 'bad' }], data: null });
  });

  it('edge: an empty body says so; a long HTML body is cut to 300 characters', () => {
    expect(readGraphqlResponse(502, '', '').errors![0].message).toBe('HTTP 502: the endpoint did not return JSON. The response body was empty.');
    const html = `<html>${'x'.repeat(1000)}</html>`;
    const msg = readGraphqlResponse(200, 'OK', html).errors![0].message;
    expect(msg).toBe(`HTTP 200 OK: the endpoint did not return JSON. Response starts with: ${html.slice(0, 300)}`);
  });

  it('edge: non-GraphQL JSON is an HTTP error for non-2xx and data for 2xx; arrays and null are not GraphQL results', () => {
    expect(readGraphqlResponse(500, 'Internal', '{"oops":1}')).toEqual({ errors: [{ message: 'HTTP 500 Internal', extensions: { response: { oops: 1 } } }] });
    expect(readGraphqlResponse(404, '', 'null')).toEqual({ errors: [{ message: 'HTTP 404', extensions: { response: null } }] });
    expect(readGraphqlResponse(200, 'OK', '[1,2]')).toEqual({ data: [1, 2] });
    expect(readGraphqlResponse(299, '', '{"x":1}')).toEqual({ data: { x: 1 } });
    expect(readGraphqlResponse(300, '', '{"x":1}').errors![0].message).toBe('HTTP 300');
  });

  it('positive: networkErrorMessage explains CORS for a TypeError and passes other errors through', () => {
    expect(networkErrorMessage(new Error('boom'), 'https://x')).toBe('boom');
    expect(networkErrorMessage('plain string', 'https://x')).toBe('plain string');
    const msg = networkErrorMessage(new TypeError('Failed to fetch'), 'https://api.example.com/graphql');
    expect(msg).toMatch(/^Failed to fetch\. The browser blocked/);
    expect(msg).toMatch(/Access-Control-Allow-Origin/);
    expect(msg).not.toMatch(/mixed content/);
  });

  it('corner: an HTTPS page calling an HTTP endpoint mentions mixed content', () => {
    vi.stubGlobal('location', { protocol: 'https:' });
    expect(networkErrorMessage(new TypeError('Failed to fetch'), 'http://localhost:4000/graphql')).toMatch(/mixed content/);
    expect(networkErrorMessage(new TypeError('Failed to fetch'), 'https://api.example.com')).not.toMatch(/mixed content/);
  });

  it('edge: pickOperationName returns the first name only when there are several operations', () => {
    expect(pickOperationName('query A { a }')).toBeUndefined();
    expect(pickOperationName('query A { a } mutation B { b }')).toBe('A');
    expect(pickOperationName('fragment F on T { a } query Only { ...F }')).toBeUndefined();
  });

  it('negative: an unparseable document leaves the choice to the server (undefined, no throw)', () => {
    expect(pickOperationName('query A { ')).toBeUndefined();
    expect(pickOperationName('')).toBeUndefined();
  });
});
