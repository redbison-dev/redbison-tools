/**
 * The file-based viewers: tools whose natural input is bytes, not text.
 *
 * Parquet and Avro container files are binary, so they bypass the utf-8 text
 * pipeline every other tool uses: index.ts hands the raw buffer here. Both
 * readers are the site's own dependency-free implementations, imported so
 * the terminal gives the answer redbison.dev gives.
 */
import { isParquet, readParquetMetadata, renderParquetSummary } from '../../src/lib/tools/parquet-meta';
import { isAvroContainer, readAvroContainer } from '../../src/lib/tools/avro-ocf';
import { checkAvroSchema, describeType } from '../../src/lib/tools/avro-tools';
import { HprofParser, renderHprofSummary } from '../../src/lib/tools/hprof-summary';
import { parseV8HeapSnapshot, renderV8HeapSummary } from '../../src/lib/tools/v8-heap-snapshot';
import { gunzip, parsePprof, renderPprofSummary } from '../../src/lib/tools/pprof-inspect';
import { inspectSqlite, renderSqliteSummary } from '../../src/lib/tools/sqlite-inspect';
import { inspectZip, renderZipSummary } from '../../src/lib/tools/zip-inspect';
import { inspectWasm, renderWasmSummary } from '../../src/lib/tools/wasm-inspect';
import { inspectBinary, renderBinarySummary } from '../../src/lib/tools/binary-headers';
import { inspectFont, renderFontSummary } from '../../src/lib/tools/font-inspect';
import { inspectPcap, renderPcapSummary } from '../../src/lib/tools/pcap-inspect';
import { inspectArrow, renderArrowSummary } from '../../src/lib/tools/arrow-inspect';

/** The tools index.ts reads as bytes instead of text. */
export const BINARY_TOOLS = new Set(['parquet-inspect', 'avro-check', 'hprof-inspect', 'heap-snapshot-inspect', 'sqlite-inspect', 'zip-inspect', 'wasm-inspect', 'pprof-inspect', 'binary-inspect', 'font-inspect', 'pcap-inspect', 'arrow-inspect']);

export class BinaryToolError extends Error {}

export function runBinary(toolId: string, bytes: Uint8Array): string {
  if (toolId === 'parquet-inspect') {
    if (!isParquet(bytes)) {
      throw new BinaryToolError(
        'Not a Parquet file: the PAR1 magic is missing. Pass the file itself:\n  redbison parquet-inspect --file data.parquet',
      );
    }
    return renderParquetSummary(readParquetMetadata(bytes));
  }

  if (toolId === 'avro-check') {
    if (isAvroContainer(bytes)) {
      const c = readAvroContainer(bytes);
      const lines = [
        `Avro object container  ·  ${c.rows.toLocaleString('en-US')} rows  ·  ${c.blocks} block${c.blocks === 1 ? '' : 's'}  ·  codec ${c.codec}`,
        `schema: ${describeType(c.schema)}`,
        '',
        JSON.stringify(c.schema, null, 2),
      ];
      return lines.join('\n');
    }
    // Not a container: treat the input as a schema, the editors' behaviour.
    let schema: unknown;
    try {
      schema = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new BinaryToolError(
        'Neither an Avro object container (Obj\\x01 magic) nor JSON. Pass a .avro file with --file, or a schema as JSON.',
      );
    }
    const { errors } = checkAvroSchema(schema);
    if (errors.length) throw new BinaryToolError(`Not a valid Avro schema:\n${errors.map((e) => `  ${e}`).join('\n')}`);
    return `Valid Avro schema: ${describeType(schema)}`;
  }

  if (toolId === 'hprof-inspect') {
    let data = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) data = gunzip(bytes);
    const p = new HprofParser();
    // Feed in slices so a multi-GB dump never doubles in memory.
    const STEP = 8 * 1024 * 1024;
    for (let i = 0; i < data.length; i += STEP) p.push(data.subarray(i, Math.min(i + STEP, data.length)));
    return renderHprofSummary(p.finish());
  }

  if (toolId === 'heap-snapshot-inspect') {
    return renderV8HeapSummary(parseV8HeapSnapshot(new TextDecoder().decode(bytes)));
  }

  if (toolId === 'sqlite-inspect') return renderSqliteSummary(inspectSqlite(bytes));
  if (toolId === 'zip-inspect') return renderZipSummary(inspectZip(bytes));
  if (toolId === 'wasm-inspect') return renderWasmSummary(inspectWasm(bytes));
  if (toolId === 'pprof-inspect') return renderPprofSummary(parsePprof(bytes));
  if (toolId === 'binary-inspect') return renderBinarySummary(inspectBinary(bytes));
  if (toolId === 'font-inspect') return renderFontSummary(inspectFont(bytes));
  if (toolId === 'pcap-inspect') return renderPcapSummary(inspectPcap(bytes));
  if (toolId === 'arrow-inspect') return renderArrowSummary(inspectArrow(bytes));

  throw new BinaryToolError(`${toolId} is not a file-based tool.`);
}
