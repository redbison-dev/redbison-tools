import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Shield, ArrowDown, ArrowUp, FileText, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { decodeSamlMessage, encodeSamlPost, encodeSamlRedirect, summarizeSaml, type SamlSummary } from '@/lib/tools/saml-tool';
import { msg, useT } from '@/i18n';

const SamlTool = () => {
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
  
  const [samlInput, setSamlInput] = useState('');
  const [decodedOutput, setDecodedOutput] = useState('');
  const [encodedOutput, setEncodedOutput] = useState('');
  const [error, setError] = useState('');

  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  useEffect(() => {
    trackAction('view', 'saml-tool');
  }, [trackAction]);

  const [binding, setBinding] = useState('');
  const [summary, setSummary] = useState<SamlSummary | null>(null);
  const [redirectOutput, setRedirectOutput] = useState('');
  const [activeTab, setActiveTab] = useState('decoded');

  const decodeSaml = () => {
    if (!samlInput.trim()) {
      setError(msg('Please enter SAML data to decode'));
      return;
    }

    try {
      trackAction('decode', 'saml-tool');
      const result = decodeSamlMessage(samlInput);
      // Pretty-print single-line XML for reading only; re-encode the original, not this view, if it is signed.
      const xml = result.xml.includes('\n') ? result.xml : formatXml(result.xml);
      setDecodedOutput(xml);
      setBinding(result.binding);
      setSummary(summarizeSaml(result.xml));
      setActiveTab('decoded');
      setError('');

      toast({
        title: t('SAML Decoded'),
        description: t('Detected {binding} encoding{value}', { binding: t(result.binding), value: result.parameter ? ` (${result.parameter})` : '' }),
      });
    } catch (err) {
      setSummary(null);
      setBinding('');
      setError(err instanceof Error ? err.message : msg('Failed to decode SAML data. Please check the format.'));
    }
  };

  const encodeSaml = () => {
    if (!samlInput.trim()) {
      setError(msg('Please enter SAML XML to encode'));
      return;
    }
    if (!samlInput.trim().startsWith('<')) {
      setError(msg('Encode expects SAML XML. To read an encoded value, use Decode.'));
      return;
    }

    try {
      trackAction('encode', 'saml-tool');
      // The XML is encoded exactly as entered: reformatting would break an XML signature.
      setEncodedOutput(encodeSamlPost(samlInput));
      setRedirectOutput(encodeSamlRedirect(samlInput));
      setSummary(summarizeSaml(samlInput));
      setActiveTab('encoded');
      setError('');

      toast({
        title: t('SAML Encoded'),
        description: t('HTTP-POST and HTTP-Redirect encodings are ready'),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : msg('Failed to encode SAML data'));
    }
  };

  const formatXml = (xml: string): string => {
    const formatted = xml.replace(/></g, '>\n<');
    const lines = formatted.split('\n');
    let indent = 0;
    
    return lines.map(line => {
      if (line.match(/<\/\w/)) {
        indent--;
      }
      
      const indentedLine = '  '.repeat(Math.max(0, indent)) + line.trim();
      
      if (line.match(/<\w[^>]*[^\/]>$/)) {
        indent++;
      }
      
      return indentedLine;
    }).join('\n');
  };

  const generateSampleSamlRequest = () => {
    trackAction('generate_sample', 'saml-tool');
    const sampleRequest = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6"
    Version="2.0"
    IssueInstant="2024-01-15T09:30:10Z"
    Destination="https://idp.example.com/sso"
    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
    AssertionConsumerServiceURL="https://sp.example.com/acs">
    <saml:Issuer>https://sp.example.com</saml:Issuer>
    <samlp:NameIDPolicy
        Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        AllowCreate="true"/>
    <samlp:RequestedAuthnContext Comparison="exact">
        <saml:AuthnContextClassRef>
            urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport
        </saml:AuthnContextClassRef>
    </samlp:RequestedAuthnContext>
</samlp:AuthnRequest>`;
    setSamlInput(sampleRequest);
  };

  const generateSampleSamlResponse = () => {
    trackAction('generate_sample_response', 'saml-tool');
    const sampleResponse = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6"
    Version="2.0"
    IssueInstant="2024-01-15T09:32:10Z"
    Destination="https://sp.example.com/acs"
    InResponseTo="_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6">
    <saml:Issuer>https://idp.example.com</saml:Issuer>
    <samlp:Status>
        <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
    </samlp:Status>
    <saml:Assertion
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:xs="http://www.w3.org/2001/XMLSchema"
        ID="_d71a3a8e9fcc45c9b9da8ed6a7aa6f75"
        Version="2.0"
        IssueInstant="2024-01-15T09:32:10Z">
        <saml:Issuer>https://idp.example.com</saml:Issuer>
        <saml:Subject>
            <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
                user@example.com
            </saml:NameID>
            <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
                <saml:SubjectConfirmationData
                    NotOnOrAfter="2024-01-15T09:37:10Z"
                    Recipient="https://sp.example.com/acs"
                    InResponseTo="_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6"/>
            </saml:SubjectConfirmation>
        </saml:Subject>
        <saml:Conditions NotBefore="2024-01-15T09:27:10Z" NotOnOrAfter="2024-01-15T09:37:10Z">
            <saml:AudienceRestriction>
                <saml:Audience>https://sp.example.com</saml:Audience>
            </saml:AudienceRestriction>
        </saml:Conditions>
        <saml:AuthnStatement AuthnInstant="2024-01-15T09:32:10Z">
            <saml:AuthnContext>
                <saml:AuthnContextClassRef>
                    urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport
                </saml:AuthnContextClassRef>
            </saml:AuthnContext>
        </saml:AuthnStatement>
        <saml:AttributeStatement>
            <saml:Attribute Name="email">
                <saml:AttributeValue xsi:type="xs:string">user@example.com</saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="firstName">
                <saml:AttributeValue xsi:type="xs:string">John</saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="lastName">
                <saml:AttributeValue xsi:type="xs:string">Doe</saml:AttributeValue>
            </saml:Attribute>
        </saml:AttributeStatement>
    </saml:Assertion>
</samlp:Response>`;
    setSamlInput(sampleResponse);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    trackAction('copy', 'saml-tool');
    toast({
      title: t('Copied!'),
      description: t('Content copied to clipboard'),
    });
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
              toolName="SAML Tool"
            />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('SAML Decoder and Encoder')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Decode SAMLRequest and SAMLResponse values from HTTP-Redirect (deflated) or HTTP-POST bindings, inspect key fields, and encode XML for either binding. Runs in your browser.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">SAML</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">SSO</Badge>
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
                    <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                    {t('SAML Input')}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {t('Encoded value (Decode) or XML (Encode)')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={decodeSaml} size="sm" className="text-xs sm:text-sm">
                      <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      {t('Decode')}
                    </Button>
                    <Button onClick={encodeSaml} size="sm" className="text-xs sm:text-sm">
                      <ArrowUp className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      {t('Encode')}
                    </Button>
                    <Button variant="outline" onClick={generateSampleSamlRequest} size="sm" className="text-xs sm:text-sm">
                      {t('Sample Request')}
                    </Button>
                    <Button variant="outline" onClick={generateSampleSamlResponse} size="sm" className="text-xs sm:text-sm">
                      {t('Sample Response')}
                    </Button>
                  </div>

                  <Textarea
                    placeholder={t('Paste a SAMLRequest/SAMLResponse value, a full redirect URL, or SAML XML to encode...')}
                    value={samlInput}
                    onChange={(e) => setSamlInput(e.target.value)}
                    className="min-h-[300px] sm:min-h-[400px] font-mono text-xs sm:text-sm resize-none"
                  />

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-700 text-xs sm:text-sm">{t(error)}</p>
                    </div>
                  )}

                  {summary && (
                    <div className="p-3 bg-gray-50 border rounded-md text-xs sm:text-sm space-y-1">
                      <h2 className="font-semibold text-sm sm:text-base mb-1">{t('Message summary')}</h2>
                      {binding && <p><span className="font-medium text-gray-600">{t('Encoding:')}</span> {t(binding)}</p>}
                      {([
                        [t('Type'), summary.messageType],
                        ['ID', summary.id],
                        ['IssueInstant', summary.issueInstant],
                        ['Issuer', summary.issuer],
                        ['Destination', summary.destination],
                        ['ACS URL', summary.acsUrl],
                        ['InResponseTo', summary.inResponseTo],
                        [t('Status'), summary.status],
                        ['NameID', summary.nameId],
                        ['Audience', summary.audience],
                        ['NotBefore', summary.notBefore],
                        ['NotOnOrAfter', summary.notOnOrAfter],
                      ] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                        <p key={k} className="break-all"><span className="font-medium text-gray-600">{k}:</span> {v}</p>
                      ))}
                      <p><span className="font-medium text-gray-600">{t('XML signature element:')}</span> {summary.signed ? t('present (not verified here)') : t('none')}</p>
                      {summary.encryptedAssertion && <p className="text-amber-700">{t('Contains an EncryptedAssertion; decrypting it needs the SP private key.')}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg sm:text-xl">{t('Output')}</CardTitle>
                  <CardDescription className="text-sm">
                    {t('Decoded or encoded SAML data')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="decoded" className="text-xs sm:text-sm">{t('Decoded')}</TabsTrigger>
                      <TabsTrigger value="encoded" className="text-xs sm:text-sm">{t('Encoded')}</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="decoded" className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(decodedOutput)}
                          disabled={!decodedOutput}
                          className="text-xs sm:text-sm"
                        >
                          <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          {t('Copy')}
                        </Button>
                      </div>
                      
                      <Textarea
                        value={decodedOutput}
                        readOnly
                        className="min-h-[300px] sm:min-h-[400px] font-mono text-xs sm:text-sm resize-none"
                        placeholder={t('Decoded SAML XML will appear here...')}
                      />
                    </TabsContent>
                    
                    <TabsContent value="encoded" className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(encodedOutput)}
                          disabled={!encodedOutput}
                          className="text-xs sm:text-sm"
                        >
                          <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          {t('Copy')}
                        </Button>
                      </div>
                      
                      <p className="text-xs sm:text-sm font-medium text-gray-700">{t('HTTP-POST binding (Base64, for a SAMLResponse/SAMLRequest form field)')}</p>
                      <Textarea
                        value={encodedOutput}
                        readOnly
                        className="min-h-[160px] sm:min-h-[180px] font-mono text-xs sm:text-sm resize-none"
                        placeholder={t('Encoded SAML data will appear here...')}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs sm:text-sm font-medium text-gray-700">{t('HTTP-Redirect binding (DEFLATE + Base64 + URL-encoded, for ?SAMLRequest=)')}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(redirectOutput)}
                          disabled={!redirectOutput}
                          className="text-xs sm:text-sm"
                        >
                          <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          {t('Copy')}
                        </Button>
                      </div>
                      <Textarea
                        value={redirectOutput}
                        readOnly
                        className="min-h-[120px] sm:min-h-[160px] font-mono text-xs sm:text-sm resize-none"
                        placeholder={t('Redirect-binding value will appear here...')}
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

export default SamlTool;
