import { compare, type Case } from './compare-local';
const cases: Case[] = [
  { id: 'contrast-check', input: '#b32020', options: { background: '#ffffff' } },
  { id: 'contrast-check', input: '#767676', options: { background: '#ffffff' } },
  { id: 'contrast-check', input: '#000000', options: { background: '#ffffff' } },
  { id: 'color-convert', input: '#3B82F6', options: {} },
  { id: 'color-convert', input: 'rgb(59,130,246)', options: {} },
  { id: 'color-convert', input: 'hsl(217,91%,60%)', options: {} },
  { id: 'color-convert', input: '#abc', options: {} },
  { id: 'css-gradient', input: '', options: { type: 'linear', angle: 45, stops: '#b32020,#d4af37' } },
  { id: 'css-gradient', input: '', options: { type: 'radial', stops: '#000,#fff,#000' } },
];
void compare(cases).then((bad) => process.exit(bad ? 1 : 0));
