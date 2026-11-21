import { compare, type Case } from './compare-local';
const cases: Case[] = [
  { id: 'curl-to-code', input: "curl -X POST https://api.example.com/v1/items -H 'Authorization: Bearer t' -d '{\"a\":1}'", options: { target: 'python' } },
  { id: 'curl-to-code', input: 'curl https://example.com', options: { target: 'go' } },
  { id: 'curl-to-code', input: "curl -X PUT https://api.example.com/a -H 'X-Key: v' -d 'x=1'", options: { target: 'php' } },
  { id: 'curl-to-code', input: 'curl https://example.com/a?b=c', options: {} },
  { id: 'morse', input: 'HELLO WORLD', options: {} },
  { id: 'morse', input: '.... . .-.. .-.. ---', options: {} },
  { id: 'nato', input: 'RedBison 42', options: {} },
  { id: 'nato', input: 'Romeo Echo Delta', options: { direction: 'decode' } },
  { id: 'readability', input: 'The quick brown fox jumps over the lazy dog. It was remarkably effective, and the implementation was subsequently utilised by numerous organisations.', options: {} },
  { id: 'gitignore', input: '', options: { templates: 'node,macos' } },
  { id: 'gitignore', input: '', options: { templates: 'python', extra: '*.bak' } },
  { id: 'redirect-rules', input: '/old /new\n/a /b 302', options: { platform: 'nginx' } },
  { id: 'redirect-rules', input: '/old /new', options: { platform: 'netlify', forceHttps: true } },
  { id: 'barcode-check', input: '400638133393', options: { mode: 'compute' } },
  { id: 'barcode-check', input: '4006381333931', options: { mode: 'validate' } },
  { id: 'number-to-words', input: '1234.56', options: {} },
  { id: 'number-to-words', input: '-17', options: {} },
  { id: 'color-palette', input: '#b32020', options: { rule: 'complementary' } },
  { id: 'color-palette', input: '#1e90ff', options: { rule: 'triadic', wheel: 'ryb', name: 'brand' } },
];
void compare(cases).then((bad) => process.exit(bad ? 1 : 0));
