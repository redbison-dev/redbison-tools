/** Helpers for the Security Threat Checklist. */

/** Category filter options derived from the data, so every category can be selected. */
export function categoryOptions(threats: { category: string }[]): string[] {
  return ['all', ...Array.from(new Set(threats.map((t) => t.category))).sort((a, b) => a.localeCompare(b))];
}
