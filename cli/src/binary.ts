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

/** The tools index.ts reads as bytes instead of text. */
export const BINARY_TOOLS = new Set(['parquet-inspect', 'avro-check']);

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

  throw new BinaryToolError(`${toolId} is not a file-based tool.`);
}
