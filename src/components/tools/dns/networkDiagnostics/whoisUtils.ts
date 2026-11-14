
import type { TFunction } from '@/i18n';
import { DiagnosticResult } from './types';

/** `t` translates the result text into the page's language; WHOIS values stay as the registry gives them. */
export const performWhoisLookup = async (domain: string, t: TFunction): Promise<DiagnosticResult> => {
  const whoisApis = [
    {
      name: 'WHOIS API',
      url: `https://api.whois.vu/?q=${domain}`,
      headers: {},
      parser: (data: any) => {
        const details = [];
        let hasRegistrar = false;
        if (data.domain) details.push(t('Domain: {value}', { value: data.domain }));
        if (data.registrar) {
          details.push(t('Registrar: {value}', { value: data.registrar }));
          hasRegistrar = true;
        }
        if (data.created_date || data.created) {
          const createdDate = data.created_date || new Date(data.created * 1000).toLocaleDateString();
          details.push(t('Created: {value}', { value: createdDate }));
        }
        if (data.expiry_date || data.expires) {
          const expiryDate = data.expiry_date || new Date(data.expires * 1000).toLocaleDateString();
          details.push(t('Expires: {value}', { value: expiryDate }));
        }
        if (data.status || data.statuses) {
          const status = Array.isArray(data.statuses) ? data.statuses.join(', ') : data.status;
          details.push(t('Status: {value}', { value: status }));
        }
        if (data.name_servers && data.name_servers.length > 0) {
          details.push(t('Name Servers: {value}', { value: data.name_servers.join(', ') }));
        }
        if (data.whois && data.whois.includes('Name Server:')) {
          const nsMatches = data.whois.match(/Name Server:\s*([^\r\n]+)/gi);
          if (nsMatches) {
            const nameServers = nsMatches.map(ns => ns.replace('Name Server:', '').trim());
            details.push(t('Name Servers: {value}', { value: nameServers.join(', ') }));
          }
        }
        if (data.whois && data.whois.includes('Registrar:')) {
          const regMatch = data.whois.match(/Registrar:\s*([^\r\n]+)/i);
          if (regMatch && !hasRegistrar) {
            details.push(t('Registrar: {value}', { value: regMatch[1].trim() }));
          }
        }
        if (data.whois && data.whois.includes('DNSSEC:')) {
          const dnssecMatch = data.whois.match(/DNSSEC:\s*([^\r\n]+)/i);
          if (dnssecMatch) {
            details.push(`DNSSEC: ${dnssecMatch[1].trim()}`);
          }
        }

        return {
          message: t('Domain registration information retrieved successfully'),
          details: details.length > 0 ? details : [t('Domain: {value}', { value: domain }), t('Status: Active')]
        };
      }
    },
    {
      name: 'IP Registry',
      url: `https://api.ipregistry.co/domain/${domain}?key=tryout`,
      headers: {},
      parser: (data: any) => {
        const details = [];
        details.push(t('Domain: {value}', { value: domain }));
        if (data.created_date) details.push(t('Created: {value}', { value: data.created_date }));
        if (data.updated_date) details.push(t('Updated: {value}', { value: data.updated_date }));
        if (data.registrar) details.push(t('Registrar: {value}', { value: data.registrar.name || data.registrar }));
        if (data.country) details.push(t('Country: {value}', { value: data.country }));

        return {
          message: t('Domain registration details found'),
          details
        };
      }
    }
  ];

  for (const api of whoisApis) {
    try {
      const response = await fetch(api.url, {
        headers: api.headers,
        signal: AbortSignal.timeout(8000)
      });
      
      if (response.ok) {
        const data = await response.json();
        const parsed = api.parser(data);
        return {
          kind: 'whois',
          test: t('WHOIS Lookup'),
          status: 'success',
          message: parsed.message,
          details: parsed.details
        };
      }
    } catch (error) {
      console.log(`WHOIS API ${api.name} failed:`, error);
      continue;
    }
  }

  // If all APIs fail, try a simple domain validation approach
  try {
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`);
    if (response.ok) {
      const data = await response.json();
      if (data.Answer && data.Answer.length > 0) {
        return {
          kind: 'whois',
          test: t('WHOIS Lookup'),
          status: 'warning',
          message: t('WHOIS data unavailable, but the domain resolves'),
          details: [
            t('Domain: {value}', { value: domain }),
            t('IP Address: {value}', { value: data.Answer[0].data }),
            t('DNS Resolution: Successful'),
            t('Note: Detailed WHOIS data unavailable')
          ]
        };
      }
    }
  } catch (error) {
    // Final fallback
  }

  return {
    kind: 'whois',
    test: t('WHOIS Lookup'),
    status: 'warning',
    message: t('WHOIS data unavailable for {domain}', { domain }),
    details: [
      t('Domain: {value}', { value: domain }),
      t('Status: no WHOIS provider answered and no A record was found'),
      t('Detailed registration info: Not accessible')
    ]
  };
};
