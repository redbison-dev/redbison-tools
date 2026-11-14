import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolResult } from '@/hooks/useToolResult';
import ConverterShell from '../ConverterShell';
import { msg, useT } from '@/i18n';
import { binaryToText, hexToTextBytes, isDecodeError, textToBinary, textToHex } from '@/lib/tools/specialty-converters';

const H1 = msg('Binary to Text Converter');
const TAGLINE = msg('Text to binary or hex bytes and back, using real UTF-8 so emoji and accents survive the trip.');

/** /binary-text-converter: both directions, UTF-8 throughout. */
export default function BinaryTextConverterPage() {
  const { t } = useT();
  const { toast } = useToast();
  const [text, setText] = useState('Hello, world!');
  const [encoded, setEncoded] = useState('01001000 01101001');
  const [mode, setMode] = useState<'binary' | 'hex'>('binary');

  const fromText = useMemo(() => (mode === 'binary' ? textToBinary(text) : textToHex(text)), [text, mode]);
  const fromEncoded = useMemo(() => (mode === 'binary' ? binaryToText(encoded) : hexToTextBytes(encoded)), [encoded, mode]);

  useToolResult('converted', `${fromText.slice(0, 80)}|${fromEncoded.ok ? fromEncoded.text.slice(0, 80) : ''}`);

  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast({ title: t('Result Copied'), description: t('The output is on your clipboard.') });
  };

  return (
    <ConverterShell
      category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
      subcategory={{ label: t('Data Conversion'), href: '/category/development-tech/data-conversion' }}
      h1={H1}
      tagline={TAGLINE}
    >
      <div className="flex gap-2">
        {(['binary', 'hex'] as const).map((m) => (
          <Button key={m} variant={mode === m ? 'default' : 'outline'} size="sm" onClick={() => setMode(m)}>
            {m === 'binary' ? t('Binary (bits)') : t('Hex (bytes)')}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="bt-text" className="font-semibold">{t('Text')}</Label>
          <Textarea id="bt-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="break-all font-mono text-sm text-black">{fromText ? <code>{fromText}</code> : t('Type text above to encode it.')}</p>
              {fromText && (
                <Button variant="ghost" size="sm" className="h-7 shrink-0 px-1.5" aria-label={t('Copy result')} onClick={() => copy(fromText)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bt-enc" className="font-semibold">{mode === 'binary' ? t('Binary') : t('Hex bytes')}</Label>
          <Textarea id="bt-enc" rows={5} value={encoded} onChange={(e) => setEncoded(e.target.value)} className="font-mono" />
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            {isDecodeError(fromEncoded) ? (
              <p className="text-sm text-red-700">{t(fromEncoded.error)}</p>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p className="break-all text-black">{fromEncoded.text ? <code>{fromEncoded.text}</code> : t('Paste bits or bytes above to decode them.')}</p>
                {fromEncoded.text && (
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 px-1.5" aria-label={t('Copy result')} onClick={() => copy(fromEncoded.text)}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-sm text-gray-600">
        {t('Every character becomes its UTF-8 bytes, eight bits per byte, so multi-byte characters such as é or 🚀 take two to four bytes. Nothing leaves your browser.')}
      </p>
    </ConverterShell>
  );
}
