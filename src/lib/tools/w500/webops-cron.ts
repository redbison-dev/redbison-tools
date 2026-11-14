/**
 * Cron expression builder. Turns plain choices ("every weekday at 09:30")
 * into a standard five-field expression, then translates it for Quartz,
 * AWS EventBridge, GitHub Actions and Kubernetes. Next run times come from
 * cron-parser (time-zone and DST aware) and the English description from
 * cronstrue, the same libraries the Cron Expression Validator uses.
 */
import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';
import { msg } from '../../msg';

export type FieldKey = 'minute' | 'hour' | 'dom' | 'month' | 'dow';

export type FieldSpec =
  | { mode: 'every' }
  | { mode: 'step'; step: number; start?: number }
  | { mode: 'list'; values: number[] }
  | { mode: 'range'; from: number; to: number; step?: number };

export type CronSpec = Record<FieldKey, FieldSpec>;

export type FieldDef = { key: FieldKey; label: string; min: number; max: number };

export const FIELD_DEFS: FieldDef[] = [
  { key: 'minute', label: 'Minute', min: 0, max: 59 },
  { key: 'hour', label: 'Hour', min: 0, max: 23 },
  { key: 'dom', label: 'Day of month', min: 1, max: 31 },
  { key: 'month', label: 'Month', min: 1, max: 12 },
  { key: 'dow', label: 'Day of week', min: 0, max: 6 },
];

export const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const def = (k: FieldKey) => FIELD_DEFS.find((d) => d.key === k)!;

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Throws with a readable message when a field is out of range. */
export function validateField(key: FieldKey, f: FieldSpec): void {
  const d = def(key);
  const inRange = (n: number) => isInt(n) && n >= d.min && n <= d.max;
  const label = d.label.toLowerCase();
  if (f.mode === 'step') {
    if (!isInt(f.step) || f.step < 1 || f.step > d.max - d.min + 1) throw new Error(`The ${label} interval must be a whole number from 1 to ${d.max - d.min + 1}.`);
    if (f.start !== undefined && !inRange(f.start)) throw new Error(`The ${label} start must be between ${d.min} and ${d.max}.`);
  } else if (f.mode === 'list') {
    if (!f.values.length) throw new Error(`Pick at least one ${label}.`);
    for (const v of f.values) if (!inRange(v)) throw new Error(`${v} is not a valid ${label} (${d.min} to ${d.max}).`);
  } else if (f.mode === 'range') {
    if (!inRange(f.from) || !inRange(f.to)) throw new Error(`The ${label} range must be within ${d.min} to ${d.max}.`);
    if (f.from > f.to) throw new Error(`The ${label} range starts after it ends.`);
    if (f.step !== undefined && (!isInt(f.step) || f.step < 1)) throw new Error(`The ${label} range step must be a whole number of at least 1.`);
  }
}

/** The set of values a field matches. */
export function expandField(key: FieldKey, f: FieldSpec): number[] {
  const d = def(key);
  const out: number[] = [];
  if (f.mode === 'every') for (let i = d.min; i <= d.max; i++) out.push(i);
  else if (f.mode === 'step') for (let i = f.start ?? d.min; i <= d.max; i += f.step) out.push(i);
  else if (f.mode === 'range') for (let i = f.from; i <= f.to; i += f.step ?? 1) out.push(i);
  else out.push(...f.values);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Join sorted values, collapsing runs of three or more into a-b. */
export function compressValues(values: number[], name?: (n: number) => string): string {
  const v = [...new Set(values)].sort((a, b) => a - b);
  const label = name ?? ((n: number) => String(n));
  const parts: string[] = [];
  let i = 0;
  while (i < v.length) {
    let j = i;
    while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
    if (j - i >= 2) parts.push(`${label(v[i])}-${label(v[j])}`);
    else for (let k = i; k <= j; k++) parts.push(label(v[k]));
    i = j + 1;
  }
  return parts.join(',');
}

/** Render one field in portable Vixie/POSIX cron syntax. */
export function renderField(key: FieldKey, f: FieldSpec): string {
  const d = def(key);
  if (f.mode === 'every') return '*';
  if (f.mode === 'step') {
    if (f.step === 1 && (f.start ?? d.min) === d.min) return '*';
    // "N/step" without a range is not accepted by classic Vixie cron; "N-max/step" is.
    if (f.start === undefined || f.start === d.min) return `*/${f.step}`;
    return `${f.start}-${d.max}/${f.step}`;
  }
  if (f.mode === 'range') return `${f.from}-${f.to}${f.step && f.step > 1 ? `/${f.step}` : ''}`;
  return compressValues(f.values);
}

export function specToExpression(spec: CronSpec): string {
  for (const d of FIELD_DEFS) validateField(d.key, spec[d.key]);
  return FIELD_DEFS.map((d) => renderField(d.key, spec[d.key])).join(' ');
}

// ---------- Plain choices ----------

export type Frequency = 'minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type PlainSchedule = {
  frequency: Frequency;
  /** minutes: run every N minutes. hourly: every N hours. */
  interval?: number;
  /** Minute past the hour (hourly, daily, weekly, monthly, yearly). */
  minute?: number;
  /** One or more hours (daily, weekly, monthly, yearly). */
  hours?: number[];
  /** 0 = Sunday ... 6 = Saturday (weekly). */
  daysOfWeek?: number[];
  /** 1-31 (monthly, yearly). */
  daysOfMonth?: number[];
  /** 1-12 (yearly). */
  months?: number[];
};

