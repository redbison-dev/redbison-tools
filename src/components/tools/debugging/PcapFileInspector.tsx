/**
 * PCAP File Inspector: drop a .pcap or .pcapng capture and read the
 * five-minute triage facts. All parsing is src/lib/tools/pcap-inspect.ts
 * (pinned in src/test/tools/tier-analyzers.test.ts): both pcap magics in
 * both byte orders per draft-ietf-opsawg-pcap, pcapng section header,
 * interface description and enhanced packet blocks per
 * draft-ietf-opsawg-pcapng. The page says plainly that Wireshark owns
 * everything deeper (filters, stream reassembly, dissectors). A capture can
 * hold credentials and private traffic, which is why local parsing is the
 * headline: the file never leaves the tab.
 */
import React, { useState } from 'react';
import { Network, FileText, TriangleAlert, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inspectPcap, renderPcapSummary, type PcapSummary } from '@/lib/tools/pcap-inspect';
import { reportInput } from '@/lib/report/attrs';
import { useFormat, useT } from '@/i18n';
import { DebugPage, DebugHeader, Panel, Notice, Stat, Chip, FileDrop, CopyDownload, useDevActions, iecBytes } from './shared';
import { samplePcapBytes } from './wk20261122-captures-samples';

const PcapFileInspector = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { copy, download, track } = useDevActions('pcap-file-inspector');
  const [summary, setSummary] = useState<PcapSummary | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const inspect = (bytes: Uint8Array, name: string, source: string) => {
    setError('');
    setSummary(null);
    try {
      setSummary(inspectPcap(bytes));
      setFileName(name);
      track('inspect', { source });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (f: File) => {
    inspect(new Uint8Array(await f.arrayBuffer()), f.name, 'file');
  };

  const text = summary ? renderPcapSummary(summary) : '';

  return (
    <DebugPage>
      <DebugHeader
        h1={t('PCAP File Inspector')}
        tagline={t('Packets, protocols, conversations and unanswered SYNs from a .pcap or .pcapng capture, read in your browser')}
        icon={Network}
      />
      <div className="space-y-6 mt-6">
        <Panel title={t('Capture')} icon={FileText}>
          <Notice
            tone="info"
            title={t('A capture can hold passwords, cookies, session tokens and every site a machine talked to. This page parses it in your tab and never uploads a byte, which is the only acceptable way to triage one on the web.')}
          />
          <FileDrop
            id="pcap-file"
            label={fileName || t('Drop a .pcap or .pcapng capture here')}
            hint={t('Or click to choose one. tcpdump, Wireshark and tshark files all read; nothing leaves this tab.')}
            accept=".pcap,.pcapng,.cap,application/vnd.tcpdump.pcap"
            onFile={onFile}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inspect(samplePcapBytes(), 'sample.pcap', 'sample')}>
              {t('Load a sample')}
            </Button>
          </div>
          {error && <Notice tone="error" title={error} />}
        </Panel>

        {summary && (
          <>
            <Panel title={t('The capture at a glance')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="pcap-stats">
                <Stat label={t('Format')} value={summary.format} sub={summary.linkType} />
                <Stat label={t('Packets')} value={fmt.number(summary.packets)} />
                <Stat label={t('Captured traffic')} value={iecBytes(summary.totalBytes)} sub={t('original packet lengths')} />
                <Stat label={t('Duration')} value={summary.durationSeconds !== undefined ? `${summary.durationSeconds.toFixed(1)}s` : '—'} />
              </div>
              <div className="flex flex-wrap gap-2" {...reportInput(t('Capture'), `${fileName} · ${summary.packets} packets`)}>
                <Chip label={t('IPv4 hosts')} value={fmt.number(summary.ipv4Hosts)} />
                <Chip label={t('IPv6 hosts')} value={fmt.number(summary.ipv6Hosts)} />
                <Chip label={t('DNS queries')} value={fmt.number(summary.dnsQueries)} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('This is the five-minute read: what the capture holds and where the traffic went. Filters, stream reassembly and protocol dissection belong to Wireshark; open the file there once this page tells you it is worth the time.')}
              </p>
            </Panel>

            {summary.truncated && (
              <div data-testid="pcap-truncated">
                <Notice tone="warn" title={t('The file ends mid-packet: the capture was cut off while being written or copied, so the last record is incomplete and these counts are a floor, not the whole story.')} />
              </div>
            )}

            {summary.synWithoutAck > 0 && (
              <div data-testid="pcap-syn">
                <Notice
                  tone="warn"
                  title={t('{n} TCP SYNs were never answered with a SYN-ACK. One or two are ordinary timeouts; a cluster toward one port is a dead service, a dropped firewall rule, or a scan.', { n: summary.synWithoutAck })}
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title={t('By protocol')}>
                <table className="w-full text-sm" data-testid="pcap-protocols">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Protocol')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Packets')}</th>
                      <th className="py-1.5 font-medium text-right">{t('Bytes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.byProtocol.map((p) => (
                      <tr key={p.proto}>
                        <td className="py-1.5 pr-3 font-mono text-xs">{p.proto}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmt.number(p.packets)}</td>
                        <td className="py-1.5 text-right tabular-nums">{iecBytes(p.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
              <Panel title={t('Services on well-known ports')}>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('Named by port number alone: packets to 443 are called https whether or not TLS is inside. Wireshark\'s dissectors are the tool that checks.')}
                </p>
                <table className="w-full text-sm" data-testid="pcap-services">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Service')}</th>
                      <th className="py-1.5 font-medium text-right">{t('Packets')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.byService.map((sv) => (
                      <tr key={sv.service}>
                        <td className="py-1.5 pr-3 font-mono text-xs">{sv.service}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmt.number(sv.packets)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>

            <Panel title={t('Top conversations')} icon={MessagesSquare}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="pcap-conversations">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3 font-medium">{t('Hosts')}</th>
                      <th className="py-1.5 pr-3 font-medium">{t('Protocol')}</th>
                      <th className="py-1.5 pr-3 font-medium text-right">{t('Packets')}</th>
                      <th className="py-1.5 font-medium text-right">{t('Bytes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {summary.conversations.map((c) => (
                      <tr key={`${c.a}|${c.b}|${c.proto}`}>
                        <td className="py-1.5 pr-3 font-mono text-xs break-all">{c.a} ↔ {c.b}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{c.proto}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{fmt.number(c.packets)}</td>
                        <td className="py-1.5 text-right tabular-nums">{iecBytes(c.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title={t('Text summary')} icon={TriangleAlert}>
              <div className="flex flex-wrap gap-2">
                <CopyDownload text={text} filename="pcap-summary.txt" onCopy={copy} onDownload={download} />
              </div>
              <pre className="font-mono text-xs overflow-x-auto bg-gray-50 dark:bg-gray-900/60 rounded-lg p-3 text-gray-800 dark:text-gray-200" data-testid="pcap-summary">{text}</pre>
            </Panel>
          </>
        )}
      </div>
    </DebugPage>
  );
};

export default PcapFileInspector;
