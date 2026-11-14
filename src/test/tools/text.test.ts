import { describe, it, expect } from 'vitest';
import { addEscapes, removeEscapes } from '@/lib/tools/escape-characters';
import {
  collapseSpaces,
  commitHistory,
  lineCount,
  linesToComma,
  redoHistory,
  replaceAllLiteral,
  sortLines,
  toCamelCase,
  undoHistory,
  type TextHistory,
} from '@/lib/tools/online-text-processor';
import { findDuplicateEntries } from '@/lib/tools/find-duplicate-entries';
import { countWords, topWords } from '@/lib/tools/word-cloud-generator';
import { compareLists } from '@/lib/tools/list-comparison';
import {
  formatInTimeZone,
  fromDateTimeLocalValue,
  getOffsetMinutes,
  isValidTimeZone,
  parseTimeParam,
  parseZonesParam,
  toDateTimeLocalValue,
} from '@/lib/tools/timezone-converter';

describe('escape-characters', () => {
  it('does not treat regex word boundaries as backspaces when escaping', () => {
    expect(addEscapes('hello world')).toBe('hello world');
  });

  it('escapes backslashes, quotes and control characters', () => {
    expect(addEscapes('say "hi"\n\tit\'s C:\\temp')).toBe('say \\"hi\\"\\n\\tit\\\'s C:\\\\temp');
    expect(addEscapes('\b\f\v\0')).toBe('\\b\\f\\v\\0');
  });

  it('unescapes an escaped backslash followed by a letter as a backslash and the letter', () => {
    expect(removeEscapes('C:\\\\new\\\\bin')).toBe('C:\\new\\bin');
  });

  it('round-trips arbitrary text', () => {
    const samples = ['C:\\new\\table', 'line1\nline2\r\n\t"q" \'s\'', 'a\\nb', '\b\f\v\0', ''];
    for (const s of samples) expect(removeEscapes(addEscapes(s))).toBe(s);
  });

  it('leaves unknown escapes alone', () => {
    expect(removeEscapes('\\q \\u00e9')).toBe('\\q \\u00e9');
  });
});

describe('online-text-processor', () => {
  it('undo returns to the text before the last operation, and redo restores the result', () => {
    let h: TextHistory = { stack: [''], index: 0 };
    h = commitHistory(h, 'abc', 'ABC');
    const undone = undoHistory(h)!;
    expect(undone.stack[undone.index]).toBe('abc');
    const redone = redoHistory(undone)!;
    expect(redone.stack[redone.index]).toBe('ABC');
    expect(undoHistory(undoHistory(h)!)!.stack[0]).toBe('');
  });

  it('a new edit after undo drops the redo branch', () => {
    let h: TextHistory = { stack: [''], index: 0 };
    h = commitHistory(h, 'a', 'A');
    h = undoHistory(h)!;
    h = commitHistory(h, 'a', 'a!');
    expect(h.stack).toEqual(['', 'a', 'a!']);
    expect(redoHistory(h)).toBeNull();
  });

  it('caps history at 50 entries', () => {
    let h: TextHistory = { stack: [''], index: 0 };
    for (let i = 0; i < 80; i++) h = commitHistory(h, String(i), String(i + 1));
    expect(h.stack.length).toBe(50);
    expect(h.stack[h.index]).toBe('80');
  });

  it('find and replace inserts $ patterns literally', () => {
    expect(replaceAllLiteral('price: X', 'X', '$&5', true)).toBe('price: $&5');
    expect(replaceAllLiteral('a.b.c', '.', '-', true)).toBe('a-b-c');
    expect(replaceAllLiteral('Cat cat', 'cat', 'dog', false)).toBe('dog dog');
  });

  it('camelCase handles all-caps input, separators and each line', () => {
    expect(toCamelCase('HELLO WORLD')).toBe('helloWorld');
    expect(toCamelCase('user-id value')).toBe('userIdValue');
    expect(toCamelCase('first name\nlast_name')).toBe('firstName\nlastName');
    expect(toCamelCase('XMLHttpRequest')).toBe('xmlhttpRequest');
  });

  it('sorts lines alphabetically regardless of case', () => {
    expect(sortLines('banana\nApple\ncherry')).toBe('Apple\nbanana\ncherry');
  });

  it('counts zero lines for empty input', () => {
    expect(lineCount('')).toBe(0);
    expect(lineCount('a\nb')).toBe(2);
  });
});

describe('remove-extra-spaces', () => {
  it('keeps line breaks while collapsing spaces, tabs and non-breaking spaces', () => {
    expect(collapseSpaces('  This   text\n\thas \u00a0 extra   spaces  ')).toBe('This text\nhas extra spaces');
  });
});

describe('lines-to-comma', () => {
  it('trims each line and skips blank ones', () => {
    expect(linesToComma('apple \n\n banana\ncherry  ')).toBe('apple, banana, cherry');
  });
});

