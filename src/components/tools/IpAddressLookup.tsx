import React, { useState } from 'react';
import { Search, MapPin, Globe, Server, Loader2, ExternalLink, Copy, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { isValidIpForLookup } from '@/lib/tools/ip-address-lookup';
import { useT } from '@/i18n';
interface IpInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  loc: string;
  org: string;
  postal: string;
  timezone: string;
  hostname?: string;
  anycast?: boolean;
}

const IpAddressLookup = () => {
  const { t } = useT();
  const [ipAddress, setIpAddress] = useState('');
  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const validateIpAddress = isValidIpForLookup;

  const lookupIpAddress = async () => {
    if (!ipAddress.trim()) {
      toast({
        title: t('IP Address Required'),
        description: t('Please enter an IP address to lookup'),
        variant: "destructive"
      });
      return;
    }

    if (!validateIpAddress(ipAddress.trim())) {
      toast({
        title: t('Invalid IP Address'),
        description: t('Please enter a valid IPv4 or IPv6 address'),
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Using ipinfo.io API (free tier allows 50k requests/month)
      const response = await fetch(`https://ipinfo.io/${encodeURIComponent(ipAddress.trim())}/json`);
      
      if (!response.ok) {
        throw new Error(t('Failed to fetch IP information'));
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || t('Invalid IP address'));
      }

      setIpInfo(data);
      trackAction('ip-address-lookup', { ipType: validateIpAddress(ipAddress.trim()) ? 'valid' : 'invalid' });
      
      toast({
        title: t('Lookup Successful'),
        description: t('Information retrieved for {value}', { value: ipAddress.trim() })
      });
    } catch (error) {
      console.error('IP lookup error:', error);
      toast({
        title: t('Lookup Failed'),
        description: error instanceof Error ? error.message : t('Unable to retrieve IP information'),
        variant: "destructive"
      });
      setIpInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  const lookupMyIp = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('https://ipinfo.io/json');
      if (!response.ok) throw new Error(t('Failed to fetch IP information'));
      const data = await response.json();
      
      setIpAddress(data.ip);
      setIpInfo(data);
      trackAction('ip-address-lookup', { type: 'my-ip' });
      
      toast({
        title: t('Your IP Retrieved'),
        description: t('Your public IP address is {ip}', { ip: data.ip })
      });
    } catch (error) {
      console.error('My IP lookup error:', error);
      toast({
        title: t('Lookup Failed'),
        description: t('Unable to retrieve your IP information'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openInMaps = () => {
    if (ipInfo?.loc) {
      const [lat, lng] = ipInfo.loc.split(',');
      window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
    }
  };

  const relatedTools = [
    'dns-lookup',
    'subnet-calculator',
    'port-scanner',
    'network-tools',
    'ssl-checker'
  ];

  const InfoCard = ({ icon: Icon, title, value, copyValue, color = "text-cyan-600" }) => (
    <div className="group bg-white border-2 border-gray-200 rounded-2xl p-6 hover:border-gray-300 transition-all duration-200 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center">
            <Icon className={`h-6 w-6 ${color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-600 text-sm font-medium mb-1">{title}</p>
            <p className="text-black font-mono text-lg font-semibold break-all">{value || t('Loading...')}</p>
          </div>
        </div>
        {value && copyValue && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(copyValue, title)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black hover:bg-gray-100 h-9 w-9 p-0 flex-shrink-0"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied!'),
      description: t('{label} copied to clipboard', { label }),
    });
  };

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          <ToolBreadcrumb 
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Network Tools'), href: "/category/development-tech/network-tools" }}
            toolName={t('IP Address Lookup')}
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Globe className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('IP Address Lookup')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Discover detailed IP address information including location, ISP & network details')}</p>
              </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-cyan-500 text-cyan-600 px-3 py-1 bg-cyan-50 text-xs sm:text-sm">{t('Network')}</Badge>
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Lookup')}</Badge>
                </div>
              </div>
            </div>

          <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
          <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
            <CardHeader className="pb-6">
              <CardTitle className="text-black text-2xl flex items-center space-x-3">
                <Search className="h-7 w-7 text-cyan-600" />
                <span>{t('IP Address Information')}</span>
              </CardTitle>
              <CardDescription className="text-gray-600 text-base">
                {t('Enter an IPv4 or IPv6 address. The address is sent to ipinfo.io for the lookup.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2">
                <Input
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder={t('Enter IP address (e.g., 8.8.8.8)')}
                  onKeyPress={(e) => e.key === 'Enter' && lookupIpAddress()}
                  className="flex-1"
                />
                <Button 
                  onClick={lookupIpAddress} 
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  {t('Lookup')}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={lookupMyIp}
                  disabled={isLoading}
                  className="px-6 py-2 rounded-xl"
                >
                  {t('My IP')}
                </Button>
              </div>

              {ipInfo && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InfoCard
                    icon={Globe}
                    title={t('IP Address')}
                    value={ipInfo.ip}
                    copyValue={ipInfo.ip}
                    color="text-blue-600"
                  />
                  
                  {ipInfo.hostname && (
                    <InfoCard
                      icon={Server}
                      title={t('Hostname')}
                      value={ipInfo.hostname}
                      copyValue={ipInfo.hostname}
                      color="text-purple-600"
                    />
                  )}
                  
                  <InfoCard
                    icon={MapPin}
                    title={t('Location')}
                    value={ipInfo.city && ipInfo.country ? `${ipInfo.city}, ${ipInfo.country}` : t('Unknown')}
                    copyValue={ipInfo.city && ipInfo.country ? `${ipInfo.city}, ${ipInfo.country}` : ''}
                    color="text-green-600"
                  />
                  
                  <InfoCard
                    icon={Server}
                    title={t('Organization')}
                    value={ipInfo.org || t('Unknown')}
                    copyValue={ipInfo.org}
                    color="text-orange-600"
                  />
                  
                  {ipInfo.timezone && (
                    <InfoCard
                      icon={Clock}
                      title={t('Timezone')}
                      value={ipInfo.timezone}
                      copyValue={ipInfo.timezone}
                      color="text-cyan-600"
                    />
                  )}
                  
                  <InfoCard
                    icon={Globe}
                    title={t('IP Type')}
                    value={ipInfo.ip.includes(':') ? 'IPv6' : 'IPv4'}
                    copyValue={ipInfo.ip.includes(':') ? 'IPv6' : 'IPv4'}
                    color="text-indigo-600"
                  />
                </div>
              )}

              {ipInfo?.loc && (
                <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-green-600" />
                      {t('Coordinates')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <span className="text-black font-mono text-sm">{ipInfo.loc}</span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(ipInfo.loc, t('Coordinates'))}
                          className="text-gray-500 hover:text-black h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={openInMaps}
                          className="h-8 px-3"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          {t('Maps')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!ipInfo && !isLoading && (
                <Card className="border-dashed bg-gray-50">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Globe className="h-12 w-12 text-gray-500 mb-4" />
                    <p className="text-lg font-medium text-gray-500 mb-2">
                      {t('No IP information available')}
                    </p>
                    <p className="text-sm text-gray-500 text-center">
                      {t('Enter an IP address above to get detailed geolocation and network information')}
                    </p>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
          </div>
          
        </div>
      </div>
    </>
  );
};

export default IpAddressLookup;