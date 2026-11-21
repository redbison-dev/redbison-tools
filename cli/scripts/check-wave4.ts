import { compare, type Case } from './compare-local';
const cases: Case[] = [
  { id: 'json-to-yaml', input: '{"a":1,"b":[1,2],"c":{"d":"x y"}}', options: {} },
  { id: 'json-to-yaml', input: '{"list":[{"n":1},{"n":2}],"empty":[],"nil":null}', options: {} },
  { id: 'yaml-to-json', input: 'a: 1\nb:\n  - x\n  - y\nc:\n  d: true', options: {} },
  { id: 'yaml-to-json', input: 'name: RedBison\ncount: 100\nflow: [1, 2]', options: {} },
  { id: 'yaml-beautify', input: 'a:  1\n\n\n\nb:\t2   \n', options: {} },
  { id: 'html-beautify', input: '<div><p>hi</p><br><img src="x"></div>', options: {} },
  { id: 'html-beautify', input: '<ul><li>a</li><li>b</li></ul>', options: { indent: 4 } },
  { id: 'xml-beautify', input: '<?xml version="1.0"?><root><a x="1"/><b>t</b></root>', options: {} },
  { id: 'sql-beautify', input: 'select a,b from t where x=1 and y=2 order by a', options: {} },
  { id: 'sql-beautify', input: 'SELECT * FROM a LEFT JOIN b ON a.id=b.id WHERE a.x>1', options: {} },
  { id: 'cron', input: '*/15 * * * *', options: {} },
  { id: 'cron', input: '0 0 1 1 0', options: {} },
  { id: 'cron', input: '99 * * * *', options: {}, envelopedRefusal: true },
  { id: 'cron', input: 'not a cron', options: {}, envelopedRefusal: true },
  { id: 'timezone-convert', input: '2026-01-15T14:30:00Z', options: { to: 'America/New_York' } },
  { id: 'timezone-convert', input: '2026-07-15T14:30:00Z', options: { to: 'Asia/Tokyo' } },
  { id: 'text-diff', input: 'one\ntwo\nthree', options: { b: 'one\n2\nthree' } },
  { id: 'text-diff', input: 'a\nb', options: { b: 'a\nb\nc' } },
];
void compare(cases).then((bad) => process.exit(bad ? 1 : 0));
