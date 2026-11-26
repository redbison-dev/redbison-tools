import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, Wifi, Copy, RefreshCw, MapPin, Server, Monitor, Languages, Clock, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { msg, useT } from '@/i18n';

/** Labels of the copied summary, as the key names spell out in English. */
const INFO_LABELS: Record<string, string> = {
  publicIPv4: msg('Public I Pv4'),
  publicIPv6: msg('Public I Pv6'),
  userAgent: msg('User Agent'),
  language: msg('Language'),
  platform: msg('Platform'),
  timezone: msg('Timezone'),
  screenResolution: msg('Screen Resolution'),
  cookieEnabled: msg('Cookie Enabled'),
  onlineStatus: msg('Online Status'),
  connectionType: msg('Connection Type'),
  country: msg('Country'),
  city: msg('City'),
  isp: msg('Isp'),
};

const NetworkTools = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [networkInfo, setNetworkInfo] = useState({
    publicIPv4: '',
    publicIPv6: '',
    userAgent: '',
    language: '',
    platform: '',
    timezone: '',
    screenResolution: '',
    cookieEnabled: '',
    onlineStatus: '',
    connectionType: '',
    country: '',
    city: '',
    isp: ''
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const fetchNetworkInfo = async () => {
    setLoading(true);
    trackAction('fetch_network_info');
    try {
      // Get basic browser info
      const basicInfo = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screenResolution: `${screen.width} x ${screen.height}`,
        cookieEnabled: navigator.cookieEnabled ? t('Enabled') : t('Disabled'),
        onlineStatus: navigator.onLine ? t('Online') : t('Offline'),
        connectionType: (navigator as any).connection?.effectiveType || t('Unknown'),
        publicIPv4: '',
        publicIPv6: '',
        country: '',
        city: '',
        isp: ''
      };

      // Get IPv4 address
      try {
        const ipv4Response = await fetch('https://api.ipify.org?format=json');
        const ipv4Data = await ipv4Response.json();
        basicInfo.publicIPv4 = ipv4Data.ip;
      } catch {
        basicInfo.publicIPv4 = t('Unable to fetch');
      }

      // Try to get IPv6 address separately
      try {
        const ipv6Response = await fetch('https://api64.ipify.org?format=json');
        const ipv6Data = await ipv6Response.json();
        // Check if it's actually IPv6 (contains colons) and different from IPv4
        if (ipv6Data.ip && ipv6Data.ip.includes(':') && ipv6Data.ip !== basicInfo.publicIPv4) {
          basicInfo.publicIPv6 = ipv6Data.ip;
        } else {
          basicInfo.publicIPv6 = t('Not available');
        }
      } catch {
        basicInfo.publicIPv6 = t('Not available');
      }

      // Try to get more detailed location info
      try {
        const detailResponse = await fetch('https://ipapi.co/json/');
        const detailData = await detailResponse.json();
        if (!detailResponse.ok || detailData.error) throw new Error(detailData.reason || 'Location lookup failed');
        
        setNetworkInfo({
          ...basicInfo,
          country: detailData.country_name || t('Unknown'),
          city: detailData.city || t('Unknown'),
          isp: detailData.org || t('Unknown')
        });
      } catch {
        setNetworkInfo({
          ...basicInfo,
          country: t('Unknown'),
          city: t('Unknown'),
          isp: t('Unknown')
        });
      }
    } catch (error) {
      toast({
        title: t('Error'),
        description: t('Failed to fetch network information'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    trackAction('copy_network_info', { type: label });
    toast({
      title: t('Copied!'),
      description: t('{label} copied to clipboard', { label: t(label) }),
    });
  };

  const copyAllInfo = () => {
    const allInfo = Object.entries(networkInfo)
      .map(([key, value]) => `${INFO_LABELS[key] ? t(INFO_LABELS[key]) : key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${value}`)
      .join('\n');
    
    navigator.clipboard.writeText(allInfo);
    trackAction('copy_all_network_info');
    toast({
      title: t('Copied!'),
      description: t('All network information copied to clipboard'),
    });
  };

  useEffect(() => {
    fetchNetworkInfo();
  }, []);

  const InfoCard = ({ icon: Icon, title, value, color = "text-cyan-400" }) => (
    <div className="group bg-white border-2 border-gray-200 rounded-2xl p-6 hover:border-gray-300 transition-all duration-200 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center">
            <Icon className={`h-6 w-6 text-cyan-600`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-600 text-sm font-medium mb-1">{title}</p>
            <p className="text-black font-mono text-lg font-semibold break-all">{value || t('Loading...')}</p>
          </div>
        </div>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(value, title)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black hover:bg-gray-100 h-9 w-9 p-0 flex-shrink-0"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          <ToolBreadcrumb 
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Network Tools'), href: "/category/development-tech/network-tools" }}
            toolName="Network Tools"
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center gap-3">
                  <Wifi className="h-8 w-8 sm:h-10 sm:w-10 text-blue-600" />
                  {t('Network and Browser Info')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Your public IPs (via ipify), approximate location and ISP (via ipapi.co), and what your browser reports about itself')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="border-cyan-500 text-cyan-600 px-4 py-2 bg-cyan-50">{t('Network')}</Badge>
                <Badge variant="outline" className="border-emerald-500 text-emerald-600 px-4 py-2 bg-emerald-50">{t('Info')}</Badge>
                <Button
                  onClick={fetchNetworkInfo}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <InfoCard
                icon={Globe}
                title={t('Public IPv4')}
                value={networkInfo.publicIPv4}
                color="text-emerald-600"
              />
              
              <InfoCard
                icon={Globe}
                title={t('Public IPv6')}
                value={networkInfo.publicIPv6}
                color="text-blue-600"
              />
              
              <InfoCard
                icon={MapPin}
                title={t('Location')}
                value={networkInfo.city && networkInfo.country ? `${networkInfo.city}, ${networkInfo.country}` : t('Unknown')}
                color="text-purple-600"
              />
              
              <InfoCard
                icon={Server}
                title="ISP"
                value={networkInfo.isp}
                color="text-orange-600"
              />
              
              <InfoCard
                icon={Wifi}
                title={t('Effective Connection Type')}
                value={networkInfo.connectionType}
                color="text-cyan-600"
              />
              
              <InfoCard
                icon={Globe}
                title={t('Online Status')}
                value={networkInfo.onlineStatus}
                color={networkInfo.onlineStatus === t('Online') ? "text-emerald-600" : "text-red-600"}
              />
            </div>

            <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
              <CardHeader className="pb-6">
                <CardTitle className="text-black text-2xl flex items-center space-x-3">
                  <Monitor className="h-7 w-7 text-cyan-600" />
                  <span>{t('System Information')}</span>
                </CardTitle>
                <CardDescription className="text-gray-600 text-base">
                  {t('Browser and system details')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div className="group">
                      <div className="flex items-center space-x-2 mb-3">
                        <Monitor className="h-4 w-4 text-gray-500" />
                        <label className="text-gray-700 text-sm font-medium">{t('Platform')}</label>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <span className="text-black font-mono text-sm">{networkInfo.platform}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(networkInfo.platform, msg('Platform'))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="group">
                      <div className="flex items-center space-x-2 mb-3">
                        <Languages className="h-4 w-4 text-gray-500" />
                        <label className="text-gray-700 text-sm font-medium">{t('Language')}</label>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <span className="text-black font-mono text-sm">{networkInfo.language}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(networkInfo.language, msg('Language'))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="group">
                      <div className="flex items-center space-x-2 mb-3">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <label className="text-gray-700 text-sm font-medium">{t('Timezone')}</label>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <span className="text-black font-mono text-sm">{networkInfo.timezone}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(networkInfo.timezone, msg('Timezone'))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="group">
                      <div className="flex items-center space-x-2 mb-3">
                        <Monitor className="h-4 w-4 text-gray-500" />
                        <label className="text-gray-700 text-sm font-medium">{t('Screen Resolution')}</label>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <span className="text-black font-mono text-sm">{networkInfo.screenResolution}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(networkInfo.screenResolution, msg('Screen Resolution'))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="group">
                      <div className="flex items-center space-x-2 mb-3">
                        <Shield className="h-4 w-4 text-gray-500" />
                        <label className="text-gray-700 text-sm font-medium">{t('Cookies')}</label>
                      </div>
                      <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <span className="text-black font-mono text-sm">{networkInfo.cookieEnabled}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(networkInfo.cookieEnabled, msg('Cookie Status'))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="group">
                  <div className="flex items-center space-x-2 mb-3">
                    <Globe className="h-4 w-4 text-gray-500" />
                    <label className="text-gray-700 text-sm font-medium">{t('User Agent')}</label>
                  </div>
                  <div className="flex items-start justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <span className="text-black font-mono text-xs break-all pr-4 leading-relaxed">{networkInfo.userAgent}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(networkInfo.userAgent, msg('User Agent'))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-500 hover:text-black h-8 w-8 p-0 flex-shrink-0 mt-1"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
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
          </div>
          
        </div>
      </div>
    </>
  );
};

export default NetworkTools;
