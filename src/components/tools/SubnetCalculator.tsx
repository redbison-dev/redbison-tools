
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { Badge } from '@/components/ui/badge';
import { Calculator, Network, Copy, Info, Maximize, Minimize } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { calculateSubnet as computeSubnet, prefixToMaskString, type SubnetInfo } from '@/lib/tools/subnet-calculator';
import CalculationSteps from '@/components/tools/shared/CalculationSteps';
import { reportResult, REPORT_VALUE, REPORT_IGNORE, REPORT_FORMULAS } from '@/lib/report/attrs';
import { subnetCalculatorSteps } from '@/lib/tools/steps/s7';
import { useFormat, useT } from '@/i18n';

const SubnetCalculator = () => {
  const { t } = useT();
  const fmt = useFormat();
  const [ipAddress, setIpAddress] = useState('192.168.1.1');
  const [cidr, setCidr] = useState('24');
  const [subnetInfo, setSubnetInfo] = useState<SubnetInfo | null>(null);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState('');
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();

  const cidrOptions = Array.from({ length: 33 }, (_, i) => i);

  const calculateSubnet = () => {
    setError('');
    try {
      setSubnetInfo(computeSubnet(ipAddress, parseInt(cidr, 10)));
      trackAction('calculate_subnet');
    } catch (err) {
      setSubnetInfo(null);
      setError(err instanceof Error ? t(err.message) : t('Please enter a valid IPv4 address'));
    }
  };

  const calculateSubnetMask = prefixToMaskString;
  const steps = useMemo(() => (subnetInfo ? subnetCalculatorSteps(ipAddress, parseInt(cidr, 10)) : []), [subnetInfo, ipAddress, cidr]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyAnimation(label);
    setTimeout(() => setCopyAnimation(''), 1000);
    trackAction('copy_subnet_info');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  useEffect(() => {
    if (ipAddress && cidr) {
      calculateSubnet();
    }
  }, [ipAddress, cidr]);

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            <ToolBreadcrumb 
              category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
              subcategory={{ label: t('Network Tools'), href: "/category/development-tech/network-tools" }}
              toolName={t('Subnet Calculator')}
            />
            
            <div className="tool-header mt-6">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Calculator className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('Subnet Calculator')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Calculate subnet information, network ranges, and host details')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Network')}</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Calculator')}</Badge>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-blue-500" />
                    {t('Subnet Configuration')}
                  </CardTitle>
                  <CardDescription>
                    {t('Enter an IP address and select the subnet mask (CIDR notation)')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label htmlFor="subnet-ip" className="block text-sm font-medium mb-2">{t('IP Address')}</label>
                      <Input
                        id="subnet-ip"
                        placeholder="192.168.1.1"
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="subnet-cidr" className="block text-sm font-medium mb-2">{t('CIDR Notation')}</label>
                      <Select value={cidr} onValueChange={setCidr}>
                        <SelectTrigger id="subnet-cidr">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {cidrOptions.map((option) => (
                            <SelectItem key={option} value={option.toString()}>
                              /{option} ({calculateSubnetMask(option)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button onClick={calculateSubnet} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    {t('Calculate Subnet')}
                  </Button>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {subnetInfo && (
                <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-black text-lg sm:text-xl flex items-center gap-2">
                      <Network className="h-5 w-5 text-green-500" />
                      {t('Subnet Results')}
                    </CardTitle>
                    <CardDescription>
                      {t('Found {value} usable hosts in this subnet', { value: fmt.number(subnetInfo.usableHosts) })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: t('Network Address'), value: subnetInfo.networkAddress },
                      { label: t('Broadcast Address'), value: subnetInfo.broadcastAddress ?? (subnetInfo.prefix === 31 ? t('None (/31 point-to-point, RFC 3021)') : t('None (single host)')) },
                      { label: t('Subnet Mask'), value: subnetInfo.subnetMask },
                      { label: t('Wildcard Mask'), value: subnetInfo.wildcardMask },
                      { label: t('CIDR Notation'), value: subnetInfo.cidr },
                      { label: t('Network Class'), value: t(subnetInfo.networkClass) },
                      { label: t('Total Hosts'), value: fmt.number(subnetInfo.totalHosts) },
                      { label: t('Usable Hosts'), value: fmt.number(subnetInfo.usableHosts) },
                      { label: t('First Usable IP'), value: subnetInfo.firstUsableIP },
                      { label: t('Last Usable IP'), value: subnetInfo.lastUsableIP }
                    ].map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded" {...reportResult(item.label)}>
                        <span className="font-medium text-sm">{t('{label}:', { label: item.label })}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm" {...REPORT_VALUE}>{item.value}</span>
                          <Button
                            {...REPORT_IGNORE}
                            aria-label={t('Copy {label}', { label: item.label })}
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(item.value, item.label)}
                            className={`transition-all duration-300 ${
                              copyAnimation === item.label ? 'bg-green-100 text-green-700 scale-105' : ''
                            }`}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <CalculationSteps steps={steps} />
                    <div className="rounded-lg border border-gray-200 p-3">
                      <h4 className="text-sm font-semibold mb-2">{t('Formulas used')}</h4>
                      <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5" {...REPORT_FORMULAS}>
                        <li>{t('Mask for prefix p: p one bits followed by 32 − p zero bits (RFC 4632); wildcard = NOT mask')}</li>
                        <li>{t('Network = address AND mask; broadcast = network OR wildcard (RFC 950)')}</li>
                        <li>{t('Addresses = 2^(32 − p); usable hosts = 2^(32 − p) − 2 for /0 to /30, 2 for a /31 point-to-point link (RFC 3021), 1 for a /32')}</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SubnetCalculator;
