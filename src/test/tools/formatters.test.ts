// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { beautifyHtml } from '@/lib/tools/html-beautify';
import { beautifyYaml } from '@/lib/tools/yaml-beautify';
import { beautifyXml, minifyXml } from '@/lib/tools/xml-beautify';
import { generateTypescript } from '@/lib/tools/json-to-typescript-generator';
import { excelSerialToIso, readWorkbook, sheetToJson } from '@/lib/tools/excel-to-json-converter';
import { computeHistogram, heatColorIndex, parseChartCsv, pickColumns } from '@/lib/tools/data-visualization-tool';

describe('html-beautify', () => {
  it('does not indent after void elements', () => {
    expect(beautifyHtml('<div><img src="a.png"><br><input type="text"><span>x</span></div><p>after</p>')).toBe(
      '<div><img src="a.png"><br><input type="text"><span>x</span></div>\n<p>after</p>',
    );
  });
  it('indents nested blocks and returns to column zero for siblings', () => {
    expect(beautifyHtml('<!DOCTYPE html><html><head><meta charset="utf-8"><title>T</title></head><body><div><p>Hi</p></div></body></html>')).toBe(
      [
        '<!DOCTYPE html>',
        '<html>',
        '  <head>',
        '    <meta charset="utf-8">',
        '    <title>T</title>',
        '  </head>',
        '  <body>',
        '    <div>',
        '      <p>Hi</p>',
        '    </div>',
        '  </body>',
        '</html>',
      ].join('\n'),
    );
  });
  it('keeps inline content on one line without changing word spacing', () => {
    expect(beautifyHtml('<p>Hello <b>big</b>world, <a href="/x">link</a>!</p>')).toBe('<p>Hello <b>big</b>world, <a href="/x">link</a>!</p>');
  });
  it('copies pre content verbatim and keeps comments', () => {
    const out = beautifyHtml('<div><!-- note --><pre>  a\n    b</pre></div>');
    expect(out).toBe('<div>\n  <!-- note -->\n  <pre>  a\n    b</pre>\n</div>');
  });
  it('does not split script content that contains < characters', () => {
    const out = beautifyHtml('<script>if (a < b && c > d) { go(); }</script><div></div>');
    expect(out).toBe('<script>if (a < b && c > d) { go(); }</script>\n<div></div>');
  });
  it('handles self-closing syntax and quoted > in attributes', () => {
    expect(beautifyHtml('<section><svg/><button title="a>b">Go</button></section>')).toBe(
      '<section>\n  <svg />\n  <button title="a>b">Go</button>\n</section>',
    );
  });
});

describe('yaml-beautify', () => {
  it('keeps sibling keys at their original nesting level', () => {
    expect(beautifyYaml('a:\n    b: 1\n    c: 2\nd: 3\n')).toBe('a:\n  b: 1\n  c: 2\nd: 3\n');
  });
  it('preserves anchors, merge keys, comments and multiple documents', () => {
    const out = beautifyYaml('base: &b\n    x: 1\nchild:\n    <<: *b\n    y: 2 # note\n---\nsecond: true\n');
    expect(out).toBe('base: &b\n  x: 1\nchild:\n  <<: *b\n  y: 2 # note\n---\nsecond: true\n');
  });
  it('reports invalid YAML and duplicate keys with a position', () => {
    expect(() => beautifyYaml('a: [1, 2\n')).toThrow(/line/);
    expect(() => beautifyYaml('a: 1\na: 2\n')).toThrow(/unique/);
  });
  it('does not re-wrap long strings', () => {
    const long = 'word '.repeat(30).trim();
    expect(beautifyYaml(`k: ${long}\n`)).toBe(`k: ${long}\n`);
  });
});

describe('xml-beautify', () => {
  it('rejects malformed XML instead of formatting the parser error', () => {
    expect(() => beautifyXml('<a><b></a>')).toThrow();
    expect(() => minifyXml('<a><b></a>')).toThrow();
  });
  it('keeps escaping in text and attribute values', () => {
    expect(beautifyXml('<r><a t="x &amp; &quot;y&quot;">1 &lt; 2</a></r>')).toBe('<r>\n  <a t="x &amp; &quot;y&quot;">1 &lt; 2</a>\n</r>');
  });
  it('keeps comments, CDATA and processing instructions', () => {
    const out = beautifyXml('<?xml version="1.0"?><r><!-- c --><?pi data?><s><![CDATA[a < b]]></s></r>');
    expect(out).toBe('<?xml version="1.0"?>\n<r>\n  <!-- c -->\n  <?pi data?>\n  <s><![CDATA[a < b]]></s>\n</r>');
  });
  it('does not add whitespace inside mixed content', () => {
    expect(beautifyXml('<doc><p>Hello <b>world</b>!</p></doc>')).toBe('<doc>\n  <p>Hello <b>world</b>!</p>\n</doc>');
  });
  it('minifies without touching text content', () => {
    expect(minifyXml('<r>\n  <a> keep  this </a>\n  <b/>\n</r>')).toBe('<r><a> keep  this </a><b/></r>');
  });
});

