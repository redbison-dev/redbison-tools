/**
 * Offline decoder for raw signed Ethereum transactions: RLP, legacy
 * (with EIP-155 chain id), and EIP-2718 typed envelopes 0x01 (EIP-2930),
 * 0x02 (EIP-1559), 0x03 (EIP-4844) and 0x04 (EIP-7702).
 */
import {
  bytesToHex,
  COMMON_FUNCTIONS,
  decodeCalldata,
  formatDecodedValue,
  hexToBytes,
  keccak256Bytes,
  toChecksumAddress,
} from './smart-contract-abi-decoder';
import { formatDecimal } from './cryptocurrency-unit-converter';
import { msg } from '../msg';

export type RlpItem = Uint8Array | RlpItem[];

type Vars = Record<string, string | number>;
/** Translator the UI passes in (its useT() t); the default fills placeholders in English. */
export type TxT = (source: string, vars?: Vars) => string;
const fill: TxT = (source, vars) => (vars ? source.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : source);

/** A decoding error whose English message is `text` with `vars`, so the UI can show it translated. */
export class TxDecodeError extends Error {
  readonly text: string;
  readonly vars: Vars;
  constructor(text: string, vars: Vars = {}) {
    super(fill(text, vars));
    this.text = text;
    this.vars = vars;
  }
}

/** Decode one RLP item that must span the whole input. */
export function rlpDecode(input: Uint8Array): RlpItem {
  const [item, end] = decodeItem(input, 0);
  if (end !== input.length) throw new TxDecodeError(msg('RLP has {n} trailing bytes'), { n: input.length - end });
  return item;
}

function readLength(data: Uint8Array, pos: number, n: number): number {
  if (pos + n > data.length) throw new TxDecodeError(msg('RLP length prefix runs past the end of the data'));
  if (data[pos] === 0) throw new TxDecodeError(msg('RLP length has a leading zero'));
  let len = 0;
  for (let i = 0; i < n; i++) len = len * 256 + data[pos + i];
  return len;
}

function decodeItem(data: Uint8Array, pos: number): [RlpItem, number] {
  if (pos >= data.length) throw new TxDecodeError(msg('RLP data ended unexpectedly'));
  const p = data[pos];
  if (p <= 0x7f) return [data.subarray(pos, pos + 1), pos + 1];
  if (p <= 0xb7) {
    const len = p - 0x80;
    const end = pos + 1 + len;
    if (end > data.length) throw new TxDecodeError(msg('RLP string runs past the end of the data'));
    if (len === 1 && data[pos + 1] <= 0x7f) throw new TxDecodeError(msg('Non-canonical RLP: single byte below 0x80 should not be prefixed'));
    return [data.subarray(pos + 1, end), end];
  }
  if (p <= 0xbf) {
    const ll = p - 0xb7;
    const len = readLength(data, pos + 1, ll);
    const start = pos + 1 + ll;
    if (start + len > data.length) throw new TxDecodeError(msg('RLP string runs past the end of the data'));
    return [data.subarray(start, start + len), start + len];
  }
  let start: number;
  let len: number;
  if (p <= 0xf7) {
    len = p - 0xc0;
    start = pos + 1;
  } else {
    const ll = p - 0xf7;
    len = readLength(data, pos + 1, ll);
    start = pos + 1 + ll;
  }
  const end = start + len;
  if (end > data.length) throw new TxDecodeError(msg('RLP list runs past the end of the data'));
  const items: RlpItem[] = [];
  let cur = start;
  while (cur < end) {
    const [item, next] = decodeItem(data, cur);
    items.push(item);
    cur = next;
  }
  if (cur !== end) throw new TxDecodeError(msg('RLP list contents overrun the declared length'));
  return [items, end];
}

function asBytes(item: RlpItem | undefined, field: string): Uint8Array {
  if (!(item instanceof Uint8Array)) throw new TxDecodeError(msg('Field {field} should be a byte string'), { field });
  return item;
}

