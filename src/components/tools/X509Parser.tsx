
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { FileText, Upload, Shield, Calendar, Building, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { certificateFingerprints, daysUntil, encodePem, parseCertificates, validityState, type ParsedCertificate } from '@/lib/tools/x509-parser';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useFormat, useT } from '@/i18n';
import { translateBuilt } from '@/lib/msg';

/** Date and time as en-US toLocaleString() prints them, in the page's locale. */
const LONG_STAMP: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' };

const X509Parser = () => {
  const { t } = useT();
  const fmt = useFormat();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };
  
  const [certInput, setCertInput] = useState('');
  const [certDetails, setCertDetails] = useState<{ cert: ParsedCertificate; fingerprints: { sha1: string; sha256: string }; count: number } | null>(null);
  const [error, setError] = useState('');

  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  useEffect(() => {
    trackAction('view', 'x509-parser');
  }, [trackAction]);

  const parseCertificate = async (input: string = certInput) => {
    if (!input.trim()) {
      setError(t('Please enter a certificate'));
      return;
    }

    try {
      trackAction('parse', 'x509-parser');
      const certs = parseCertificates(input);
      const cert = certs[0];
      const fingerprints = await certificateFingerprints(cert.der);
      setCertDetails({ cert, fingerprints, count: certs.length });
      setError('');

      toast({
        title: t('Certificate Parsed'),
        description: certs.length > 1 ? t('Showing the first of {length} certificates', { length: certs.length }) : t('X.509 certificate has been successfully parsed'),
      });
    } catch (err) {
      setCertDetails(null);
      setError(err instanceof Error ? translateBuilt(t, err.message) : t('Failed to parse certificate'));
    }
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { certInput };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSampleCertificate = () => requestSampleLoad(() => {
    trackAction('load_sample', 'x509-parser');
    const sampleCert = `-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----`;
    setCertInput(sampleCert);
    parseCertificate(sampleCert);
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    trackAction('file_upload', 'x509-parser');

    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
      // Binary DER files (.der/.cer) start with a SEQUENCE tag; convert them to PEM text.
      const content = bytes[0] === 0x30 ? encodePem('CERTIFICATE', bytes) : new TextDecoder().decode(bytes);
      setCertInput(content);
      parseCertificate(content);
    };
    reader.readAsArrayBuffer(file);
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
              toolName="X.509 Parser"
            />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('X.509 Certificate Parser')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Decode PEM or DER certificates: subject, issuer, validity, key, SANs, extensions and fingerprints. Parsed in your browser.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">X.509</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">SSL</Badge>
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
                    {t('Certificate Input')}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {t('Paste a PEM certificate (or a chain) or upload a .pem, .crt, .cer or .der file')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('cert-file')?.click()}
                      size="sm"
                      className="text-xs sm:text-sm"
                    >
                      <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      {t('Upload File')}
                    </Button>
                    <Button variant="outline" onClick={loadSampleCertificate} size="sm" className="text-xs sm:text-sm">
                      {t('Sample Certificate')}
                    </Button>
                    <Button onClick={() => parseCertificate()} size="sm" className="text-xs sm:text-sm">
                      {t('Parse Certificate')}
                    </Button>
                  </div>

                  <input
                    id="cert-file"
                    type="file"
                    accept=".crt,.cer,.pem,.der,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <Textarea
                    placeholder={t('-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJAKoK/heBjcOuMA0GCSqGSIb3DQEBBQUAMEUxCzAJBgNV\n...\n-----END CERTIFICATE-----')}
                    value={certInput}
                    onChange={(e) => setCertInput(e.target.value)}
                    className="min-h-[250px] sm:min-h-[300px] font-mono text-xs sm:text-sm resize-none"
                  />

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-700 text-xs sm:text-sm">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg sm:text-xl">{t('Certificate Details')}</CardTitle>
                  <CardDescription className="text-sm">
                    {t('Parsed certificate information')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-h-[500px] sm:max-h-[600px] overflow-y-auto">
                  {certDetails ? (() => {
                    const c = certDetails.cert;
                    const state = validityState(c);
                    const days = daysUntil(c.notAfter);
                    const row = (label: string, value: React.ReactNode, mono = false) => (
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                        <span className="font-medium text-gray-600 shrink-0 sm:mr-4">{label}:</span>
                        <span className={`break-all sm:text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
                      </div>
                    );
                    const badges = (items: string[], mono = false, translated = false) => (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {items.map((item, index) => (
                          <Badge key={index} variant={mono ? 'outline' : 'secondary'} className={`text-xs ${mono ? 'font-mono' : ''}`}>{mono || translated ? item : t(item)}</Badge>
                        ))}
                      </div>
                    );
                    return (
                    <div className="space-y-4 sm:space-y-6">
                      {certDetails.count > 1 && (
                        <p className="text-xs sm:text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-2">
                          {t('The input contains {count} certificates. Showing the first one; paste the others on their own to inspect them.', { count: certDetails.count })}
                        </p>
                      )}
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                          <Building className="h-3 w-3 sm:h-4 sm:w-4" />
                          {t('Basic Information')}
                        </h3>
                        <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                          {row(t('Version'), `v${c.version}`)}
                          {row(t('Serial Number'), c.serialNumber, true)}
                          {row(t('Signature Algorithm'), c.signatureAlgorithm)}
                          {row(t('Self-issued'), c.selfIssued ? t('Yes (issuer = subject)') : t('No'))}
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">{t('Subject')}</h3>
                        <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                          {c.subject.map((a, i) => <React.Fragment key={i}>{row(t(a.name), a.value)}</React.Fragment>)}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">{t('Issuer')}</h3>
                        <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                          {c.issuer.map((a, i) => <React.Fragment key={i}>{row(t(a.name), a.value)}</React.Fragment>)}
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2">
                          <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                          {t('Validity Period')}
                        </h3>
                        <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                          {row(t('Not Before'), `${c.notBefore.toISOString().replace('.000Z', 'Z')} (${fmt.date(c.notBefore, LONG_STAMP)})`)}
                          {row(t('Not After'), `${c.notAfter.toISOString().replace('.000Z', 'Z')} (${fmt.date(c.notAfter, LONG_STAMP)})`)}
                          {row(t('Status'), (
                            <Badge variant={state === 'valid' ? 'default' : 'destructive'} className="text-xs">
                              {state === 'valid' ? t('Valid, {days} day(s) left', { days }) : state === 'expired' ? t('Expired {days} day(s) ago', { days: -days }) : t('Not yet valid')}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">{t('Public Key')}</h3>
                        <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
                          {row(t('Algorithm'), <Badge variant="outline" className="text-xs w-fit">{c.publicKey.algorithm}</Badge>)}
                          {c.publicKey.curve && row(t('Curve'), c.publicKey.curve)}
                          {c.publicKey.keySize && row(t('Key Size'), t('{n} bits', { n: c.publicKey.keySize }))}
                          {c.publicKey.exponent && row(t('Exponent'), String(c.publicKey.exponent))}
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">{t('Extensions')}</h3>
                        <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                          {c.subjectAltNames.length > 0 && (
                            <div>
                              <label className="font-medium text-gray-600">{t('Subject Alt Names:')}</label>
                              {badges(c.subjectAltNames, true)}
                            </div>
                          )}
                          {c.keyUsage.length > 0 && (
                            <div>
                              <label className="font-medium text-gray-600">{t('Key Usage:')}</label>
                              {badges(c.keyUsage)}
                            </div>
                          )}
                          {c.extendedKeyUsage.length > 0 && (
                            <div>
                              <label className="font-medium text-gray-600">{t('Extended Key Usage:')}</label>
                              {badges(c.extendedKeyUsage)}
                            </div>
                          )}
                          {c.basicConstraints && row(t('Basic Constraints'), `CA:${c.basicConstraints.ca ? 'TRUE' : 'FALSE'}${c.basicConstraints.pathLength !== undefined ? `, pathlen:${c.basicConstraints.pathLength}` : ''}`)}
                          {c.subjectKeyId && row(t('Subject Key ID'), c.subjectKeyId, true)}
                          {c.authorityKeyId && row(t('Authority Key ID'), c.authorityKeyId, true)}
                          {c.policies.length > 0 && (
                            <div>
                              <label className="font-medium text-gray-600">{t('Certificate Policies:')}</label>
                              {badges(c.policies)}
                            </div>
                          )}
                          {c.ocspUrls.length > 0 && row(t('OCSP'), c.ocspUrls.join(', '), true)}
                          {c.caIssuerUrls.length > 0 && row(t('CA Issuers'), c.caIssuerUrls.join(', '), true)}
                          {c.crlUrls.length > 0 && row(t('CRL'), c.crlUrls.join(', '), true)}
                          <div>
                            <label className="font-medium text-gray-600">{t('All extensions:')}</label>
                            {badges(c.extensions.map((e) => (e.critical ? t('{name} (critical)', { name: t(e.name) }) : t(e.name))), false, true)}
                          </div>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">{t('Fingerprints')}</h3>
                        <div className="space-y-2 text-xs sm:text-sm">
                          <div>
                            <label className="font-medium text-gray-600">SHA-256:</label>
                            <p className="font-mono text-xs bg-gray-50 p-2 rounded mt-1 break-all">{certDetails.fingerprints.sha256}</p>
                          </div>
                          <div>
                            <label className="font-medium text-gray-600">SHA-1:</label>
                            <p className="font-mono text-xs bg-gray-50 p-2 rounded mt-1 break-all">{certDetails.fingerprints.sha1}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })() : (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      {t('Parse a certificate to view details')}
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>
              
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default X509Parser;
