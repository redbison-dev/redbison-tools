// @vitest-environment jsdom
/**
 * Edge, corner, positive and negative cases for html-beautify, xml-beautify and
 * json-to-typescript-generator.
 *
 * Oracles: the browser DOM (jsdom's HTML and XML parsers) for "the page or document
 * means the same thing before and after formatting", and the TypeScript compiler for
 * "the generated types accept the sample JSON".
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { beautifyHtml, parseHtml } from '@/lib/tools/html-beautify';
import { beautifyXml, minifyXml, parseXml } from '@/lib/tools/xml-beautify';
import { DEFAULT_JSON_TO_TS_OPTIONS, generateTypescript, pascalCase } from '@/lib/tools/json-to-typescript-generator';

/* ------------------------------------------------------------------ */
/* html-beautify                                                       */
/* ------------------------------------------------------------------ */

const BLOCK = new Set(['HTML', 'HEAD', 'BODY', 'DIV', 'P', 'UL', 'OL', 'LI', 'NAV', 'MAIN', 'SECTION', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'H1', 'H2', 'PRE', 'TEXTAREA', 'SCRIPT', 'STYLE', 'TITLE', 'META']);
const asciiCollapse = (s: string) => s.replace(/[ \t\n\f\r]+/g, ' ').replace(/^ | $/g, '');

/**
 * Text a browser renders in each block that holds only inline content: ASCII whitespace runs
 * collapse to one space and are dropped at the block edges (CSS Text 3, white-space: normal);
 * U+00A0 is not white space there.
 */
function renderedText(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('*'))
    .filter((el) => BLOCK.has(el.tagName) && !Array.from(el.children).some((c) => BLOCK.has(c.tagName)))
    .map((el) => (['PRE', 'TEXTAREA'].includes(el.tagName) ? el.textContent ?? '' : asciiCollapse(el.textContent ?? '')))
    .filter((t) => t !== '');
}

/** Element structure (tag names and attributes) as the HTML parser builds it, ignoring text. */
function elementTree(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (el: Element): string => `${el.tagName}${Array.from(el.attributes).map((a) => `[${a.name}=${a.value}]`).join('')}(${Array.from(el.children).map(walk).join(',')})`;
  return walk(doc.documentElement);
}

