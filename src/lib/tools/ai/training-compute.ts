/**
 * Pre-training compute estimates.
 *
 * C ≈ 6·N·D training FLOPs (Kaplan et al. 2020, "Scaling Laws for Neural
 * Language Models", section 2.1: 2N forward + 4N backward per token).
 * Compute-optimal tokens ≈ 20 per parameter (Hoffmann et al. 2022,
 * "Training Compute-Optimal Large Language Models", Chinchilla).
 * Inference ≈ 2·N FLOPs per generated token.
 */
import { msg } from '../../msg';

export const CHINCHILLA_TOKENS_PER_PARAM = 20;

export type GpuCompute = {
  id: string;
  label: string;
  /** Dense BF16 tensor TFLOPS (vendor datasheets list sparse figures at twice this). */
  bf16Tflops: number;
  tdpW: number;
  memGb: number;
  source: string;
};

export const GPU_COMPUTE_PRESETS: GpuCompute[] = [
  { id: 'a100', label: 'NVIDIA A100 SXM', bf16Tflops: 312, tdpW: 400, memGb: 80, source: msg('NVIDIA A100 datasheet: 312 TFLOPS BF16 (624 with sparsity), 400 W SXM') },
  { id: 'h100', label: 'NVIDIA H100 SXM', bf16Tflops: 989, tdpW: 700, memGb: 80, source: msg('NVIDIA H100 datasheet: 1,979 TFLOPS BF16 with sparsity, so 989 dense; up to 700 W') },
  { id: 'h200', label: 'NVIDIA H200 SXM', bf16Tflops: 989, tdpW: 700, memGb: 141, source: msg('NVIDIA H200 datasheet: same 1,979 sparse / 989 dense BF16 TFLOPS as H100, up to 700 W') },
  { id: 'b200', label: 'NVIDIA B200 (HGX)', bf16Tflops: 2250, tdpW: 1000, memGb: 180, source: msg('NVIDIA HGX B200: 36 PFLOPS BF16 with sparsity for 8 GPUs, so 2.25 PFLOPS dense per GPU; 1,000 W') },
  { id: 'mi300x', label: 'AMD Instinct MI300X', bf16Tflops: 1307.4, tdpW: 750, memGb: 192, source: msg('AMD MI300X datasheet: 1,307.4 TFLOPS BF16 dense (2,614.9 with sparsity), 750 W') },
];

export const trainingFlops = (params: number, tokens: number) => 6 * params * tokens;
export const tokensForCompute = (flops: number, params: number) => flops / (6 * params);
export const paramsForCompute = (flops: number, tokens: number) => flops / (6 * tokens);
export const inferenceFlopsPerToken = (params: number) => 2 * params;

/** Compute-optimal split of a FLOP budget with D = 20·N: C = 6·N·20N = 120·N², so N = √(C/120). */
export function chinchillaOptimal(flops: number, tokensPerParam = CHINCHILLA_TOKENS_PER_PARAM): { params: number; tokens: number } {
  const params = Math.sqrt(flops / (6 * tokensPerParam));
  return { params, tokens: params * tokensPerParam };
}

export type HardwareInput = {
  flops: number;
  /** Dense peak per GPU, TFLOPS. */
  peakTflops: number;
  /** Model FLOPs utilisation, percent. */
  mfuPct: number;
  gpus: number;
  pricePerGpuHour: number;
  tdpW: number;
  pue: number;
};

export type HardwareResult = {
  gpuHours: number;
  wallClockDays: number;
  cost: number;
  /** Energy at the GPU board power, scaled by PUE, in MWh. */
  energyMwh: number;
  effectiveTflopsPerGpu: number;
};

/** Invalid inputs (no GPUs, MFU outside 0-100%, negative price or FLOPs, PUE below 1, NaN) give NaN everywhere, which the formatters show as n/a. */
export function hardwareEstimate(h: HardwareInput): HardwareResult {
  const valid = h.flops >= 0 && h.peakTflops > 0 && h.mfuPct > 0 && h.mfuPct <= 100 && h.gpus > 0 && h.pricePerGpuHour >= 0 && h.tdpW >= 0 && h.pue >= 1;
  if (!valid) return { gpuHours: NaN, wallClockDays: NaN, cost: NaN, energyMwh: NaN, effectiveTflopsPerGpu: NaN };
  const eff = h.peakTflops * 1e12 * (h.mfuPct / 100);
  const gpuSeconds = h.flops / eff;
  const gpuHours = gpuSeconds / 3600;
  return {
    gpuHours,
    wallClockDays: gpuHours / h.gpus / 24,
    cost: gpuHours * h.pricePerGpuHour,
    energyMwh: (gpuHours * h.tdpW * h.pue) / 1e6,
    effectiveTflopsPerGpu: eff / 1e12,
  };
}

/** Parse numbers like "70B", "1.4T", "5.9e23", "405 billion". */
export function parseScaled(s: string): number {
  const t = s.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '');
  if (!t) return NaN;
  const m = t.match(/^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)(k|m|b|t|thousand|million|billion|trillion)?$/);
  if (!m) return NaN;
  const mult: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9, t: 1e12, trillion: 1e12 };
  return Number(m[1]) * (m[2] ? mult[m[2]] : 1);
}

/** 7.03e9 -> "7.03B", 1.4e12 -> "1.4T". */
export function formatScaled(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return 'n/a';
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, u] of units) if (Math.abs(x) >= v) return `${Number((x / v).toPrecision(digits))}${u}`;
  return String(Number(x.toPrecision(digits)));
}

/** 5.88e23 -> "5.88 × 10²³". */
export function formatSci(x: number, digits = 3): string {
  if (!Number.isFinite(x) || x <= 0) return 'n/a';
  let e = Math.floor(Math.log10(x));
  let m = Number((x / 10 ** e).toPrecision(digits));
  // Rounding can carry the mantissa to 10 (9.9996e5 -> "10.0"); renormalise to 1 x 10^(e+1).
  if (m >= 10) {
    m = Number((m / 10).toPrecision(digits));
    e += 1;
  }
  const sup = String(e).replace(/[-0-9]/g, (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
  return `${m} × 10${sup}`;
}

/** Round to `digits` significant figures with thousands separators. */
export const fmtNum = (x: number, digits = 3) => (Number.isFinite(x) ? Number(x.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 6 }) : 'n/a');
