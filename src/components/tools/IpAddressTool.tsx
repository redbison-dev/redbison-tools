
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, Copy, RefreshCw, MapPin, Server, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { msg, useT } from '@/i18n';

// Placeholder values (kept in state, translated where shown).
const UNKNOWN = msg('Unknown');
const NOT_AVAILABLE = msg('Not available');
const UNABLE = msg('Unable to fetch');
/** Line labels of the copied summary (the state keys in capitals). */
const COPY_LABELS = {
  ipv4: msg('IPV4'), ipv6: msg('IPV6'), country: msg('COUNTRY'), city: msg('CITY'), region: msg('REGION'),
  timezone: msg('TIMEZONE'), isp: msg('ISP'), org: msg('ORG'), as: msg('AS'),
};

const IpAddressTool = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [ipInfo, setIpInfo] = useState({
    ipv4: '',
    ipv6: '',
    country: '',
    city: '',
    region: '',
    timezone: '',
    isp: '',
    org: '',
    as: ''
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const fetchIpInfo = async () => {
    setLoading(true);
    try {
      // First get IPv4 address
      const ipv4Response = await fetch('https://api.ipify.org?format=json');
      const ipv4Data = await ipv4Response.json();
      
      // Try to get IPv6 address separately
      let ipv6Address = '';
      try {
        const ipv6Response = await fetch('https://api64.ipify.org?format=json');
        const ipv6Data = await ipv6Response.json();
        // Only set IPv6 if it's actually different from IPv4 and contains colons
        if (ipv6Data.ip && ipv6Data.ip !== ipv4Data.ip && ipv6Data.ip.includes(':')) {
          ipv6Address = ipv6Data.ip;
        }
      } catch {
        // IPv6 not available
      }

      // Get detailed location info using IPv4
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        // ipapi.co answers rate limits with { error: true, reason }
        if (!response.ok || data.error) throw new Error(data.reason || t('Location lookup failed'));
        
        setIpInfo({
          ipv4: ipv4Data.ip || UNKNOWN,
          ipv6: ipv6Address || NOT_AVAILABLE,
          country: data.country_name || UNKNOWN,
          city: data.city || UNKNOWN,
          region: data.region || UNKNOWN,
          timezone: data.timezone || UNKNOWN,
          isp: data.org || UNKNOWN,
          org: data.org || UNKNOWN,
          as: data.asn || UNKNOWN
        });
      } catch (error) {
        // Fallback with basic info
        setIpInfo({
          ipv4: ipv4Data.ip || UNABLE,
          ipv6: ipv6Address || NOT_AVAILABLE,
          country: UNKNOWN,
          city: UNKNOWN,
          region: UNKNOWN,
          timezone: UNKNOWN,
          isp: UNKNOWN,
          org: UNKNOWN,
          as: UNKNOWN
        });
      }
    } catch (error) {
      // Without this the rows would keep showing "Loading..." forever.
      setIpInfo({
        ipv4: UNABLE,
        ipv6: NOT_AVAILABLE,
        country: UNKNOWN,
        city: UNKNOWN,
        region: UNKNOWN,
        timezone: UNKNOWN,
        isp: UNKNOWN,
        org: UNKNOWN,
        as: UNKNOWN
      });
      toast({
        title: t('Error'),
        description: t('Failed to fetch IP information'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied!'),
      description: t('{label} copied to clipboard', { label }),
    });
  };

  const copyAllInfo = () => {
    const allInfo = Object.entries(ipInfo)
      .filter(([key, value]) => value !== NOT_AVAILABLE && value !== UNKNOWN)
      .map(([key, value]) => `${t(COPY_LABELS[key as keyof typeof COPY_LABELS])}: ${value === UNABLE ? t(value) : value}`)
      .join('\n');
    
    navigator.clipboard.writeText(allInfo);
    toast({
      title: t('Copied!'),
      description: t('All IP information copied to clipboard'),
    });
  };

  useEffect(() => {
    fetchIpInfo();
  }, []);

  const InfoRow = ({ icon: Icon, label, value, color = "text-cyan-600" }) => (
    <div className="group flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors">
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center flex-shrink-0">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-lg font-mono font-semibold text-black break-words">{value ? (([UNKNOWN, NOT_AVAILABLE, UNABLE] as string[]).includes(value) ? t(value) : value) : t('Loading...')}</p>
        </div>
      </div>
      {value && value !== NOT_AVAILABLE && value !== UNKNOWN && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copyToClipboard(value, label)}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black hover:bg-white flex-shrink-0"
        >
          <Copy className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          <ToolBreadcrumb 
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Network Tools'), href: "/category/development-tech/network-tools" }}
            toolName={t('What is My IP Address?')}
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center gap-3">
                  <Globe className="h-8 w-8 sm:h-10 sm:w-10 text-blue-600" />
                  {t('What Is My IP Address')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Find your public IP address and location information instantly')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="border-cyan-500 text-cyan-600 px-4 py-2 bg-cyan-50">{t('Network')}</Badge>
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-4 py-2 bg-blue-50">IP</Badge>
                <Button
                  onClick={fetchIpInfo}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {t('Refresh')}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-8 mt-8">
            <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
              <CardHeader className="pb-6">
                <CardTitle className="text-black text-2xl flex items-center space-x-3">
                  <Globe className="h-7 w-7 text-cyan-600" />
                  <span>{t('Your IP Information')}</span>
                </CardTitle>
                <CardDescription className="text-gray-600 text-base">
                  {t('Fetched from api.ipify.org (IP) and ipapi.co (approximate location and ISP)')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow
                  icon={Globe}
                  label={t('IPv4 Address')}
                  value={ipInfo.ipv4}
                  color="text-blue-600"
                />
                
                {ipInfo.ipv6 !== NOT_AVAILABLE && (
                  <InfoRow
                    icon={Globe}
                    label={t('IPv6 Address')}
                    value={ipInfo.ipv6}
                    color="text-purple-600"
                  />
                )}
                
                <InfoRow
                  icon={MapPin}
                  label={t('Country')}
                  value={ipInfo.country}
                  color="text-green-600"
                />
                
                <InfoRow
                  icon={MapPin}
                  label={t('City')}
                  value={ipInfo.city}
                  color="text-green-600"
                />
                
                <InfoRow
                  icon={MapPin}
                  label={t('Region')}
                  value={ipInfo.region}
                  color="text-purple-600"
                />
                
                <InfoRow
                  icon={Server}
                  label={t('ISP/Organization')}
                  value={ipInfo.isp}
                  color="text-orange-600"
                />
                
                <div className="pt-4 border-t border-gray-200">
                  <Button
                    onClick={copyAllInfo}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-3 rounded-xl font-medium"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('Copy All Information')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-cyan-200 rounded-2xl">
              <CardContent className="p-8">
                <div className="text-center space-y-4">
                  <Shield className="h-12 w-12 text-cyan-600 mx-auto" />
                  <h3 className="text-xl font-bold text-gray-800">{t('Privacy Note')}</h3>
                  <p className="text-gray-600 leading-relaxed">
                    {t('This tool shows your public IP address - the address that websites see when you visit them. Your IP address can reveal your approximate location and internet service provider, but not your exact physical address or personal information.')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          
        </div>
      </div>
    </>
  );
};

export default IpAddressTool;
