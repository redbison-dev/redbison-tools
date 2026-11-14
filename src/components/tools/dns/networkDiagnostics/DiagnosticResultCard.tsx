
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Globe, Shield, Server } from 'lucide-react';
import { DiagnosticResult } from './types';
import { msg, useT } from '@/i18n';

interface DiagnosticResultCardProps {
  result: DiagnosticResult;
}

const STATUS_WORDS: Record<DiagnosticResult['status'], string> = { success: msg('success'), error: msg('error'), warning: msg('warning') };

const DiagnosticResultCard = ({ result }: DiagnosticResultCardProps) => {
  const { t } = useT();
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Globe className="h-4 w-4 text-gray-500" />;
    }
  };

  // By kind, as the English titles chose before (the timing check's title contains "HTTPS", so it shows the globe).
  const getTestIcon = (kind: DiagnosticResult['kind']) => {
    if (kind === 'http' || kind === 'ping') return <Globe className="h-4 w-4" />;
    if (kind === 'whois') return <Server className="h-4 w-4" />;
    return <Shield className="h-4 w-4" />;
  };

  return (
    <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          {getTestIcon(result.kind)}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium">{result.test}</span>
              <Badge variant={result.status === 'success' ? 'default' : result.status === 'error' ? 'destructive' : 'secondary'}>
                {t(STATUS_WORDS[result.status])}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 mb-2">{result.message}</p>
            {result.duration && (
              <p className="text-xs text-gray-500 mb-2">{t('Duration: {duration}ms', { duration: result.duration })}</p>
            )}
            {result.details && result.details.length > 0 && (
              <div className="bg-gray-50 p-3 rounded text-xs space-y-1">
                {result.details.map((detail, detailIndex) => (
                  <div key={detailIndex} className="text-gray-600 font-mono">
                    {detail}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {getStatusIcon(result.status)}
      </div>
    </div>
  );
};

export default DiagnosticResultCard;
