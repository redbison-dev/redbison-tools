/**
 * GPU memory estimates for running and fine-tuning transformer LLMs.
 *
 * Units: bytes internally; GB in this module means GiB (2^30 bytes), which is
 * how GPU memory sizes such as "80 GB" are actually built and reported.
 */
import { msg } from '../../msg';

export const GIB = 1024 ** 3;

export type ModelArch = {
  id: string;
  label: string;
  /** Total parameters (billions), as published by the model author. */
  paramsB: number;
  /** Parameters used per token (billions). Differs from paramsB only for mixture-of-experts. */
  activeParamsB?: number;
  layers: number;
  hidden: number;
  heads: number;
  kvHeads: number;
  headDim: number;
  intermediate: number;
  vocab: number;
  /** Input embedding and output head share one matrix. */
  tiedEmbeddings: boolean;
  /** Mixture of experts: experts per layer (MLP is replicated this many times). */
  experts?: number;
  source: string;
};

/**
 * Architecture numbers from each model's config.json on Hugging Face
 * (hidden_size, num_hidden_layers, num_attention_heads, num_key_value_heads,
 * head_dim, intermediate_size, vocab_size) and parameter counts from the
 * model cards.
 */
export const MODEL_PRESETS: ModelArch[] = [
  { id: 'llama-3.1-8b', label: 'Llama 3.1 8B', paramsB: 8.03, layers: 32, hidden: 4096, heads: 32, kvHeads: 8, headDim: 128, intermediate: 14336, vocab: 128256, tiedEmbeddings: false, source: 'meta-llama/Llama-3.1-8B config.json' },
  { id: 'llama-3.1-70b', label: 'Llama 3.1 70B', paramsB: 70.6, layers: 80, hidden: 8192, heads: 64, kvHeads: 8, headDim: 128, intermediate: 28672, vocab: 128256, tiedEmbeddings: false, source: 'meta-llama/Llama-3.1-70B config.json' },
  { id: 'llama-3.1-405b', label: 'Llama 3.1 405B', paramsB: 405.9, layers: 126, hidden: 16384, heads: 128, kvHeads: 8, headDim: 128, intermediate: 53248, vocab: 128256, tiedEmbeddings: false, source: 'meta-llama/Llama-3.1-405B config.json' },
  { id: 'mistral-7b', label: 'Mistral 7B v0.3', paramsB: 7.25, layers: 32, hidden: 4096, heads: 32, kvHeads: 8, headDim: 128, intermediate: 14336, vocab: 32768, tiedEmbeddings: false, source: 'mistralai/Mistral-7B-v0.3 config.json' },
  { id: 'mixtral-8x7b', label: 'Mixtral 8x7B', paramsB: 46.7, activeParamsB: 12.9, layers: 32, hidden: 4096, heads: 32, kvHeads: 8, headDim: 128, intermediate: 14336, vocab: 32000, tiedEmbeddings: false, experts: 8, source: 'mistralai/Mixtral-8x7B-v0.1 config.json' },
  { id: 'qwen2.5-7b', label: 'Qwen 2.5 7B', paramsB: 7.61, layers: 28, hidden: 3584, heads: 28, kvHeads: 4, headDim: 128, intermediate: 18944, vocab: 152064, tiedEmbeddings: false, source: 'Qwen/Qwen2.5-7B config.json' },
  { id: 'qwen2.5-72b', label: 'Qwen 2.5 72B', paramsB: 72.7, layers: 80, hidden: 8192, heads: 64, kvHeads: 8, headDim: 128, intermediate: 29568, vocab: 152064, tiedEmbeddings: false, source: 'Qwen/Qwen2.5-72B config.json' },
  { id: 'gemma-2-9b', label: 'Gemma 2 9B', paramsB: 9.24, layers: 42, hidden: 3584, heads: 16, kvHeads: 8, headDim: 256, intermediate: 14336, vocab: 256000, tiedEmbeddings: true, source: 'google/gemma-2-9b config.json' },
  { id: 'gemma-2-27b', label: 'Gemma 2 27B', paramsB: 27.2, layers: 46, hidden: 4608, heads: 32, kvHeads: 16, headDim: 128, intermediate: 36864, vocab: 256000, tiedEmbeddings: true, source: 'google/gemma-2-27b config.json' },
  { id: 'phi-3-mini', label: 'Phi-3 mini (3.8B)', paramsB: 3.82, layers: 32, hidden: 3072, heads: 32, kvHeads: 32, headDim: 96, intermediate: 8192, vocab: 32064, tiedEmbeddings: false, source: 'microsoft/Phi-3-mini-4k-instruct config.json' },
];

