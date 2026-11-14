/**
 * Lane 3 (Ethereum and HTTP clients): edge, corner, positive and negative
 * cases for the Solidity ABI decoder, the raw transaction decoder and the API
 * tester's curl/fetch helpers.
 *
 * References: Keccak-256 values from `openssl dgst -keccak-256` (OpenSSL
 * 3.6), the worked examples in the Solidity ABI specification, EIP-55 test
 * addresses, the RLP examples in the Ethereum Yellow Paper / wiki, the
 * EIP-155 example transaction, EIP-1559/2930/4844/7702 field lists, the curl
 * man page and the Fetch standard's forbidden header list.
 */
import { describe, it, expect } from 'vitest';
import {
  keccak256Bytes,
  keccak256Text,
  hexToBytes,
  bytesToHex,
  toChecksumAddress,
  canonicalType,
  signatureOf,
  selectorOf,
  parseAbiJson,
  summarizeAbi,
  splitTupleTypes,
  decodeAbiParameters,
  decodeCalldata,
  formatDecodedValue,
  COMMON_FUNCTIONS,
  type AbiItem,
} from '@/lib/tools/smart-contract-abi-decoder';
import { rlpDecode, decodeRawTransaction, chainName, formatTransactionReport, isTransactionHash, type RlpItem } from '@/lib/tools/ethereum-transaction-decoder';
import {
  isForbiddenHeader,
  shellQuote,
  buildCurlCommand,
  shellSplit,
  parseCurlCommand,
  buildFetchPlan,
  formatResponseBody,
  headersToObject,
  headerPairsToObject,
} from '@/lib/tools/api-tester';

const words = (...w: string[]) => '0x' + w.join('');
const pad = (h: string) => h.padStart(64, '0');
const padRight = (h: string) => h.padEnd(64, '0');

