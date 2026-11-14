import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/mcp/tools';

describe('mcp tool registry', () => {
  it('every tool has a description, schema and working example', async () => {
    for (const [name, tool] of Object.entries(TOOLS)) {
      expect(tool.description.length, name).toBeGreaterThan(20);
      expect((tool.inputSchema as { type: string }).type, name).toBe('object');
      const result = await tool.run(tool.example);
      expect(result, name).toBeTruthy();
    }
  });

  it('tools compute correct answers', async () => {
    expect((await TOOLS.hash_text.run({ text: 'abc', algorithm: 'SHA-256' })) as { hex: string }).toMatchObject({
      hex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    });
    expect(TOOLS.number_base_convert.run({ value: 'ff', fromBase: 16, toBase: 10 })).toEqual({ result: '255' });
    expect((TOOLS.epoch_convert.run({ value: '1700000000' }) as { iso: string; unit: string }).iso).toContain('2023-11-14');
    expect((TOOLS.base64_convert.run({ mode: 'encode', text: 'hello' }) as { result: string }).result).toBe('aGVsbG8=');
    expect((TOOLS.jwt_decode.run(TOOLS.jwt_decode.example) as { payload: { name: string } }).payload.name).toBe('John Doe');
    expect((TOOLS.cron_describe.run({ expression: '0 9 * * 1' }) as { description: string }).description).toContain('Monday');
  });

  it('every tool is documented in src/mcp/README.md', () => {
    const readme = readFileSync(resolve(__dirname, '../mcp/README.md'), 'utf8');
    for (const name of Object.keys(TOOLS)) {
      expect(readme, name).toContain(`\`${name}\``);
    }
  });

  it('bad input surfaces as an error, not a wrong answer', () => {
    expect(() => TOOLS.number_base_convert.run({ value: 'z9', fromBase: 10, toBase: 2 })).toThrow();
    expect(() => TOOLS.json_format.run({ json: '{nope' })).toThrow();
  });
});
