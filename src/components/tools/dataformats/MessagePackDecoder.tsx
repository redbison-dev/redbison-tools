/**
 * MessagePack Decoder: hex or base64 in, JSON out. All decoding is
 * decodeMessagePack in src/lib/tools/binary-json-formats.ts (pinned in
 * src/test/tools/tier-analyzers.test.ts). What JSON cannot carry is
 * tagged instead of mangled: integers past 2^53 as $int64 strings, bin as
 * $bytes previews, extensions as $ext, and the spec's -1 timestamp
 * extension rendered as an ISO 8601 $timestamp. Bytes never leave the tab.
 */
import React, { useState } from 'react';
import { Braces, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { decodeMessagePack } from '@/lib/tools/binary-json-formats';
import { reportInput } from '@/lib/report/attrs';
import { useT } from '@/i18n';
import { CodeArea, DevPage, Panel, Notice, Chip, Segmented, CopyDownload, useDevActions } from '@/components/tools/devformat/shared';
import { DataFormatsHeader, parseBytes, type BytesEncoding } from './wk20261122-shared';

/**
 * A 4-key map: the classic {"compact":true,"schema":0} pair plus a
 * timestamp-32 extension and a 3-byte bin. Output pinned in
 * src/test/tools/wk20261122-binary.render.test.tsx.
 */
const SAMPLE = '84 a7 63 6f 6d 70 61 63 74 c3 a6 73 63 68 65 6d 61 00 a4 77 68 65 6e d6 ff 5e 0b e1 00 a4 62 6c 6f 62 c4 03 01 02 03';

const MessagePackDecoder = () => {
  const { t } = useT();
  const { copy, download, track } = useDevActions('messagepack-decoder');
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
      const { value, trailingBytes } = decodeMessagePack(bytes);
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
        h1={t('MessagePack Decoder')}
        tagline={t('Turn MessagePack bytes into readable JSON, with 64-bit integers, binary, extensions and timestamps tagged instead of silently changed')}
        icon={Braces}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('MessagePack bytes')} icon={FileCode2}>
          <CodeArea
            id="msgpack-input"
            label={t('Hex or base64')}
            value={input}
            onChange={setInput}
            rows={6}
            placeholder={t('e.g. 82 a7 63 6f 6d 70 61 63 74 c3 …, or a base64 payload from Redis or a message queue')}
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
            <div className="flex flex-wrap gap-2" data-testid="msgpack-chips" {...reportInput(t('Input'), `${byteCount} bytes (${readAs})`)}>
              <Chip label={t('Bytes')} value={String(byteCount)} />
              <Chip label={t('Read as')} value={readAs} />
            </div>
            {trailing > 0 && (
              <div data-testid="msgpack-trailing">
                <Notice tone="warn" title={t('Trailing bytes after the first object: {n}. MessagePack streams are often several objects back to back; decode the rest by removing the leading bytes.', { n: trailing })} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <CopyDownload text={json} filename="messagepack-decoded.json" onCopy={copy} onDownload={download} />
            </div>
            <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="msgpack-json">{json}</pre>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('Tags in the output mark what plain JSON cannot carry: $int64 is an integer past 2^53 kept as a decimal string, $bytes a bin payload with a hex preview, $ext an application extension with its type number, $timestamp the spec\'s -1 extension as ISO 8601, and $key: a map key that was not a string.')}
            </p>
          </Panel>
        )}
      </div>
    </DevPage>
  );
};

export default MessagePackDecoder;