export function plainToSpec(p: PlainSchedule): CronSpec {
  const every: FieldSpec = { mode: 'every' };
  const minute = p.minute ?? 0;
  const hours = p.hours && p.hours.length ? p.hours : [0];
  const base = { minute: { mode: 'list', values: [minute] } as FieldSpec, hour: { mode: 'list', values: hours } as FieldSpec, dom: every, month: every, dow: every };
  switch (p.frequency) {
    case 'minutes': {
      const n = p.interval ?? 5;
      return { minute: n === 1 ? every : { mode: 'step', step: n }, hour: every, dom: every, month: every, dow: every };
    }
    case 'hourly': {
      const n = p.interval ?? 1;
      return { minute: { mode: 'list', values: [minute] }, hour: n === 1 ? every : { mode: 'step', step: n }, dom: every, month: every, dow: every };
    }
    case 'daily':
      return base;
    case 'weekly':
      return { ...base, dow: { mode: 'list', values: (p.daysOfWeek && p.daysOfWeek.length ? p.daysOfWeek : [1]).map((d) => (d === 7 ? 0 : d)) } };
    case 'monthly':
      return { ...base, dom: { mode: 'list', values: p.daysOfMonth && p.daysOfMonth.length ? p.daysOfMonth : [1] } };
    case 'yearly':
      return { ...base, dom: { mode: 'list', values: p.daysOfMonth && p.daysOfMonth.length ? p.daysOfMonth : [1] }, month: { mode: 'list', values: p.months && p.months.length ? p.months : [1] } };
  }
}

// ---------- Platform translations ----------

export type PlatformId = 'unix' | 'kubernetes' | 'github' | 'quartz' | 'eventbridge';

export type PlatformOutput = { id: PlatformId; name: string; value: string | null; notes: string[] };

const restricted = (f: FieldSpec, key: FieldKey) => {
  const d = def(key);
  return expandField(key, f).length !== d.max - d.min + 1;
};

/** Field for Quartz / EventBridge: steps written as start/step, weekdays as names. */
function renderAws(key: FieldKey, f: FieldSpec): string {
  const d = def(key);
  if (key === 'dow') {
    if (!restricted(f, key)) return '*';
    return compressValues(expandField(key, f), (n) => DOW_NAMES[n]);
  }
  if (f.mode === 'every') return '*';
  if (f.mode === 'step') return `${f.start ?? d.min}/${f.step}`;
  return renderField(key, f);
}

