
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Shield, AlertTriangle, CheckCircle, XCircle, Info, Maximize, Minimize, Copy, Terminal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { analyzeSecurityHeaders, curlCommand, type HeaderReport, type HeaderStatus, type NoteMsg } from '@/lib/tools/security-headers-analyzer';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { msg, useT } from '@/i18n';

const SAMPLE_HEADERS = `HTTP/2 200
content-type: text/html; charset=utf-8
strict-transport-security: max-age=31536000; includeSubDomains
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
referrer-policy: no-referrer-when-downgrade
x-powered-by: Express
server: nginx/1.25.3`;

const SecurityHeadersAnalyzer = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [url, setUrl] = useState('');
  const [rawHeaders, setRawHeaders] = useState('');
  const [report, setReport] = useState<HeaderReport | null>(null);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const analyzeHeaders = (raw: string = rawHeaders) => {
    setError('');
    setReport(null);
    if (!raw.trim()) {
      setError(msg('Paste the response headers first (run the curl command above, or copy them from the Network tab in DevTools).'));
      return;
    }
    try {
      setReport(analyzeSecurityHeaders(raw));
      trackAction('analyze_headers');
    } catch (err) {
      setError(err instanceof Error ? err.message : msg('Could not read those headers'));
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(curlCommand(url));
      toast({ title: t('Copied'), description: t('Run it in a terminal and paste the output below.') });
    } catch {
      toast({ title: t('Copy failed'), description: t('Select the command and copy it manually.'), variant: 'destructive' });
    }
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { url, rawHeaders };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setUrl('https://example.com');
    setRawHeaders(SAMPLE_HEADERS);
    analyzeHeaders(SAMPLE_HEADERS);
  });

  const statusStyle = (status: HeaderStatus, critical: boolean) => {
    switch (status) {
      case 'present':
        return { label: t('Good'), badge: 'default', icon: CheckCircle, color: 'text-green-600' };
      case 'weak':
        return { label: t('Weak'), badge: 'secondary', icon: AlertTriangle, color: 'text-yellow-600' };
      case 'info':
        return { label: t('Info'), badge: 'outline', icon: Info, color: 'text-blue-600' };
      default:
        return { label: t('Missing'), badge: critical ? 'destructive' : 'secondary', icon: XCircle, color: 'text-red-600' };
    }
  };

  // A finding's note in the page language; CSP problems are separate phrases joined into {problems}.
  const noteText = (m: NoteMsg) => t(m.text, { ...m.vars, ...(m.parts ? { problems: m.parts.map((p) => t(p)).join('; ') } : {}) });

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
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
              toolName="Security Headers Analyzer"
            />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('Security Headers Analyzer')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Grade HSTS, CSP, X-Frame-Options and other HTTP security headers from a curl or DevTools paste. Analysed in your browser.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Security')}</Badge>
                  <Badge variant="outline" className="border-red-500 text-red-600 px-3 py-1 bg-red-50 text-xs sm:text-sm">{t('Headers')}</Badge>
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
                    <Shield className="h-5 w-5" />
                    {t('Analyze Security Headers')}
                  </CardTitle>
                  <CardDescription>
                    {t('Enter a URL to analyze its HTTP security headers')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-900">
                    {t('Browsers hide most response headers of other sites from web pages (CORS), so paste the headers instead. Copy the curl command, run it in a terminal, and paste its output. DevTools also works: Network tab, click the document request, Response Headers, Raw.')}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="https://example.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="flex-1"
                      aria-label="URL"
                    />
                    <Button onClick={copyCommand} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100">
                      <Copy className="h-4 w-4 mr-2" />
                      {t('Copy curl Command')}
                    </Button>
                  </div>
                  <div className="flex items-start gap-2 bg-gray-900 text-gray-100 rounded-md p-3 font-mono text-xs sm:text-sm break-all">
                    <Terminal className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{curlCommand(url)}</span>
                  </div>
                  <Textarea
                    placeholder={t('HTTP/2 200\nstrict-transport-security: max-age=31536000\ncontent-security-policy: default-src \'self\'\n...')}
                    value={rawHeaders}
                    onChange={(e) => setRawHeaders(e.target.value)}
                    className="min-h-[180px] font-mono text-xs sm:text-sm"
                    aria-label={t('Raw response headers')}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => analyzeHeaders()} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {t('Analyze Headers')}
                    </Button>
                    <Button onClick={loadSample} variant="outline" className="border-gray-300 text-gray-600 hover:bg-gray-100">
                      {t('Load Sample')}
                    </Button>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-medium">{t('Error:')}</span>
                      </div>
                      <p className="text-red-700 mt-1">{t(error)}</p>
                    </div>
                  )}

                  {report && (
                    <div className="space-y-4">
                      <Separator />

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div className="p-4 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{report.present}</div>
                          <div className="text-sm text-green-700">{t('Good')}</div>
                        </div>
                        <div className="p-4 bg-yellow-50 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600">{report.weak}</div>
                          <div className="text-sm text-yellow-700">{t('Weak')}</div>
                        </div>
                        <div className="p-4 bg-red-50 rounded-lg">
                          <div className="text-2xl font-bold text-red-600">{report.missing}</div>
                          <div className="text-sm text-red-700">{t('Missing')}</div>
                        </div>
                        <div className="p-4 bg-red-50 rounded-lg">
                          <div className="text-2xl font-bold text-red-700">{report.criticalMissing}</div>
                          <div className="text-sm text-red-700">{t('Critical Missing')}</div>
                        </div>
                      </div>
                      {report.statusLine && <p className="text-sm text-gray-600">{t('Analysed response:')}{' '}<code>{report.statusLine}</code></p>}

                      <div className="grid gap-4">
                        {report.findings.map((finding) => {
                          const style = statusStyle(finding.status, finding.critical);
                          const StatusIcon = style.icon;
                          return (
                            <Card key={finding.key}>
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                                      <StatusIcon className={`h-4 w-4 ${style.color}`} />
                                      {t(finding.name)}
                                      {finding.critical && (
                                        <Badge variant="destructive" className="text-xs">{t('Critical')}</Badge>
                                      )}
                                    </CardTitle>
                                    <CardDescription className="mt-1">{t(finding.description)}</CardDescription>
                                    <p className="text-sm mt-2 text-gray-800">{noteText(finding.noteMsg)}</p>
                                  </div>
                                  <Badge variant={style.badge as any}>{style.label}</Badge>
                                </div>
                              </CardHeader>
                              {finding.value && (
                                <CardContent className="pt-0">
                                  <div className="bg-gray-50 p-3 rounded-md">
                                    <code className="text-sm font-mono break-all">{finding.value}</code>
                                  </div>
                                </CardContent>
                              )}
                            </Card>
                          );
                        })}
                      </div>

                      {report.disclosures.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                              <Info className="h-5 w-5" />
                              {t('Information Disclosure')}
                            </CardTitle>
                            <CardDescription>{t('These headers reveal server software or versions. Remove them or strip the version.')}</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-1">
                            {report.disclosures.map((d) => (
                              <p key={d.header} className="font-mono text-sm break-all">{d.header}: {d.value}</p>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default SecurityHeadersAnalyzer;
