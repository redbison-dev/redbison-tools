/**
 * Shared pieces for the binary-format decoders of batch wk20261122-binary
 * (protobuf wire, MessagePack, CBOR): the Data Formats breadcrumb header
 * and the hex/base64 input reader. The reader is UI plumbing only; all
 * decoding lives in src/lib/tools (proto-wire.ts, binary-json-formats.ts),
 * pinned by src/test/tools/tier-analyzers.test.ts.
 */
import React from 'react';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useT } from '@/i18n';

/** Breadcrumb, the page's only H1 and a one-line tagline. */
export function DataFormatsHeader({ h1, tagline, icon: Icon }: { h1: string; tagline: string; icon: React.ComponentType<{ className?: string }> }) {
  const { t } = useT();
  return (
    <>
      <ToolBreadcrumb
        category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
        subcategory={{ label: t('Data Formats'), href: '/category/development-tech/data-formats' }}
        toolName={h1}
      />
      <div className="tool-header mt-6">
        <h1 className="tool-title text-black dark:text-white text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
          <Icon className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-red-600 shrink-0" />
          {h1}
        </h1>
        <p className="tool-description text-gray-600 dark:text-gray-300 text-sm sm:text-base mt-2">{tagline}</p>
      </div>
    </>
  );
}

export type BytesEncoding = 'auto' | 'hex' | 'base64';

/**
 * Reads pasted bytes as hex or base64. Auto prefers hex when the text is
 * valid hex, because dumps from tcpdump, Wireshark, protoc and logging
 * libraries are hex far more often than base64; short all-digit strings
 * ("1234") are valid in both readings, so the caller shows which reading
 * was used and offers the explicit switch.
 */
export function parseBytes(text: string, mode: BytesEncoding): { bytes: Uint8Array; read: 'hex' | 'base64' } {
  const compact = text.replace(/\s+/g, '').replace(/^0x/i, '').replace(/[,;]0x/gi, '');
  if (!compact) throw new Error('Paste the bytes first, as hex or base64.');
  const hexOk = /^[0-9a-fA-F]+$/.test(compact);
  if (mode === 'hex' || (mode === 'auto' && hexOk)) {
    if (!hexOk) throw new Error('Not hex: only 0-9 and a-f (whitespace is fine).');
    if (compact.length % 2) throw new Error(`Odd number of hex digits (${compact.length}): one nibble is missing.`);
    return { bytes: new Uint8Array(compact.match(/../g)!.map((x) => parseInt(x, 16))), read: 'hex' };
  }
  const b64 = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bin = atob(b64);
    return { bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)), read: 'base64' };
  } catch {
    throw new Error('Not valid base64 (standard or URL-safe) and not valid hex.');
  }
}
