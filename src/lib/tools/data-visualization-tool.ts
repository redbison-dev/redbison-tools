import Papa from 'papaparse';

export type CsvRow = Record<string, string | number>;
export type ParsedCsv = { headers: string[]; rows: CsvRow[]; data: CsvRow[] };

const NUMERIC_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

/** Converts a cell to a number only when the whole cell is numeric ("2024-01-01" stays text). */
export function toCellValue(raw: string): string | number {
  const v = raw.trim();
  return NUMERIC_RE.test(v) ? Number(v) : v;
}

/** RFC 4180 CSV parsing (quoted commas, doubled quotes, CRLF) with a header row. */
export function parseChartCsv(text: string): ParsedCsv {
  const empty: ParsedCsv = { headers: [], rows: [], data: [] };
  if (!text.trim()) return empty;
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: 'greedy' });
  const [headerRow, ...body] = result.data;
  if (!headerRow || !body.length) return empty;
  const headers = headerRow.map((h) => h.trim());
  const rows = body.map((cells) => {
    const row: CsvRow = {};
    headers.forEach((h, i) => { row[h] = toCellValue(cells[i] ?? ''); });
    return row;
  });
  return { headers, rows, data: rows };
}

export type HistogramBin = { range: string; count: number; frequency: number };

/**
 * Equal-width histogram. The last bin is closed on the right so the maximum
 * value is counted; non-numeric and empty cells are skipped.
 */
export function computeHistogram(rawValues: unknown[], binCount = 10): HistogramBin[] {
  const values = rawValues
    .filter((v) => v !== '' && v !== null && v !== undefined)
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ range: `${min}`, count: values.length, frequency: values.length }];
  const size = (max - min) / binCount;
  const counts = new Array(binCount).fill(0);
  values.forEach((v) => { counts[Math.min(Math.floor((v - min) / size), binCount - 1)]++; });
  const fmt = (n: number) => (Number.isInteger(size) ? n.toFixed(0) : Number(n.toPrecision(4)).toString());
  return counts.map((count, i) => ({
    range: `${fmt(min + i * size)}-${fmt(min + (i + 1) * size)}`,
    count,
    frequency: count,
  }));
}

/**
 * Index into a palette ordered darkest first: the largest value gets index 0
 * (darkest), values near zero get the lightest shade.
 */
export function heatColorIndex(value: number, maxValue: number, paletteSize: number): number {
  if (!(maxValue > 0) || !Number.isFinite(value) || value <= 0) return paletteSize - 1;
  const ratio = Math.min(value / maxValue, 1);
  return Math.min(paletteSize - 1, Math.floor((1 - ratio) * paletteSize));
}

/** True when the CSV text is one of the bundled samples (so it is safe to replace). */
export function isSampleCsv(text: string, samples: Record<string, { csv: string }>): boolean {
  return Object.values(samples).some((s) => s.csv.trim() === text.trim());
}

export type ColumnChoice = { x: string; y: string; group: string };

const PRESETS: Record<string, Record<string, ColumnChoice>> = {
  bar: { sales: { x: 'Product', y: 'Q1_Sales', group: 'Category' }, geographic: { x: 'Region', y: 'Sales', group: 'none' } },
  pie: { sales: { x: 'Product', y: 'Q1_Sales', group: 'Category' }, geographic: { x: 'Region', y: 'Sales', group: 'none' } },
  line: { timeSeries: { x: 'Date', y: 'Revenue', group: 'none' } },
  area: { timeSeries: { x: 'Date', y: 'Revenue', group: 'none' } },
  scatter: { correlation: { x: 'Price', y: 'Rating', group: 'none' } },
  histogram: { distribution: { x: '', y: 'Employee_Salary', group: 'none' } },
  heatmap: { geographic: { x: 'Country', y: 'GDP_Per_Capita', group: 'none' } },
  sankey: { flow: { x: 'Source', y: 'Value', group: 'Target' } },
};

/** Picks sensible X, Y and group columns for a chart type from the parsed data itself. */
export function pickColumns(chartType: string, datasetKey: string | null, parsed: ParsedCsv): ColumnChoice {
  const preset = datasetKey ? PRESETS[chartType]?.[datasetKey] : undefined;
  if (preset && [preset.x, preset.y].every((c) => !c || parsed.headers.includes(c))) return preset;
  const numeric = parsed.headers.filter((h) => parsed.data.some((r) => typeof r[h] === 'number'));
  const text = parsed.headers.filter((h) => parsed.data.some((r) => typeof r[h] === 'string' && r[h] !== ''));
  const firstText = text[0] || parsed.headers[0] || '';
  switch (chartType) {
    case 'scatter':
      return { x: numeric[0] || parsed.headers[0] || '', y: numeric[1] || numeric[0] || '', group: 'none' };
    case 'histogram':
      return { x: '', y: numeric[0] || '', group: 'none' };
    case 'sankey':
      return { x: firstText, y: numeric[0] || '', group: text[1] || 'none' };
    default:
      return { x: firstText, y: numeric.find((h) => h !== firstText) || '', group: 'none' };
  }
}