function asList(item: RlpItem | undefined, field: string): RlpItem[] {
  if (!Array.isArray(item)) throw new TxDecodeError(msg('Field {field} should be a list'), { field });
  return item;
}

function asInt(item: RlpItem | undefined, field: string): bigint {
  const b = asBytes(item, field);
  return b.length === 0 ? 0n : BigInt(bytesToHex(b));
}

function asAddress(item: RlpItem | undefined, field: string): string | null {
  const b = asBytes(item, field);
  if (b.length === 0) return null; // contract creation
  if (b.length !== 20) throw new TxDecodeError(msg('Field {field} should be 20 bytes, got {n}'), { field, n: b.length });
  return toChecksumAddress(bytesToHex(b));
}

export type AccessListEntry = { address: string; storageKeys: string[] };

export type DecodedTransaction = {
  type: 0 | 1 | 2 | 3 | 4;
  typeName: string;
  hash: string;
  chainId: bigint | null;
  nonce: bigint;
  gasLimit: bigint;
  gasPrice?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
  maxFeePerBlobGas?: bigint;
  blobVersionedHashes?: string[];
  authorizationCount?: number;
  to: string | null;
  value: bigint;
  data: string;
  accessList: AccessListEntry[];
  v?: bigint;
  yParity?: bigint;
  r: string;
  s: string;
};

function decodeAccessList(item: RlpItem | undefined): AccessListEntry[] {
  return asList(item, 'accessList').map((entry, i) => {
    const pair = asList(entry, `accessList[${i}]`);
    return {
      address: asAddress(pair[0], `accessList[${i}].address`) ?? '',
      storageKeys: asList(pair[1], `accessList[${i}].storageKeys`).map((k, j) =>
        bytesToHex(asBytes(k, `accessList[${i}].storageKeys[${j}]`)),
      ),
    };
  });
}

const TYPE_NAMES: Record<number, string> = {
  0: msg('Legacy'),
  1: msg('EIP-2930 (access list)'),
  2: msg('EIP-1559 (dynamic fee)'),
  3: msg('EIP-4844 (blob)'),
  4: msg('EIP-7702 (set code)'),
};

