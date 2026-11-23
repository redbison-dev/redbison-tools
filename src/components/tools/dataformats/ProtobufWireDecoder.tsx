/**
 * Protobuf Wire Decoder: paste hex or base64 message bytes, no .proto
 * needed. All decoding is src/lib/tools/proto-wire.ts (pinned in
 * src/test/tools/tier-analyzers.test.ts): every field keeps every reading
 * that fits, because without the schema the wire format does not say
 * whether a varint is int or sint, or a LEN payload a string, bytes or a
 * nested message. The component renders the readings side by side instead
 * of picking one. Bytes never leave the tab.
 */
import React, { useState } from 'react';
import { Binary, FileCode2, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { decodeProtoWire, renderProtoWire, type WireField } from '@/lib/tools/proto-wire';
import { reportInput } from '@/lib/report/attrs';
import { useT } from '@/i18n';
import { CodeArea, DevPage, Panel, Notice, Chip, Segmented, CopyDownload, useDevActions } from '@/components/tools/devformat/shared';
import { DataFormatsHeader, parseBytes, type BytesEncoding } from './wk20261122-shared';

/**
 * Field 1 varint 150 (the encoding guide's own example), field 2 the
 * string "testing", field 3 a nested message holding field 1 = 150, and
 * field 4 the double 42 as i64. Output pinned in
 * src/test/tools/wk20261122-binary.render.test.tsx.
 */
const SAMPLE = '08 96 01 12 07 74 65 73 74 69 6e 67 1a 03 08 96 01 21 00 00 00 00 00 00 45 40';

function FieldRow({ f, depth }: { f: WireField; depth: number }) {
  const { t } = useT();
  const readings: string[] = [];
  if (f.wireType === 0) {
    readings.push(t('as uint: {v}', { v: f.value ?? '' }));
    if (f.zigzag !== f.value) readings.push(t('as sint (zigzag): {v}', { v: f.zigzag ?? '' }));
  } else if (f.wireType === 1 || f.wireType === 5) {
    readings.push(t('as unsigned: {v}', { v: f.value ?? '' }));
    if (Number.isFinite(f.asFloat)) readings.push(`${f.wireType === 1 ? t('as double') : t('as float')}: ${f.asFloat}`);
  } else {
    if (f.message?.length) readings.push(t('as nested message ({n} fields)', { n: f.message.length }));
    if (f.text !== undefined) readings.push(t('as string: "{v}"', { v: f.text.length > 60 ? `${f.text.slice(0, 60)}…` : f.text }));
    if (f.hex) readings.push(t('as bytes: {v}', { v: f.hex }));
    if (!f.message?.length && f.text === undefined && !f.hex) readings.push(t('{n} bytes', { n: f.bytes ?? 0 }));
  }
  return (
    <>
      <tr className="align-top">
        <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap" style={{ paddingLeft: `${depth * 16}px` }}>{f.fieldNumber}</td>
        <td className="py-1.5 pr-3 font-mono text-xs">{f.wireTypeName}</td>
        <td className="py-1.5 text-xs">
          {readings.map((r, i) => (
            <div key={i} className={i === 0 ? '' : 'text-gray-500 dark:text-gray-400'}>{r}</div>
          ))}
        </td>
      </tr>
      {f.message?.map((sub, i) => <FieldRow key={`${depth}-${i}`} f={sub} depth={depth + 1} />)}
    </>
  );
}

const ProtobufWireDecoder = () => {
  const { t } = useT();
  const { copy, download, track } = useDevActions('protobuf-wire-decoder');
  const [input, setInput] = useState('');
  const [encoding, setEncoding] = useState<BytesEncoding>('auto');
  const [fields, setFields] = useState<WireField[] | null>(null);
  const [readAs, setReadAs] = useState('');
  const [byteCount, setByteCount] = useState(0);
  const [error, setError] = useState('');

  const decode = (text: string, source: string) => {
    setError('');
    setFields(null);
    try {
      const { bytes, read } = parseBytes(text, encoding);
      setFields(decodeProtoWire(bytes));
      setReadAs(read);
      setByteCount(bytes.length);
      track('decode', { source, read });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const text = fields ? renderProtoWire(fields) : '';
  const ambiguous = fields?.some((f) => f.message?.length && f.text !== undefined) ?? false;

  return (
    <DevPage>
      <DataFormatsHeader
        h1={t('Protobuf Wire Decoder')}
        tagline={t('Field numbers, wire types and every plausible reading from raw protobuf bytes, no .proto file needed, decoded in your browser')}
        icon={Binary}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Message bytes')} icon={FileCode2}>
          <CodeArea
            id="proto-input"
            label={t('Hex or base64')}
            value={input}
            onChange={setInput}
            rows={6}
            placeholder={t('e.g. 08 96 01, or the base64 payload from a log line')}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label={t('Input encoding')}
              value={encoding}
              onChange={(v) => setEncoding(v as BytesEncoding)}
              options={[{ value: 'auto', label: t('Auto') }, { value: 'hex', label: t('Hex') }, { value: 'base64', label: t('Base64') }]}
            />
            <Button type="button" className="tool-button" onClick={() => decode(input, 'paste')}>
              {t('Decode')}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setInput(SAMPLE); decode(SAMPLE, 'sample'); }}>
              {t('Load a sample')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {fields && (
          <>
            <Panel title={t('Decoded fields')} icon={ListTree}>
              <div className="flex flex-wrap gap-2" data-testid="proto-chips" {...reportInput(t('Input'), `${byteCount} bytes (${readAs})`)}>
                <Chip label={t('Bytes')} value={String(byteCount)} />
                <Chip label={t('Read as')} value={readAs} />
                <Chip label={t('Top-level fields')} value={String(fields.length)} />
              </div>
              <Notice
                tone="info"
                title={t('Without the .proto, the wire format does not carry the declared types: a varint could be int32 or the zigzag sint32, and a length-delimited payload a string, bytes, a nested message or a packed repeated field. Every reading that fits is shown; you pick the one your schema means.')}
              />
              {ambiguous && (
                <div data-testid="proto-ambiguous">
                  <Notice tone="warn" title={t('At least one payload decodes both as a nested message and as text. The bytes alone cannot settle which was meant.')} />
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="proto-fields">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Field')}</th>
                      <th className="py-1.5 pr-3 font-medium">{t('Wire type')}</th>
                      <th className="py-1.5 font-medium">{t('Readings')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {fields.map((f, i) => <FieldRow key={i} f={f} depth={0} />)}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title={t('Text form')}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="protobuf-decoded.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="proto-text">{text}</pre>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('Same one-line-per-field shape as protoscope output: field number, wire type, value, with nested decodes indented.')}
              </p>
            </Panel>
          </>
        )}
      </div>
    </DevPage>
  );
};

export default ProtobufWireDecoder;
