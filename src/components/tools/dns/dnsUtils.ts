
import { Globe, Server, Mail, Shield, Network, FileText, Link } from 'lucide-react';
import { buildDohRequest } from '@/lib/tools/dns-lookup';
import { msg } from '@/i18n';

/** Record names and descriptions are marked with msg() here and translated where they are shown (DnsResults). */

export const recordTypes = [
  { value: 'A', name: msg('A - IPv4 Address'), icon: Globe, description: msg('Maps domain to IPv4 address'), typeNum: 1 },
  { value: 'AAAA', name: msg('AAAA - IPv6 Address'), icon: Globe, description: msg('Maps domain to IPv6 address'), typeNum: 28 },
  { value: 'MX', name: msg('MX - Mail Exchange'), icon: Mail, description: msg('Mail server records'), typeNum: 15 },
  { value: 'TXT', name: msg('TXT - Text Records'), icon: FileText, description: msg('Text records (SPF, DKIM, etc.)'), typeNum: 16 },
  { value: 'CNAME', name: msg('CNAME - Canonical Name'), icon: Link, description: msg('Alias to another domain'), typeNum: 5 },
  { value: 'NS', name: msg('NS - Name Server'), icon: Server, description: msg('Authoritative name servers'), typeNum: 2 },
  { value: 'SOA', name: msg('SOA - Start of Authority'), icon: Shield, description: msg('Zone authority information'), typeNum: 6 },
  { value: 'PTR', name: msg('PTR - Pointer Record'), icon: Network, description: msg('Reverse DNS lookup'), typeNum: 12 },
  { value: 'SRV', name: msg('SRV - Service Record'), icon: Server, description: msg('Service location records'), typeNum: 33 },
  { value: 'CAA', name: msg('CAA - Certificate Authority'), icon: Shield, description: msg('Certificate authority authorization'), typeNum: 257 }
];

// Convert numeric type back to string
export const getRecordTypeString = (typeNum: number): string => {
  const typeMap: { [key: number]: string } = {
    1: 'A',
    2: 'NS',
    5: 'CNAME',
    6: 'SOA',
    12: 'PTR',
    15: 'MX',
    16: 'TXT',
    28: 'AAAA',
    33: 'SRV',
    257: 'CAA'
  };
  return typeMap[typeNum] || 'Unknown';
};

// Format record data based on type
export const formatRecordData = (data: string, type: number): string => {
  switch (type) {
    case 15: // MX
      return data;
    case 16: // TXT
      // Clean up TXT records by removing quotes and extra escape characters
      return data.replace(/^"|"$/g, '').replace(/\\"/g, '"');
    case 6: // SOA
      return data;
    case 33: // SRV
      return data;
    default:
      return data.endsWith('.') ? data.slice(0, -1) : data;
  }
};

export const getRecordIcon = (type: string) => {
  const record = recordTypes.find(r => r.value === type);
  return record ? record.icon : Server;
};

export const getRecordDescription = (type: string) => {
  const record = recordTypes.find(r => r.value === type);
  return record ? record.description : msg('DNS record');
};

// Enhanced DNS lookup with better error handling and multiple DNS servers
export const performDnsLookup = async (domain: string) => {
  // Try multiple DNS providers for better results
  const dnsProviders = [
    'https://dns.google/resolve',
    'https://cloudflare-dns.com/dns-query',
    'https://dns.quad9.net:5053/dns-query'
  ];

  const allResults: any[] = [];

  for (const provider of dnsProviders) {
    try {
      const queryPromises = recordTypes.map(async (recordType) => {
        try {
          // All three providers serve the JSON API over GET; a POST must be
          // binary RFC 8484 wire format, so the old JSON POST always failed.
          const req = buildDohRequest(provider, domain, recordType.typeNum);
          const response = await fetch(req.url, {
            method: req.method,
            headers: req.headers,
            signal: AbortSignal.timeout(10000)
          });

          if (!response.ok) {
            console.warn(`Failed to query ${recordType.value} records:`, response.status);
            return [];
          }

          const data = await response.json();

          if (data && data.Answer && data.Answer.length > 0) {
            return data.Answer.map((record: any) => ({
              name: record.name.endsWith('.') ? record.name.slice(0, -1) : record.name,
              type: getRecordTypeString(record.type),
              TTL: record.TTL,
              data: formatRecordData(record.data, record.type),
              provider: provider.includes('google') ? 'Google DNS' : provider.includes('cloudflare') ? 'Cloudflare' : 'Quad9'
            }));
          }
          return [];
        } catch (error) {
          return [];
        }
      });

      const providerResults = await Promise.all(queryPromises);
      const flattenedResults = providerResults.flat();
      
      if (flattenedResults.length > 0) {
        allResults.push(...flattenedResults);
        break; // Use first successful provider
      }
    } catch (error) {
      console.error(`Provider ${provider} failed:`, error);
      continue;
    }
  }

  // Remove duplicates based on name, type, and data
  const uniqueResults = allResults.filter((record, index, self) => 
    index === self.findIndex(r => 
      r.name === record.name && 
      r.type === record.type && 
      r.data === record.data
    )
  );


  if (uniqueResults.length > 0) {
    // Sort results by type for better organization
    const sortedResults = uniqueResults.sort((a, b) => {
      const order = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'SRV', 'PTR', 'CAA'];
      const aIndex = order.indexOf(a.type);
      const bIndex = order.indexOf(b.type);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
    return sortedResults;
  }
  
  return [];
};
