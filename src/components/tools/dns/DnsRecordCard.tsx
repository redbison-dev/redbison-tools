
import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getRecordIcon, getRecordDescription } from './dnsUtils';
import { useT } from '@/i18n';

interface DnsRecord {
  name: string;
  type: string;
  TTL: number;
  data: string;
}

interface DnsRecordCardProps {
  record: DnsRecord;
  index: number;
}

const DnsRecordCard = ({ record, index }: DnsRecordCardProps) => {
  const { t } = useT();
  const { toast } = useToast();
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied!'),
      description: t('DNS record copied to clipboard'),
    });
  };

  return (
    <div key={index} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-600">TTL: {record.TTL}s</span>
          </div>
          <div className="mb-2">
            <span className="text-sm text-gray-600">{t('Name:')}{' '}</span>
            <span className="font-mono text-sm">{record.name}</span>
          </div>
          <div className="font-mono text-sm bg-gray-100 p-3 rounded border break-all">
            {record.data}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => copyToClipboard(record.data)}
          className="ml-2 shrink-0"
          title={t('Copy record data')}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default DnsRecordCard;
