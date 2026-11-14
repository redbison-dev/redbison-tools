import React, { useEffect, useMemo, useState } from 'react';
import { Binary, Hash, Cpu, ListOrdered } from 'lucide-react';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { GeoPage as Page, Panel, PickField, Segmented, Stat, ErrorNote, FormulaBox, ActionRow, useGeoAnalytics } from '@/components/tools/calculators/geometryShared';
import { CopyButton, Chip, LocalNote } from '@/components/tools/webops/webopsShared';
import CalculationSteps from '@/components/tools/shared/CalculationSteps';
import { numberBaseSteps } from '@/lib/tools/steps/s10';
import { convertNumber, groupDigits, positionalExpansion, type BaseString } from '@/lib/tools/dataformats/number-base-converter';
import { useToolResult } from '@/hooks/useToolResult';
import { msg, useT } from '@/i18n';

const H1 = 'Number Base Converter';

const FROM_OPTIONS = [
  { value: 'auto', label: msg('Auto (0x, 0o, 0b prefix or decimal)') },
  { value: '2', label: msg('Binary (base 2)') },
  { value: '8', label: msg('Octal (base 8)') },
  { value: '10', label: msg('Decimal (base 10)') },
  { value: '16', label: msg('Hexadecimal (base 16)') },
];
const OTHER_BASES = Array.from({ length: 35 }, (_, i) => i + 2).filter((b) => ![2, 8, 10, 16].includes(b));

const WIDTHS = [
  { value: '0', label: msg('Off') },
  { value: '8', label: msg('8-bit') },
  { value: '16', label: msg('16-bit') },
  { value: '32', label: msg('32-bit') },
  { value: '64', label: msg('64-bit') },
  { value: 'custom', label: msg('Custom') },
];

const EXAMPLES: { label: string; value: string; from: string; width: string; pattern?: boolean }[] = [
  { label: '255', value: '255', from: 'auto', width: '0' },
  { label: msg('-42 as int16'), value: '-42', from: 'auto', width: '16' },
  { label: '0xDEADBEEF', value: '0xDEADBEEF', from: 'auto', width: '32' },
  { label: msg('FFD6 as signed'), value: 'FFD6', from: '16', width: '16', pattern: true },
  { label: '10.625', value: '10.625', from: 'auto', width: '0' },
  { label: '0.1', value: '0.1', from: 'auto', width: '0' },
  { label: '2^64 - 1', value: '18446744073709551615', from: 'auto', width: '64' },
];

/** Group the integer digits of a signed, possibly fractional result. */
function grouped(r: BaseString, size: number, on: boolean): string {
  if (!on) return r.text;
  const neg = r.text.startsWith('-');
  const rest = r.text.slice(neg ? 1 : 0);
  const dot = rest.indexOf('.');
  const int = dot < 0 ? rest : rest.slice(0, dot);
  return (neg ? '-' : '') + groupDigits(int, size) + (dot < 0 ? '' : rest.slice(dot));
}

function ResultRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
        <CopyButton text={value.replace(/ /g, '')} onCopied={onCopy} />
      </div>
      <div className="font-mono text-sm sm:text-base text-black dark:text-white break-all mt-1" data-testid={`base-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
        {value}
      </div>
    </div>
  );
}

export default function NumberBaseConverter() {
  const { t, tr } = useT();
  const [value, setValue] = useState('255');
  const [from, setFrom] = useState('auto');
  const [to, setTo] = useState('36');
  const [width, setWidth] = useState('0');
  const [customWidth, setCustomWidth] = useState('24');
  const [pattern, setPattern] = useState(false);
  const [group, setGroup] = useState(true);
  const track = useGeoAnalytics('number-base-converter', `${value}|${from}|${to}|${width}|${pattern}`);

  // Restore a shared link (?v=...&from=...&to=...&w=...&p=1).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('v')) setValue(q.get('v')!);
    if (q.get('from')) setFrom(q.get('from')!);
    if (q.get('to')) setTo(q.get('to')!);
    const w = q.get('w');
    if (w) {
      if (WIDTHS.some((o) => o.value === w)) setWidth(w);
      else {
        setWidth('custom');
        setCustomWidth(w);
      }
    }
    if (q.get('p') === '1') setPattern(true);
  }, []);

  const bits = width === 'custom' ? Number(customWidth) : Number(width);
  const toBase = Number(to);
  const toValid = Number.isInteger(toBase) && toBase >= 2 && toBase <= 36;

  const out = useMemo(() => {
    try {
      return {
        r: convertNumber(value, {
          from: from === 'auto' ? 'auto' : Number(from),
          to: toValid ? toBase : undefined,
          width: bits > 0 ? bits : undefined,
          inputIsPattern: pattern && bits > 0,
        }),
        error: null as string | null,
      };
    } catch (e) {
      return { r: null, error: (e as Error).message };
    }
  }, [value, from, toBase, toValid, bits, pattern]);

  const r = out.r;
  const shareUrl = () => {
    const q = new URLSearchParams({ v: value, from, to });
    if (bits > 0) q.set('w', String(bits));
    if (pattern) q.set('p', '1');
    return `${window.location.origin}/number-base-converter?${q.toString()}`;
  };
  const summary = () =>
    r
      ? [t('Input: {value} (base {base})', { value, base: r.fromBase }), t('Binary: {value}', { value: r.binary.text }), t('Octal: {value}', { value: r.octal.text }), t('Decimal: {value}', { value: r.decimal.text }), t('Hex: {value}', { value: r.hex.text }), r.target ? t('Base {base}: {value}', { base: r.target.base, value: r.target.text }) : '', r.twos ? t("{width}-bit two's complement: {hex} (signed {signed}, unsigned {unsigned})", { width: r.twos.width, hex: r.twos.hex, signed: r.twos.signed, unsigned: r.twos.unsigned }) : '']
          .filter(Boolean)
          .join('\n')
      : '';

  const exp = r && r.isInteger && !r.negative ? positionalExpansion(BigInt(r.decimal.text), r.fromBase) : null;

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('converted', summary());

  return (
    <Page>
      <ToolBreadcrumb category={{ label: t('Tech Tools'), href: '/category/development-tech' }} subcategory={{ label: t('Data Formats'), href: '/category/development-tech/data-formats' }} toolName={t(H1)} />
      <div className="tool-header mt-6">
        <h1 className="tool-title text-black dark:text-white text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
          <Binary className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600 shrink-0" />
          {t(H1)}
        </h1>
        <p className="tool-description text-gray-600 dark:text-gray-300 text-sm sm:text-base mt-2">
          {t("Convert binary, octal, decimal, hex and any base from 2 to 36, with integers of any size, exact fractions and two's complement at 8, 16, 32 or 64 bits.")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <div className="space-y-4 min-w-0">
          <Panel title={t('Number')} icon={Hash}>
            <div>
              <Label htmlFor="nbc-value" className="text-sm font-medium text-black dark:text-white">
                {t('Value')}
              </Label>
              <Input
                id="nbc-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('A sign, a 0x, 0o or 0b prefix, _ separators and a fractional part are all accepted.')}</p>
            </div>
            <PickField id="nbc-from" label={t('Input base')} value={from} onChange={setFrom} options={[...FROM_OPTIONS.map((o) => ({ ...o, label: t(o.label) })), ...OTHER_BASES.map((b) => ({ value: String(b), label: t('Base {base}', { base: b }) }))]} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('Examples')}</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <Chip
                    key={x.label}
                    active={value === x.value && from === x.from}
                    onClick={() => {
                      setValue(x.value);
                      setFrom(x.from);
                      setWidth(x.width);
                      setPattern(!!x.pattern);
                      track('example', { example: x.label });
                    }}
                  >
                    {t(x.label)}
                  </Chip>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title={t("Two's complement")} icon={Cpu}>
            <Segmented label={t('Bit width')} value={width} onChange={setWidth} options={WIDTHS.map((o) => ({ ...o, label: t(o.label) }))} />
            {width === 'custom' && (
              <div>
                <Label htmlFor="nbc-width" className="text-sm font-medium text-black dark:text-white">
                  {t('Width in bits (1 to 1024)')}
                </Label>
                <Input id="nbc-width" type="number" inputMode="numeric" min={1} max={1024} value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              </div>
            )}
            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Checkbox checked={pattern} onCheckedChange={(c) => setPattern(c === true)} aria-label={t('Read the input as a signed bit pattern')} disabled={!(bits > 0)} />
              <span>{t('Read the input as a bit pattern and show its signed value (FF at 8 bits is -1)')}</span>
            </label>
          </Panel>

          <Panel title={t('Options')} icon={ListOrdered}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="nbc-to" className="text-sm font-medium text-black dark:text-white">
                  {t('Extra output base')}
                </Label>
                <Input id="nbc-to" type="number" inputMode="numeric" min={2} max={36} value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 mt-6">
                <Checkbox checked={group} onCheckedChange={(c) => setGroup(c === true)} aria-label={t('Group digits')} />
                {t('Group digits')}
              </label>
            </div>
            {!toValid && <ErrorNote>{t('The extra base must be a whole number from 2 to 36.')}</ErrorNote>}
          </Panel>
        </div>

        <div className="space-y-4 min-w-0">
          <Panel title={t('Results')} icon={Binary}>
            {out.error && <ErrorNote>{t(out.error)}</ErrorNote>}
            {r && (
              <>
                <div className="grid gap-3">
                  <ResultRow label={t('Binary (base 2)')} value={grouped(r.binary, 4, group)} onCopy={() => track('copy', { base: 2 })} />
                  <ResultRow label={t('Octal (base 8)')} value={grouped(r.octal, 3, group)} onCopy={() => track('copy', { base: 8 })} />
                  <ResultRow label={t('Decimal (base 10)')} value={grouped(r.decimal, 3, group)} onCopy={() => track('copy', { base: 10 })} />
                  <ResultRow label={t('Hexadecimal (base 16)')} value={grouped(r.hex, 4, group)} onCopy={() => track('copy', { base: 16 })} />
                  {r.target && ![2, 8, 10, 16].includes(r.target.base) && <ResultRow label={t('Base {base}', { base: r.target.base })} value={r.target.text} onCopy={() => track('copy', { base: r.target!.base })} />}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label={t('Read as base')} value={String(r.fromBase)} sub={r.prefix ? t('from the {prefix} prefix', { prefix: r.prefix }) : undefined} />
                  <Stat label={t('Bits needed')} value={r.isInteger ? String(r.bitLength) : t('n/a')} sub={r.isInteger ? t('for the magnitude, without a sign bit') : t('not a whole number')} />
                </div>
                {!r.isInteger && <p className="text-sm text-gray-700 dark:text-gray-300">{tr('Exact value as a fraction: {fraction}. Digits in parentheses repeat forever.', { fraction: <span className="font-mono">{r.fraction}</span> })}</p>}
                {r.warnings.map((w) => (
                  <ErrorNote key={w}>{w}</ErrorNote>
                ))}
              </>
            )}
          </Panel>

          {r?.twos && (
            <Panel title={t("{width}-bit two's complement", { width: r.twos.width })} icon={Cpu}>
              <ResultRow label={t('Bit pattern')} value={group ? groupDigits(r.twos.binary, 4) : r.twos.binary} onCopy={() => track('copy', { base: 'pattern' })} />
              <div className="grid grid-cols-2 gap-3">
                <Stat label={t('Hex')} value={`0x${r.twos.hex}`} tone="accent" />
                <Stat label={t('Signed')} value={r.twos.signed} />
                <Stat label={t('Unsigned')} value={r.twos.unsigned} />
                <Stat label={t('Signed range')} value={t('{min} to {max}', { min: r.twos.min, max: r.twos.max })} />
              </div>
              {r.twos.width % 8 === 0 && r.twos.width <= 128 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label={t('Bytes, big-endian')} value={r.twos.bytesBigEndian} sub={t('network order, most significant first')} />
                  <Stat label={t('Bytes, little-endian')} value={r.twos.bytesLittleEndian} sub={t('x86 and ARM memory order')} />
                </div>
              )}
            </Panel>
          )}

          {r && <CalculationSteps steps={numberBaseSteps({ value, from: from === 'auto' ? 'auto' : Number(from), to: toValid ? toBase : undefined, width: bits > 0 ? bits : undefined, pattern: pattern && bits > 0, group })} />}
          {r && exp && <FormulaBox title={t('Positional value')} lines={[t('{digits} (base {base}) = {expansion}', { digits: BigInt(r.decimal.text).toString(r.fromBase).toUpperCase(), base: r.fromBase, expansion: exp }), t('= {value} in decimal', { value: r.decimal.text })]} />}
          {r && <ActionRow summary={summary} shareUrl={shareUrl} onReset={() => { setValue('255'); setFrom('auto'); setWidth('0'); setPattern(false); setTo('36'); }} onAction={track} />}
          <LocalNote />
        </div>
      </div>
    </Page>
  );
}