export type Precision = 'fp32' | 'bf16' | 'fp8' | 'int8' | 'int4';
export const PRECISION_BYTES: Record<Precision, number> = { fp32: 4, bf16: 2, fp8: 1, int8: 1, int4: 0.5 };
export const PRECISION_LABEL: Record<Precision, string> = { fp32: 'FP32', bf16: 'BF16 / FP16', fp8: 'FP8', int8: 'INT8', int4: 'INT4 (GPTQ, AWQ, GGUF Q4)' };

/**
 * QLoRA NF4 with double quantisation: 4 bits per weight plus 8-bit block
 * constants per 64 weights and a 32-bit constant per 256 blocks
 * (Dettmers et al. 2023, section 3): 4 + 8/64 + 32/(64*256) bits.
 */
export const NF4_BYTES_PER_PARAM = (4 + 8 / 64 + 32 / (64 * 256)) / 8;

/** Mixed-precision AdamW: fp16 weights 2 + fp16 grads 2 + fp32 master, momentum, variance 12 (ZeRO, Rajbhandari et al. 2019). */
export const ADAM_MIXED_BYTES_PER_PARAM = 16;
/** Trainable adapter weights kept in fp32: weight 4 + gradient 4 + Adam moments 8. */
export const ADAPTER_BYTES_PER_PARAM = 16;

/** Parameters in the input embedding plus the output head (counted once when tied). */
export function embeddingParams(m: Pick<ModelArch, 'vocab' | 'hidden' | 'tiedEmbeddings'>): number {
  return m.vocab * m.hidden * (m.tiedEmbeddings ? 1 : 2);
}

/** Rough parameter count from the architecture (attention, gated MLP, embeddings; norms ignored). */
export function paramsFromArch(m: Omit<ModelArch, 'id' | 'label' | 'paramsB' | 'source'>): number {
  const q = m.hidden * m.heads * m.headDim;
  const kv = 2 * m.hidden * m.kvHeads * m.headDim;
  const o = m.heads * m.headDim * m.hidden;
  const mlp = 3 * m.hidden * m.intermediate * (m.experts ?? 1);
  const router = m.experts ? m.hidden * m.experts : 0;
  return m.layers * (q + kv + o + mlp + router) + embeddingParams(m);
}

/** KV cache bytes = 2 (K and V) x layers x KV heads x head dim x bytes x tokens x batch. */
export function kvCacheBytes(m: Pick<ModelArch, 'layers' | 'kvHeads' | 'headDim'>, contextTokens: number, batch: number, bytesPerValue: number): number {
  return 2 * m.layers * m.kvHeads * m.headDim * bytesPerValue * contextTokens * batch;
}

export const LORA_TARGETS = ['q', 'k', 'v', 'o', 'gate', 'up', 'down'] as const;
export type LoraTarget = (typeof LORA_TARGETS)[number];