describe('find-duplicate-entries', () => {
  const opts = { caseSensitive: false, trimSpaces: true, removeExtraSpaces: false, showOnlyDuplicates: true, includeCount: true };

  it('reports duplicate types even when all entries are shown', () => {
    const { stats } = findDuplicateEntries('a\nb\na\nc\nb\na', { ...opts, showOnlyDuplicates: false });
    expect(stats).toEqual({ totalLines: 6, uniqueLines: 3, duplicateLines: 3, duplicateCount: 2 });
  });

  it('uses singular "time" for single occurrences', () => {
    const { output } = findDuplicateEntries('a\nb\nA', { ...opts, showOnlyDuplicates: false });
    expect(output).toBe('a (appears 2 times)\nb (appears 1 time)');
  });

  it('lists only duplicates by default, case-insensitively and trimmed', () => {
    expect(findDuplicateEntries('Apple\n apple \nPear', opts).output).toBe('Apple (appears 2 times)');
    expect(findDuplicateEntries('x\ny', opts).output).toBe('No duplicate entries found.');
  });
});

describe('word-cloud-generator', () => {
  const opts = { caseSensitive: false, minWordLength: 3, removeStopWords: true };

  it('keeps accented and non-Latin words whole', () => {
    const counts = countWords('Café café naïve Москва Москва', opts);
    expect(counts.get('café')).toBe(2);
    expect(counts.get('naïve')).toBe(1);
    expect(counts.get('москва')).toBe(2);
  });

  it('drops stop words and short words, and ranks by frequency', () => {
    const counts = countWords('The cat and the dog. The cat sat.', opts);
    expect(topWords(counts, 10)).toEqual([['cat', 2], ['dog', 1], ['sat', 1]]);
  });
});

describe('list-comparison', () => {
  const opts = { caseSensitive: false, trimWhitespace: true, ignoreEmpty: true };

  it('keeps the original spelling of items in case-insensitive mode', () => {
    const r = compareLists('Apple\nBanana\nCherry', 'apple\nDate', opts);
    expect(r.common).toEqual(['Apple']);
    expect(r.leftOnly).toEqual(['Banana', 'Cherry']);
    expect(r.rightOnly).toEqual(['Date']);
    expect(r.similarityPercentage).toBe(40);
  });

  it('treats lists as sets', () => {
    const r = compareLists('a\na\nb', 'b\nb', { ...opts, caseSensitive: true });
    expect(r.leftTotal).toBe(2);
    expect(r.rightTotal).toBe(1);
    expect(r.common).toEqual(['b']);
  });
});

describe('timezone-converter', () => {
  it('rejects names that are not IANA zones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    for (const bad of ['Asia/Mumbai', 'Asia/Delhi', 'Asia/Bangalore', 'Asia/Chennai', 'Asia/Beijing']) {
      expect(isValidTimeZone(bad)).toBe(false);
    }
  });

  it('interprets the entered time in the source zone, not the browser zone', () => {
    expect(fromDateTimeLocalValue('2026-01-15T09:30', 'America/New_York')!.toISOString()).toBe('2026-01-15T14:30:00.000Z');
    expect(fromDateTimeLocalValue('2026-07-15T09:30', 'America/New_York')!.toISOString()).toBe('2026-07-15T13:30:00.000Z');
    expect(fromDateTimeLocalValue('2026-01-15T09:30', 'Asia/Kolkata')!.toISOString()).toBe('2026-01-15T04:00:00.000Z');
  });

  it('shows the instant as wall time in the source zone', () => {
    const d = new Date('2026-01-15T14:30:00Z');
    expect(toDateTimeLocalValue(d, 'America/New_York')).toBe('2026-01-15T09:30');
    expect(toDateTimeLocalValue(d, 'Asia/Kathmandu')).toBe('2026-01-15T20:15');
  });

  it('handles DST gaps and overlaps', () => {
    // 02:30 does not exist in New York on 8 March 2026; it resolves to 03:30 EDT.
    expect(fromDateTimeLocalValue('2026-03-08T02:30', 'America/New_York')!.toISOString()).toBe('2026-03-08T07:30:00.000Z');
    // 01:30 happens twice on 1 November 2026; the first (EDT) is chosen.
    expect(fromDateTimeLocalValue('2026-11-01T01:30', 'America/New_York')!.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('reports offsets in minutes', () => {
    expect(getOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'America/New_York')).toBe(-300);
    expect(getOffsetMinutes(new Date('2026-07-15T00:00:00Z'), 'Europe/London')).toBe(60);
    expect(getOffsetMinutes(new Date('2026-07-15T00:00:00Z'), 'Asia/Kathmandu')).toBe(345);
  });

  it('formats midnight as 00, not 24', () => {
    expect(formatInTimeZone(new Date('2026-01-15T00:05:00Z'), 'UTC')).toBe('01/15/2026, 00:05:00');
  });

  it('ignores unparseable share parameters instead of crashing', () => {
    expect(parseTimeParam('not a date')).toBeNull();
    expect(fromDateTimeLocalValue('', 'UTC')).toBeNull();
    expect(parseZonesParam(encodeURIComponent(JSON.stringify(['UTC', 'Asia/Mumbai', 'Asia/Tokyo'])))).toEqual(['UTC', 'Asia/Tokyo']);
    expect(parseZonesParam('garbage')).toBeNull();
  });
});
