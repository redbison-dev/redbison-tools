
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Shield, AlertTriangle, CheckCircle, Clock, Globe, Lock, Maximize, Minimize, Info, ChevronDown, Copy, Terminal } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { analyzeChain, describeKey, opensslCommand, type ChainReport, type CheckLevel } from '@/lib/tools/ssl-checker';
import { certificateFingerprints, commonName } from '@/lib/tools/x509-parser';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useFormat, useT } from '@/i18n';
import { translateBuilt } from '@/lib/msg';

const SAMPLE_CHAIN = `-----BEGIN CERTIFICATE-----
MIIDIDCCAsagAwIBAgIGChssPU5fMAoGCCqGSM49BAMCMEYxCzAJBgNVBAYTAlVT
MRgwFgYDVQQKDA9FeGFtcGxlIFRlc3QgQ0ExHTAbBgNVBAMMFEV4YW1wbGUgVGVz
dCBSb290IENBMB4XDTI2MDEwMTAwMDAwMFoXDTI3MDEwMTAwMDAwMFowazELMAkG
A1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWExFjAUBgNVBAcMDVNhbiBGcmFu
Y2lzY28xFTATBgNVBAoMDEV4YW1wbGUgQ29ycDEYMBYGA1UEAwwPd3d3LmV4YW1w
bGUuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAihm9oVmnVTyt
/G3DA6+A9guRUp2+K+iS0o1OcXe2vwSumA4JSWa06neb0/kcjZSEASj+Jeng+BCk
x10LAH68VO+n0sjqk73PYmxjKFOW0CEf9CxemNHyZY0iO8lGLJNzgZp9aqYELOdY
KZy7AQ6xaQFmVOQ8dJEv2NaCHajrO4usr+L1Fu+BGoXYCk8Cselj1oV9dUFAtI9v
FkDx5COcFmvxwAsU+edzUFt80yxlMPNDaUK9oxadcMYShAp0+G9xoX2CM6JMYuzg
Uns0PcZPC7hyn/DbOJaKsYga4Gzi6OuE0pX77HVmPuEeT66hAZrbnpOvdEezgC4g
OERY3qKaxQIDAQABo4GvMIGsMAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgWg
MB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjAtBgNVHREEJjAkgg93d3cu
ZXhhbXBsZS5jb22CC2V4YW1wbGUuY29thwTAAAIKMB0GA1UdDgQWBBQpojCC08fY
Z2BsApQtVh9J3BLIJDAfBgNVHSMEGDAWgBTemJTWcSPPEXtkWcl779DqvXlILjAK
BggqhkjOPQQDAgNIADBFAiBlAu6xhmH4s591DUMVPjC1CCcuZfzsYLlQVH7fnWpi
zwIhAJsQVna1Iu6V0W20FRQbayIagvB5qqPXwYnltWoB+OYW
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIB8TCCAZegAwIBAgIUecPKYUvox4WNlNI2TFqRcxzbbckwCgYIKoZIzj0EAwIw
RjELMAkGA1UEBhMCVVMxGDAWBgNVBAoMD0V4YW1wbGUgVGVzdCBDQTEdMBsGA1UE
AwwURXhhbXBsZSBUZXN0IFJvb3QgQ0EwHhcNMjYwMTAxMDAwMDAwWhcNMzYwMTAx
MDAwMDAwWjBGMQswCQYDVQQGEwJVUzEYMBYGA1UECgwPRXhhbXBsZSBUZXN0IENB
MR0wGwYDVQQDDBRFeGFtcGxlIFRlc3QgUm9vdCBDQTBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABM80LfyZln7P7qMZg1igalZL5spbZPzNVW3MaHqSfIL25Kufv4aQ
z7ljOOfouxUpoVzdUUnc/Mr9H/Doa4kVXnejYzBhMB0GA1UdDgQWBBTemJTWcSPP
EXtkWcl779DqvXlILjAfBgNVHSMEGDAWgBTemJTWcSPPEXtkWcl779DqvXlILjAP
BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDAgNIADBF
AiAZGBcKQKcdWAwdsirCCvLD09DfyVPONx8DeakyHqZPZwIhAKkEuJ7OoAuFdJGX
fy1NVy5P5Trp3cW0kuK5lxpF4HrR
-----END CERTIFICATE-----`;

const levelStyles: Record<CheckLevel, { icon: typeof CheckCircle; className: string }> = {
  pass: { icon: CheckCircle, className: 'text-green-600' },
  warn: { icon: Clock, className: 'text-yellow-600' },
  fail: { icon: AlertTriangle, className: 'text-red-600' },
  info: { icon: Info, className: 'text-blue-600' },
};

