
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle } from 'lucide-react';
import { getRecordIcon, getRecordDescription } from './dnsUtils';
import DnsRecordCard from './DnsRecordCard';
import { useT } from '@/i18n';

interface DnsRecord {
  name: string;
  type: string;
  TTL: number;
  data: string;
}

interface DnsResultsProps {
  results: DnsRecord[];
  domain: string;
}

const DnsResults = ({ results, domain }: DnsResultsProps) => {
  // Group results by type for better display
  const { t } = useT();
  const groupedResults = results.reduce((acc, record) => {
    if (!acc[record.type]) {
      acc[record.type] = [];
    }
    acc[record.type].push(record);
    return acc;
  }, {} as Record<string, DnsRecord[]>);

  if (results.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          {t('DNS Records Found')}
        </CardTitle>
        <CardDescription>
          {t('Found {length} DNS record(s) across {length2} type(s) for {domain}', { length: results.length, length2: Object.keys(groupedResults).length, domain })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(groupedResults).map(([recordType, records]) => {
            const IconComponent = getRecordIcon(recordType);
            return (
              <div key={recordType} className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <IconComponent className="h-5 w-5 text-blue-500" />
                  <Badge variant="outline" className="font-mono text-sm">
                    {recordType}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    {t(getRecordDescription(recordType))}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {records.length > 1 ? t('{length} records', { length: records.length }) : t('{length} record', { length: records.length })}
                  </span>
                </div>
                
                <div className="space-y-2">
                  {records.map((record, index) => (
                    <DnsRecordCard key={index} record={record} index={index} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default DnsResults;