// ---------------------------------------------------------------------------
// Keccak, selectors and addresses
// ---------------------------------------------------------------------------
describe('Keccak-256, selectors and EIP-55 (references from openssl dgst -keccak-256)', () => {
  it('Keccak-256 of the empty string and of signatures', () => {
    expect(keccak256Text('')).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    expect(keccak256Bytes(new Uint8Array())).toBe(keccak256Text(''));
    expect(keccak256Text('Transfer(address,address,uint256)')).toBe('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
    expect(selectorOf('transfer(address,uint256)')).toBe('0xa9059cbb');
    expect(selectorOf('approve(address,uint256)')).toBe('0x095ea7b3');
  });
  it('edge: inputs that are not a multiple of 4 bytes and longer than one 136-byte Keccak block', () => {
    // EIP-155 example transaction (110 bytes) -> 0x33469b22...0788
    const tx = '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83';
    expect(keccak256Bytes(hexToBytes(tx))).toBe('0x33469b22e9f636356c4160a87eb19df52b7412e8eac32a4a55ffe88ea8350788');
    // "sam(bytes,bool,uint256[])" is 25 bytes
    expect(keccak256Text('sam(bytes,bool,uint256[])')).toBe('0xa5643bf27e2786816613d3eeb0b62650200b5a98766dfcfd4428f296fb56d043');
  });
  it('EIP-55 checksum test vectors (all caps, all lower, mixed)', () => {
    for (const a of ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB', '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb', '0x52908400098527886E0F7030069857D2E4169EE7', '0x8617E340B3D01FA5F11F306F4090FD50E238070D', '0xde709f2102306220921060314715629080e2fb77', '0x27b1fdb04752bbc536007a920d24acb045561c26']) {
      expect(toChecksumAddress(a.toLowerCase())).toBe(a);
      expect(toChecksumAddress(a.toUpperCase().replace('0X', '0x'))).toBe(a);
    }
  });
  it('hexToBytes / bytesToHex: 0x/0X prefix, whitespace, empty; odd length and non-hex are errors', () => {
    expect(Array.from(hexToBytes(' 0XdeAD be ef '))).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(hexToBytes('0x').length).toBe(0);
    expect(bytesToHex(new Uint8Array())).toBe('0x');
    expect(bytesToHex(Uint8Array.of(0, 15, 255))).toBe('0x000fff');
    expect(() => hexToBytes('0xabc')).toThrow('Hex data must have an even number of characters');
    expect(() => hexToBytes('zz')).toThrow('Hex data contains non-hex characters');
  });
});

describe('ABI signatures and summaries', () => {
  it('canonicalType expands tuples and the uint/int aliases (Solidity ABI spec)', () => {
    const swap: AbiItem = { name: 'swap', inputs: [{ type: 'tuple[]', components: [{ type: 'address' }, { type: 'uint' }] }, { type: 'int' }] };
    expect(signatureOf(swap)).toBe('swap((address,uint256)[],int256)');
    expect(selectorOf(signatureOf(swap))).toBe('0x8b1fe8f0');
    expect(canonicalType({ type: ' uint[2][] ' })).toBe('uint256[2][]');
    expect(canonicalType({ type: 'uint8' })).toBe('uint8');
    expect(canonicalType({ type: 'tuple' })).toBe('()');
    expect(signatureOf({})).toBe('()');
  });
  it('splitTupleTypes splits only at top-level commas', () => {
    expect(splitTupleTypes('uint256,(address,(bool,bytes))[],bytes')).toEqual(['uint256', '(address,(bool,bytes))[]', 'bytes']);
    expect(splitTupleTypes('')).toEqual([]);
    expect(splitTupleTypes(' a , b ')).toEqual(['a', 'b']);
  });
  it('parseAbiJson accepts an array or an artifact with "abi"; anything else is an error', () => {
    expect(parseAbiJson('[]')).toEqual([]);
    expect(parseAbiJson('{"contractName":"X","abi":[{"type":"receive"}]}')).toEqual([{ type: 'receive' }]);
    expect(() => parseAbiJson('{"abi":{}}')).toThrow('Expected a JSON array of ABI entries');
    expect(() => parseAbiJson('null')).toThrow('Expected a JSON array of ABI entries');
    expect(() => parseAbiJson('[')).toThrow();
  });
  it('summarizeAbi: functions (typed or untyped), events with full topics, errors, constructor, fallback, receive', () => {
    const abi: AbiItem[] = [
      { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], stateMutability: 'nonpayable' },
      { name: 'transferFrom', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }] },
      { type: 'event', name: 'Transfer', inputs: [{ type: 'address', indexed: true }, { type: 'address', indexed: true }, { type: 'uint256' }] },
      { type: 'error', name: 'InsufficientBalance', inputs: [{ type: 'uint256' }, { type: 'uint256' }] },
      { type: 'constructor', inputs: [] },
      { type: 'fallback' },
      { type: 'receive' },
      { type: 'function' }, // nameless: still listed, signature "()"
    ];
    const s = summarizeAbi(abi);
    expect(s.functions.map((f) => [f.signature, f.id])).toEqual([
      ['transfer(address,uint256)', '0xa9059cbb'],
      ['transferFrom(address,address,uint256)', '0x23b872dd'],
      ['()', keccak256Text('()').slice(0, 10)],
    ]);
    expect(s.events[0].id).toBe('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
    expect(s.errors[0].id).toBe('0xcf479181');
    expect(s.constructors).toHaveLength(1);
    expect(s.hasFallback).toBe(true);
    expect(s.hasReceive).toBe(true);
    expect(summarizeAbi([])).toEqual({ functions: [], events: [], errors: [], constructors: [], hasFallback: false, hasReceive: false });
  });
});

