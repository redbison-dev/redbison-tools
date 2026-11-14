
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';
import { NetworkDiagnosticsProps, DiagnosticResult } from './networkDiagnostics/types';
import { performHttpTest } from './networkDiagnostics/httpTestUtils';
import { performWhoisLookup } from './networkDiagnostics/whoisUtils';
import { performPingTest } from './networkDiagnostics/pingUtils';
import DiagnosticResultCard from './networkDiagnostics/DiagnosticResultCard';
import { useT } from '@/i18n';

const NetworkDiagnostics = ({ domain }: NetworkDiagnosticsProps) => {
  const { t } = useT();
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    if (!domain.trim()) return;
    
    setLoading(true);
    setResults([]);

    const diagnostics = [
      performHttpTest(`http://${domain}`, 'HTTP', t),
      performHttpTest(`https://${domain}`, 'HTTPS', t),
      performPingTest(domain, t),
      performWhoisLookup(domain, t)
    ];

    const results = await Promise.all(diagnostics);
    setResults(results);
    setLoading(false);
  };

  if (!domain) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          {t('Network Diagnostics')}
        </CardTitle>
        <CardDescription>
          {t('Comprehensive network connectivity and diagnostic tests for {domain}', { domain })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={runDiagnostics} 
          disabled={loading}
          className="w-full"
        >
          {loading ? t('Running Diagnostics...') : t('Run Network Diagnostics')}
        </Button>

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((result, index) => (
              <DiagnosticResultCard key={index} result={result} />
            ))}
          </div>
        )}

        <div className="text-xs text-gray-500 border-t pt-4">
          <p>{t('Network diagnostics are performed using browser-compatible methods.')}</p>
          <p className="mt-1">{t('Some tests may be limited by CORS policies and browser security restrictions.')}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default NetworkDiagnostics;
