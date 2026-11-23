/**
 * CBOR Decoder: hex or base64 in, JSON out per RFC 8949. All decoding is
 * decodeCbor in src/lib/tools/binary-json-formats.ts, pinned against the
 * RFC's own Appendix A vectors in src/test/tools/tier-analyzers.test.ts.
 * What JSON cannot say is tagged: $tag wrappers (tags 0 and 1 rendered as
 * date-times), $int64 for integers past 2^53, $bytes for byte strings,
 * $undefined and $simple for major type 7. Bytes never leave the tab.
 */
import React, { useState } from 'react';
import { FileCode2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { decodeCbor } from '@/lib/tools/binary-json-formats';
import { reportInput } from '@/lib/report/attrs';
import { useT } from '@/i18n';
import { CodeArea, DevPage, Panel, Notice, Chip, Segmented, CopyDownload, useDevActions } from '@/components/tools/devformat/shared';
import { DataFormatsHeader, parseBytes, type BytesEncoding } from './wk20261122-shared';

/**
 * A 4-key map: a text string, a tag 0 date-time, the largest uint64 and
 * the RFC's Appendix A half-float 5.960464477539063e-8. Output pinned in
 * src/test/tools/wk20261122-binary.render.test.tsx.
 */
const SAMPLE = 'a4 64 6e 61 6d 65 63 61 64 61 64 77 68 65 6e c0 74 32 30 32 36 2d 31 31 2d 32 32 54 30 39 3a 30 30 3a 30 30 5a 62 69 64 1b ff ff ff ff ff ff ff ff 64 68 61 6c 66 f9 00 01';

const CborDecoder = () => {
  const { t } = useT();
  const { copy, download, track } = useDevActions('cbor-decoder');
  const [input, setInput] = useState('');
  const [encoding, setEncoding] = useState<BytesEncoding>('auto');
  const [json, setJson] = useState('');
  const [readAs, setReadAs] = useState('');
  const [byteCount, setByteCount] = useState(0);
  const [trailing, setTrailing] = useState(0);
  const [error, setError] = useState('');

  const decode = (text: string, source: string) => {
    setError('');
    setJson('');
    try {
      const { bytes, read } = parseBytes(text, encoding);
      const { value, trailingBytes } = decodeCbor(bytes);
      setJson(JSON.stringify(value, null, 2) ?? 'null');
      setTrailing(trailingBytes);
      setReadAs(read);
      setByteCount(bytes.length);
      track('decode', { source, read });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <DevPage>
      <DataFormatsHeader
        h1={t('CBOR Decoder')}
        tagline={t('Decode CBOR bytes to JSON per RFC 8949: tags, half-precision floats, indefinite lengths and 64-bit integers, all in your browser')}
        icon={Tag}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('CBOR bytes')} icon={FileCode2}>
          <CodeArea
            id="cbor-input"
            label={t('Hex or base64')}
            value={input}
            onChange={setInput}
            rows={6}
            placeholder={t('e.g. a2 61 61 01 61 62 82 02 03, or a base64 COSE or CoAP payload')}
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

        {json && (
          <Panel title={t('Decoded JSON')}>
            <div className="flex flex-wrap gap-2" data-testid="cbor-chips" {...reportInput(t('Input'), `${byteCount} bytes (${readAs})`)}>
              <Chip label={t('Bytes')} value={String(byteCount)} />
              <Chip label={t('Read as')} value={readAs} />
            </div>
            {trailing > 0 && (
              <div data-testid="cbor-trailing">
                <Notice tone="warn" title={t('Trailing bytes after the first data item: {n}. A CBOR sequence (RFC 8742) is several items back to back; decode the rest by removing the leading bytes.', { n: trailing })} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <CopyDownload text={json} filename="cbor-decoded.json" onCopy={copy} onDownload={download} />
            </div>
            <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="cbor-json">{json}</pre>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('Tags in the output mark what plain JSON cannot say: $tag wraps a tagged item (tag 0 and tag 1 date-times are rendered), $int64 keeps an integer past 2^53 as a decimal string, $bytes previews a byte string in hex, $undefined and $simple carry major type 7 values, and $key: keeps a non-string map key visible.')}
            </p>
          </Panel>
        )}
      </div>
    </DevPage>
  );
};

export default CborDecoder;
