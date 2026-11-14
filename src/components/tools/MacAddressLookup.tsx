import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Network, Search, Shuffle, Copy, Info, AlertCircle, Maximize, Minimize, Building, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { OUI_TABLE, normalizeMac, analyzeMac } from '@/lib/tools/mac-address-lookup';
import { msg, useT } from '@/i18n';

const MacAddressLookup = () => {
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
  
  const [macAddress, setMacAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [vendorInfo, setVendorInfo] = useState<any>(null);
  const [error, setError] = useState('');

  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const macDatabase = OUI_TABLE;

  const lookupMacAddress = async () => {
    if (!macAddress.trim()) {
      setError(t('Please enter a MAC address'));
      return;
    }

    const normalizedMac = normalizeMac(macAddress);

    if (!normalizedMac) {
      setError(t('Please enter 12 hex digits, e.g. 00:1A:2B:3C:4D:5E, 00-1A-2B-3C-4D-5E or 001a.2b3c.4d5e'));
      return;
    }

    setLoading(true);
    setError('');
    setVendorInfo(null);

    try {
      const analysis = analyzeMac(normalizedMac);
      const vendor = analysis.vendor ?? {
        vendor: analysis.isLocal ? msg('None (locally administered address)') : msg('Not in built-in table'),
        type: analysis.isLocal ? msg('Randomized or virtual') : msg('Unknown'),
        country: msg('Unknown')
      };

      setVendorInfo({ ...analysis, ...vendor });

      trackAction('lookup_mac_address', { vendor: vendor.vendor });
      toast({
        title: t('MAC Address Analyzed'),
        description: analysis.vendor ? t('Vendor found for {normalizedMac}', { normalizedMac }) : t('No vendor match for {normalizedMac}', { normalizedMac }),
      });

    } catch (err) {
      setError(t('Failed to lookup MAC address'));
      console.error('MAC lookup error:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateRandomMac = () => {
    const vendors = Object.keys(macDatabase);
    const randomVendor = vendors[Math.floor(Math.random() * vendors.length)];
    const randomSuffix = Array.from({ length: 3 }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()
    ).join(':');
    
    setMacAddress(`${randomVendor}:${randomSuffix}`);
    trackAction('generate_random_mac');
  };

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          <ToolBreadcrumb 
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Network Tools'), href: "/category/development-tech/network-tools" }}
            toolName={t('MAC Address Lookup')}
          />
          
          <div className="tool-header mt-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Network className="h-8 w-8 text-blue-600" />
                {t('MAC Address Lookup')}
              </h1>
              <p className="text-gray-600">
                {t('Find the manufacturer prefix (OUI) and address type of a MAC address')}
              </p>
            </div>
          </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              {t('Lookup MAC Address')}
            </CardTitle>
            <CardDescription>
              {t('Enter a MAC address to identify the vendor and device information')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder={t('00:1A:2B:3C:4D:5E, 00-1A-2B-3C-4D-5E or 001a.2b3c.4d5e')}
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && lookupMacAddress()}
                className="font-mono"
              />
              <Button onClick={lookupMacAddress} disabled={loading}>
                {loading ? t('Looking up...') : t('Lookup')}
              </Button>
              <Button variant="outline" onClick={generateRandomMac}>
                {t('Random')}
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {vendorInfo && (
              <div className="space-y-4">
                <Separator />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        {t('Vendor Information')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-600">{t('Vendor')}</label>
                        <p className="font-semibold text-lg">{vendorInfo.vendor === 'None (locally administered address)' || vendorInfo.vendor === 'Not in built-in table' ? t(vendorInfo.vendor) : vendorInfo.vendor}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">{t('Device Type')}</label>
                        <Badge variant="outline" className="ml-2">
                          {t(vendorInfo.type)}
                        </Badge>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">{t('Country')}</label>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-500" />
                          <span>{t(vendorInfo.country)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Network className="h-4 w-4" />
                        {t('Address Details')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-600">{t('Full Address')}</label>
                        <p className="font-mono text-sm bg-gray-50 p-2 rounded">
                          {vendorInfo.fullMac}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">{t('OUI (Vendor Prefix)')}</label>
                        <p className="font-mono text-sm bg-gray-50 p-2 rounded">
                          {vendorInfo.oui}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">{t('Address Type')}</label>
                        <Badge variant={
                          vendorInfo.addressType === 'Universally Administered' ? 'default' :
                          vendorInfo.addressType === 'Locally Administered' ? 'secondary' : 'destructive'
                        }>
                          {t(vendorInfo.addressType)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{t('Address Analysis')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-lg font-semibold">
                          {vendorInfo.isMulticast ? t('Yes') : t('No')}
                        </div>
                        <div className="text-sm text-gray-600">{t('Multicast')}</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-lg font-semibold">
                          {vendorInfo.isLocal ? t('Yes') : t('No')}
                        </div>
                        <div className="text-sm text-gray-600">{t('Local Admin')}</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-lg font-semibold">
                          {vendorInfo.oui.split(':').length}
                        </div>
                        <div className="text-sm text-gray-600">{t('OUI Octets')}</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-lg font-semibold">48</div>
                        <div className="text-sm text-gray-600">{t('Bits Total')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
          
        </div>
      </div>
    </>
  );
};

export default MacAddressLookup;