describe('html-beautify', () => {
  it('corner: no-break spaces are content, not collapsible whitespace (only ASCII whitespace collapses)', () => {
    const input = '<div><p>a  b</p><p> x </p></div>';
    const out = beautifyHtml(input);
    expect(out).toBe('<div>\n  <p>a  b</p>\n  <p> x </p>\n</div>');
    expect(renderedText(out)).toEqual(renderedText(input));
  });

  it('corner: a comment between words stays inline, so no space appears between "a" and "b"', () => {
    const input = '<p>a<!-- c -->b</p>';
    const out = beautifyHtml(input);
    expect(out).toBe('<p>a<!-- c -->b</p>');
    expect(renderedText(out)).toEqual(['ab']);
  });

  it('positive: rendered text and element tree are unchanged for a realistic page', () => {
    const input =
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Shop</title><style>a{color:red}\n.b{x:y}</style></head>' +
      '<body><nav><ul><li><a href="/">Home</a><li><a href="/cart">Cart (<b>2</b>)</a></ul></nav>' +
      '<main><h1>Deals</h1><p>Save <em>20%</em> today &amp; tomorrow.<br>Ends soon.</p>' +
      '<table><tr><td>1<td>2</tr></table><pre>  keep\n    this</pre><textarea>a\n b</textarea>' +
      '<script>if (a < b) { go(); }</script></main></body></html>';
    const out = beautifyHtml(input);
    expect(renderedText(out)).toEqual(renderedText(input));
    expect(elementTree(out)).toBe(elementTree(input));
    expect(out).toContain('\n      <pre>  keep\n    this</pre>');
    expect(out).toContain('<textarea>a\n b</textarea>');
  });

  it('edge: empty input, whitespace only and text only', () => {
    expect(beautifyHtml('')).toBe('');
    expect(beautifyHtml(' \n\t ')).toBe('');
    expect(beautifyHtml('just   text')).toBe('just text');
  });

  it('edge: a custom indent string and multi-line script content dedented under its tag', () => {
    expect(beautifyHtml('<div><div><p>x</p></div></div>', '\t')).toBe('<div>\n\t<div>\n\t\t<p>x</p>\n\t</div>\n</div>');
    expect(beautifyHtml('<div><script>\n      a();\n        b();\n    </script></div>')).toBe('<div>\n  <script>\n    a();\n      b();\n  </script>\n</div>');
    expect(beautifyHtml('<div><style>   </style></div>')).toBe('<div>\n  <style></style>\n</div>');
  });

  it('negative: malformed markup is kept, never invented: stray end tags, unclosed tags and an unterminated tag', () => {
    const stray = beautifyHtml('<div>x</span></div>');
    expect(stray).toContain('</span>');
    expect(renderedText(stray)).toEqual(['x']);
    expect(beautifyHtml('<div><p>open')).toBe('<div>\n  <p>open');
    expect(beautifyHtml('<div>a <b')).toBe('<div>a <b');
    expect(beautifyHtml('<!-- never closed <div>')).toBe('<!-- never closed <div>');
    expect(beautifyHtml('a < b and c > d')).toBe('a < b and c > d');
  });

  it('corner: implied end tags (li, td, p before a block) and upper-case tags', () => {
    const nodes = parseHtml('<UL><LI>a<LI>b</UL>');
    expect(nodes).toHaveLength(1);
    const ul = nodes[0] as { children: { type: string; name: string }[] };
    expect(ul.children.map((c) => c.name)).toEqual(['li', 'li']);
    expect(beautifyHtml('<p>one<div>two</div>')).toBe('<p>one\n<div>two</div>');
    expect(beautifyHtml('<SCRIPT>x</SCRIPT>')).toBe('<SCRIPT>x</SCRIPT>');
  });

  it('positive: attributes are normalised to single spaces without touching quoted values', () => {
    expect(beautifyHtml('<a   href = "x y"  data-z=\'1\'   disabled>t</a>')).toBe('<a href="x y" data-z=\'1\' disabled>t</a>');
    expect(beautifyHtml('<img src=a.png alt="">')).toBe('<img src=a.png alt="">');
  });

  it('positive: CDATA, processing instructions and Unicode text survive', () => {
    expect(beautifyHtml('<svg><![CDATA[ x < y ]]></svg>')).toBe('<svg>\n  <![CDATA[ x < y ]]>\n</svg>');
    expect(beautifyHtml('<?xml   version="1.0"?><p>日本 😀 مرحبا</p>')).toBe('<?xml version="1.0"?>\n<p>日本 😀 مرحبا</p>');
  });
});

/* ------------------------------------------------------------------ */
/* xml-beautify                                                        */
/* ------------------------------------------------------------------ */

/** Text content of every element, which formatting must not change for mixed content. */
function textOf(xml: string, tag: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(doc.getElementsByTagName(tag)).map((e) => e.textContent ?? '');
}

