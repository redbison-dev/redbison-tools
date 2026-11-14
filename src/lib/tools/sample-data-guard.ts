/**
 * Decides whether "Load Sample" would overwrite something the user typed.
 * Blank strings, whitespace and empty list rows count as empty, so an
 * untouched form (or one holding an unedited sample) loads without asking.
 */
function normalize(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(normalize).filter((v) => !isBlank(v));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = normalize((value as Record<string, unknown>)[key]);
      if (!isBlank(v)) out[key] = v;
    }
    return out;
  }
  return value;
}

function isBlank(v: unknown): boolean {
  if (v === '' || v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

export function sameFormData(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** True when `current` differs from the defaults and from every known sample snapshot. */
export function shouldConfirmSampleOverwrite<T>(current: T, defaults: T, samples: readonly T[] = []): boolean {
  if (sameFormData(current, defaults)) return false;
  return !samples.some((s) => sameFormData(current, s));
}
