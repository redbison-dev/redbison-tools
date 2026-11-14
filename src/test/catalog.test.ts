import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalog } from '@/catalog';
import { toolRoutes } from '@/toolRoutes';

describe('catalog', () => {
  it('ships exactly 100 tools', () => {
    expect(catalog.length).toBe(100);
  });

  it('has unique ids, each with a name and description', () => {
    const ids = new Set(catalog.map((t) => t.id));
    expect(ids.size).toBe(catalog.length);
    for (const tool of catalog) {
      expect(tool.name.length, tool.id).toBeGreaterThan(2);
      expect(tool.desc.length, tool.id).toBeGreaterThan(5);
      expect(tool.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('has a route component for every tool and no orphan routes', () => {
    for (const tool of catalog) expect(toolRoutes[tool.id], tool.id).toBeTruthy();
    for (const id of Object.keys(toolRoutes)) expect(catalog.some((t) => t.id === id), id).toBe(true);
  });

  it('TOOLS.md documents every tool', () => {
    const md = readFileSync(resolve(__dirname, '../../TOOLS.md'), 'utf8');
    for (const tool of catalog) {
      expect(md, tool.id).toContain(`**${tool.name}**`);
      expect(md, tool.id).toContain(`https://redbison.dev/${tool.id})`);
    }
  });
});
