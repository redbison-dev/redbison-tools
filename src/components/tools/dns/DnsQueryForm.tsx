
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, AlertCircle } from 'lucide-react';
import { useT } from '@/i18n';

interface DnsQueryFormProps {
  domain: string;
  setDomain: (domain: string) => void;
  onLookup: () => void;
  loading: boolean;
  error: string;
}

const DnsQueryForm = ({ domain, setDomain, onLookup, loading, error }: DnsQueryFormProps) => {
  const { t } = useT();
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-500" />
          {t('DNS Query')}
        </CardTitle>
        <CardDescription>
          {t('Enter a domain name to automatically discover all available DNS records')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 p-3 border-2 border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors">
            <Input
              placeholder={t('Enter domain name (e.g., google.com)')}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onLookup()}
              className="border-0 bg-white text-base sm:text-sm font-medium placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
            />
          </div>
          <Button 
            onClick={onLookup} 
            disabled={loading}
            className="w-full sm:w-auto whitespace-nowrap px-6 bg-black text-white hover:bg-gray-800 border-none"
          >
            {loading ? t('Looking up...') : t('Lookup All Records')}
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DnsQueryForm;