describe('xml-beautify', () => {
  it('corner: CDATA next to an element is mixed content, so no whitespace is added to the text', () => {
    const input = '<r><a/><![CDATA[x]]></r>';
    const out = beautifyXml(input);
    expect(out).toBe('<r><a/><![CDATA[x]]></r>');
    expect(textOf(out, 'r')).toEqual(textOf(input, 'r'));
  });

  it('positive: element-only content is indented and the text of every leaf is unchanged', () => {
    const input = '<?xml version="1.0" encoding="UTF-8"?><catalog><book id="1"><title>Dune</title><price cur="€">9.99</price></book><book id="2"/></catalog>';
    const out = beautifyXml(input);
    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<catalog>\n  <book id="1">\n    <title>Dune</title>\n    <price cur="€">9.99</price>\n  </book>\n  <book id="2"/>\n</catalog>',
    );
    expect(textOf(out, 'title')).toEqual(['Dune']);
    expect(minifyXml(out)).toBe(input);
  });

  it('corner: xml:space="preserve" keeps whitespace, and xml:space="default" below it turns formatting back on', () => {
    const input = '<r><code xml:space="preserve">\n  a  </code><x xml:space="preserve"><y xml:space="default"><z/></y></x></r>';
    const out = beautifyXml(input);
    expect(textOf(out, 'code')).toEqual(['\n  a  ']);
    expect(out).toContain('<x xml:space="preserve"><y xml:space="default"><z/></y></x>');
    expect(minifyXml('<r>\n <p xml:space="preserve"> </p>\n</r>')).toBe('<r><p xml:space="preserve"> </p></r>');
  });

  it('positive: attribute values round-trip through re-escaping, including tabs and newlines (XML 1.0 3.3.3)', () => {
    const input = '<r a="x &amp; &lt;y&gt; &quot;q&quot;" b="1&#9;2&#10;3"/>';
    const out = beautifyXml(input);
    const before = parseXml(input).documentElement;
    const after = parseXml(out).documentElement;
    expect(after.getAttribute('a')).toBe(before.getAttribute('a'));
    expect(after.getAttribute('b')).toBe('1\t2\n3');
  });

  it('edge: an element holding only whitespace becomes self-closing; namespaces and prefixes are kept', () => {
    expect(beautifyXml('<r>\n   \n</r>')).toBe('<r/>');
    expect(minifyXml('<r>\n   \n</r>')).toBe('<r/>');
    expect(beautifyXml('<x:r xmlns:x="urn:a"><x:a/></x:r>')).toBe('<x:r xmlns:x="urn:a">\n  <x:a/>\n</x:r>');
  });

  it('positive: comments and processing instructions outside the root element are kept in order', () => {
    const out = beautifyXml('<!-- top --><?pi a?><r><!-- in --><?go now?><a/></r><!-- after -->', '\t');
    expect(out).toBe('<!-- top -->\n<?pi a?>\n<r>\n\t<!-- in -->\n\t<?go now?>\n\t<a/>\n</r>\n<!-- after -->');
  });

  it('negative: empty input, two roots, unclosed tags and undefined entities are parse errors', () => {
    expect(() => beautifyXml('')).toThrow();
    expect(() => beautifyXml('<a/><b/>')).toThrow();
    expect(() => minifyXml('<a>')).toThrow();
    expect(() => beautifyXml('<a>&nope;</a>')).toThrow();
    expect(() => beautifyXml('not xml')).toThrow();
  });

  it('corner: Unicode, emoji and CRLF line endings', () => {
    const out = beautifyXml('<r>\r\n  <t>日本 😀</t>\r\n</r>');
    expect(out).toBe('<r>\n  <t>日本 😀</t>\n</r>');
  });
});

/* ------------------------------------------------------------------ */
/* json-to-typescript-generator                                        */
/* ------------------------------------------------------------------ */

