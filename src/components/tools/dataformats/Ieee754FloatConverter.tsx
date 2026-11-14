import React, { useEffect, useMemo, useState } from 'react';
import { Binary, SlidersHorizontal, Table2, MoveHorizontal } from 'lucide-react';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GeoPage as Page, Panel, Segmented, Stat, ErrorNote, FormulaBox, ActionRow, useGeoAnalytics } from '@/components/tools/calculators/geometryShared';
import { CopyButton, Chip, LocalNote } from '@/components/tools/webops/webopsShared';
import CalculationSteps from '@/components/tools/shared/CalculationSteps';
import { ieee754Steps } from '@/lib/tools/steps/s10';
import { encodeFloat, decodeFloat, formatLimits, nanToFormat, FORMATS, type FloatFormat, type FloatResult } from '@/lib/tools/dataformats/ieee-754-float-converter';
import { msg, useT } from '@/i18n';

const H1 = 'IEEE 754 Float Converter';
const FORMAT_OPTIONS = [
  { value: 'binary16', label: msg('Half (16-bit)') },
  { value: 'binary32', label: msg('Single (32-bit)') },
  { value: 'binary64', label: msg('Double (64-bit)') },
];
const MODE_OPTIONS = [
  { value: 'encode', label: msg('Number to bits') },
  { value: 'decode', label: msg('Bits to number') },
];
const ENCODE_EXAMPLES = ['0.1', '1/3', '-0', '0.1+0.2 = 0.30000000000000004', '16777217', '65520', '1e-45', 'inf', 'nan'];
const DECODE_EXAMPLES: Record<FloatFormat, string[]> = {
  binary16: ['3C00', '7BFF', '0001', '7E00', 'FC00'],
  binary32: ['3DCCCCCD', '40490FDB', '00000001', '7F7FFFFF', '7FC00001', '80000000'],
  binary64: ['3FB999999999999A', '3FD3333333333334', '0000000000000001', '7FEFFFFFFFFFFFFF', '7FF8000000000BAD'],
};

/** Example chips may carry a label after " = "; the value is the part after it, if any. */
const exampleValue = (x: string) => (x.includes(' = ') ? x.split(' = ')[1] : x);

function BitGrid({ r, onToggle }: { r: FloatResult; onToggle: (i: number) => void }) {
  const { t } = useT();
  const f = FORMATS[r.format];
  const role = (i: number) => (i === 0 ? 'sign' : i <= f.exponentBits ? 'exponent' : 'fraction');
  const roleName = (i: number) => (i === 0 ? t('sign') : i <= f.exponentBits ? t('exponent') : t('fraction'));
  const cls: Record<string, string> = {
    sign: 'bg-rose-100 border-rose-300 text-rose-900 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-100',
    exponent: 'bg-sky-100 border-sky-300 text-sky-900 dark:bg-sky-900/40 dark:border-sky-700 dark:text-sky-100',
    fraction: 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-100',
  };
  return (
    <div>
      <div className="flex flex-wrap gap-0.5" role="group" aria-label={t('Bits, click one to flip it')}>
        {r.bits.split('').map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i)}
            aria-label={t('Bit {value} ({value2}) is {b}, flip it', { value: f.bits - 1 - i, value2: roleName(i), b })}
            className={`w-5 h-7 sm:w-6 sm:h-8 rounded border font-mono text-xs sm:text-sm font-bold ${cls[role(i)]} ${i === f.exponentBits || i === 0 ? 'mr-1.5' : ''}`}
          >
            {b}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600 dark:text-gray-300">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-rose-200 border border-rose-300" />{' '}{t('sign (1 bit)')}</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-sky-200 border border-sky-300" />{' '}{t('exponent ({exponentBits} bits, bias {bias})', { exponentBits: f.exponentBits, bias: f.bias })}</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300" />{' '}{t('fraction ({fractionBits} bits)', { fractionBits: f.fractionBits })}</span>
      </div>
    </div>
  );
}

const CLASS_LABEL: Record<string, string> = { zero: msg('Zero'), subnormal: msg('Subnormal'), normal: msg('Normal'), infinity: msg('Infinity'), nan: 'NaN' };
const CLASS_WORD: Record<string, string> = { zero: msg('zero'), subnormal: msg('subnormal'), normal: msg('normal'), infinity: msg('infinity'), nan: 'nan' };