/** Decode a raw signed transaction given as hex (with or without 0x). */
export function decodeRawTransaction(rawHex: string): DecodedTransaction {
  const raw = hexToBytes(rawHex);
  if (raw.length === 0) throw new TxDecodeError(msg('Transaction data is empty'));
  const hash = keccak256Bytes(raw);
  const first = raw[0];

  if (first >= 0xc0) {
    const f = asList(rlpDecode(raw), 'transaction');
    if (f.length !== 9) throw new TxDecodeError(msg('Legacy transaction should have 9 fields, found {n}'), { n: f.length });
    const v = asInt(f[6], 'v');
    // EIP-155: v = chainId * 2 + 35 or 36. Pre-155 transactions use 27/28.
    const chainId = v >= 35n ? (v - 35n) / 2n : null;
    return {
      type: 0,
      typeName: TYPE_NAMES[0],
      hash,
      chainId,
      nonce: asInt(f[0], 'nonce'),
      gasPrice: asInt(f[1], 'gasPrice'),
      gasLimit: asInt(f[2], 'gasLimit'),
      to: asAddress(f[3], 'to'),
      value: asInt(f[4], 'value'),
      data: bytesToHex(asBytes(f[5], 'data')),
      accessList: [],
      v,
      r: bytesToHex(asBytes(f[7], 'r')),
      s: bytesToHex(asBytes(f[8], 's')),
    };
  }

  if (first > 0x7f) throw new TxDecodeError(msg('Unknown transaction type byte {byte}'), { byte: `0x${first.toString(16)}` });
  const type = first;
  if (type < 1 || type > 4) throw new TxDecodeError(msg('Unsupported transaction type {byte}'), { byte: `0x${type.toString(16).padStart(2, '0')}` });
  let payload = rlpDecode(raw.subarray(1));
  // EIP-4844 network form wraps [tx, blobs, commitments, proofs].
  if (type === 3 && Array.isArray(payload) && Array.isArray(payload[0])) payload = payload[0];
  const f = asList(payload, 'transaction');
  const expected: Record<number, number> = { 1: 11, 2: 12, 3: 14, 4: 13 };
  if (f.length !== expected[type]) {
    throw new TxDecodeError(msg('Type {type} transaction should have {expected} fields, found {n}'), { type, expected: expected[type], n: f.length });
  }
  const common = {
    type: type as 1 | 2 | 3 | 4,
    typeName: TYPE_NAMES[type],
    hash,
    chainId: asInt(f[0], 'chainId'),
    nonce: asInt(f[1], 'nonce'),
  };
  const sig = (i: number) => ({
    yParity: asInt(f[i], 'yParity'),
    r: bytesToHex(asBytes(f[i + 1], 'r')),
    s: bytesToHex(asBytes(f[i + 2], 's')),
  });

  if (type === 1) {
    return {
      ...common,
      gasPrice: asInt(f[2], 'gasPrice'),
      gasLimit: asInt(f[3], 'gasLimit'),
      to: asAddress(f[4], 'to'),
      value: asInt(f[5], 'value'),
      data: bytesToHex(asBytes(f[6], 'data')),
      accessList: decodeAccessList(f[7]),
      ...sig(8),
    };
  }
  const dyn = {
    ...common,
    maxPriorityFeePerGas: asInt(f[2], 'maxPriorityFeePerGas'),
    maxFeePerGas: asInt(f[3], 'maxFeePerGas'),
    gasLimit: asInt(f[4], 'gasLimit'),
    to: asAddress(f[5], 'to'),
    value: asInt(f[6], 'value'),
    data: bytesToHex(asBytes(f[7], 'data')),
    accessList: decodeAccessList(f[8]),
  };
  if (type === 2) return { ...dyn, ...sig(9) };
  if (type === 3) {
    return {
      ...dyn,
      maxFeePerBlobGas: asInt(f[9], 'maxFeePerBlobGas'),
      blobVersionedHashes: asList(f[10], 'blobVersionedHashes').map((h, i) => bytesToHex(asBytes(h, `blobVersionedHashes[${i}]`))),
      ...sig(11),
    };
  }
  return { ...dyn, authorizationCount: asList(f[9], 'authorizationList').length, ...sig(10) };
}

const CHAIN_NAMES: Record<string, string> = {
  '1': msg('Ethereum mainnet'),
  '10': 'OP Mainnet',
  '56': 'BNB Smart Chain',
  '137': 'Polygon PoS',
  '8453': 'Base',
  '42161': 'Arbitrum One',
  '11155111': msg('Sepolia testnet'),
  '17000': msg('Holesky testnet'),
};

export function chainName(chainId: bigint | null, t: TxT = fill): string {
  if (chainId === null) return t(msg('not set (pre-EIP-155, replayable on any chain)'));
  const known = CHAIN_NAMES[chainId.toString()];
  return t(msg('{id} ({name})'), { id: chainId.toString(), name: known ? t(known) : t(msg('unknown chain')) });
}

const gwei = (wei: bigint) => `${formatDecimal(wei, 9)} gwei`;
const eth = (wei: bigint) => `${formatDecimal(wei, 18)} ETH`;

