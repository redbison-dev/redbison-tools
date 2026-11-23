import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalog } from '@/catalog';
import { subcategoryIcons, toolIcons } from '@/catalogIcons';
import { toolRoutes } from '@/toolRoutes';

describe('catalog', () => {
  it('ships exactly 116 tools: the top 100 plus the debugging and file-analysis family', () => {
    expect(catalog.length).toBe(116);
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

  it('every tool and subcategory has an icon', () => {
    for (const tool of catalog) {
      expect(toolIcons[tool.id], `${tool.id} has no icon`).toBeTruthy();
      expect(subcategoryIcons[tool.subcategory], `${tool.subcategory} has no icon`).toBeTruthy();
    }
  });

  it('TOOLS.md documents every tool', () => {
    const md = readFileSync(resolve(__dirname, '../../TOOLS.md'), 'utf8');
    for (const tool of catalog) {
      expect(md, tool.id).toContain(`**${tool.name}**`);
      expect(md, tool.id).toContain(`https://redbison.dev/${tool.id})`);
    }
  });
});
