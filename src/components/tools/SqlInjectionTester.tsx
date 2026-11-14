import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Copy, Download, Shield, AlertTriangle, CheckCircle, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { testSqlSecurity, type TestResult } from '@/lib/tools/sql-injection-tester';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { msg, useT } from '@/i18n';

const SEVERITY_LABELS = { Critical: msg('Critical'), High: msg('High'), Medium: msg('Medium'), Low: msg('Low') } as const;

const SqlInjectionTester = () => {
  const { t } = useT();
  const [sqlQuery, setSqlQuery] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleQuery = `SELECT * FROM users WHERE username = '\${username}' AND password = '\${password}';

SELECT id, name, email FROM products WHERE category = '\${category}' ORDER BY price;

UPDATE users SET last_login = NOW() WHERE id = \${user_id};

DELETE FROM sessions WHERE user_id = '\${uid}' AND expires < NOW();`;

  const handleTest = () => {
    if (!sqlQuery.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter SQL queries to test'),
        variant: "destructive",
      });
      return;
    }

    trackAction('test_sql_injection');
    
    const result = testSqlSecurity(sqlQuery);
    setTestResult(result);

    const criticalVulns = result.vulnerabilities.filter(v => v.severity === 'Critical').length;
    
    if (criticalVulns > 0) {
      toast({
        title: t('Critical Vulnerabilities Found'),
        description: t('Found {criticalVulns} critical SQL injection vulnerabilities', { criticalVulns }),
        variant: "destructive",
      });
    } else if (result.vulnerabilities.length > 0) {
      toast({
        title: t('Vulnerabilities Detected'),
        description: t('Found {length} potential security issues', { length: result.vulnerabilities.length }),
        variant: "destructive",
      });
    } else {
      toast({
        title: t('No Known Patterns Found'),
        description: t('No risky patterns matched. This is a static check, not proof the code is safe'),
      });
    }
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { sqlQuery };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setSqlQuery(sampleQuery);
    trackAction('load_sample');
  });

  const buildReport = (testResult: TestResult) => `${t('SQL Injection Security Test Report')}
=====================================

${t('Security Score: {score}/100', { score: testResult.securityScore })}
${t('Tests Passed: {passed}/{total}', { passed: testResult.passedTests, total: testResult.totalTests })}

${t('Vulnerabilities Found ({count}):', { count: testResult.vulnerabilities.length })}
${testResult.vulnerabilities.map((vuln, index) => `
${index + 1}. ${t(vuln.type)} (${t(SEVERITY_LABELS[vuln.severity])})
   ${t('Description: {text}', { text: t(vuln.description) })}
   ${t('Example: {text}', { text: vuln.example })}
   ${t('Mitigation: {text}', { text: t(vuln.mitigation) })}
`).join('\n')}

${t('Recommendations:')}
${testResult.recommendations.map(rec => `- ${t(rec)}`).join('\n')}

${t('Tested SQL:')}
${sqlQuery}
`;

  const copyReport = () => {
    if (!testResult) return;

    const report = buildReport(testResult);

    navigator.clipboard.writeText(report);
    toast({
      title: t('Copied'),
      description: t('Security report copied to clipboard'),
    });
    trackAction('copy_report');
  };

  const downloadReport = () => {
    if (!testResult) return;
    
    const report = buildReport(testResult);

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sql-injection-test-report.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('download_report');
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical': return 'bg-red-100 text-red-800';
      case 'High': return 'bg-orange-100 text-orange-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          {/* Breadcrumb */}
          <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
            subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
            toolName={t('SQL Injection Tester')}
          />
          </div>
          
          <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('SQL Injection Tester')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Paste SQL or the code that builds it and spot string-built queries, interpolated values and classic injection signatures. Static check, runs in your browser.')}</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Security')}</Badge>
                <Badge variant="outline" className="border-red-500 text-red-600 px-3 py-1 bg-red-50 text-xs sm:text-sm">SQL</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('SQL Query Input')}
              <Button variant="outline" size="sm" onClick={loadSample}>
                {t('Load Sample')}
              </Button>
            </CardTitle>
            <CardDescription>
              {t('Paste SQL text, query-building code, or a logged runtime query')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="SELECT * FROM users WHERE username = '$username' AND password = '$password';"
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />
            <Button onClick={handleTest} className="w-full">
              <Shield className="h-4 w-4 mr-2" />
              {t('Test for SQL Injection')}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {testResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {t('Security Analysis')}
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={copyReport}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadReport}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className={`text-4xl font-bold mb-2 ${getScoreColor(testResult.securityScore)}`}>
                      {testResult.securityScore}/100
                    </div>
                    <p className="text-gray-600">{t('Security Score')}</p>
                    <Progress value={testResult.securityScore} className="mt-2" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{testResult.passedTests}</div>
                      <div className="text-xs text-gray-600">{t('Tests Passed')}</div>
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{testResult.vulnerabilities.length}</div>
                      <div className="text-xs text-gray-600">{t('Vulnerabilities')}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {testResult.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
                      {t('Security Recommendations')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {testResult.recommendations.map((recommendation, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{t(recommendation)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {testResult && testResult.vulnerabilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
              {t('Security Vulnerabilities ({length})', { length: testResult.vulnerabilities.length })}
            </CardTitle>
            <CardDescription>
              {t('Detailed analysis of detected SQL injection vulnerabilities')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {testResult.vulnerabilities.map((vulnerability, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Badge className={getSeverityColor(vulnerability.severity)}>
                        {t(SEVERITY_LABELS[vulnerability.severity])}
                      </Badge>
                      <h4 className="font-semibold">{t(vulnerability.type)}</h4>
                    </div>
                    <Eye className="h-4 w-4 text-gray-500" />
                  </div>

                  <p className="text-sm text-gray-600 mb-3">{t(vulnerability.description)}</p>
                  
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium text-red-600">{t('What this pattern looks like:')}</span>
                      <code className="block mt-1 p-2 bg-red-50 rounded text-sm">
                        {vulnerability.example}
                      </code>
                    </div>
                    
                    <div>
                      <span className="text-sm font-medium text-green-600">{t('Mitigation:')}</span>
                      <p className="text-sm text-gray-700 mt-1">{t(vulnerability.mitigation)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Best Practices */}
      <Card>
        <CardHeader>
          <CardTitle>{t('SQL Injection Prevention Best Practices')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">{t('Prevention Techniques:')}</h4>
              <ul className="space-y-1 text-gray-600">
                <li>{t('• Use parameterized queries/prepared statements')}</li>
                <li>{t('• Implement input validation and sanitization')}</li>
                <li>{t('• Apply principle of least privilege')}</li>
                <li>{t('• Use stored procedures when appropriate')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('Security Measures:')}</h4>
              <ul className="space-y-1 text-gray-600">
                <li>{t('• Enable SQL query logging and monitoring')}</li>
                <li>{t('• Regular security testing and code reviews')}</li>
                <li>{t('• Keep database software updated')}</li>
                <li>{t('• Implement Web Application Firewalls (WAF)')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
          </div>
        </div>
        {confirmDialog}
      </>
    );
  };

export default SqlInjectionTester;