export function platformOutputs(spec: CronSpec): PlatformOutput[] {
  const expr = specToExpression(spec);
  const domR = restricted(spec.dom, 'dom');
  const dowR = restricted(spec.dow, 'dow');
  const both = domR && dowR;
  const awsFields = () => {
    const min = renderAws('minute', spec.minute);
    const hour = renderAws('hour', spec.hour);
    const month = renderAws('month', spec.month);
    let dom = renderAws('dom', spec.dom);
    let dow = renderAws('dow', spec.dow);
    if (!dowR) dow = '?';
    else dom = '?';
    return { min, hour, dom, month, dow };
  };
  const out: PlatformOutput[] = [];
  out.push({
    id: 'unix',
    name: msg('crontab (Linux, macOS, Vixie, cronie)'),
    value: expr,
    notes: [
      msg('Runs in the cron daemon\'s time zone, usually the server\'s local time. Set CRON_TZ=Area/City on the line above if your cron supports it.'),
      ...(both ? [msg('Day of month and day of week are both set, so the job runs when EITHER matches (standard cron behaviour), not only when both do.')] : []),
    ],
  });
  out.push({
    id: 'kubernetes',
    name: msg('Kubernetes CronJob'),
    value: expr,
    notes: [msg('Put it in spec.schedule. Since Kubernetes 1.27 you can set spec.timeZone (for example "Europe/London"); without it the kube-controller-manager\'s time zone is used.')],
  });
  const steps = spec.minute.mode === 'step' ? spec.minute.step : null;
  const minutes = expandField('minute', spec.minute);
  const tooOften = (steps !== null && steps < 5) || (spec.minute.mode === 'every') || (minutes.length > 12 && !restricted(spec.hour, 'hour'));
  out.push({
    id: 'github',
    name: msg('GitHub Actions (on.schedule)'),
    value: expr,
    notes: [
      msg('Always evaluated in UTC. Convert your local time to UTC before using it.'),
      ...(tooOften ? [msg('GitHub runs scheduled workflows at most once every 5 minutes, so this schedule will be throttled.')] : []),
      msg('Runs can be delayed at busy times, especially at the top of the hour; an odd minute such as 17 is more reliable than 0.'),
    ],
  });
  const a = awsFields();
  out.push({
    id: 'quartz',
    name: msg('Quartz / Spring @Scheduled'),
    value: both ? null : `0 ${a.min} ${a.hour} ${a.dom} ${a.month} ${a.dow}`,
    notes: both
      ? [msg('Quartz cannot set both day of month and day of week. Split the job into two triggers, one per field.')]
      : [msg('Six fields: seconds come first. Exactly one of day of month and day of week must be "?". Spring\'s @Scheduled also uses six fields but accepts "*" in both.')],
  });
  out.push({
    id: 'eventbridge',
    name: msg('AWS EventBridge Scheduler'),
    value: both ? null : `cron(${a.min} ${a.hour} ${a.dom} ${a.month} ${a.dow} *)`,
    notes: both
      ? [msg('EventBridge cannot set both day of month and day of week. Create two schedules instead.')]
      : [msg('Six fields with a year at the end. Day of week counts 1 = Sunday, so names (MON-FRI) are used here. EventBridge Scheduler lets you choose a time zone; the older EventBridge rules always run in UTC.')],
  });
  return out;
}

// ---------- Description and next runs ----------

export function describeExpression(expr: string, use24Hour = true): string {
  return cronstrue.toString(expr, { throwExceptionOnParseError: true, use24HourTimeFormat: use24Hour, verbose: false });
}

export function nextRuns(expr: string, count = 5, from: Date = new Date(), tz?: string): Date[] {
  const it = CronExpressionParser.parse(expr, { currentDate: from, tz });
  const out: Date[] = [];
  for (let i = 0; i < count; i++) out.push(it.next().toDate());
  return out;
}

/** Format a run time in a time zone as "Thu 29 Oct 2026, 09:30". */
export function formatRun(d: Date, tz?: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/** Months in which a day-of-month list can never occur (e.g. 30 or 31 in February only). */
export function impossibleDate(spec: CronSpec): string | null {
  if (restricted(spec.dow, 'dow')) return null;
  const days = expandField('dom', spec.dom);
  const months = expandField('month', spec.month);
  const maxDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const ok = months.some((m) => days.some((d) => d <= maxDays[m - 1]));
  if (ok) return null;
  return `Day ${compressValues(days)} never occurs in ${months.map((m) => MONTH_LONG[m - 1]).join(', ')}, so this schedule would never run.`;
}

export type CronBuildResult = {
  expression: string;
  description: string;
  nextRuns: string[];
  timezone: string;
  platforms: PlatformOutput[];
  warnings: string[];
};

export function buildCron(spec: CronSpec, opts: { count?: number; tz?: string; from?: Date } = {}): CronBuildResult {
  const expression = specToExpression(spec);
  const tz = opts.tz || 'UTC';
  const warnings: string[] = [];
  const never = impossibleDate(spec);
  if (never) warnings.push(never);
  const days = expandField('dom', spec.dom);
  if (!never && restricted(spec.dom, 'dom') && !restricted(spec.dow, 'dow') && days.some((d) => d >= 29)) {
    warnings.push(`Months without day ${days.filter((d) => d >= 29).join(', ')} are skipped, not moved to the last day. Cron has no "last day of month" in five-field syntax.`);
  }
  let runs: string[] = [];
  let tzOk = true;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
  } catch {
    tzOk = false;
    warnings.push(`Unknown time zone "${tz}". Use an IANA name such as Europe/London.`);
  }
  if (!never && tzOk) {
    try {
      runs = nextRuns(expression, opts.count ?? 5, opts.from ?? new Date(), tz).map((d) => formatRun(d, tz));
    } catch (e) {
      warnings.push((e as Error).message);
    }
  }
  return { expression, description: describeExpression(expression), nextRuns: runs, timezone: tz, platforms: platformOutputs(spec), warnings };
}

