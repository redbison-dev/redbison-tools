import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Key, Shield, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { decodeJwt } from '@/lib/tools/jwt-decoder';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const JwtTool = () => {
  const { t, tr } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [jwtToken, setJwtToken] = useState('');
  const [decodedHeader, setDecodedHeader] = useState('');
  const [decodedPayload, setDecodedPayload] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { jwtToken };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    const sampleJWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    setJwtToken(sampleJWT);
    trackAction('load_sample_jwt');
    toast({ title: t('Sample Loaded'), description: t('Sample JWT token loaded successfully!') });
  });

  const decodeJWT = () => {
    try {
      const { header, payload } = decodeJwt(jwtToken);
      setDecodedHeader(JSON.stringify(header, null, 2));

      setDecodedPayload(JSON.stringify(payload, null, 2));

      trackAction('decode_jwt');
      toast({ title: t('Success'), description: t('JWT decoded successfully!') });
    } catch (error) {
      toast({ 
        title: t('Error'), 
        description: t('Invalid JWT token'), 
        variant: "destructive" 
      });
      setDecodedHeader('');
      setDecodedPayload('');
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    trackAction('copy_jwt_data', { type });
    toast({ title: t('Copied'), description: t('{type} copied to clipboard!', { type }) });
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

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('converted', (decodedHeader || decodedPayload) && `${decodedHeader}\u0000${decodedPayload}`);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-black dark:text-white">{t('JWT Decoder')}</h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">{t('Decode and inspect JWT tokens')}</p>
            </div>
            <Button onClick={toggleFullscreen} variant="outline" size="lg" className="border-2 border-gray-300 dark:border-gray-600">
              <Minimize2 className="h-5 w-5 mr-2" />
              {t('Exit Fullscreen')}
            </Button>
          </div>

          <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-black dark:text-white flex items-center text-xl">
                <Key className="h-6 w-6 mr-3" />
                {t('JWT Token Input')}
              </CardTitle>
              <CardDescription>{t('Paste your JWT token to decode')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={jwtToken}
                onChange={(e) => setJwtToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="min-h-[120px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono text-sm"
              />
              <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
                <Button onClick={decodeJWT} className="bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200">
                  <Shield className="h-4 w-4 mr-2" />
                  {t('Decode JWT')}
                </Button>
                <Button onClick={loadSample} variant="outline" className="border-2 border-gray-300 dark:border-gray-600">
                  {t('Load Sample')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-black dark:text-white flex items-center justify-between text-xl">
                  <span>{t('Header')}</span>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(decodedHeader, t('Header'))} disabled={!decodedHeader}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={decodedHeader}
                  readOnly
                  className="min-h-[300px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder={t('JWT header will appear here...')}
                />
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-black dark:text-white flex items-center justify-between text-xl">
                  <span>{t('Payload')}</span>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(decodedPayload, t('Payload'))} disabled={!decodedPayload}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={decodedPayload}
                  readOnly
                  className="min-h-[300px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder={t('JWT payload will appear here...')}
                />
              </CardContent>
            </Card>
          </div>
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          <ToolBreadcrumb
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
            toolName={t('JWT Decoder')}
          />
          
          <div className="tool-header mt-6">
          <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-black dark:text-white flex items-center gap-3">
                <Key className="h-8 w-8 text-blue-600" />
                {t('JWT Decoder')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">{t('Decode and inspect JWT tokens')}</p>
            </div>
            <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-3">
              {!isMobile && (
                <Button onClick={toggleFullscreen} variant="outline" className="border-2 border-gray-300 dark:border-gray-600">
                  <Maximize2 className="h-4 w-4 mr-2" />
                  {t('Fullscreen')}
                </Button>
              )}
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <Badge variant="outline" className="border-cyan-500 text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950">JWT</Badge>
                <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950">{t('Decoder')}</Badge>
              </div>
            </div>
          </div>
          </div>

          <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
            <CardHeader>
              <CardTitle className="text-black dark:text-white flex items-center text-lg sm:text-xl">
                <Key className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                {t('JWT Token Input')}
              </CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">{t('Paste your JWT token to decode')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={jwtToken}
                onChange={(e) => setJwtToken(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="min-h-[100px] sm:min-h-[120px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono text-xs sm:text-sm"
              />
              <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
                <Button onClick={decodeJWT} className="w-full sm:w-auto bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200">
                  <Shield className="h-4 w-4 mr-2" />
                  {t('Decode JWT')}
                </Button>
                <Button onClick={loadSample} variant="outline" className="w-full sm:w-auto border-2 border-gray-300 dark:border-gray-600">
                  {t('Load Sample')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 sm:gap-8">
            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-black dark:text-white flex items-center justify-between text-lg sm:text-xl">
                  <span>{t('Header')}</span>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(decodedHeader, t('Header'))} disabled={!decodedHeader}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={decodedHeader}
                  readOnly
                  className="min-h-[150px] sm:min-h-[200px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono text-xs sm:text-sm"
                  placeholder={t('JWT header will appear here...')}
                />
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
              <CardHeader>
                <CardTitle className="text-black dark:text-white flex items-center justify-between text-lg sm:text-xl">
                  <span>{t('Payload')}</span>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(decodedPayload, t('Payload'))} disabled={!decodedPayload}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={decodedPayload}
                  readOnly
                  className="min-h-[150px] sm:min-h-[200px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono text-xs sm:text-sm"
                  placeholder={t('JWT payload will appear here...')}
                />
              </CardContent>
            </Card>
          </div>
          
          {/* JWT Information Section */}
          <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm mt-6 sm:mt-8">
            <CardHeader>
              <CardTitle className="text-black dark:text-white flex items-center text-lg sm:text-xl">
                <Shield className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                {t('About JSON Web Tokens (JWT)')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="prose prose-gray dark:prose-invert max-w-none">
                <p className="text-gray-700 dark:text-gray-300">
                  {tr('{term} are an open standard (RFC 7519) that defines a compact and self-contained way for securely transmitting information between parties as a JSON object. This information can be verified and trusted because it is digitally signed.', { term: <strong>{t('JSON Web Tokens (JWT)')}</strong> })}
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('JWT Structure')}</h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <li><strong>{t('Header:')}</strong>{' '}{t('Contains token type and signing algorithm')}</li>
                      <li><strong>{t('Payload:')}</strong>{' '}{t('Contains claims (user data and metadata)')}</li>
                      <li><strong>{t('Signature:')}</strong>{' '}{t('Ensures token hasn\'t been tampered with')}</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('Common Use Cases')}</h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <li><strong>{t('Authentication:')}</strong>{' '}{t('Single sign-on and user sessions')}</li>
                      <li><strong>{t('Authorization:')}</strong>{' '}{t('Secure API access control')}</li>
                      <li><strong>{t('Information Exchange:')}</strong>{' '}{t('Secure data transmission')}</li>
                    </ul>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>{t('Security Note:')}</strong>{' '}{t('This tool only decodes JWT tokens locally in your browser. It never sends your tokens to any server, ensuring your data remains private and secure.')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default JwtTool;