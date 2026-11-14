import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Maximize, Minimize } from 'lucide-react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import DnsQueryForm from './dns/DnsQueryForm';
import DnsResults from './dns/DnsResults';
import NetworkDiagnostics from './dns/NetworkDiagnostics';
import { performDnsLookup } from './dns/dnsUtils';
import { normalizeDomainInput } from '@/lib/tools/dns-lookup';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { useT } from '@/i18n';

interface DnsRecord {
  name: string;
  type: string;
  TTL: number;
  data: string;
  provider?: string;
}

const DnsLookup = () => {
  const { t } = useT();
  const [domain, setDomain] = useState('');
  const [results, setResults] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const handleLookup = async () => {
    if (!domain.trim()) {
      setError(t('Please enter a domain name'));
      return;
    }
    const name = normalizeDomainInput(domain);
    if (!name) {
      setError(t('That does not look like a domain name. Try something like {example}', { example: 'example.com' }));
      return;
    }
    if (name !== domain) setDomain(name);

    setLoading(true);
    setError('');
    setResults([]);
    trackAction('dns_lookup');

    try {
      const dnsResults = await performDnsLookup(name);
      
      if (dnsResults.length > 0) {
        setResults(dnsResults);
      } else {
        setError(t('No DNS records found for {name}. Please check the domain name and try again.', { name }));
      }
    } catch (err) {
      console.error('DNS lookup error:', err);
      setError(t('Failed to perform DNS lookup. Please check the domain name and try again.'));
    } finally {
      setLoading(false);
    }
  };


  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
            <ToolBreadcrumb 
              category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
              subcategory={{ label: t('Network Tools'), href: "/category/development-tech/network-tools" }}
              toolName="DNS Lookup"
            />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Search className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('DNS Lookup')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Query A, AAAA, MX, TXT, NS, SOA, CAA and more over DNS-over-HTTPS, plus basic reachability checks')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">DNS</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Network')}</Badge>
                  {!isMobile && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={toggleFullscreen}
                      className="border-gray-300 text-gray-600 hover:bg-gray-100"
                    >
                      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 sm:mt-8">
              <DnsQueryForm 
                domain={domain}
                setDomain={setDomain}
                onLookup={handleLookup}
                loading={loading}
                error={error}
              />

              <DnsResults results={results} domain={domain} />

              <NetworkDiagnostics domain={domain} />

              <div className="mt-8 text-center text-sm text-gray-500">
                <p>{t('Queries go from your browser to Google Public DNS (dns.google), falling back to Cloudflare and Quad9 if Google returns nothing.')}</p>
                <p className="mt-1">{t('Diagnostics run from your browser, so they cannot see HTTP status codes or send ICMP pings; WHOIS uses api.whois.vu or api.ipregistry.co.')}</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default DnsLookup;