export default function Ieee754FloatConverter() {
  const { t } = useT();
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [format, setFormat] = useState<FloatFormat>('binary32');
  const [value, setValue] = useState('0.1');
  const track = useGeoAnalytics('ieee-754-float-converter', `${mode}|${format}|${value}`);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const f = q.get('f');
    if (f && f in FORMATS) setFormat(f as FloatFormat);
    if (q.get('m') === 'decode') setMode('decode');
    if (q.get('v')) setValue(q.get('v')!);
  }, []);

  const out = useMemo(() => {
    try {
      return { r: mode === 'encode' ? encodeFloat(value, format) : decodeFloat(value, format), error: null as string | null };
    } catch (e) {
      return { r: null, error: (e as Error).message };
    }
  }, [mode, format, value]);
  const r = out.r;

  const compare = useMemo(() => {
    if (mode !== 'encode' || out.error) return null;
    return (['binary16', 'binary32', 'binary64'] as FloatFormat[]).map((f) => encodeFloat(value, f));
  }, [mode, value, out.error]);

  const limits = useMemo(() => formatLimits(format), [format]);

  const flip = (i: number) => {
    if (!r) return;
    const bits = r.bits.split('');
    bits[i] = bits[i] === '1' ? '0' : '1';
    const hex = BigInt('0b' + bits.join('')).toString(16).toUpperCase().padStart(FORMATS[format].bits / 4, '0');
    setMode('decode');
    // Keep the 0x prefix so a pattern such as 0B100000 is never read as binary.
    setValue('0x' + hex);
    track('flip_bit');
  };

  const switchMode = (m: string) => {
    // Carry the current number across: its bits when going to decode, its shortest decimal when going to encode.
    if (r && m === 'decode') setValue('0x' + r.hex);
    if (r && m === 'encode' && r.class !== 'nan') setValue(r.shortest);
    setMode(m as 'encode' | 'decode');
  };

  const switchFormat = (f: string) => {
    const to = f as FloatFormat;
    if (mode === 'decode' && r) {
      const hex = r.nan ? nanToFormat(r, to).toString(16).toUpperCase().padStart(FORMATS[to].bits / 4, '0') : encodeFloat(r.shortest, to).hex;
      setValue('0x' + hex);
    }
    setFormat(f as FloatFormat);
  };

  const shareUrl = () => `${window.location.origin}/ieee-754-float-converter?${new URLSearchParams({ v: value, f: format, m: mode }).toString()}`;
  const summary = () =>
    r
      ? [
          `${FORMATS[format].name}: ${r.hex}`,
          t('Bits: {bits}', { bits: `${r.bits[0]} ${r.exponentBits} ${r.fractionBits}` }),
          t('Class: {value}', { value: t(CLASS_LABEL[r.class]) }),
          t('Exact stored value: {value}', { value: r.exactValue }),
          t('Shortest decimal: {value}', { value: r.shortest }),
          r.rounding && !r.rounding.exact ? t('Rounding error: {value}', { value: r.rounding.error }) : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

  const examples = mode === 'encode' ? ENCODE_EXAMPLES : DECODE_EXAMPLES[format];

  return (
    <Page>
      <ToolBreadcrumb category={{ label: t('Tech Tools'), href: '/category/development-tech' }} subcategory={{ label: t('Data Formats'), href: '/category/development-tech/data-formats' }} toolName={t(H1)} />
      <div className="tool-header mt-6">
        <h1 className="tool-title text-black dark:text-white text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
          <Binary className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600 shrink-0" />
          {t(H1)}
        </h1>
        <p className="tool-description text-gray-600 dark:text-gray-300 text-sm sm:text-base mt-2">
          {t('See the sign, exponent and fraction bits of a half, single or double precision float, the exact value it stores and how far rounding moved it.')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 mt-6">
        <div className="space-y-4 min-w-0 lg:col-span-2">
          <Panel title={t('Input')} icon={SlidersHorizontal}>
            <Segmented label={t('Direction')} value={mode} onChange={switchMode} options={MODE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />
            <Segmented label={t('Format')} value={format} onChange={switchFormat} options={FORMAT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />
            <div>
              <Label htmlFor="ieee-value" className="text-sm font-medium text-black dark:text-white">
                {mode === 'encode' ? t('Number') : t('Bit pattern ({hex} hex digits or {bits} bits)', { hex: FORMATS[format].bits / 4, bits: FORMATS[format].bits })}
              </Label>
              <Input
                id="ieee-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {mode === 'encode' ? t('Decimals (0.1, 6.02e23), fractions (1/3), hex floats (0x1.8p3), inf and nan. Rounded to nearest, ties to even.') : t('Hex such as {a} or {b}, or binary with a 0b prefix.', { a: '3DCCCCCD', b: '0x3FB999999999999A' })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('Examples')}</p>
              <div className="flex flex-wrap gap-1.5">
                {examples.map((x) => (
                  <Chip
                    key={x}
                    active={value === exampleValue(x)}
                    onClick={() => {
                      setValue(exampleValue(x));
                      track('example', { example: x });
                    }}
                  >
                    {x.split(' = ')[0]}
                  </Chip>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title={t('{name} limits', { name: FORMATS[format].name })} icon={Table2}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t('Largest finite')} value={limits.maxFinite} />
              <Stat label={t('Smallest normal')} value={limits.minNormal} />
              <Stat label={t('Smallest subnormal')} value={limits.minSubnormal} />
              <Stat label={t('Machine epsilon')} value={`2^-${limits.precision - 1}`} sub={limits.epsilon.length < 24 ? limits.epsilon : undefined} />
              <Stat label={t('Precision')} value={t('{n} bits', { n: limits.precision })} sub={t('{decimalDigits} to {roundTripDigits} decimal digits', { decimalDigits: limits.decimalDigits, roundTripDigits: limits.roundTripDigits })} />
              <Stat label={t('Exponent range')} value={t('{from} to {to}', { from: limits.emin, to: limits.emax })} sub={t('bias {bias}', { bias: limits.bias })} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('Also known as: {aka}.', { aka: limits.aka })}</p>
          </Panel>
        </div>

        <div className="space-y-4 min-w-0 lg:col-span-3">
          <Panel title={t('Bits')} icon={Binary}>
            {out.error && <ErrorNote>{t(out.error)}</ErrorNote>}
            {r && (
              <>
                <BitGrid r={r} onToggle={flip} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Stat label={t('Hex')} value={`0x${r.hex}`} tone="accent" />
                  <Stat label={t('Class')} value={t(CLASS_LABEL[r.class])} />
                  <Stat label={t('Exponent')} value={r.exponent === null ? t('all ones') : String(r.exponent)} sub={
                      r.exponent === null
                        ? t('stored {biasedExponent}', { biasedExponent: r.biasedExponent })
                        : r.class === 'normal'
                          ? t('stored {biasedExponent} = {exponent} + {bias}', { biasedExponent: r.biasedExponent, exponent: r.exponent, bias: FORMATS[format].bias })
                          : t('stored 0 ({class}: fixed at emin = {emin})', { class: t(CLASS_WORD[r.class] ?? r.class), emin: FORMATS[format].emin })
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat label={t('Bytes, big-endian')} value={r.bytesBigEndian} sub={t('DataView default, network order')} />
                  <Stat label={t('Bytes, little-endian')} value={r.bytesLittleEndian} sub={t('memory order on x86 and ARM')} />
                </div>
                <CalculationSteps steps={ieee754Steps({ mode, format, value })} />
                <FormulaBox title={t('Decoded')} lines={[r.formula]} />
              </>
            )}
          </Panel>

          {r && (
            <Panel title={t('Stored value')} icon={MoveHorizontal}>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t('Exact decimal value')}</span>
                  <CopyButton text={r.exactValue} onCopied={() => track('copy_exact')} />
                </div>
                <div className="font-mono text-sm text-black dark:text-white break-all mt-1" data-testid="ieee-exact">
                  {r.exactValue}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={t('Shortest decimal')} value={r.shortest} sub={t('reads back to the same bits')} />
                {r.rounding && <Stat label={t('Rounding error')} value={r.rounding.exact ? t('none, exact') : r.rounding.error} sub={r.rounding.exact ? undefined : t('relative {relativeError}', { relativeError: r.rounding.relativeError })} />}
                <Stat label={t('Next up')} value={r.nextUp.value} sub={`0x${r.nextUp.hex}`} />
                <Stat label={t('Next down')} value={r.nextDown.value} sub={`0x${r.nextDown.hex}`} />
                {r.ulp && <Stat label={t('Unit in the last place')} value={r.ulp.length > 24 ? Number(r.ulp).toExponential(6) : r.ulp} sub={t('gap to the next float out from zero')} />}
                {r.nan && <Stat label={t('NaN payload')} value={r.nan.payloadHex} sub={r.nan.quiet ? t('quiet NaN') : t('signalling NaN')} />}
              </div>
              {r.rounding?.overflow && <ErrorNote>{t('The number is beyond the largest finite {format} value, so round to nearest gives infinity.', { format })}</ErrorNote>}
              {r.rounding?.underflow && <ErrorNote>{r.class === 'zero' ? t('The number is below the normal range and lost precision on the way into a zero.') : t('The number is below the normal range and lost precision on the way into a subnormal.')}</ErrorNote>}
            </Panel>
          )}

          {compare && (
            <Panel title={t('Same number in each format')} icon={Table2}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 dark:text-gray-300">
                      <th className="py-1 pr-2 font-medium">{t('Format')}</th>
                      <th className="py-1 pr-2 font-medium">{t('Hex')}</th>
                      <th className="py-1 pr-2 font-medium">{t('Stored (shortest)')}</th>
                      <th className="py-1 font-medium">{t('Error')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.map((c) => (
                      <tr key={c.format} className="border-t border-gray-200 dark:border-gray-700 text-black dark:text-white">
                        <td className="py-2 pr-2">{c.format}</td>
                        <td className="py-2 pr-2 font-mono break-all">{c.hex}</td>
                        <td className="py-2 pr-2 font-mono break-all">{c.shortest}</td>
                        <td className="py-2 font-mono">{c.rounding?.exact ? '0' : c.rounding?.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {r && <ActionRow summary={summary} shareUrl={shareUrl} onReset={() => { setMode('encode'); setFormat('binary32'); setValue('0.1'); }} onAction={track} />}
          <LocalNote />
        </div>
      </div>
    </Page>
  );
}
