/**
 * The tools the extension answers itself.
 *
 * These are the same cases the IntelliJ plugin checks, so a shared command
 * cannot behave differently in the two editors. Every one runs with no
 * network, which is why the assertions can be exact.
 */
import * as assert from 'node:assert';
import { runLocal, LocalToolError } from '../../local';
import { TOOLS } from '../../catalog';

const run = (id: string, input: string, options: Record<string, unknown> = {}): string => {
  const out = runLocal(id, input, options);
  assert.ok(out !== undefined, `${id} was not handled locally`);
  return out;
};

suite('Native tools', () => {
  test('sorts lines, including naturally', () => {
    assert.strictEqual(run('sort-lines', 'c\na\nb'), 'a\nb\nc');
    assert.strictEqual(run('sort-lines', 'c\na\nb', { order: 'desc' }), 'c\nb\na');
    // file10 after file9, which plain sorting gets wrong.
    assert.strictEqual(run('sort-lines', 'file10\nfile9', { order: 'natural' }), 'file9\nfile10');
  });

  test('reverses lines and text', () => {
    assert.strictEqual(run('reverse-lines', 'a\nb\nc'), 'c\nb\na');
    assert.strictEqual(run('reverse-text', 'abc'), 'cba');
  });

  test('reversing keeps astral characters whole', () => {
    // Reversing by UTF-16 unit would split the surrogate pair into rubbish.
    assert.strictEqual(run('reverse-text', 'a\u{1F600}b'), 'b\u{1F600}a');
  });

  test('numbers lines with a right-aligned gutter', () => {
    assert.strictEqual(run('number-lines', 'a\nb'), '1. a\n2. b');
    const ten = run('number-lines', Array.from({ length: 10 }, () => 'x').join('\n'));
    assert.ok(ten.startsWith(' 1. x'), ten);
    assert.ok(ten.endsWith('10. x'), ten);
  });

  test('trims and wraps', () => {
    assert.strictEqual(run('trim-lines', '  a  \n  b  '), 'a\nb');
    const text = 'the quick brown fox jumps over the lazy dog';
    const wrapped = run('wrap-lines', text, { width: 20 });
    assert.ok(wrapped.split('\n').every((l) => l.length <= 20), wrapped);
    assert.strictEqual(wrapped.replace(/\n/g, ' '), text);
  });

  test('rot13 is its own inverse', () => {
    const once = run('rot13', 'Hello, World!');
    assert.strictEqual(once, 'Uryyb, Jbeyq!');
    assert.strictEqual(run('rot13', once), 'Hello, World!');
  });

  test('strips HTML and round-trips entities', () => {
    assert.strictEqual(run('strip-html', '<p>Hello <b>world</b></p>'), 'Hello world');
    const escaped = run('html-escape', '<a href="x">&</a>');
    assert.strictEqual(escaped, '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    assert.strictEqual(run('html-unescape', escaped), '<a href="x">&</a>');
  });

  test('hex round-trips and refuses odd input', () => {
    assert.strictEqual(run('to-hex', 'Hi'), '48 69');
    assert.strictEqual(run('from-hex', '48 69'), 'Hi');
    assert.strictEqual(run('from-hex', '0x48 0x69'), 'Hi');
    assert.throws(() => run('from-hex', 'abc'), LocalToolError, 'odd-length hex should be refused');
  });

  test('removes accents', () => {
    assert.strictEqual(run('remove-accents', 'résumé'), 'resume');
  });

  test('extracts URLs, addresses and numbers', () => {
    assert.strictEqual(run('extract-urls', 'see https://redbison.dev now'), 'https://redbison.dev');
    assert.strictEqual(run('extract-emails', 'mail a@b.com please'), 'a@b.com');
    assert.strictEqual(run('extract-numbers', '1 and -2.5'), '1\n-2.5');
  });

  test('sorts JSON keys at every level', () => {
    const out = run('sort-json-keys', '{"b":1,"a":{"d":2,"c":3}}');
    assert.ok(out.indexOf('"a"') < out.indexOf('"b"'), out);
    assert.ok(out.indexOf('"c"') < out.indexOf('"d"'), out);
  });

  test('query strings round-trip', () => {
    assert.ok(run('query-to-json', '?a=1&b=two').includes('"a"'));
    assert.strictEqual(run('json-to-query', '{"a":"1","b":"two"}'), 'a=1&b=two');
  });

  test('repeated query keys become an array', () => {
    const json = JSON.parse(run('query-to-json', 'x=1&x=2'));
    assert.deepStrictEqual(json.x, ['1', '2']);
  });

  test('parses a URL and refuses a non-URL', () => {
    const out = run('url-parse', 'https://redbison.dev:8443/a/b?q=1#frag');
    assert.ok(out.includes('Scheme:    https'), out);
    assert.ok(out.includes('Port:      8443'), out);
    assert.ok(out.includes('Fragment:  frag'), out);
    assert.throws(() => run('url-parse', 'not a url'), LocalToolError);
  });

  test('counts words and characters', () => {
    assert.ok(run('unique-words', 'a b a').startsWith('     2  a'));
    assert.ok(run('char-frequency', 'aab').startsWith('     2  a'));
  });

  test('shuffling keeps every line', () => {
    const input = Array.from({ length: 40 }, (_, i) => String(i)).join('\n');
    assert.deepStrictEqual(
      run('shuffle-lines', input).split('\n').sort(),
      input.split('\n').sort(),
    );
  });

  test('every tool marked native is actually implemented', () => {
    // A catalog entry marked native with no branch here would be a command
    // that silently does nothing.
    // A tool that throws on the probe input is handled; it just rejected
    // the input, which is the behaviour we want from from-hex and url-parse.
    const handled = (id: string): boolean => {
      try {
        return runLocal(id, 'test probe') !== undefined;
      } catch {
        return true;
      }
    };
    const unhandled = TOOLS.filter((t) => t.native).map((t) => t.id).filter((id) => !handled(id));
    assert.deepStrictEqual(unhandled, [], 'native in the catalog but not implemented');
  });
});
