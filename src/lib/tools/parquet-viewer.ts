/**
 * The Parquet viewer page's export half: summaries of the metadata the
 * dependency-free reader (parquet-meta.ts) produced, as JSON, CSV or YAML.
 */
import Papa from 'papaparse';
import YAML from 'yaml';
import type { ParquetMetadata } from './parquet-meta';

export { isParquet, readParquetMetadata } from './parquet-meta';
export type { ParquetColumn, ParquetMetadata } from './parquet-meta';

export function convertParquetSummary(data: unknown, format: 'json' | 'csv' | 'yaml'): string {
  if (format === 'json') return JSON.stringify(data, null, 2);
  if (format === 'yaml') return YAML.stringify(data);
  const d = data as any;
  const rows: unknown[] | undefined = Array.isArray(d) ? d : Array.isArray(d?.sample_data) ? d.sample_data : Array.isArray(d?.schema?.fields) ? d.schema.fields : undefined;
  if (!rows || rows.length === 0) throw new Error('Nothing tabular to convert to CSV');
  const flat = rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r)
    ? Object.fromEntries(Object.entries(r as Record<string, unknown>).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v]))
    : { value: r }));
  const fields = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  return Papa.unparse({ fields, data: flat.map((r) => fields.map((f) => (r as Record<string, unknown>)[f] ?? '')) });
}