describe('ABI decoding: the Solidity ABI specification examples', () => {
  it('baz(uint32,bool) with 69 and true', () => {
    const abi: AbiItem[] = [{ type: 'function', name: 'baz', inputs: [{ name: 'x', type: 'uint32' }, { name: 'y', type: 'bool' }] }];
    const call = decodeCalldata(abi, '0xcdcd77c0' + pad('45') + pad('1'));
    expect(call).toEqual({ name: 'baz', signature: 'baz(uint32,bool)', selector: '0xcdcd77c0', args: [{ name: 'x', type: 'uint32', value: '69' }, { name: 'y', type: 'bool', value: true }] });
  });
  it('bar(bytes3[2]) with ["abc", "def"]', () => {
    const v = decodeAbiParameters([{ type: 'bytes3[2]' }], words(padRight('616263'), padRight('646566')));
    expect(v).toEqual([['0x616263', '0x646566']]);
  });
  it('sam(bytes,bool,uint256[]) with "dave", true, [1,2,3]', () => {
    const data = words(pad('60'), pad('1'), pad('a0'), pad('4'), padRight('64617665'), pad('3'), pad('1'), pad('2'), pad('3'));
    expect(decodeAbiParameters([{ type: 'bytes' }, { type: 'bool' }, { type: 'uint256[]' }], data)).toEqual(['0x64617665', true, ['1', '2', '3']]);
    expect(decodeAbiParameters([{ type: 'string' }, { type: 'bool' }, { type: 'uint[]' }], data)).toEqual(['dave', true, ['1', '2', '3']]);
  });
  it('f(uint256,uint32[],bytes10,bytes) with 0x123, [0x456, 0x789], "1234567890", "Hello, world!"', () => {
    const data = words(pad('123'), pad('80'), padRight('31323334353637383930'), pad('e0'), pad('2'), pad('456'), pad('789'), pad('d'), padRight('48656c6c6f2c20776f726c6421'));
    expect(decodeAbiParameters([{ type: 'uint256' }, { type: 'uint32[]' }, { type: 'bytes10' }, { type: 'bytes' }], data)).toEqual([
      '291',
      ['1110', '1929'],
      '0x31323334353637383930',
      '0x48656c6c6f2c20776f726c6421',
    ]);
  });
  it('g(uint256[][],string[]) with [[1,2],[3]] and ["one","two","three"]', () => {
    const data = words(
      pad('40'), pad('140'),
      pad('2'), pad('40'), pad('a0'), pad('2'), pad('1'), pad('2'), pad('1'), pad('3'),
      pad('3'), pad('60'), pad('a0'), pad('e0'), pad('3'), padRight('6f6e65'), pad('3'), padRight('74776f'), pad('5'), padRight('7468726565'),
    );
    const v = decodeAbiParameters([{ type: 'uint256[][]' }, { type: 'string[]' }], data);
    expect(v).toEqual([[['1', '2'], ['3']], ['one', 'two', 'three']]);
    expect(formatDecodedValue(v as never)).toBe('[[[1, 2], [3]], [one, two, three]]');
  });
  it('tuples: static tuple inline, dynamic tuple by offset, and the "(a,b)" type-string form', () => {
    const addr = '00000000000000000000000052908400098527886e0f7030069857d2e4169ee7';
    expect(decodeAbiParameters([{ type: 'tuple', components: [{ type: 'address' }, { type: 'bool' }] }, { type: 'uint8' }], words(addr, pad('1'), pad('7')))).toEqual([
      ['0x52908400098527886E0F7030069857D2E4169EE7', true],
      '7',
    ]);
    // (string,uint256) is dynamic: head holds offset 0x20; tail is (offset 0x40, 5, len 2, "hi")
    expect(decodeAbiParameters([{ type: '(string,uint256)' }], words(pad('20'), pad('40'), pad('5'), pad('2'), padRight('6869')))).toEqual([['hi', '5']]);
  });
  it('edge: signed integers, bytes32, function type, zero-length arrays and strings', () => {
    const ff = 'f'.repeat(64);
    expect(decodeAbiParameters([{ type: 'int8' }, { type: 'int256' }, { type: 'int' }], words(ff, '8' + '0'.repeat(63), pad('7f')))).toEqual(['-1', (-(2n ** 255n)).toString(), '127']);
    expect(decodeAbiParameters([{ type: 'uint256' }], words(ff))).toEqual([(2n ** 256n - 1n).toString()]);
    expect(decodeAbiParameters([{ type: 'bytes32' }, { type: 'function' }], words('ab'.repeat(32), 'cd'.repeat(24) + '0'.repeat(16)))).toEqual(['0x' + 'ab'.repeat(32), '0x' + 'cd'.repeat(24)]);
    expect(decodeAbiParameters([{ type: 'uint256[]' }, { type: 'string' }], words(pad('40'), pad('60'), pad('0'), pad('0')))).toEqual([[], '']);
    expect(decodeAbiParameters([{ type: 'uint256[0]' }, { type: 'bool' }], words(pad('0')))).toEqual([[], false]);
    expect(decodeAbiParameters([], '0x')).toEqual([]);
  });
  it('negative: short data, offsets and lengths outside the data, unsupported types', () => {
    expect(() => decodeAbiParameters([{ type: 'uint256' }], '0x' + '00'.repeat(31))).toThrow('Data too short: needed 32 bytes at offset 0, have 31');
    expect(() => decodeAbiParameters([{ type: 'bytes' }], words(pad('1000')))).toThrow('Offset 4096 points outside the data');
    expect(() => decodeAbiParameters([{ type: 'bytes' }], words(pad('20'), pad('40'), pad('0')))).toThrow('Data too short for bytes of length 64');
    expect(() => decodeAbiParameters([{ type: 'uint256[]' }], words(pad('20'), 'f'.repeat(64)))).toThrow(/Array length .* points outside the data/);
    for (const t of ['uint7', 'uint264', 'bytes0', 'bytes33', 'fixed128x18', 'address payable', 'string[x]']) {
      expect(() => decodeAbiParameters([{ type: t }], words(pad('0'))), t).toThrow(`Unsupported ABI type: ${t}`);
    }
  });
  it('negative: a huge fixed-size array is rejected up front instead of allocating it (no hang)', () => {
    const started = Date.now();
    expect(() => decodeAbiParameters([{ type: 'uint256[4294967295]' }], words(pad('1')))).toThrow(/too short/i);
    expect(() => decodeAbiParameters([{ type: 'bytes[100000000]' }], words(pad('1')))).toThrow(/too short/i);
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it('decodeCalldata: short calldata, unknown selector, unnamed arguments, the built-in ERC-20 list', () => {
    expect(() => decodeCalldata(COMMON_FUNCTIONS, '0xa9059c')).toThrow('Calldata must be at least 4 bytes');
    expect(() => decodeCalldata(COMMON_FUNCTIONS, '0xdeadbeef')).toThrow('No function in this ABI has selector 0xdeadbeef');
    const unnamed = decodeCalldata([{ type: 'function', name: 'f', inputs: [{ type: 'bool' }] }], selectorOf('f(bool)') + pad('0'));
    expect(unnamed.args).toEqual([{ name: 'arg0', type: 'bool', value: false }]);
    const t = decodeCalldata(COMMON_FUNCTIONS, '0xa9059cbb' + pad('52908400098527886e0f7030069857d2e4169ee7') + pad('de0b6b3a7640000'));
    expect(t.args.map((a) => formatDecodedValue(a.value))).toEqual(['0x52908400098527886E0F7030069857D2E4169EE7', '1000000000000000000']);
    expect(decodeCalldata(COMMON_FUNCTIONS, selectorOf('deposit()')).args).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RLP and raw transactions
// ---------------------------------------------------------------------------
/** Minimal RLP encoder (Yellow Paper appendix B) used to build test transactions. */
function rlp(x: RlpItem): Uint8Array {
  const len = (n: number, off: number) => {
    if (n < 56) return [off + n];
    const b: number[] = [];
    for (let v = n; v > 0; v = Math.floor(v / 256)) b.unshift(v & 0xff);
    return [off + 55 + b.length, ...b];
  };
  if (x instanceof Uint8Array) return x.length === 1 && x[0] < 0x80 ? x : Uint8Array.from([...len(x.length, 0x80), ...x]);
  const body = x.flatMap((i) => Array.from(rlp(i)));
  return Uint8Array.from([...len(body.length, 0xc0), ...body]);
}
const int = (n: bigint) => (n === 0n ? new Uint8Array() : hexToBytes(n.toString(16).padStart(Math.ceil(n.toString(16).length / 2) * 2, '0')));
const b = (h: string) => hexToBytes(h);
const typed = (type: number, fields: RlpItem[]) => bytesToHex(Uint8Array.from([type, ...rlp(fields)]));
const TO = b('52908400098527886e0f7030069857d2e4169ee7');
const R = b('11'.repeat(32));
const S = b('22'.repeat(32));

describe('rlpDecode (Ethereum Yellow Paper appendix B examples)', () => {
  const dec = (h: string) => rlpDecode(hexToBytes(h));
  it('positive: "dog", ["cat","dog"], empty string, empty list, 0x0f, 1024 and the set-theoretic nesting', () => {
    expect(dec('83646f67')).toEqual(new TextEncoder().encode('dog'));
    expect(dec('c88363617483646f67')).toEqual([new TextEncoder().encode('cat'), new TextEncoder().encode('dog')]);
    expect(dec('80')).toEqual(new Uint8Array());
    expect(dec('c0')).toEqual([]);
    expect(dec('0f')).toEqual(Uint8Array.of(0x0f));
    expect(dec('820400')).toEqual(Uint8Array.of(4, 0));
    expect(dec('c7c0c1c0c3c0c1c0')).toEqual([[], [[]], [[], [[]]]]);
  });
  it('edge: a 56-byte string switches to the long form (0xb8 0x38)', () => {
    const lorem = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit';
    expect(lorem.length).toBe(56);
    expect(dec('b838' + Buffer.from(lorem).toString('hex'))).toEqual(new TextEncoder().encode(lorem));
    expect(dec(bytesToHex(rlp(Array(30).fill(new Uint8Array([0x81]).subarray(0, 1)) as RlpItem[])).slice(2))).toHaveLength(30);
  });
  it('negative: trailing bytes, overruns, leading zeros in lengths and non-canonical single bytes', () => {
    expect(() => dec('8000')).toThrow('RLP has 1 trailing bytes');
    expect(() => dec('83646f')).toThrow('RLP string runs past the end of the data');
    expect(() => dec('b90000')).toThrow('RLP length has a leading zero');
    expect(() => dec('b9')).toThrow('RLP length prefix runs past the end of the data');
    expect(() => dec('b80141')).not.toThrow();
    expect(() => dec('8105')).toThrow('Non-canonical RLP: single byte below 0x80 should not be prefixed');
    expect(() => dec('c3646f')).toThrow('RLP list runs past the end of the data');
    expect(() => dec('c28300')).toThrow('RLP string runs past the end of the data');
    expect(() => dec('')).toThrow('RLP data ended unexpectedly');
    expect(() => dec('f90000')).toThrow('RLP length has a leading zero');
  });
});

describe('decodeRawTransaction', () => {
  it('EIP-155 example: every field, chain id from v = 37, hash from openssl keccak', () => {
    const raw = '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83';
    const tx = decodeRawTransaction(raw);
    expect(tx).toEqual({
      type: 0,
      typeName: 'Legacy',
      hash: '0x33469b22e9f636356c4160a87eb19df52b7412e8eac32a4a55ffe88ea8350788',
      chainId: 1n,
      nonce: 9n,
      gasPrice: 20_000_000_000n,
      gasLimit: 21000n,
      to: '0x3535353535353535353535353535353535353535',
      value: 10n ** 18n,
      data: '0x',
      accessList: [],
      v: 37n,
      r: '0x28ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276',
      s: '0x67cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83',
    });
    const report = formatTransactionReport(tx).split('\n');
    expect(report.slice(0, 11)).toEqual([
      'Transaction type: 0 (Legacy)',
      'Transaction hash: 0x33469b22e9f636356c4160a87eb19df52b7412e8eac32a4a55ffe88ea8350788',
      'Chain ID: 1 (Ethereum mainnet)',
      'Nonce: 9',
      'To: 0x3535353535353535353535353535353535353535',
      'Value: 1 ETH (1000000000000000000 wei)',
      'Gas limit: 21000',
      'Gas price: 20 gwei',
      // 21000 x 20 gwei = 420000 gwei = 0.00042 ETH
      'Max gas cost (gas limit x gas price): 0.00042 ETH',
      'Input data: none (plain value transfer)',
      'Signature:',
    ]);
    expect(report).toContain('  v: 37');
  });
  it('edge: pre-EIP-155 v = 27/28 has no chain id; an empty "to" is a contract creation', () => {
    const legacy = (v: bigint, to: Uint8Array) => bytesToHex(rlp([int(0n), int(1n), int(21000n), to, int(0n), b('6080'), int(v), R, S]));
    const tx = decodeRawTransaction(legacy(27n, new Uint8Array()));
    expect(tx.chainId).toBeNull();
    expect(tx.to).toBeNull();
    expect(chainName(tx.chainId)).toBe('not set (pre-EIP-155, replayable on any chain)');
    const report = formatTransactionReport(tx);
    expect(report).toContain('To: (empty: contract creation)');
    expect(report).toContain('Input data: 2 bytes');
    // v = 36 -> chainId (36 - 35) / 2 = 0; v = 22310258 -> chainId 11155111 (Sepolia)
    expect(decodeRawTransaction(legacy(22310258n, TO)).chainId).toBe(11155111n);
  });
  it('EIP-2930 (type 1) with an access list', () => {
    const raw = typed(1, [int(5n), int(7n), int(10n ** 9n), int(30000n), TO, int(1n), new Uint8Array(), [[TO, [b('00'.repeat(31) + '01')]]], int(1n), R, S]);
    const tx = decodeRawTransaction(raw);
    expect(tx).toMatchObject({ type: 1, typeName: 'EIP-2930 (access list)', chainId: 5n, nonce: 7n, gasPrice: 10n ** 9n, gasLimit: 30000n, value: 1n, yParity: 1n });
    expect(tx.accessList).toEqual([{ address: '0x52908400098527886E0F7030069857D2E4169EE7', storageKeys: ['0x' + '00'.repeat(31) + '01'] }]);
    expect(tx.hash).toBe(keccak256Bytes(hexToBytes(raw)));
    const report = formatTransactionReport(tx);
    expect(report).toContain('Access list: \n  0x52908400098527886E0F7030069857D2E4169EE7: 1 storage key(s)');
    expect(report).toContain('  yParity: 1');
  });
  it('EIP-1559 (type 2) carrying an ERC-20 transfer that the report decodes', () => {
    const data = b('a9059cbb' + pad('52908400098527886e0f7030069857d2e4169ee7') + pad('3e8'));
    const tx = decodeRawTransaction(typed(2, [int(1n), int(0n), int(2n * 10n ** 9n), int(100n * 10n ** 9n), int(60000n), TO, int(0n), data, [], new Uint8Array(), R, S]));
    expect(tx).toMatchObject({ type: 2, chainId: 1n, maxPriorityFeePerGas: 2_000_000_000n, maxFeePerGas: 100_000_000_000n, gasLimit: 60000n, yParity: 0n, accessList: [] });
    const report = formatTransactionReport(tx);
    expect(report).toContain('Max priority fee per gas: 2 gwei');
    // 60000 x 100 gwei = 0.006 ETH
    expect(report).toContain('Max gas cost (gas limit x max fee): 0.006 ETH');
    expect(report).toContain('Access list: empty');
    expect(report).toContain('Matches common function: transfer(address,uint256)');
    expect(report).toContain('  amount (uint256): 1000');
  });
  it('EIP-4844 (type 3) in both the canonical and the network wrapper form; EIP-7702 (type 4)', () => {
    const fields: RlpItem[] = [int(1n), int(0n), int(1n), int(2n), int(21000n), TO, int(0n), new Uint8Array(), [], int(3n), [b('01' + '00'.repeat(31))], int(1n), R, S];
    const blob = decodeRawTransaction(typed(3, fields));
    expect(blob).toMatchObject({ type: 3, typeName: 'EIP-4844 (blob)', maxFeePerBlobGas: 3n, blobVersionedHashes: ['0x01' + '00'.repeat(31)] });
    const wrapped = decodeRawTransaction(typed(3, [fields, [], [], []]));
    expect(wrapped.blobVersionedHashes).toEqual(blob.blobVersionedHashes);
    expect(formatTransactionReport(blob)).toContain('Max fee per blob gas: 0.000000003 gwei');
    const auth: RlpItem = [int(1n), TO, int(0n), int(0n), R, S];
    const setCode = decodeRawTransaction(typed(4, [int(1n), int(0n), int(1n), int(2n), int(50000n), TO, int(0n), new Uint8Array(), [], [auth, auth], int(1n), R, S]));
    expect(setCode).toMatchObject({ type: 4, typeName: 'EIP-7702 (set code)', authorizationCount: 2 });
    expect(formatTransactionReport(setCode)).toContain('Authorizations: 2');
  });
  it('report for unknown calldata points to the ABI decoder', () => {
    const tx = decodeRawTransaction(typed(2, [int(1n), int(0n), int(1n), int(1n), int(1n), TO, int(0n), b('deadbeef00'), [], int(0n), R, S]));
    const report = formatTransactionReport(tx);
    expect(report).toContain('Function selector: 0xdeadbeef');
    expect(report).toContain('Selector is not one of the built-in ERC-20/721 functions.');
    expect(report).toContain('Raw input: 0xdeadbeef00');
  });
  it('negative: empty, unknown and unsupported types, wrong field counts and field shapes', () => {
    expect(() => decodeRawTransaction('0x')).toThrow('Transaction data is empty');
    expect(() => decodeRawTransaction('0x80')).toThrow('Unknown transaction type byte 0x80');
    expect(() => decodeRawTransaction('0x05c0')).toThrow('Unsupported transaction type 0x05');
    expect(() => decodeRawTransaction('0x00c0')).toThrow('Unsupported transaction type 0x00');
    expect(() => decodeRawTransaction(bytesToHex(rlp([int(0n)])))).toThrow('Legacy transaction should have 9 fields, found 1');
    expect(() => decodeRawTransaction(typed(2, [int(1n)]))).toThrow('Type 2 transaction should have 12 fields, found 1');
    expect(() => decodeRawTransaction('0x0280')).toThrow('Field transaction should be a list');
    expect(() => decodeRawTransaction(bytesToHex(rlp([int(0n), int(1n), int(21000n), b('1234'), int(0n), new Uint8Array(), int(27n), R, S])))).toThrow('Field to should be 20 bytes, got 2');
    expect(() => decodeRawTransaction(bytesToHex(rlp([[], int(1n), int(21000n), TO, int(0n), new Uint8Array(), int(27n), R, S])))).toThrow('Field nonce should be a byte string');
    expect(() => decodeRawTransaction(typed(1, [int(1n), int(0n), int(1n), int(1n), TO, int(0n), new Uint8Array(), [int(1n)], int(0n), R, S]))).toThrow('Field accessList[0] should be a list');
    expect(() => decodeRawTransaction('0xzz')).toThrow('Hex data contains non-hex characters');
  });
  it('chainName and isTransactionHash', () => {
    expect(chainName(42161n)).toBe('42161 (Arbitrum One)');
    expect(chainName(999999n)).toBe('999999 (unknown chain)');
    expect(isTransactionHash(' 0x' + 'a'.repeat(64) + ' ')).toBe(true);
    expect(isTransactionHash('0x' + 'a'.repeat(63))).toBe(false);
    expect(isTransactionHash('a'.repeat(64))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// API tester
// ---------------------------------------------------------------------------
describe('api-tester: curl parsing and building', () => {
  it('isForbiddenHeader follows the Fetch forbidden request-header list, including Proxy- and Sec- prefixes', () => {
    for (const h of ['Host', ' cookie ', 'Content-Length', 'Proxy-Authorization', 'Sec-Fetch-Mode', 'Keep-Alive', 'TE']) expect(isForbiddenHeader(h), h).toBe(true);
    for (const h of ['Authorization', 'Content-Type', 'X-Proxy', 'Accept']) expect(isForbiddenHeader(h), h).toBe(false);
  });
  it('shellQuote always single-quotes and escapes embedded quotes', () => {
    expect(shellQuote('')).toBe("''");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
  it('buildCurlCommand: HEAD uses -I, GET has no -X, body only when allowed', () => {
    expect(buildCurlCommand({ method: 'head', url: ' https://a.test ', headers: {}, body: 'x' })).toBe("curl \\\n  -I \\\n  'https://a.test'");
    expect(buildCurlCommand({ method: 'GET', url: 'https://a.test', headers: { A: "b'c" }, body: 'ignored' })).toBe("curl \\\n  -H 'A: b'\\''c' \\\n  'https://a.test'");
    expect(buildCurlCommand({ method: 'patch', url: 'u', headers: {}, body: '{"a":1}' })).toBe(`curl \\\n  -X PATCH \\\n  --data-raw '{"a":1}' \\\n  'u'`);
    expect(buildCurlCommand({ method: 'POST', url: 'u', headers: {}, body: '   ' })).toBe("curl \\\n  -X POST \\\n  'u'");
  });
  it('shellSplit: ANSI-C $\'...\' quoting, double-quote escapes, backslashes and continuations', () => {
    expect(shellSplit(`curl $'a\\nb\\'c\\x' "d\\"e\\q" f\\ g \\\n h`)).toEqual(['curl', "a\nb'cx", 'd"e\\q', 'f g', 'h']);
    expect(shellSplit('  ')).toEqual([]);
    expect(shellSplit(`a''b`)).toEqual(['ab']);
    expect(() => shellSplit(`'x`)).toThrow('Unclosed single quote');
    expect(() => shellSplit(`"x`)).toThrow('Unclosed double quote');
    expect(() => shellSplit(`$'x`)).toThrow("Unclosed $'...' quote");
  });
  it('parseCurlCommand: a Chrome "Copy as cURL (bash)" command', () => {
    const p = parseCurlCommand(`curl 'https://api.test/v1?x=1' \\\n  -H 'accept: application/json' \\\n  -H $'x-note: it\\'s' \\\n  -b 'sid=1' \\\n  --data-raw $'{"a":"b\\nc"}' \\\n  --compressed`);
    expect(p).toEqual({
      method: 'POST',
      url: 'https://api.test/v1?x=1',
      headers: [{ key: 'accept', value: 'application/json' }, { key: 'x-note', value: "it's" }, { key: 'Cookie', value: 'sid=1' }],
      body: '{"a":"b\nc"}',
    });
  });
  it('parseCurlCommand: -G moves data to the query; -I is HEAD; --url, -A, -e and ignored-value flags', () => {
    expect(parseCurlCommand('curl -G -d a=1 -d b=2 https://x.test/s?q=0')).toMatchObject({ method: 'GET', url: 'https://x.test/s?q=0&a=1&b=2', body: '' });
    expect(parseCurlCommand('curl -I https://x.test').method).toBe('HEAD');
    const p = parseCurlCommand('curl -sSL -o out.json --max-time=5 -m 10 -w "%{http_code}" -A agent/1 -e https://ref.test --url=https://x.test/y');
    expect(p).toEqual({ method: 'GET', url: 'https://x.test/y', headers: [{ key: 'User-Agent', value: 'agent/1' }, { key: 'Referer', value: 'https://ref.test' }], body: '' });
    // -u builds Basic auth: base64("ada:é") = YWRhOsOp
    expect(parseCurlCommand('curl -u ada:é https://x.test').headers).toEqual([{ key: 'Authorization', value: 'Basic YWRhOsOp' }]);
    expect(parseCurlCommand('curl --json {} -H "Accept: text/plain" https://x.test').headers).toEqual([{ key: 'Content-Type', value: 'application/json' }, { key: 'Accept', value: 'application/json' }, { key: 'Accept', value: 'text/plain' }]);
  });
  it('corner: short options with the value attached (-XPUT, -HName:v, -dbody), as curl accepts', () => {
    expect(parseCurlCommand('curl -XPUT https://x.test')).toMatchObject({ method: 'PUT', url: 'https://x.test' });
    expect(parseCurlCommand('curl -XDELETE -HX-Token:abc https://x.test')).toMatchObject({ method: 'DELETE', headers: [{ key: 'X-Token', value: 'abc' }] });
    expect(parseCurlCommand('curl -da=1 https://x.test')).toMatchObject({ method: 'POST', body: 'a=1' });
    expect(parseCurlCommand('curl -oout.txt https://x.test').url).toBe('https://x.test');
  });
  it('corner: --data-urlencode encodes the content part the way curl does', () => {
    // curl man page: "name=content" -> name=URL-encoded content; "=content" and "content" -> encoded content.
    expect(parseCurlCommand(`curl --data-urlencode 'name=John Doe & co' https://x.test`).body).toBe('name=John%20Doe%20%26%20co');
    expect(parseCurlCommand(`curl --data-urlencode '=a b' https://x.test`).body).toBe('a%20b');
    expect(parseCurlCommand(`curl --data-urlencode "hello world!" https://x.test`).body).toBe('hello%20world%21');
    expect(parseCurlCommand(`curl -G --data-urlencode 'q=café' https://x.test/s`).url).toBe('https://x.test/s?q=caf%C3%A9');
  });
  it('negative: not curl, missing URL, missing option value', () => {
    expect(() => parseCurlCommand('wget https://x.test')).toThrow('The command must start with "curl".');
    expect(() => parseCurlCommand('')).toThrow('The command must start with "curl".');
    expect(() => parseCurlCommand('curl -H "A: b"')).toThrow('No URL found in the curl command.');
    expect(() => parseCurlCommand('curl https://x.test -H')).toThrow('Option -H needs a value.');
    expect(() => parseCurlCommand('curl https://x.test -o')).toThrow('Option -o needs a value.');
    // A header without a colon is dropped rather than half-parsed.
    expect(parseCurlCommand('curl -H nocolon https://x.test').headers).toEqual([]);
  });
});

describe('api-tester: fetch plan and response helpers', () => {
  it('buildFetchPlan drops bodies on GET/HEAD, forbidden headers and a body-less Content-Type', () => {
    expect(buildFetchPlan({ method: 'get', url: 'u', headers: { 'Content-Type': 'application/json', Host: 'x', ' ': 'y', Accept: '*/*' }, body: '{}' })).toEqual({
      init: { method: 'GET', headers: { Accept: '*/*' } },
      ignoredHeaders: ['Host'],
      bodyDropped: true,
    });
    expect(buildFetchPlan({ method: 'POST', url: 'u', headers: { ' Content-Type ': 'text/plain' }, body: 'hi' })).toEqual({
      init: { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hi' },
      ignoredHeaders: [],
      bodyDropped: false,
    });
    expect(buildFetchPlan({ method: 'DELETE', url: 'u', headers: {}, body: '  ' }).init.body).toBeUndefined();
  });
  it('formatResponseBody pretty-prints JSON by content type or shape and leaves everything else alone', () => {
    expect(formatResponseBody('{"a":[1,2]}', null)).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(formatResponseBody('"x"', 'application/problem+json')).toBe('"x"');
    expect(formatResponseBody('{oops', 'application/json')).toBe('{oops');
    expect(formatResponseBody('<p>{x}</p>', 'text/html')).toBe('<p>{x}</p>');
    expect(formatResponseBody('', 'application/json')).toBe('');
  });
  it('headersToObject lowercases names and combines repeats; headerPairsToObject trims and skips blanks', () => {
    const h = new Headers();
    h.append('X-A', '1');
    h.append('x-a', '2');
    h.append('Content-Type', 'text/plain');
    expect(headersToObject(h)).toEqual({ 'content-type': 'text/plain', 'x-a': '1, 2' });
    expect(headerPairsToObject([{ key: ' A ', value: ' 1 ' }, { key: '', value: 'x' }, { key: 'B', value: '  ' }, { key: 'A', value: '2' }])).toEqual({ A: '2' });
  });
});