/** LoRA adds r x (in + out) parameters per adapted matrix (Hu et al. 2021). MoE MLP targets are adapted in every expert. */
export function loraParams(m: Pick<ModelArch, 'layers' | 'hidden' | 'heads' | 'kvHeads' | 'headDim' | 'intermediate' | 'experts'>, rank: number, targets: readonly LoraTarget[]): number {
  const dims: Record<LoraTarget, [number, number]> = {
    q: [m.hidden, m.heads * m.headDim],
    k: [m.hidden, m.kvHeads * m.headDim],
    v: [m.hidden, m.kvHeads * m.headDim],
    o: [m.heads * m.headDim, m.hidden],
    gate: [m.hidden, m.intermediate],
    up: [m.hidden, m.intermediate],
    down: [m.intermediate, m.hidden],
  };
  let perLayer = 0;
  for (const t of targets) {
    const [i, o] = dims[t];
    const mult = (t === 'gate' || t === 'up' || t === 'down') && m.experts ? m.experts : 1;
    perLayer += rank * (i + o) * mult;
  }
  return perLayer * m.layers;
}

/**
 * Activation memory for one training step in BF16.
 * Without recomputation a transformer layer stores about 34 x s x b x h bytes
 * when attention scores are not materialised (FlashAttention), from
 * Korthikanti et al. 2022, "Reducing Activation Recomputation". Full gradient
 * checkpointing keeps each layer's 2 x s x b x h input plus one layer being
 * recomputed. The fp32 logits (s x b x vocab x 4) are added on top.
 */
export function activationBytes(m: Pick<ModelArch, 'layers' | 'hidden' | 'vocab'>, seqLen: number, batch: number, checkpointing: boolean): number {
  const sbh = seqLen * batch * m.hidden;
  const layers = checkpointing ? m.layers * 2 * sbh + 34 * sbh : m.layers * 34 * sbh;
  const logits = seqLen * batch * m.vocab * 4;
  return layers + logits;
}

export type MemoryMode = 'inference' | 'full' | 'lora' | 'qlora';

export type MemoryInput = {
  model: ModelArch;
  mode: MemoryMode;
  /** Inference weight precision. */
  precision: Precision;
  /** KV cache precision in bytes per value (2 for BF16, 1 for FP8). */
  kvBytes: number;
  contextTokens: number;
  batch: number;
  checkpointing: boolean;
  loraRank: number;
  loraTargets: readonly LoraTarget[];
  /** Framework, CUDA context and fragmentation allowance, as % of the subtotal. */
  overheadPct: number;
};

/** `labelMsg` and `noteMsgs` are the message forms of text built from values, for translation where it renders. */
export type MemoryPart = { key: string; label: string; labelMsg?: { text: string; vars: Record<string, string | number> }; bytes: number };
export type MemoryResult = { parts: MemoryPart[]; totalBytes: number; trainableParams: number; notes: string[]; noteMsgs: { text: string; vars: Record<string, string | number> }[] };

