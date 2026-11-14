
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, Globe, ArrowLeftRight, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { parseIPv4, parseIPv4Integer, intToIPv4, ipv4ToHex, ipv4ToBinary } from '@/lib/tools/ip-converter';
import { useT } from '@/i18n';

const IpConverter = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [ipInput, setIpInput] = useState('');
  const [decimalInput, setDecimalInput] = useState('');
  const [ipResult, setIpResult] = useState('');
  const [decimalResult, setDecimalResult] = useState('');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const [hexResult, setHexResult] = useState('');
  const [binaryResult, setBinaryResult] = useState('');

  const ipToDecimal = () => {
    try {
      const decimal = parseIPv4(ipInput);
      setDecimalResult(decimal.toString());
      setHexResult(ipv4ToHex(decimal));
      setBinaryResult(ipv4ToBinary(decimal));
      setError('');
      trackAction('ip_to_decimal');
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Invalid IP address'));
      setDecimalResult('');
      setHexResult('');
      setBinaryResult('');
    }
  };

  const decimalToIp = () => {
    try {
      setIpResult(intToIPv4(parseIPv4Integer(decimalInput)));
      setError('');
      trackAction('decimal_to_ip');
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Invalid decimal number'));
      setIpResult('');
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied'),
      description: t('{type} copied to clipboard!', { type }),
    });
  };

  const clearAll = () => {
    setIpInput('');
    setDecimalInput('');
    setIpResult('');
    setDecimalResult('');
    setHexResult('');
    setBinaryResult('');
    setError('');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Handle ESC key for fullscreen exit
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-black dark:text-white">{t('IPv4 Address Converter')}</h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">{t('Convert IPv4 addresses to decimal, hex and binary, and integers back to dotted form')}</p>
            </div>
            <Button onClick={toggleFullscreen} variant="outline" size="lg" className="border-2 border-gray-300 dark:border-gray-600">
              <Minimize2 className="h-5 w-5 mr-2" />
              {t('Exit Fullscreen')}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-black dark:text-white flex items-center text-xl">
                  <Globe className="h-6 w-6 mr-3" />
                  {t('IP to Decimal')}
                </CardTitle>
                <CardDescription>{t('Convert an IPv4 address to decimal, hex and binary')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-black dark:text-white text-sm mb-2 block">{t('IP Address')}</label>
                  <Input
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    placeholder="192.168.1.1"
                    className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                  />
                </div>
                
                <Button onClick={ipToDecimal} className="bg-blue-600 hover:bg-blue-700 w-full">
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  {t('Convert to Decimal')}
                </Button>

                {decimalResult && (
                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-300 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-gray-600 dark:text-gray-400 text-sm">{t('Decimal Result:')}</label>
                        <div className="text-green-600 dark:text-green-400 font-mono text-lg">{decimalResult}</div>
                        <div className="text-gray-600 dark:text-gray-400 font-mono text-xs mt-1">Hex: {hexResult}</div>
                        <div className="text-gray-600 dark:text-gray-400 font-mono text-xs break-all">Binary: {binaryResult}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(decimalResult, t('Decimal'))}
                        className="border-gray-300 dark:border-gray-600"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-black dark:text-white flex items-center text-xl">
                  <Globe className="h-6 w-6 mr-3" />
                  {t('Decimal to IP')}
                </CardTitle>
                <CardDescription>{t('Convert a decimal (or 0x hex) number to an IPv4 address')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-black dark:text-white text-sm mb-2 block">{t('Decimal Number')}</label>
                  <Input
                    value={decimalInput}
                    onChange={(e) => setDecimalInput(e.target.value)}
                    placeholder="3232235777"
                    className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                  />
                </div>
                
                <Button onClick={decimalToIp} className="bg-green-600 hover:bg-green-700 w-full">
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  {t('Convert to IP')}
                </Button>

                {ipResult && (
                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-300 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-gray-600 dark:text-gray-400 text-sm">{t('IP Result:')}</label>
                        <div className="text-blue-600 dark:text-blue-400 font-mono text-lg">{ipResult}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(ipResult, t('IP Address'))}
                        className="border-gray-300 dark:border-gray-600"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Examples and Info */}
          <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-black dark:text-white text-xl">{t('Examples & Information')}</CardTitle>
              <CardDescription>{t('Common IP addresses and their decimal equivalents')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <div className="text-black dark:text-white font-semibold">{t('Localhost')}</div>
                  <div className="text-blue-600 dark:text-blue-400 font-mono">127.0.0.1</div>
                  <div className="text-green-600 dark:text-green-400 font-mono">2130706433</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <div className="text-black dark:text-white font-semibold">{t('Private Network')}</div>
                  <div className="text-blue-600 dark:text-blue-400 font-mono">192.168.1.1</div>
                  <div className="text-green-600 dark:text-green-400 font-mono">3232235777</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <div className="text-black dark:text-white font-semibold">{t('Google DNS')}</div>
                  <div className="text-blue-600 dark:text-blue-400 font-mono">8.8.8.8</div>
                  <div className="text-green-600 dark:text-green-400 font-mono">134744072</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                  <div className="text-black dark:text-white font-semibold">{t('Broadcast')}</div>
                  <div className="text-blue-600 dark:text-blue-400 font-mono">255.255.255.255</div>
                  <div className="text-green-600 dark:text-green-400 font-mono">4294967295</div>
                </div>
              </div>

              <div className="mt-4 flex space-x-2">
                <Button onClick={clearAll} variant="outline" className="border-gray-300 dark:border-gray-600">
                  {t('Clear All')}
                </Button>
              </div>

              {error && (
                <div className="mt-4 text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          <ToolBreadcrumb 
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Network Tools'), href: "/category/development-tech/network-tools" }}
            toolName={t('IP Converter')}
          />
          
          <div className="tool-header mt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-4xl font-bold text-black dark:text-white flex items-center gap-3">
                  <Globe className="h-10 w-10 text-blue-600" />
                  {t('IPv4 Address Converter')}
                </h1>
                <p className="text-gray-600 dark:text-gray-400 text-lg">{t('Convert IPv4 addresses to decimal, hex and binary, and integers back to dotted form')}</p>
              </div>
              <div className="flex items-center space-x-3">
                <Button onClick={toggleFullscreen} variant="outline" className="border-2 border-gray-300 dark:border-gray-600">
                  <Maximize2 className="h-4 w-4 mr-2" />
                  {t('Fullscreen')}
                </Button>
                <div className="flex space-x-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950">IP</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950">{t('Decimal')}</Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
          <CardHeader>
            <CardTitle className="text-black dark:text-white flex items-center text-xl">
              <Globe className="h-5 w-5 mr-3" />
              {t('IP to Decimal')}
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">{t('Convert an IPv4 address to decimal, hex and binary')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-black dark:text-white text-sm mb-2 block">{t('IP Address')}</label>
              <Input
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="192.168.1.1"
                className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
              />
            </div>
            
            <Button onClick={ipToDecimal} className="bg-blue-600 hover:bg-blue-700 w-full">
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              {t('Convert to Decimal')}
            </Button>

            {decimalResult && (
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-300 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-gray-600 dark:text-gray-400 text-sm">{t('Decimal Result:')}</label>
                    <div className="text-green-600 dark:text-green-400 font-mono text-lg">{decimalResult}</div>
                    <div className="text-gray-600 dark:text-gray-400 font-mono text-xs mt-1">Hex: {hexResult}</div>
                    <div className="text-gray-600 dark:text-gray-400 font-mono text-xs break-all">Binary: {binaryResult}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(decimalResult, t('Decimal'))}
                    className="border-gray-300 dark:border-gray-600"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
          <CardHeader>
            <CardTitle className="text-black dark:text-white flex items-center text-xl">
              <Globe className="h-5 w-5 mr-3" />
              {t('Decimal to IP')}
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">{t('Convert a decimal (or 0x hex) number to an IPv4 address')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-black dark:text-white text-sm mb-2 block">{t('Decimal Number')}</label>
              <Input
                value={decimalInput}
                onChange={(e) => setDecimalInput(e.target.value)}
                placeholder="3232235777"
                className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
              />
            </div>
            
            <Button onClick={decimalToIp} className="bg-green-600 hover:bg-green-700 w-full">
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              {t('Convert to IP')}
            </Button>

            {ipResult && (
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-300 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-gray-600 dark:text-gray-400 text-sm">{t('IP Result:')}</label>
                    <div className="text-blue-600 dark:text-blue-400 font-mono text-lg">{ipResult}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(ipResult, t('IP Address'))}
                    className="border-gray-300 dark:border-gray-600"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Examples and Info */}
      <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
        <CardHeader>
          <CardTitle className="text-black dark:text-white text-xl">{t('Examples & Information')}</CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">{t('Common IP addresses and their decimal equivalents')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div className="text-black dark:text-white font-semibold">{t('Localhost')}</div>
              <div className="text-blue-600 dark:text-blue-400 font-mono">127.0.0.1</div>
              <div className="text-green-600 dark:text-green-400 font-mono">2130706433</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div className="text-black dark:text-white font-semibold">{t('Private Network')}</div>
              <div className="text-blue-600 dark:text-blue-400 font-mono">192.168.1.1</div>
              <div className="text-green-600 dark:text-green-400 font-mono">3232235777</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div className="text-black dark:text-white font-semibold">{t('Google DNS')}</div>
              <div className="text-blue-600 dark:text-blue-400 font-mono">8.8.8.8</div>
              <div className="text-green-600 dark:text-green-400 font-mono">134744072</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div className="text-black dark:text-white font-semibold">{t('Broadcast')}</div>
              <div className="text-blue-600 dark:text-blue-400 font-mono">255.255.255.255</div>
              <div className="text-green-600 dark:text-green-400 font-mono">4294967295</div>
            </div>
          </div>

          <div className="mt-4 flex space-x-2">
            <Button onClick={clearAll} variant="outline" className="border-gray-300 dark:border-gray-600">
              {t('Clear All')}
            </Button>
          </div>

          {error && (
            <div className="mt-4 text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
      
        </div>
      </div>
    </>
  );
};

export default IpConverter;
