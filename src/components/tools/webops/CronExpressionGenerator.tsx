import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Settings2, ListOrdered, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WebPage, WebHeader, Panel, Segmented, PickField, Chip, CopyButton, ErrorNote, CodeOut, LocalNote, useWebAnalytics } from './webopsShared';
import {
  buildCron,
  plainToSpec,
  expressionToSpec,
  CRON_PRESETS,
  DOW_LONG,
  MONTH_LONG,
  type Frequency,
  type PlainSchedule,
  type CronSpec,
} from '@/lib/tools/w500/webops-cron';
import { useFormat, useT } from '@/i18n';

const MINUTE_STEPS = [1, 2, 3, 5, 10, 15, 20, 30];
const HOUR_STEPS = [1, 2, 3, 4, 6, 8, 12];

function zones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return ['UTC', ...fn('timeZone').filter((z) => z !== 'UTC')];
  } catch {
    /* older browsers */
  }
  return ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];
}

function toggle(list: number[], v: number): number[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort((a, b) => a - b);
}

export default function CronExpressionGenerator() {
  const { t } = useT();
  const format = useFormat();
  // Short day and month names in the page's language (en-US: Sun, Mon … and Jan, Feb …); 1 Jan 2023 was a Sunday.
  const dowShort = (i: number) => format.date(new Date(Date.UTC(2023, 0, 1 + i)), { weekday: 'short', timeZone: 'UTC' });
  const monthShort = (i: number) => format.date(new Date(Date.UTC(2023, i, 15)), { month: 'short', timeZone: 'UTC' });
  const track = useWebAnalytics('cron-expression-generator');
  const [freq, setFreq] = useState<Frequency | 'custom'>('weekly');
  const [interval, setInterval_] = useState(5);
  const [minute, setMinute] = useState('0');
  const [hours, setHours] = useState<number[]>([9]);
  const [dows, setDows] = useState<number[]>([1, 2, 3, 4, 5]);
  const [doms, setDoms] = useState<number[]>([1]);
  const [months, setMonths] = useState<number[]>([1]);
  const [custom, setCustom] = useState('30 2 * * 0');
  const [tz, setTz] = useState('UTC');
  const [tzList, setTzList] = useState<string[]>(['UTC']);

  useEffect(() => {
    setTzList(zones());
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (local) setTz(local);
    } catch {
      /* keep UTC */
    }
  }, []);

  const minuteNum = Number(minute);
  const minuteErr = minute.trim() === '' || !Number.isInteger(minuteNum) || minuteNum < 0 || minuteNum > 59 ? t('Minute must be 0 to 59.') : null;

  const { result, error } = useMemo(() => {
    try {
      let spec: CronSpec;
      if (freq === 'custom') spec = expressionToSpec(custom);
      else {
        if (minuteErr && freq !== 'minutes') throw new Error(minuteErr);
        const plain: PlainSchedule = { frequency: freq, interval, minute: minuteNum, hours, daysOfWeek: dows, daysOfMonth: doms, months };
        spec = plainToSpec(plain);
      }
      return { result: buildCron(spec, { count: 8, tz }), error: null };
    } catch (e) {
      return { result: null, error: (e as Error).message };
    }
  }, [freq, interval, minuteNum, minuteErr, hours, dows, doms, months, custom, tz]);

  const loadPreset = (p: PlainSchedule) => {
    setFreq(p.frequency);
    if (p.interval) setInterval_(p.interval);
    setMinute(String(p.minute ?? 0));
    if (p.hours) setHours(p.hours);
    if (p.daysOfWeek) setDows(p.daysOfWeek);
    if (p.daysOfMonth) setDoms(p.daysOfMonth);
    if (p.months) setMonths(p.months);
    track('preset');
  };

  const needsTime = freq === 'daily' || freq === 'weekly' || freq === 'monthly' || freq === 'yearly';

  return (
    <WebPage>
      <WebHeader h1={t('Cron Expression Generator')} icon={CalendarClock} tagline={t('Pick how often a job should run and get the cron expression, a plain-English check, the next run times in your time zone, and the same schedule for Quartz, AWS EventBridge, GitHub Actions and Kubernetes.')} />
      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <Panel title={t('Schedule')} icon={Settings2}>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((p) => (
              <Chip key={p.label} active={false} onClick={() => loadPreset(p.plain)}>
                {t(p.label)}
              </Chip>
            ))}
          </div>
          <Segmented
            label={t('Frequency')}
            value={freq}
            onChange={(v) => setFreq(v as Frequency | 'custom')}
            options={[
              { value: 'minutes', label: t('Minutes') },
              { value: 'hourly', label: t('Hourly') },
              { value: 'daily', label: t('Daily') },
              { value: 'weekly', label: t('Weekly') },
              { value: 'monthly', label: t('Monthly') },
              { value: 'yearly', label: t('Yearly') },
              { value: 'custom', label: t('Edit expression') },
            ]}
          />
          {freq === 'minutes' && (
            <PickField id="min-step" label={t('Run every')} value={String(interval)} onChange={(v) => setInterval_(Number(v))} options={MINUTE_STEPS.map((n) => ({ value: String(n), label: n === 1 ? t('minute') : t('{n} minutes', { n }) }))} />
          )}
          {freq === 'hourly' && (
            <div className="grid grid-cols-2 gap-3">
              <PickField id="hour-step" label={t('Run every')} value={String(interval)} onChange={(v) => setInterval_(Number(v))} options={HOUR_STEPS.map((n) => ({ value: String(n), label: n === 1 ? t('hour') : t('{n} hours', { n }) }))} />
              <div>
                <Label htmlFor="hourly-min" className="text-sm font-medium text-black dark:text-white">
                  {t('At minute')}
                </Label>
                <Input id="hourly-min" inputMode="numeric" value={minute} onChange={(e) => setMinute(e.target.value)} aria-invalid={!!minuteErr} className="mt-1 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              </div>
            </div>
          )}
          {freq === 'weekly' && (
            <div>
              <p className="text-sm font-medium text-black dark:text-white mb-1">{t('On these days')}</p>
              <div className="flex flex-wrap gap-1.5">
                {DOW_LONG.map((d, i) => (
                  <Chip key={d} active={dows.includes(i)} onClick={() => setDows(toggle(dows, i))}>
                    {dowShort(i)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {freq === 'yearly' && (
            <div>
              <p className="text-sm font-medium text-black dark:text-white mb-1">{t('In these months')}</p>
              <div className="flex flex-wrap gap-1.5">
                {MONTH_LONG.map((m, i) => (
                  <Chip key={m} active={months.includes(i + 1)} onClick={() => setMonths(toggle(months, i + 1))}>
                    {monthShort(i)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {(freq === 'monthly' || freq === 'yearly') && (
            <div>
              <p className="text-sm font-medium text-black dark:text-white mb-1">{t('On these days of the month')}</p>
              <div className="grid grid-cols-7 gap-1 max-w-xs">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={doms.includes(d)}
                    onClick={() => setDoms(toggle(doms, d))}
                    className={`h-8 rounded-md text-xs border ${doms.includes(d) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
          {needsTime && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-black dark:text-white">{t('At these hours (24-hour clock)')}</p>
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={hours.includes(h)}
                    onClick={() => setHours(toggle(hours, h))}
                    className={`h-8 rounded-md text-xs border ${hours.includes(h) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}
                  >
                    {String(h).padStart(2, '0')}
                  </button>
                ))}
              </div>
              <div className="max-w-[10rem]">
                <Label htmlFor="at-min" className="text-sm font-medium text-black dark:text-white">
                  {t('Minute past the hour')}
                </Label>
                <Input id="at-min" inputMode="numeric" value={minute} onChange={(e) => setMinute(e.target.value)} aria-invalid={!!minuteErr} className="mt-1 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              </div>
            </div>
          )}
          {freq === 'custom' && (
            <div>
              <Label htmlFor="cron-custom" className="text-sm font-medium text-black dark:text-white">
                {t('Five-field expression')}
              </Label>
              <Input id="cron-custom" value={custom} onChange={(e) => setCustom(e.target.value)} className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('minute hour day-of-month month day-of-week, with *, lists, ranges, steps and names such as MON-FRI.')}</p>
            </div>
          )}
          <PickField id="cron-tz" label={t('Time zone for the preview')} value={tz} onChange={setTz} options={tzList.includes(tz) ? tzList.map((z) => ({ value: z, label: z })) : [tz, ...tzList].map((z) => ({ value: z, label: z }))} />
          <LocalNote />
        </Panel>

        <div className="space-y-4 min-w-0">
          <Panel title={t('Cron expression')} icon={ListOrdered}>
            {error && <ErrorNote>{error}</ErrorNote>}
            {result && (
              <>
                <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-3">
                  <div className="font-mono text-2xl sm:text-3xl font-bold text-black dark:text-white break-all" data-testid="cron-expression">
                    {result.expression}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 mt-1" data-testid="cron-description">
                    {result.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={result.expression} label={t('Copy expression')} onCopied={() => track('copy_expression')} />
                  <CopyButton text={`${result.expression} /path/to/command`} label={t('Copy crontab line')} />
                </div>
                {result.warnings.map((w) => (
                  <ErrorNote key={w}>{w}</ErrorNote>
                ))}
                {result.nextRuns.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-black dark:text-white mb-1">{t('Next {length} runs ({timezone})', { length: result.nextRuns.length, timezone: result.timezone })}</p>
                    <ol className="text-sm font-mono text-gray-700 dark:text-gray-200 space-y-0.5 list-decimal pl-6">
                      {result.nextRuns.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </Panel>
          {result && (
            <Panel title={t('Same schedule on other platforms')} icon={Layers}>
              <div className="space-y-3">
                {result.platforms.map((p) => (
                  <div key={p.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-black dark:text-white">{t(p.name)}</span>
                      {p.value && <CopyButton text={p.value} />}
                    </div>
                    {p.value ? <CodeOut value={p.value} label={t(p.name)} /> : <p className="text-sm text-red-700 dark:text-red-300">{t('Not expressible as one schedule.')}</p>}
                    <ul className="text-xs text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-0.5">
                      {p.notes.map((n) => (
                        <li key={n}>{t(n)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </WebPage>
  );
}