export function estimateMemory(i: MemoryInput): MemoryResult {
  const P = i.model.paramsB * 1e9;
  const emb = embeddingParams(i.model);
  const parts: MemoryPart[] = [];
  const notes: string[] = [];
  const noteMsgs: { text: string; vars: Record<string, string | number> }[] = [];
  const note = (text: string, vars: Record<string, string | number> = {}) => {
    notes.push(text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))));
    noteMsgs.push({ text, vars });
  };
  let trainable = 0;
  if (i.mode === 'inference') {
    const b = PRECISION_BYTES[i.precision];
    const weights = b >= 2 ? P * b : (P - emb) * b + emb * 2;
    if (b < 2) note(msg('Embedding and output head kept in BF16, as GPTQ, AWQ and FP8 checkpoints usually do.'));
    parts.push({ key: 'weights', label: `Weights (${PRECISION_LABEL[i.precision]})`, labelMsg: { text: msg('Weights ({precision})'), vars: { precision: PRECISION_LABEL[i.precision] } }, bytes: weights });
    parts.push({ key: 'kv', label: msg('KV cache'), bytes: kvCacheBytes(i.model, i.contextTokens, i.batch, i.kvBytes) });
    if (i.model.activeParamsB) note(msg('Mixture of experts: all {total}B parameters must be in memory even though only {active}B are used per token.'), { total: i.model.paramsB, active: i.model.activeParamsB });
  } else if (i.mode === 'full') {
    trainable = P;
    parts.push({ key: 'weights', label: msg('Weights (BF16)'), bytes: P * 2 });
    parts.push({ key: 'grads', label: msg('Gradients (BF16)'), bytes: P * 2 });
    parts.push({ key: 'optim', label: msg('AdamW state + FP32 master weights'), bytes: P * (ADAM_MIXED_BYTES_PER_PARAM - 4) });
    parts.push({ key: 'act', label: msg('Activations'), bytes: activationBytes(i.model, i.contextTokens, i.batch, i.checkpointing) });
  } else {
    const A = loraParams(i.model, i.loraRank, i.loraTargets);
    trainable = A;
    const base = i.mode === 'lora' ? P * 2 : (P - emb) * NF4_BYTES_PER_PARAM + emb * 2;
    parts.push({ key: 'weights', label: i.mode === 'lora' ? msg('Frozen base (BF16)') : msg('Frozen base (NF4, double-quantised)'), bytes: base });
    parts.push({ key: 'adapter', label: msg('LoRA adapters + grads + AdamW'), bytes: A * ADAPTER_BYTES_PER_PARAM });
    parts.push({ key: 'act', label: msg('Activations'), bytes: activationBytes(i.model, i.contextTokens, i.batch, i.checkpointing) });
    if (i.mode === 'qlora') note(msg('Embedding and output head stay in BF16; bitsandbytes quantises only the linear layers.'));
  }
  const sub = parts.reduce((s, p) => s + p.bytes, 0);
  parts.push({ key: 'overhead', label: `Overhead (${i.overheadPct}%)`, labelMsg: { text: msg('Overhead ({pct}%)'), vars: { pct: i.overheadPct } }, bytes: (sub * i.overheadPct) / 100 });
  return { parts, totalBytes: parts.reduce((s, p) => s + p.bytes, 0), trainableParams: trainable, notes, noteMsgs };
}

export type GpuMemoryOption = { id: string; label: string; gb: number; note?: string };

export const GPU_MEMORY_OPTIONS: GpuMemoryOption[] = [
  { id: 'rtx-4090', label: 'RTX 4090', gb: 24 },
  { id: 'rtx-5090', label: 'RTX 5090', gb: 32 },
  { id: 'l4', label: 'L4', gb: 24 },
  { id: 'a10', label: 'A10', gb: 24 },
  { id: 'l40s', label: 'L40S', gb: 48 },
  { id: 'a100-40', label: 'A100 40 GB', gb: 40 },
  { id: 'a100-80', label: 'A100 80 GB', gb: 80 },
  { id: 'h100', label: 'H100 80 GB', gb: 80 },
  { id: 'h200', label: 'H200', gb: 141 },
  { id: 'b200', label: 'B200', gb: 180, note: msg('HGX B200 lists 1.44 TB across 8 GPUs') },
  { id: 'mi300x', label: 'AMD MI300X', gb: 192 },
  { id: 'mac-36', label: msg('Mac, 36 GB unified'), gb: 36, note: msg('macOS gives the GPU only part of unified memory by default') },
  { id: 'mac-64', label: msg('Mac, 64 GB unified'), gb: 64, note: msg('macOS gives the GPU only part of unified memory by default') },
  { id: 'mac-128', label: msg('Mac, 128 GB unified'), gb: 128, note: msg('macOS gives the GPU only part of unified memory by default') },
  { id: 'mac-192', label: msg('Mac, 192 GB unified'), gb: 192, note: msg('macOS gives the GPU only part of unified memory by default') },
];

/** GPUs needed if the total is split evenly (tensor or pipeline parallel, ZeRO-3/FSDP for training). */
export function gpusNeeded(totalBytes: number, gpuGb: number): number {
  if (!(totalBytes > 0) || !(gpuGb > 0)) return 0;
  // The slack absorbs float noise at exact multiples; any positive total still needs at least one GPU.
  return Math.max(1, Math.ceil(totalBytes / (gpuGb * GIB) - 1e-9));
}