describe('json-to-typescript-generator', () => {
  it('parenthesises union element types in arrays', () => {
    expect(generateTypescript('{"v":[1,"a"]}')).toContain('v: (number | string)[];');
  });
  it('keeps null inside arrays even when nulls are treated as optional', () => {
    expect(generateTypescript('{"tags":["a",null]}')).toContain('tags: (string | null)[];');
  });
  it('does not name the item type of a root array after the root alias', () => {
    const out = generateTypescript('[{"id":1}]');
    expect(out).toContain('export type Root = RootItem[];');
    expect(out).toContain('export interface RootItem {');
  });
  it('produces valid type names for keys that start with digits', () => {
    expect(generateTypescript('{"2fa":{"on":true}}')).toContain('export interface T2fa {');
  });
  it('merges differently shaped objects in a mixed array into one type with optional fields', () => {
    const out = generateTypescript('{"items":[1,{"a":1},{"b":"x"}]}');
    expect(out).toContain('items: (number | Item)[];');
    expect(out).toMatch(/a\?: number;[\s\S]*b\?: string;/);
    expect(out).not.toContain('Item2');
  });
  it('quotes keys that are not identifiers and marks null fields optional', () => {
    const out = generateTypescript('{"first-name":"a","email":null,"class":1}');
    expect(out).toContain('"first-name": string;');
    expect(out).toContain('email?: null;');
    expect(out).toContain('"class": number;');
  });
});

describe('excel-to-json-converter', () => {
  const buildWorkbook = () => {
    const people = XLSX.utils.aoa_to_sheet([['name', 'joined', 'zip', 'score'], ['Ada', 0, '00123', 5], ['Lin', 0, null, null]]);
    people.B2 = { t: 'n', v: 45306, z: 'yyyy-mm-dd' };
    people.B3 = { t: 'n', v: 45444.5625, z: 'yyyy-mm-dd hh:mm' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, people, 'People');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], [1]]), 'Other');
    return readWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  };
  it('converts date cells to ISO strings instead of Excel serial numbers', () => {
    const rows = sheetToJson(buildWorkbook(), 'People', { includeHeaders: true, outputFormat: 'object' });
    expect(rows).toEqual([
      { name: 'Ada', joined: '2024-01-15', zip: '00123', score: 5 },
      { name: 'Lin', joined: '2024-06-01T13:30:00', zip: null, score: null },
    ]);
  });
  it('reads any sheet and uses column letters when there is no header row', () => {
    const wb = buildWorkbook();
    expect(wb.SheetNames).toEqual(['People', 'Other']);
    expect(sheetToJson(wb, 'Other', { includeHeaders: false, outputFormat: 'object' })).toEqual([{ A: 'x' }, { A: 1 }]);
    expect(sheetToJson(wb, 'Other', { includeHeaders: false, outputFormat: 'array' })).toEqual([[1]]);
  });
  it('keeps CSV leading zeros and ISO dates as written', () => {
    const wb = readWorkbook(new TextEncoder().encode('id,zip,date,ok\n1,00123,2024-01-15,TRUE\n'));
    expect(sheetToJson(wb, wb.SheetNames[0], { includeHeaders: true, outputFormat: 'object' })).toEqual([
      { id: 1, zip: '00123', date: '2024-01-15', ok: true },
    ]);
  });
  it('formats serials time-zone independently', () => {
    expect(excelSerialToIso(1)).toBe('1900-01-01');
    expect(excelSerialToIso(0.75)).toBe('18:00:00');
  });
});

describe('data-visualization-tool', () => {
  it('keeps ISO dates as text and respects quoted commas', () => {
    const parsed = parseChartCsv('Date,Label,Revenue\n2024-01-01,"Jan, early",45000\n2024-02-01,Feb,52000');
    expect(parsed.data[0]).toEqual({ Date: '2024-01-01', Label: 'Jan, early', Revenue: 45000 });
  });
  it('counts the maximum value in the histogram', () => {
    const bins = computeHistogram([0, 5, 10]);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3);
    expect(bins[9].count).toBe(1);
  });
  it('handles a histogram where every value is equal and skips blanks', () => {
    expect(computeHistogram([7, 7, '', 'x'])).toEqual([{ range: '7', count: 2, frequency: 2 }]);
  });
  it('gives the largest heat map value the darkest shade', () => {
    expect(heatColorIndex(100, 100, 5)).toBe(0);
    expect(heatColorIndex(1, 100, 5)).toBe(4);
    expect(heatColorIndex(5, 0, 5)).toBe(4);
  });
  it('picks columns from the new dataset, not the previous one', () => {
    const parsed = parseChartCsv('Date,Revenue,Users\n2024-01-01,1,2');
    expect(pickColumns('line', 'timeSeries', parsed)).toEqual({ x: 'Date', y: 'Revenue', group: 'none' });
    expect(pickColumns('bar', null, parsed)).toEqual({ x: 'Date', y: 'Revenue', group: 'none' });
  });
});
