/**
 * Keyword-based SQL formatter. String literals, quoted identifiers, dollar-quoted
 * bodies and comments are protected first, so their contents (spacing, keywords
 * such as "and") are never changed and line comments still end their line.
 */
const PROTECTED = /'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\$([A-Za-z_]*)\$[\s\S]*?\$\1\$|--[^\n]*|\/\*[\s\S]*?\*\//g;

const CLAUSES = [
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
  'SELECT', 'INSERT INTO', 'DELETE FROM', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'VALUES', 'UPDATE', 'SET',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
];
const CLAUSE_RE = new RegExp(`\\b(${CLAUSES.map((c) => c.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi');

export function formatSql(input: string): string {
  const saved: string[] = [];
  const masked = input.replace(PROTECTED, (m) => {
    saved.push(m);
    return `\u0000${saved.length - 1}\u0000${m.startsWith('--') ? '\u0001' : ''}`;
  });
  const formatted = masked
    .replace(/\s+/g, ' ')
    .replace(/;\s*/g, ';\n\n')
    .replace(CLAUSE_RE, (m) => `\n${m.toUpperCase().replace(/\s+/g, ' ')}`)
    .replace(/\b(AND|OR)\b/gi, (m) => `\n  ${m.toUpperCase()}`)
    .replace(/\bON\b/gi, '\n  ON')
    .replace(/\u0001[ ]*\n?/g, '\n')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return formatted.replace(/\u0000(\d+)\u0000/g, (_m, i) => saved[Number(i)]);
}
