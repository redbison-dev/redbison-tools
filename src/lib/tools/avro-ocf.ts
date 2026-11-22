/**
 * Reads the header and block layout of an Avro Object Container File
 * (the .avro files data pipelines write), following the Avro 1.11.1
 * specification's file format section: the 4-byte magic "Obj\x01", a file
 * metadata map (avro.schema, avro.codec), a 16-byte sync marker, then data
 * blocks of [row count varint][byte size varint][data][sync marker].
 *
 * Rows are counted from the block headers without decoding any data, so
 * this works whatever the codec. Dependency-free on purpose: the CLI and
 * the editor plugins bundle it.
 */

export type AvroContainer = {
  schema: unknown;
  codec: string;
  meta: Record<string, string>;
  blocks: number;
  rows: number;
};

const MAGIC = [0x4f, 0x62, 0x6a, 0x01]; // "Obj\x01"

/** True when the buffer starts with the OCF magic. */
export const isAvroContainer = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && MAGIC.every((m, i) => bytes[i] === m);

class Reader {
  pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  private byte(): number {
    if (this.pos >= this.buf.length) throw new Error('Truncated Avro file');
    return this.buf[this.pos++];
  }

  /** Avro long: zig-zag varint. */
  long(): number {
    let n = 0n;
    let shift = 0n;
    for (;;) {
      const b = this.byte();
      n |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7n;
      if (shift > 70n) throw new Error('Malformed varint in Avro file');
    }
    return Number((n >> 1n) ^ -(n & 1n));
  }

  bytes(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.buf.length) throw new Error('Truncated Avro file');
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  skip(n: number): void {
    if (n < 0 || this.pos + n > this.buf.length) throw new Error('Truncated Avro file');
    this.pos += n;
  }
}

export function readAvroContainer(bytes: Uint8Array): AvroContainer {
  if (!isAvroContainer(bytes)) throw new Error('Not an Avro object container file: the Obj\\x01 magic is missing.');
  const r = new Reader(bytes);
  r.skip(4);

  // The file metadata map: blocks of [count][key bytes][value bytes], ended
  // by a zero count. A negative count is followed by a byte size.
  const decoder = new TextDecoder();
  const meta: Record<string, string> = {};
  for (;;) {
    let count = r.long();
    if (count === 0) break;
    if (count < 0) {
      r.long(); // byte size of the block, not needed when reading it all
      count = -count;
    }
    for (let i = 0; i < count; i++) {
      const key = decoder.decode(r.bytes(r.long()));
      const value = r.bytes(r.long());
      meta[key] = decoder.decode(value);
    }
  }
  const sync = r.bytes(16).slice();

  const codec = meta['avro.codec'] || 'null';
  let schema: unknown;
  try {
    schema = JSON.parse(meta['avro.schema'] ?? '');
  } catch {
    throw new Error('The avro.schema metadata entry is not valid JSON.');
  }

  let blocks = 0;
  let rows = 0;
  while (!r.done) {
    const count = r.long();
    const size = r.long();
    r.skip(size);
    const marker = r.bytes(16);
    if (!marker.every((b, i) => b === sync[i])) throw new Error(`Sync marker mismatch after block ${blocks + 1}: the file is corrupt or truncated.`);
    blocks += 1;
    rows += count;
  }

  return { schema, codec, meta, blocks, rows };
}