export const CRON_PRESETS: { label: string; plain: PlainSchedule }[] = [
  { label: msg('Every 5 minutes'), plain: { frequency: 'minutes', interval: 5 } },
  { label: msg('Every 15 minutes'), plain: { frequency: 'minutes', interval: 15 } },
  { label: msg('Every hour'), plain: { frequency: 'hourly', interval: 1, minute: 0 } },
  { label: msg('Every 6 hours'), plain: { frequency: 'hourly', interval: 6, minute: 0 } },
  { label: msg('Daily at midnight'), plain: { frequency: 'daily', hours: [0], minute: 0 } },
  { label: msg('Weekdays at 09:00'), plain: { frequency: 'weekly', daysOfWeek: [1, 2, 3, 4, 5], hours: [9], minute: 0 } },
  { label: msg('Sundays at 03:30'), plain: { frequency: 'weekly', daysOfWeek: [0], hours: [3], minute: 30 } },
  { label: msg('1st of the month'), plain: { frequency: 'monthly', daysOfMonth: [1], hours: [0], minute: 0 } },
  { label: msg('Quarterly'), plain: { frequency: 'yearly', months: [1, 4, 7, 10], daysOfMonth: [1], hours: [6], minute: 0 } },
];

// ---------- Parse an existing expression back into a spec ----------

function parseValue(key: FieldKey, s: string): number {
  const up = s.toUpperCase();
  if (key === 'month' && MONTH_NAMES.includes(up)) return MONTH_NAMES.indexOf(up) + 1;
  if (key === 'dow' && DOW_NAMES.includes(up)) return DOW_NAMES.indexOf(up);
  if (!/^\d+$/.test(s)) throw new Error(`"${s}" is not a valid ${def(key).label.toLowerCase()} value.`);
  const n = Number(s);
  return key === 'dow' && n === 7 ? 0 : n;
}

/** Parse one cron field ("*", "*\/5", "1-5", "MON-FRI", "0,30", "10-50/10") into a spec. */
export function parseField(key: FieldKey, text: string): FieldSpec {
  const d = def(key);
  const t = text.trim();
  if (t === '*') return { mode: 'every' };
  const star = t.match(/^\*\/(\d+)$/);
  if (star) {
    if (Number(star[1]) < 1) throw new Error('A step must be at least 1.');
    return { mode: 'step', step: Number(star[1]) };
  }
  if (/[?#]/.test(t) || t.split(',').some((p) => /^(L|LW|\d+W|\d*L(-\d+)?)$/i.test(p))) throw new Error(`"${t}": ?, L, W and # are Quartz/AWS extensions, not standard five-field cron.`);
  const values: number[] = [];
  for (const part of t.split(',')) {
    const m = part.match(/^([^/-]+)(?:-([^/]+))?(?:\/(\d+))?$/);
    if (!m) throw new Error(`"${part}" is not a valid ${d.label.toLowerCase()} entry.`);
    const step = m[3] ? Number(m[3]) : 1;
    if (step < 1) throw new Error('A step must be at least 1.');
    let from: number;
    let to: number;
    if (m[1] === '*') {
      from = d.min;
      to = key === 'dow' ? 6 : d.max;
    } else {
      from = parseValue(key, m[1]);
      // "SUN-SAT" style ranges may end at 7 for Sunday
      to = m[2] !== undefined ? (key === 'dow' && m[2] === '7' ? 7 : parseValue(key, m[2])) : m[3] ? d.max : from;
    }
    if (key === 'dow' && to === 0 && m[2] !== undefined && from > 0) to = 7;
    const max = key === 'dow' ? 7 : d.max;
    if (from < d.min || to > max || from > to) throw new Error(`"${part}" is outside ${d.min}-${d.max} for ${d.label.toLowerCase()}.`);
    for (let v = from; v <= to; v += step) values.push(key === 'dow' && v === 7 ? 0 : v);
  }
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  if (uniq.length === d.max - d.min + 1) return { mode: 'every' };
  return { mode: 'list', values: uniq };
}

export function expressionToSpec(expr: string): CronSpec {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Expected 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}.`);
  const spec = {} as CronSpec;
  FIELD_DEFS.forEach((d, i) => (spec[d.key] = parseField(d.key, parts[i])));
  return spec;
}
