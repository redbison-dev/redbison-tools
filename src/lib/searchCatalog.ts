import { catalog, type CatalogTool } from '@/catalog';

/**
 * Browser-side tool search: name prefix first, then name substring, then
 * description or subcategory substring. Pure, so the tests can pin it.
 */
export function searchCatalog(query: string, limit = 8): CatalogTool[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: CatalogTool[] = [];
  const names: CatalogTool[] = [];
  const rest: CatalogTool[] = [];
  for (const tool of catalog) {
    const name = tool.name.toLowerCase();
    if (name.startsWith(q)) starts.push(tool);
    else if (name.includes(q)) names.push(tool);
    else if (tool.desc.toLowerCase().includes(q) || tool.subcategory.toLowerCase().includes(q) || tool.id.includes(q)) rest.push(tool);
  }
  return [...starts, ...names, ...rest].slice(0, limit);
}
