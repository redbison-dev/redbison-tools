import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Key, Download, RefreshCw, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { generateKeyPair, JwkError, jwkToPem, parseJwkInput, pemToJwk, type GenerateAlgorithm } from '@/lib/tools/jwk-tool';
import { useT } from '@/i18n';

const JwkTool = () => {
  const { t } = useT();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };
  
  const [jwkInput, setJwkInput] = useState('');
  const [pemOutput, setPemOutput] = useState('');
  const [jwkOutput, setJwkOutput] = useState('');
  const [error, setError] = useState('');
  // The tool's own messages translated; browser (Web Crypto) errors as given.
  const errorText = (err: Error) => (err instanceof JwkError ? t(err.text, err.vars) : err.message);

  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  useEffect(() => {
    trackAction('view', 'jwk-tool');
  }, [trackAction]);

  const [algorithm, setAlgorithm] = useState<GenerateAlgorithm>('RS256');
  const [thumbprint, setThumbprint] = useState('');
  const [privateJwkOutput, setPrivateJwkOutput] = useState('');
  const [activeTab, setActiveTab] = useState('jwk');

  const reset = () => {
    setError('');
    setThumbprint('');
    setPrivateJwkOutput('');
  };

  const generateJwk = async () => {
    reset();
    try {
      trackAction('generate', 'jwk-tool');
      const pair = await generateKeyPair(algorithm);
      setJwkOutput(JSON.stringify(pair.publicJwk, null, 2));
      setPrivateJwkOutput(JSON.stringify(pair.privateJwk, null, 2));
      setPemOutput(`${pair.publicPem}\n\n${pair.privatePem}`);
      setJwkInput(JSON.stringify(pair.publicJwk, null, 2));
      setThumbprint(pair.thumbprint);
      setActiveTab('jwk');
      toast({
        title: t('Key Pair Generated'),
        description: t('{algorithm} key pair generated in your browser', { algorithm }),
      });
    } catch (err) {
      setError(err instanceof Error ? t('Key generation failed: {error}', { error: errorText(err) }) : t('Key generation failed'));
    }
  };

  const convertJwkToPem = async () => {
    reset();
    if (!jwkInput.trim()) {
      setError(t('Please enter a JWK'));
      return;
    }

    try {
      trackAction('convert', 'jwk-tool');
      const keys = parseJwkInput(jwkInput);
      const results = await Promise.all(keys.map((k) => jwkToPem(k)));
      setPemOutput(results.map((r) => [r.publicPem, r.privatePem].filter(Boolean).join('\n\n')).join('\n\n'));
      setThumbprint(results.map((r) => r.thumbprint).join(', '));
      setActiveTab('pem');
      toast({
        title: t('Converted to PEM'),
        description: keys.length > 1 ? t('{length} keys converted', { length: keys.length }) : t('JWK has been converted to PEM format'),
      });
    } catch (err) {
      setError(err instanceof Error ? errorText(err) : t('Invalid JWK format or conversion failed'));
    }
  };

  const convertPemToJwk = async () => {
    reset();
    if (!jwkInput.trim()) {
      setError(t('Please paste a PEM key or certificate'));
      return;
    }
    try {
      trackAction('convert_pem', 'jwk-tool');
      const r = await pemToJwk(jwkInput);
      setJwkOutput(JSON.stringify(r.publicJwk, null, 2));
      setPrivateJwkOutput(r.privateJwk ? JSON.stringify(r.privateJwk, null, 2) : '');
      setThumbprint(r.thumbprint);
      setActiveTab('jwk');
      toast({ title: t('Converted to JWK'), description: t('{keyType} key read from {label}', { keyType: r.keyType, label: r.label }) });
    } catch (err) {
      setError(err instanceof Error ? errorText(err) : t('Could not convert that PEM'));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    trackAction('copy', 'jwk-tool');
    toast({
      title: t('Copied!'),
      description: t('Content copied to clipboard'),
    });
  };

  const downloadFile = (content: string, filename: string) => {
    trackAction('download', 'jwk-tool');
    const blob = new Blob([content], { type: filename.endsWith('.pem') ? 'application/x-pem-file' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      
      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
            <ToolBreadcrumb 
              category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
              subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
              toolName={t('JWK Tool')}
            />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Key className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('JWK Converter and Generator')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Convert JWK to PEM and PEM to JWK, generate RSA, EC and Ed25519 key pairs, and compute RFC 7638 thumbprints. Keys never leave your browser.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">JWK</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Crypto')}</Badge>
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
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
              <Card className="shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Key className="h-4 w-4 sm:h-5 sm:w-5" />
                    {t('JWK Input')}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {t('Paste a JWK or PEM, or generate a new key pair')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 flex-wrap items-center">
                    <select
                      value={algorithm}
                      onChange={(e) => setAlgorithm(e.target.value as GenerateAlgorithm)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs sm:text-sm"
                      aria-label={t('Key algorithm')}
                    >
                      <option value="RS256">RS256 (RSA 2048)</option>
                      <option value="PS256">PS256 (RSA-PSS 2048)</option>
                      <option value="ES256">ES256 (EC P-256)</option>
                      <option value="ES384">ES384 (EC P-384)</option>
                      <option value="EdDSA">{t('EdDSA (Ed25519)')}</option>
                    </select>
                    <Button onClick={generateJwk} size="sm" className="text-xs sm:text-sm">
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      {t('Generate JWK')}
                    </Button>
                    <Button variant="outline" onClick={convertJwkToPem} size="sm" className="text-xs sm:text-sm">
                      {t('Convert to PEM')}
                    </Button>
                    <Button variant="outline" onClick={convertPemToJwk} size="sm" className="text-xs sm:text-sm">
                      {t('Convert to JWK')}
                    </Button>
                  </div>

                  <Textarea
                    placeholder={t('Paste a JWK or JWK Set (to convert to PEM), or a PEM public key, private key or certificate (to convert to JWK)')}
                    value={jwkInput}
                    onChange={(e) => setJwkInput(e.target.value)}
                    className="min-h-[250px] sm:min-h-[300px] font-mono text-xs sm:text-sm resize-none"
                  />

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-700 text-xs sm:text-sm">{error}</p>
                    </div>
                  )}

                  {thumbprint && (
                    <div className="p-3 bg-gray-50 border rounded-md">
                      <p className="text-xs font-medium text-gray-600">{t('RFC 7638 thumbprint (SHA-256)')}</p>
                      <p className="font-mono text-xs sm:text-sm break-all">{thumbprint}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg sm:text-xl">{t('Output')}</CardTitle>
                  <CardDescription className="text-sm">
                    {t('Generated or converted keys. Private keys are marked; keep them secret.')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="jwk" className="text-xs sm:text-sm">JWK</TabsTrigger>
                      <TabsTrigger value="pem" className="text-xs sm:text-sm">PEM</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="jwk" className="space-y-4">
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(jwkOutput)}
                          disabled={!jwkOutput}
                          className="text-xs sm:text-sm"
                        >
                          <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          {t('Copy')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadFile(jwkOutput, 'public.jwk.json')}
                          disabled={!jwkOutput}
                          className="text-xs sm:text-sm"
                        >
                          <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          {t('Download')}
                        </Button>
                      </div>
                      
                      <Textarea
                        value={jwkOutput}
                        readOnly
                        className="min-h-[250px] sm:min-h-[300px] font-mono text-xs sm:text-sm resize-none"
                        placeholder={t('JWK output will appear here...')}
                      />

                      {privateJwkOutput && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs sm:text-sm font-medium text-red-700">{t('Private JWK (keep secret)')}</p>
                            <Button variant="outline" size="sm" onClick={() => copyToClipboard(privateJwkOutput)} className="text-xs sm:text-sm">
                              <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                              {t('Copy')}
                            </Button>
                          </div>
                          <Textarea
                            value={privateJwkOutput}
                            readOnly
                            className="min-h-[160px] font-mono text-xs sm:text-sm resize-none"
                          />
                        </div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="pem" className="space-y-4">
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(pemOutput)}
                          disabled={!pemOutput}
                          className="text-xs sm:text-sm"
                        >
                          <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          {t('Copy')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadFile(pemOutput, 'key.pem')}
                          disabled={!pemOutput}
                          className="text-xs sm:text-sm"
                        >
                          <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          {t('Download')}
                        </Button>
                      </div>
                      
                      <Textarea
                        value={pemOutput}
                        readOnly
                        className="min-h-[250px] sm:min-h-[300px] font-mono text-xs sm:text-sm resize-none"
                        placeholder={t('PEM format will appear here after conversion...')}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default JwkTool;