/** Plain-text report used by the UI and its copy button; `t` is the page's translator (English by default). */
export function formatTransactionReport(tx: DecodedTransaction, t: TxT = fill): string {
  const lines: string[] = [];
  lines.push(t(msg('Transaction type: {type} ({name})'), { type: tx.type, name: t(tx.typeName) }));
  lines.push(t(msg('Transaction hash: {hash}'), { hash: tx.hash }));
  lines.push(t(msg('Chain ID: {chain}'), { chain: chainName(tx.chainId, t) }));
  lines.push(t(msg('Nonce: {n}'), { n: tx.nonce.toString() }));
  lines.push(tx.to ? t(msg('To: {address}'), { address: tx.to }) : t(msg('To: (empty: contract creation)')));
  lines.push(t(msg('Value: {eth} ({wei} wei)'), { eth: eth(tx.value), wei: tx.value.toString() }));
  lines.push(t(msg('Gas limit: {n}'), { n: tx.gasLimit.toString() }));
  if (tx.gasPrice !== undefined) {
    lines.push(t(msg('Gas price: {value}'), { value: gwei(tx.gasPrice) }));
    lines.push(t(msg('Max gas cost (gas limit x gas price): {value}'), { value: eth(tx.gasLimit * tx.gasPrice) }));
  }
  if (tx.maxFeePerGas !== undefined && tx.maxPriorityFeePerGas !== undefined) {
    lines.push(t(msg('Max priority fee per gas: {value}'), { value: gwei(tx.maxPriorityFeePerGas) }));
    lines.push(t(msg('Max fee per gas: {value}'), { value: gwei(tx.maxFeePerGas) }));
    lines.push(t(msg('Max gas cost (gas limit x max fee): {value}'), { value: eth(tx.gasLimit * tx.maxFeePerGas) }));
  }
  if (tx.maxFeePerBlobGas !== undefined) lines.push(t(msg('Max fee per blob gas: {value}'), { value: gwei(tx.maxFeePerBlobGas) }));
  if (tx.blobVersionedHashes) {
    lines.push(tx.blobVersionedHashes.length ? t(msg('Blob versioned hashes: {hashes}'), { hashes: tx.blobVersionedHashes.join(', ') }) : t(msg('Blob versioned hashes: none')));
  }
  if (tx.authorizationCount !== undefined) lines.push(t(msg('Authorizations: {n}'), { n: tx.authorizationCount }));
  if (tx.type !== 0) {
    lines.push(tx.accessList.length ? t(msg('Access list: ')) : t(msg('Access list: empty')));
    for (const e of tx.accessList) {
      lines.push(`  ${e.address}${e.storageKeys.length ? t(msg(': {n} storage key(s)'), { n: e.storageKeys.length }) : ''}`);
    }
  }
  const dataBytes = (tx.data.length - 2) / 2;
  lines.push(dataBytes === 0 ? t(msg('Input data: none (plain value transfer)')) : t(msg('Input data: {n} bytes'), { n: dataBytes }));
  if (dataBytes >= 4) {
    lines.push(t(msg('Function selector: {selector}'), { selector: tx.data.slice(0, 10) }));
    try {
      const call = decodeCalldata(COMMON_FUNCTIONS, tx.data);
      lines.push(t(msg('Matches common function: {signature}'), { signature: call.signature }));
      for (const a of call.args) lines.push(`  ${a.name} (${a.type}): ${formatDecodedValue(a.value)}`);
    } catch {
      lines.push(t(msg('Selector is not one of the built-in ERC-20/721 functions. Paste the contract ABI into the Smart Contract ABI Decoder to decode it.')));
    }
    lines.push(t(msg('Raw input: {data}'), { data: tx.data }));
  }
  lines.push(t(msg('Signature:')));
  if (tx.v !== undefined) lines.push(`  v: ${tx.v}`);
  if (tx.yParity !== undefined) lines.push(`  yParity: ${tx.yParity}`);
  lines.push(`  r: ${tx.r}`);
  lines.push(`  s: ${tx.s}`);
  lines.push(t(msg('Sender: not shown. Recovering the from address needs secp256k1 public key recovery, which this tool does not do.')));
  return lines.join('\n');
}

export function isTransactionHash(input: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(input.trim());
}
