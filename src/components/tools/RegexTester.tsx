
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, TestTube, Search, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';

import { matchRegex } from '@/lib/tools/textConversions';
import { useToolResult } from '@/hooks/useToolResult';
import { msg, useT } from '@/i18n';

const RegexTester = () => {
  const { t } = useT();
  const [testText, setTestText] = useState('');
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [matches, setMatches] = useState<string[]>([]);
  const [isMatch, setIsMatch] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const testRegex = () => {
    try {
      if (!pattern) {
        setError(t('Please enter a regex pattern'));
        setMatches([]);
        setIsMatch(null);
        return;
      }

      const result = matchRegex(testText, pattern, flags);
      setMatches(result.matches);
      setIsMatch(result.isMatch);
      setError('');
      
      trackAction('test_regex');
    } catch (err) {
      setError(t('Invalid regex pattern'));
      setMatches([]);
      setIsMatch(null);
    }
  };

  const copyMatches = () => {
    const matchText = matches.join('\n');
    navigator.clipboard.writeText(matchText);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_matches');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const commonPatterns = [
    { name: msg('Email'), pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}' },
    { name: msg('Phone (US)'), pattern: '\\(\\d{3}\\)\\s\\d{3}-\\d{4}' },
    { name: 'URL', pattern: 'https?://[\\w\\-._~:/?#\\[\\]@!$&\'()*+,;=]+' },
    { name: msg('IP Address'), pattern: '\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b' },
    { name: msg('Date (MM/DD/YYYY)'), pattern: '\\d{2}/\\d{2}/\\d{4}' },
    { name: msg('Hex Color'), pattern: '#[0-9A-Fa-f]{6}' },
  ];

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('validated', isMatch === null ? '' : `${isMatch}:${matches.join('\u0000')}`);

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: t('Text Processing'), href: "/category/development-tech/text-processing" }}
                toolName={t('Regex Tester')}
              />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Search className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-purple-600" />
                    {t('Regex Tester')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Test regular expressions against text')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{t('Regex')}</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Test')}</Badge>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black flex items-center text-lg sm:text-xl">
                    <Search className="h-5 w-5 mr-2 text-purple-600" />
                    {t('Regex Pattern & Test Text')}
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Enter your regex pattern and test text')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 sm:space-y-6">
                  <div>
                    <label className="text-black text-sm mb-2 block font-medium">{t('Regex Pattern')}</label>
                    <Input
                      value={pattern}
                      onChange={(e) => setPattern(e.target.value)}
                      placeholder={t('e.g., ^[A-Za-z]+$')}
                      className="bg-white border-2 border-gray-200 text-black font-mono focus:border-purple-500 w-full text-sm sm:text-base"
                    />
                  </div>
                  
                  <div>
                    <label className="text-black text-sm mb-2 block font-medium">{t('Flags')}</label>
                    <Input
                      value={flags}
                      onChange={(e) => setFlags(e.target.value)}
                      placeholder={t('g, i, m, s, etc.')}
                      className="bg-white border-2 border-gray-200 text-black font-mono focus:border-purple-500 w-full text-sm sm:text-base"
                    />
                  </div>

                  <div>
                    <label className="text-black text-sm mb-2 block font-medium">{t('Test Text')}</label>
                    <Textarea
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      placeholder={t('Enter text to test against the regex...')}
                      className="min-h-[120px] sm:min-h-[150px] bg-white border-2 border-gray-200 text-black focus:border-purple-500 w-full text-sm sm:text-base"
                    />
                  </div>

                  <Button onClick={testRegex} className="bg-purple-600 hover:bg-purple-700 text-white w-full py-3 rounded-xl font-medium text-sm sm:text-base">
                    <TestTube className="h-4 w-4 mr-2" />
                    {t('Test Regex')}
                  </Button>

                  {error && (
                    <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-xl">
                      {error}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black flex items-center justify-between text-lg sm:text-xl">
                    <span>{t('Results')}</span>
                    {matches.length > 0 && (
                      <Button 
                        size="sm" 
                        onClick={copyMatches}
                        className={`transition-all duration-300 ${
                          copyAnimation ? 'bg-green-600 scale-105' : 'bg-gray-600 hover:bg-gray-700'
                        } text-white px-3 py-2 rounded-lg text-xs sm:text-sm`}
                      >
                        <Copy className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        {copyAnimation ? t('Copied!') : t('Copy')}
                      </Button>
                    )}
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Test results and matches')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 sm:space-y-6">
                  {isMatch !== null && (
                    <div className={`p-3 sm:p-4 rounded-xl border-2 font-medium text-sm sm:text-base ${
                      isMatch 
                        ? 'bg-green-50 border-green-200 text-green-700' 
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                      <strong>{t('Pattern Match:')}{' '}</strong>
                      {isMatch ? t('Yes ✅') : t('No ❌')}
                    </div>
                  )}

                  {matches.length > 0 && (
                    <div>
                      <h4 className="text-black font-semibold mb-3 text-sm sm:text-base">
                        {t('Matches Found ({length}):', { length: matches.length })}
                      </h4>
                      <div className="bg-gray-50 p-3 sm:p-4 rounded-xl border-2 border-gray-200 max-h-60 overflow-y-auto">
                        {matches.map((match, index) => (
                          <div key={index} className="text-green-600 font-mono text-xs sm:text-sm mb-2 p-2 bg-white rounded border">
                            <span className="text-gray-500 mr-2">{index + 1}:</span>
                            {match}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-black font-semibold mb-3 text-sm sm:text-base">{t('Common Patterns:')}</h4>
                    <div className="space-y-2">
                      {commonPatterns.map((p, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => setPattern(p.pattern)}
                          className="w-full justify-start border-2 border-gray-200 text-black hover:bg-gray-50 hover:border-gray-300 p-2 sm:p-3 h-auto text-left"
                        >
                          <div className="text-left w-full">
                            <span className="font-semibold block text-gray-900 text-xs sm:text-sm">{t(p.name)}</span>
                            <code className="text-xs text-gray-600 mt-1 block break-all">{p.pattern}</code>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            </div>
          </div>
        </div>
    </>
  );
};

export default RegexTester;