/** Type-checks `declarations` plus `const sample: Root = <json>` with the TypeScript compiler. */
function typeErrors(declarations: string, json: string, rootName = 'Root'): string[] {
  const code = `${declarations}\nconst sample: ${rootName} = ${json};\nexport { sample };\n`;
  const fileName = 'gen.ts';
  const options: ts.CompilerOptions = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, lib: ['lib.es2020.d.ts'], types: [], skipLibCheck: true };
  const host = ts.createCompilerHost(options);
  const orig = host.getSourceFile;
  host.getSourceFile = (name, lang, ...rest) => (name === fileName ? ts.createSourceFile(name, code, lang) : orig.call(host, name, lang, ...rest));
  const program = ts.createProgram([fileName], options, host);
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('json-to-typescript-generator', () => {
  it('positive: the generated types accept the sample for nested, optional, nullable and mixed data', () => {
    const json = '{"id":1,"name":"Ada","tags":["a","b"],"owner":null,"items":[{"sku":"A","qty":2},{"sku":"B","note":"x"}],"matrix":[[1,2],[3]],"mixed":[1,"a",true,null],"empty":[],"nested":{"deep":{"ok":true}}}';
    const out = generateTypescript(json);
    expect(typeErrors(out, json)).toEqual([]);
    expect(out).toContain('owner?: null;');
    expect(out).toContain('matrix: number[][];');
    expect(out).toContain('mixed: (number | string | boolean | null)[];');
    expect(out).toContain('empty: any[];');
  });

  it('negative: the types reject a value of the wrong type (the check is not vacuous)', () => {
    const out = generateTypescript('{"id":1}');
    expect(typeErrors(out, '{"id":"1"}').length).toBeGreaterThan(0);
  });

  it('corner: a "__proto__" key stays a field instead of vanishing into the prototype', () => {
    const out = generateTypescript('{"__proto__":{"a":1},"b":2}');
    expect(out).toContain('  __proto__: Proto;');
    expect(out).toContain('export interface Proto {\n  a: number;\n}');
    const merged = generateTypescript('[{"__proto__":1},{"x":2}]');
    expect(merged).toContain('  __proto__?: number;');
    expect(merged).toContain('  x?: number;');
  });

  it('corner: keys that are not identifiers or are reserved words are quoted; type names never collide', () => {
    const json = '{"first-name":"a","class":1,"日本":true,"":{"a":1},"$ok":1,"_x":2,"2fa":{"on":true}}';
    const out = generateTypescript(json);
    expect(typeErrors(out, json)).toEqual([]);
    expect(out).toContain('"first-name": string;');
    expect(out).toContain('"class": number;');
    expect(out).toContain('"日本": boolean;');
    expect(out).toContain('$ok: number;');
    expect(out).toContain('"": Root2;');
  });

  it('edge: non-object roots become a type alias', () => {
    for (const [json, alias] of [['null', 'null'], ['"x"', 'string'], ['1.5', 'number'], ['true', 'boolean'], ['[]', 'any[]'], ['[1,"a"]', '(number | string)[]']] as const) {
      const out = generateTypescript(json);
      expect(out).toBe(`export type Root = ${alias};\n`);
      expect(typeErrors(out, json)).toEqual([]);
    }
    expect(generateTypescript('{}')).toBe('export interface Root {\n}\n');
  });

  it('positive: every option combination still type-checks the sample', () => {
    const json = '{"a":null,"b":[{"c":1}],"d":{"e":"x"}}';
    for (const useInterfaces of [true, false]) {
      for (const optionalNulls of [true, false]) {
        for (const readonlyFields of [true, false]) {
          const out = generateTypescript(json, { useInterfaces, optionalNulls, readonlyFields, exportAll: false, rootName: 'my api-response' });
          expect(out).toContain(useInterfaces ? 'interface MyApiResponse {' : 'type MyApiResponse = {');
          expect(out.includes('export ')).toBe(false);
          expect(out.includes('readonly ')).toBe(readonlyFields);
          expect(typeErrors(out, json, 'MyApiResponse'), JSON.stringify({ useInterfaces, optionalNulls, readonlyFields })).toEqual([]);
        }
      }
    }
    expect(DEFAULT_JSON_TO_TS_OPTIONS.rootName).toBe('Root');
  });

  it('negative: invalid JSON throws a SyntaxError', () => {
    expect(() => generateTypescript('{"a":}')).toThrow(SyntaxError);
    expect(() => generateTypescript('')).toThrow(SyntaxError);
  });

  it('edge: pascalCase handles empty, symbol-only, digit-first and multi-word names', () => {
    expect(pascalCase('')).toBe('Root');
    expect(pascalCase('---')).toBe('Root');
    expect(pascalCase('2fa code')).toBe('T2faCode');
    expect(pascalCase('user_profile-data')).toBe('UserProfileData');
  });
});
