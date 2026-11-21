/**
 * Searching by what a tool is for.
 *
 * The thing worth protecting is that the words people actually type find the
 * right tool: nobody searches for `epoch` when they want a unix timestamp, or
 * `json-format` when they want to pretty-print. The keyword list behind that
 * is the website's own, generated into the catalogue, so these cases are the
 * contract between the two.
 *
 * The other half is precision. A search that answers everything is a search
 * that answers nothing, so there are as many assertions here about what must
 * *not* come back as about what must.
 */
import { describe, it, expect } from 'vitest';
import { TOOLS } from '../catalog';
import { optionsFor } from '../options';
import { formatHits, normalise, searchTools, similarity } from '../search';

const ids = (query: string, n = 5) => searchTools(query).slice(0, n).map((h) => h.tool.id);
const top = (query: string) => ids(query, 1)[0];

describe('finding a tool by what it does', () => {
  it('answers the words people type instead of the name', () => {
    expect(top('unix timestamp')).toBe('epoch');
    expect(top('pretty print json')).toBe('json-format');
    expect(top('strip html tags')).toBe('strip-html');
    expect(ids('sha256')).toContain('hash');
    expect(ids('password')).toContain('password');
    expect(top('subnet')).toBe('subnet');
    expect(ids('cidr')).toContain('subnet');
  });

  it('reads an option value as part of what the tool is for', () => {
    // v7 is a value of uuid's --variant, sha512 of hash's --algorithm.
    expect(ids('uuid v7')).toContain('uuid');
    expect(ids('sha512')).toContain('hash');
  });

  it('still answers initials, for people who know the catalogue', () => {
    expect(ids('b64')).toEqual(expect.arrayContaining(['base64-encode', 'base64-decode']));
    expect(top('jsf')).toBe('json-format');
  });

  it('puts the exact name first when there is one', () => {
    expect(top('hash')).toBe('hash');
    expect(top('cron')).toBe('cron');
    expect(top('json-format')).toBe('json-format');
  });

  it('ignores the words that carry no intent', () => {
    expect(top('how do I convert a unix timestamp')).toBe('epoch');
    // Not an assertion about which hashing tool wins — "file" is a word
    // hash-compare legitimately owns — only that the filler words neither
    // break the query nor swamp it.
    expect(ids('what is the sha256 of a file')).toContain('hash-compare');
    expect(ids('show me the sha256')).toContain('hash');
  });

  it('forgives a misspelling, including a British one', () => {
    expect(ids('colour')).toContain('color-convert');
    expect(ids('passwrod')).toContain('password');
  });

  it('is not case or punctuation sensitive', () => {
    expect(top('JSON Format')).toBe('json-format');
    expect(top('json_format')).toBe('json-format');
    expect(top('  json   format  ')).toBe('json-format');
  });
});

describe('what must not come back', () => {
  it('nothing at all for a query this package has no answer to', () => {
    // There is no QR tool in the 100, and answering with morse and
    // curl-to-code because they contain "code" is worse than answering
    // nothing: the caller can then be told where the tool does live.
    expect(searchTools('qr code')).toEqual([]);
    expect(searchTools('zzzz')).toEqual([]);
    expect(searchTools('')).toEqual([]);
    expect(searchTools('   ')).toEqual([]);
  });

  it('does not let one word of a two-word query drag in everything', () => {
    const hits = ids('json yaml', 50);
    expect(hits).toContain('json-to-yaml');
    expect(hits.length).toBeLessThan(8);
  });

  it('keeps a precise query precise', () => {
    expect(ids('base64 decode', 50)).toContain('base64-decode');
    expect(ids('base64 decode', 50).length).toBeLessThan(6);
  });

  it('refuses a near-miss on a short word, where one letter is the whole word', () => {
    // 'jsf' against 'jsx' scores 0.67 on edit distance, which is how a
    // JavaScript formatter used to answer a query for json-format.
    expect(similarity('jsf', 'jsx')).toBe(0);
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('base64', 'base32')).toBeGreaterThan(0.6);
  });
});

describe('the catalogue is searchable at all', () => {
  it('finds every tool by its own id', () => {
    const missed = TOOLS.filter((t) => !ids(t.id, 50).includes(t.id)).map((t) => t.id);
    expect(missed).toEqual([]);
  });

  it('finds every tool by its own title', () => {
    const missed = TOOLS.filter((t) => !ids(t.title, 50).includes(t.id)).map((t) => t.id);
    expect(missed).toEqual([]);
  });

  it('gives every tool keywords to be found by', () => {
    // The keywords are generated from the website's searchMetadata. A tool
    // with none is a tool only findable by a name its user does not know.
    const bare = TOOLS.filter((t) => normalise(t.keywords).split(' ').length < 3).map((t) => t.id);
    expect(bare).toEqual([]);
  });

  it('finds a tool by a keyword that is not in its name', () => {
    const outside = TOOLS.filter((t) => {
      const name = normalise(`${t.id} ${t.title}`).split(' ');
      const word = normalise(t.keywords)
        .split(' ')
        .find((w) => w.length > 4 && !name.includes(w));
      return word ? !ids(word, 50).includes(t.id) : false;
    }).map((t) => t.id);
    expect(outside).toEqual([]);
  });

  it('never returns a tool that is not in the catalogue it was given', () => {
    const local = TOOLS.filter((t) => t.offline);
    const hits = searchTools('json', local);
    expect(hits.every((h) => h.tool.offline)).toBe(true);
  });
});

describe('the printed list', () => {
  it('is the shape --list uses, so the two can be read together', () => {
    const line = formatHits(searchTools('unix timestamp')).split('\n')[0];
    expect(line).toMatch(/^epoch\s+local\s+\S/);
  });

  it('stops at the limit it was given', () => {
    expect(formatHits(searchTools('json'), 3).split('\n')).toHaveLength(3);
  });
});

describe('the keywords match the tools they were generated for', () => {
  it('names an option the tool takes, where the query is an option value', () => {
    // A guard on the generator: if option values stop reaching the index,
    // `uuid v7` quietly stops working and nothing else notices.
    const uuid = optionsFor('uuid').flatMap((o) => (o.values ?? []).map((v) => v.value));
    expect(uuid).toContain('v7');
  });
});