const SslChecker = () => {
  const { t, tr } = useT();
  const f = useFormat();
  // US pages keep the UTC string they have always shown; other locales get their own date and time order.
  const utc = (d: Date) => (f.locale ? f.date(d, { dateStyle: 'full', timeStyle: 'long', timeZone: 'UTC' }) : d.toUTCString());
  const [url, setUrl] = useState('');
  const [chainInput, setChainInput] = useState('');
  const [report, setReport] = useState<ChainReport | null>(null);
  const [fingerprint, setFingerprint] = useState('');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();
  const { toast } = useToast();

  const checkSslCertificate = async (pem: string = chainInput, host: string = url) => {
    setError('');
    setReport(null);
    setFingerprint('');
    if (!pem.trim()) {
      setError(t('Paste the certificate chain first. Run the openssl command below and copy everything from the first BEGIN CERTIFICATE line to the last END CERTIFICATE line.'));
      return;
    }
    trackAction('check_ssl_certificate');
    try {
      const result = analyzeChain(pem, host, undefined, t);
      setReport(result);
      setFingerprint((await certificateFingerprints(result.leaf.der)).sha256);
    } catch (err) {
      setError(err instanceof Error ? translateBuilt(t, err.message) : t('Could not parse the certificate chain'));
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(opensslCommand(url));
      toast({ title: t('Copied'), description: t('Run it in a terminal, then paste the output here.') });
    } catch {
      toast({ title: t('Copy failed'), description: t('Select the command and copy it manually.'), variant: 'destructive' });
    }
  };

  const getExpiryStatus = (daysUntilExpiry: number) => {
    if (daysUntilExpiry <= 7) return { color: 'destructive', icon: AlertTriangle };
    if (daysUntilExpiry <= 30) return { color: 'secondary', icon: Clock };
    return { color: 'default', icon: CheckCircle };
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { url, chainInput };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setUrl('www.example.com');
    setChainInput(SAMPLE_CHAIN);
    checkSslCertificate(SAMPLE_CHAIN, 'www.example.com');
  });

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            <ToolBreadcrumb 
              category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
              subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
              toolName={t('SSL Certificate Checker')}
            />
            
            <div className="tool-header mt-6">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('SSL Certificate Checker')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Check a server\'s TLS certificate chain for expiry, hostname match, weak keys and chain order. Paste the openssl output; nothing is uploaded.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">SSL</Badge>
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
              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    {t('Check SSL Certificate')}
                  </CardTitle>
                  <CardDescription>
                    {t('Enter a domain or URL to analyze its SSL/TLS certificate')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-900">
                    {t('Browsers do not let web pages read another site\'s certificate, so this checker works on the chain the server sends, which you fetch with OpenSSL. Enter the hostname, copy the command, run it in a terminal and paste the output below.')}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder={t('example.com')}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      aria-label={t('Hostname')}
                    />
                    <Button onClick={copyCommand} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100">
                      <Copy className="h-4 w-4 mr-2" />
                      {t('Copy openssl Command')}
                    </Button>
                  </div>
                  <div className="flex items-start gap-2 bg-gray-900 text-gray-100 rounded-md p-3 font-mono text-xs sm:text-sm break-all">
                    <Terminal className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{opensslCommand(url)}</span>
                  </div>
                  <Textarea
                    placeholder={t('-----BEGIN CERTIFICATE-----\n(server certificate)\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\n(intermediate)\n-----END CERTIFICATE-----')}
                    value={chainInput}
                    onChange={(e) => setChainInput(e.target.value)}
                    className="min-h-[180px] font-mono text-xs sm:text-sm"
                    aria-label={t('Certificate chain (PEM)')}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => checkSslCertificate()}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {t('Check Certificate')}
                    </Button>
                    <Button
                      onClick={loadSample}
                      variant="outline"
                      className="border-gray-300 text-gray-600 hover:bg-gray-100"
                    >
                      {t('Load Sample')}
                    </Button>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-medium">{t('Error:')}</span>
                      </div>
                      <p className="text-red-700 mt-1">{error}</p>
                    </div>
                  )}

                  {report && (() => {
                    const leaf = report.leaf;
                    return (
                    <div className="space-y-4">
                      <Separator />

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">{t('Checks')}</CardTitle>
                          <CardDescription>
                            {t('Offline checks on the pasted chain. Signatures, trust-store membership and revocation are not verified here.')}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {report.checks.map((check) => {
                              const { icon: Icon, className } = levelStyles[check.level];
                              return (
                                <li key={check.id} className="flex items-start gap-2 text-sm">
                                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${className}`} />
                                  <span>{tr('{label} {detail}', { label: <span className="font-medium">{t('{label}.', { label: check.label })}</span>, detail: check.detail })}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Globe className="h-4 w-4" />
                              {t('Certificate Details')}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Common Name')}</label>
                              <p className="font-mono text-sm break-all">{commonName(leaf.subject) ?? t('(none)')}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Issuer')}</label>
                              <p className="font-mono text-sm break-all">{leaf.issuerString}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Subject')}</label>
                              <p className="font-mono text-sm break-all">{leaf.subjectString}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Serial Number')}</label>
                              <p className="font-mono text-sm break-all">{leaf.serialNumber}</p>
                            </div>
                            {fingerprint && (
                              <div>
                                <label className="text-sm font-medium text-gray-600">{t('SHA-256 Fingerprint')}</label>
                                <p className="font-mono text-xs break-all">{fingerprint}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              {t('Security Information')}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Valid From')}</label>
                              <p className="text-sm">{utc(leaf.notBefore)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Valid To')}</label>
                              <p className="text-sm">{utc(leaf.notAfter)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Days Until Expiry')}</label>
                              <div className="flex items-center gap-2">
                                <Badge variant={getExpiryStatus(report.daysUntilExpiry).color as any}>
                                  {t('{daysUntilExpiry} days', { daysUntilExpiry: report.daysUntilExpiry })}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Public Key')}</label>
                              <p className="text-sm">{describeKey(leaf)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-600">{t('Signature Algorithm')}</label>
                              <p className="text-sm">{leaf.signatureAlgorithm}</p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {leaf.subjectAltNames.length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-lg">{t('Subject Alternative Names (SANs)')}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-wrap gap-2">
                              {leaf.subjectAltNames.map((san: string, index: number) => (
                                <Badge key={index} variant="outline" className="font-mono">
                                  {san}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">{t('Chain ({length})', { length: report.certificates.length })}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ol className="space-y-2 text-sm">
                            {report.certificates.map((c, i) => (
                              <li key={i} className="flex flex-col sm:flex-row sm:justify-between gap-1 border-b last:border-0 pb-2">
                                <span className="font-mono break-all">{i + 1}. {commonName(c.subject) ?? c.subjectString}</span>
                                <span className="text-gray-600">{t('expires {value}', { value: c.notAfter.toISOString().slice(0, 10) })}{c.basicConstraints?.ca ? ' (CA)' : ''}</span>
                              </li>
                            ))}
                          </ol>
                        </CardContent>
                      </Card>
                    </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* SSL Certificate Information Section for SEO */}
              <Collapsible open={isInfoOpen} onOpenChange={setIsInfoOpen}>
                <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="hover:bg-gray-50 transition-colors">
                      <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Info className="h-5 w-5 text-blue-500" />
                          {t('Understanding SSL Certificates')}
                        </div>
                        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isInfoOpen ? 'rotate-180' : ''}`} />
                      </CardTitle>
                      <CardDescription className="text-left">
                        {t('Learn about SSL/TLS certificates and their importance for website security')}
                      </CardDescription>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-2">{t('What is an SSL Certificate?')}</h3>
                          <p className="text-gray-600 text-sm">
                            {t('SSL (Secure Sockets Layer) certificates are digital certificates that authenticate a website\'s identity and enable encrypted connections. They ensure that data transmitted between your browser and the website remains private and secure.')}
                          </p>
                        </div>
                        
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-2">{t('Certificate Components')}</h3>
                          <ul className="text-gray-600 text-sm space-y-1">
                            <li>• <strong>{t('Subject:')}</strong>{' '}{t('The entity the certificate is issued to')}</li>
                            <li>• <strong>{t('Issuer:')}</strong>{' '}{t('The Certificate Authority (CA) that issued it')}</li>
                            <li>• <strong>{t('Validity Period:')}</strong>{' '}{t('Start and end dates for certificate validity')}</li>
                            <li>• <strong>{t('Public Key:')}</strong>{' '}{t('Used for encryption and digital signatures')}</li>
                          </ul>
                        </div>
                        
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-2">{t('Security Features')}</h3>
                          <ul className="text-gray-600 text-sm space-y-1">
                            <li>• <strong>{t('Encryption:')}</strong>{' '}{t('Protects data in transit')}</li>
                            <li>• <strong>{t('Authentication:')}</strong>{' '}{t('Verifies website identity')}</li>
                            <li>• <strong>{t('Data Integrity:')}</strong>{' '}{t('Ensures data hasn\'t been tampered with')}</li>
                            <li>• <strong>{t('Trust Indicators:')}</strong>{' '}{t('Browser padlock and HTTPS protocol')}</li>
                          </ul>
                        </div>
                        
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-2">{t('Certificate Types')}</h3>
                          <ul className="text-gray-600 text-sm space-y-1">
                            <li>• <strong>{t('Domain Validated (DV):')}</strong>{' '}{t('Basic validation')}</li>
                            <li>• <strong>{t('Organization Validated (OV):')}</strong>{' '}{t('Business verification')}</li>
                            <li>• <strong>{t('Extended Validation (EV):')}</strong>{' '}{t('Highest level of validation')}</li>
                            <li>• <strong>{t('Wildcard:')}</strong>{' '}{t('Covers subdomains')}</li>
                          </ul>
                        </div>
                      </div>
                      
                      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h3 className="font-semibold text-blue-900 mb-2">{t('Why Check SSL Certificates?')}</h3>
                        <p className="text-blue-800 text-sm">
                          {t('Regular SSL certificate monitoring helps prevent security incidents, ensures compliance, avoids browser warnings, and maintains user trust. This checker reads the chain you paste and reports expiry, hostname coverage, key strength and chain order.')}
                        </p>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default SslChecker;
