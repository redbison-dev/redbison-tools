
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shield, Wifi, AlertCircle, CheckCircle, XCircle, Scan, Maximize, Minimize } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { parsePortList, PORT_SERVICES } from '@/lib/tools/port-scanner';
import { msg, useT } from '@/i18n';

const STATUS_LABEL = { open: msg('OPEN'), closed: msg('CLOSED'), filtered: msg('FILTERED') };

interface PortResult {
  port: number;
  status: 'open' | 'closed' | 'filtered';
  service: string;
  responseTime?: number;
}

const PortScanner = () => {
  const { t } = useT();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMobile = useIsMobile();
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [host, setHost] = useState('');
  const [ports, setPorts] = useState('80,443,22,21,25,53,110,143,993,995');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<PortResult[]>([]);
  const [progress, setProgress] = useState(0);
  const { trackAction } = useToolAnalytics();

  const commonPorts = PORT_SERVICES;

  const presetScans = [
    { name: msg('Common Ports'), ports: '21,22,23,25,53,80,110,143,443,993,995' },
    { name: msg('Web Servers'), ports: '80,443,8080,8443,8000,8001,8008,8888' },
    { name: msg('Databases'), ports: '3306,5432,1521,1433,6379,27017' },
    { name: msg('Mail Servers'), ports: '25,110,143,465,587,993,995' },
    { name: msg('Ports 1-100'), ports: '1-100' }
  ];

  const scanPorts = async () => {
    if (!host.trim()) {
      return;
    }

    const portList = parsePortList(ports);
    
    if (portList.length === 0) {
      return;
    }

    setScanning(true);
    setResults([]);
    setProgress(0);
    trackAction('start_port_scan');

    const scanResults: PortResult[] = [];
    
    for (let i = 0; i < portList.length; i++) {
      const port = portList[i];
      try {
        const result = await simulatePortScan(host, port);
        scanResults.push({
          port,
          status: result,
          service: (commonPorts[port] ? t(commonPorts[port]) : t('Unknown'))
        });
      } catch (error) {
        scanResults.push({
          port,
          status: 'filtered',
          service: (commonPorts[port] ? t(commonPorts[port]) : t('Unknown'))
        });
      }
      
      setProgress(((i + 1) / portList.length) * 100);
      setResults([...scanResults]);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    setScanning(false);
    trackAction('complete_port_scan');
  };

  // Browsers cannot open raw TCP/UDP sockets, so no packet is ever sent to the
  // target. Results are random and labelled as simulated in the UI.
  const simulatePortScan = async (_hostname: string, port: number): Promise<'open' | 'closed' | 'filtered'> => {
    const commonPortsList = [21, 22, 25, 53, 80, 110, 143, 443, 993, 995];
    const isCommonPort = commonPortsList.includes(port);
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
    
    const random = Math.random();
    if (isCommonPort) {
      return random < 0.3 ? 'open' : random < 0.8 ? 'closed' : 'filtered';
    } else {
      return random < 0.1 ? 'open' : random < 0.7 ? 'closed' : 'filtered';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'closed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'filtered':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-red-100 text-red-800';
      case 'filtered':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
              toolName={t('Port Scanner')}
            />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('Port Scanner Simulator')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('See what a port scan report looks like. Results are randomly simulated: nothing is sent to the target.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Network')}</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Security')}</Badge>
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

            <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800 mb-1">{t('Simulation only: this is not a real scan')}</p>
                    <p className="text-yellow-700">
                      {t('Web pages cannot open raw TCP or UDP connections, so this tool never contacts the host you enter. Every open, closed or filtered status below is generated at random to show how scan output reads. To check real ports, run Nmap or nc from a machine you control, and only scan systems you are authorised to test.')}
                    </p>
                  </div>
                </div>
              </div>
              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center gap-2">
                    <Scan className="h-5 w-5 text-blue-500" />
                    {t('Simulation Settings')}
                  </CardTitle>
                  <CardDescription>
                    {t('The host is only used as a label for the simulated report')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Target Host')}</label>
                    <Input
                      placeholder={t('Enter hostname or IP address (e.g., google.com or 8.8.8.8)')}
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Ports to Scan')}</label>
                    <Input
                      placeholder={t('Ports or ranges separated by commas (e.g., 22,80,443,8000-8010)')}
                      value={ports}
                      onChange={(e) => setPorts(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Quick Presets')}</label>
                    <div className="flex flex-wrap gap-2">
                      {presetScans.map((preset) => (
                        <Button
                          key={preset.name}
                          variant="outline"
                          size="sm"
                          onClick={() => setPorts(preset.ports)}
                          className="border-2 border-gray-300"
                        >
                          {t(preset.name)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  <Button 
                    onClick={scanPorts} 
                    disabled={scanning}
                    className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {scanning ? t('Simulating...') : t('Start Simulation')}
                  </Button>

                  {scanning && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{t('Simulation Progress')}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="w-full" />
                    </div>
                  )}
                </CardContent>
              </Card>

              {results.length > 0 && (
                <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-black text-lg sm:text-xl flex items-center gap-2">
                      <Shield className="h-5 w-5 text-green-500" />
                      {t('Simulated Results for {host}', { host })}
                    </CardTitle>
                    <CardDescription>
                      {t('{open} of {total} port(s) shown as open. These statuses are random, not measured.', { open: results.filter(r => r.status === 'open').length, total: results.length })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {results.map((result, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(result.status)}
                            <div>
                              <span className="font-mono font-medium">{t('Port {port}', { port: result.port })}</span>
                              <span className="text-gray-500 ml-2">({result.service})</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(result.status)}>
                              {t(STATUS_LABEL[result.status])}
                            </Badge>
                          </div>
                        </div>
                      ))}
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

export default PortScanner;
