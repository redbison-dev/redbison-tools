/**
 * Date text shared by src/i18n/format.ts and src/lib (step dates, tool date
 * helpers). Import-free, like src/lib/msg.ts, so the MCP bundle can include it.
 */

/**
 * `f.format(d)`, except that a French date with a written month says « 1er »
 * on the first of the month (« 1er novembre 2026 », « mercredi 1er avril »,
 * docs/seo/i18n/fr-FR.md, Dates), which Intl does not. Numeric dates
 * (01/11/2026), every other day and every other locale are unchanged, so
 * English output is exactly f.format(d).
 */
export function formatDateParts(f: Intl.DateTimeFormat, d: Date | number): string {
  if (!f.resolvedOptions().locale.startsWith('fr')) return f.format(d);
  const parts = f.formatToParts(d);
  const wordMonth = parts.some((p) => p.type === 'month' && /\p{L}/u.test(p.value));
  return parts.map((p) => (p.type === 'day' && wordMonth && /^0?1$/.test(p.value) ? '1er' : p.value)).join('');
}
