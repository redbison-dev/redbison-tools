/**
 * Argument parsing.
 *
 * A CLI's parser is where the damage happens quietly: a flag it does not
 * recognise, silently ignored, means the tool runs with its default and the
 * answer looks exactly like a right one. `redbison hash --algoritm sha512`
 * returning a SHA-256 digest with no complaint is the failure these tests
 * exist to prevent.
 */
import { describe, it, expect } from 'vitest';
import { parseArgs, ArgError, missingRequired } from '../args';

const parse = (s: string) => parseArgs(s.split(' ').filter(Boolean));

describe('parsing', () => {
  it('takes the tool name first', () => {
    expect(parse('json-format').tool).toBe('json-format');
  });

  it('reads an option and its value', () => {
    expect(parse('hash --algorithm sha512').options).toEqual({ algorithm: 'sha512' });
  });

  it('reads --key=value as well', () => {
    expect(parse('hash --algorithm=sha512').options).toEqual({ algorithm: 'sha512' });
  });

  it('keeps a value containing an equals sign intact', () => {
    expect(parse('regex-test --pattern=a=b').options.pattern).toBe('a=b');
  });

  it('collects positional text as the input', () => {
    expect(parse('case-convert hello world').input).toBe('hello world');
  });

  it('treats everything after -- as input, not flags', () => {
    expect(parseArgs(['sort-lines', '--', '--not-a-flag']).input).toBe('--not-a-flag');
  });

  it('reads @path as a file', () => {
    expect(parse('json-format @data.json').file).toBe('data.json');
  });

  it('reads --file as a file', () => {
    expect(parse('json-format --file data.json').file).toBe('data.json');
  });

  it('coerces a numeric option', () => {
    const p = parse('wrap-lines --width 40');
    expect(p.options.width).toBe(40);
    expect(typeof p.options.width).toBe('number');
  });

  it('allows a negative number as input without reading it as a flag', () => {
    expect(parse('number-to-words -42').tool).toBe('number-to-words');
  });

  describe('refusing what it cannot honour', () => {
    it('rejects an unknown option rather than ignoring it', () => {
      expect(() => parse('hash --algoritm sha512')).toThrow(ArgError);
    });

    it('names the options the tool does take', () => {
      expect(() => parse('hash --nope x')).toThrow(/--algorithm, --encoding/);
    });

    it('suggests the option that was probably meant', () => {
      expect(() => parse('hash --algoritm sha512')).toThrow(/Did you mean --algorithm\?/);
    });

    it('says a tool takes no options when it takes none', () => {
      expect(() => parse('rot13 --style x')).toThrow(/takes no options/);
    });

    it('rejects a value outside a closed set', () => {
      expect(() => parse('hash --algorithm sha3')).toThrow(/one of: sha256/);
    });

    it('rejects a non-number for a numeric option', () => {
      expect(() => parse('wrap-lines --width wide')).toThrow(/takes a number/);
    });

    it('rejects an option with no value', () => {
      expect(() => parse('hash --algorithm')).toThrow(/needs a value/);
    });

    it('rejects an option given before the tool name', () => {
      expect(() => parse('--algorithm sha512 hash')).toThrow(/comes after the tool name/);
    });

    it('rejects a single-hyphen flag', () => {
      expect(() => parse('hash -algorithm sha512')).toThrow(/--like-this/);
    });
  });

  describe('boolean switches', () => {
    it('a bare switch is true', () => {
      expect(parse('css-beautify --sort').options).toEqual({ sort: true });
    });

    it('a switch does not swallow the input that follows it', () => {
      // The bug this prevents: reading the css as the value of --sort and
      // refusing a command that is obviously correct.
      const p = parse('css-beautify --sort a{color:red}');
      expect(p.options).toEqual({ sort: true });
      expect(p.input).toBe('a{color:red}');
    });

    it('--no-x sets it false', () => {
      expect(parse('css-beautify --no-sort').options).toEqual({ sort: false });
    });

    it('--x=false sets it false', () => {
      expect(parse('css-beautify --sort=false').options).toEqual({ sort: false });
    });

    it('--x=true sets it true', () => {
      expect(parse('css-beautify --sort=true').options).toEqual({ sort: true });
    });

    it('rejects a value that is not a boolean', () => {
      expect(() => parse('css-beautify --sort=maybe')).toThrow(/true or false/);
    });

    it('--no-x on an option that is not boolean is still unknown', () => {
      expect(() => parse('hash --no-algorithm')).toThrow(ArgError);
    });
  });

  describe('global flags', () => {
    it('reads --help', () => expect(parse('--help').help).toBe(true));
    it('reads -h', () => expect(parse('-h').help).toBe(true));
    it('reads --help after a tool', () => expect(parse('hash --help').help).toBe(true));
    it('reads --list', () => expect(parse('--list').list).toBe(true));
    it('reads --offline', () => expect(parse('yaml-to-json --offline').offline).toBe(true));
    it('reads --json', () => expect(parse('hash --json abc').json).toBe(true));
    it('reads --ui and --no-ui', () => {
      expect(parse('--ui').ui).toBe(true);
      expect(parse('--no-ui').noUi).toBe(true);
      expect(parse('--no-tui').noUi).toBe(true);
    });
    it('reads --theme, before any tool is named', () => {
      // The picker runs when no tool is named, so its flags cannot wait for
      // one: --theme on its own used to be refused as "an option of a tool".
      expect(parse('--theme terminal').theme).toBe('terminal');
      expect(parse('--theme=none').theme).toBe('none');
      expect(() => parse('--theme')).toThrow(/terminal, default or none/);
    });
  });
});

describe('required options', () => {
  it('reports one that is missing', () => {
    expect(missingRequired('hmac', {}).map((o) => o.key)).toEqual(['key']);
  });

  it('reports none when it is given', () => {
    expect(missingRequired('hmac', { key: 's' })).toEqual([]);
  });

  it('reports nothing for a tool with no required options', () => {
    expect(missingRequired('hash', {})).toEqual([]);
  });
});
