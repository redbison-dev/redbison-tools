import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Copy, Search, Eye, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { findDuplicateEntries, NO_DUPLICATES, NO_ENTRIES } from '@/lib/tools/find-duplicate-entries';
import { useT } from '@/i18n';

const FindDuplicateEntries = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [trimSpaces, setTrimSpaces] = useState(true);
  const [removeExtraSpaces, setRemoveExtraSpaces] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(true);
  const [includeCount, setIncludeCount] = useState(true);
  const [stats, setStats] = useState<{
    totalLines: number;
    uniqueLines: number;
    duplicateLines: number;
    duplicateCount: number;
  }>({ totalLines: 0, uniqueLines: 0, duplicateLines: 0, duplicateCount: 0 });
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const findDuplicates = () => {
    const { output, stats: result } = findDuplicateEntries(inputText, {
      caseSensitive,
      trimSpaces,
      removeExtraSpaces,
      showOnlyDuplicates,
      includeCount,
    }, t);
    setOutputText(output);
    setStats(result);
    const { totalLines, uniqueLines, duplicateLines, duplicateCount } = result;

    trackAction('find_duplicate_entries', { 
      totalLines,
      uniqueLines,
      duplicateLines,
      duplicateCount,
      caseSensitive,
      trimSpaces,
      removeExtraSpaces,
      showOnlyDuplicates,
      includeCount
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputText);
    toast({ title: t('Copied!'), description: t('Duplicate entries copied to clipboard') });
    trackAction('copy_duplicate_entries');
  };

  const clearAll = () => {
    setInputText('');
    setOutputText('');
    setStats({ totalLines: 0, uniqueLines: 0, duplicateLines: 0, duplicateCount: 0 });
  };

  return (
    <>

      <div className={`${false ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${false ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: t('Text Processing'), href: "/category/development-tech/text-processing" }}
                toolName="Find Duplicate Entries"
              />
            </div>
            
            <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Search className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('Find Duplicate Entries')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">
                  {t('Find and analyze duplicate entries in your text with frequency counts')}
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Duplicate')}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Analyzer')}</Badge>
              </div>
            </div>
          </div>
          
          <div className="space-y-6 mt-6 sm:mt-8">
            {/* Statistics */}
            {stats.totalLines > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{stats.totalLines}</div>
                      <div className="text-sm text-gray-600">{t('Total Lines')}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{stats.uniqueLines}</div>
                      <div className="text-sm text-gray-600">{t('Unique Lines')}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-orange-600">{stats.duplicateCount}</div>
                      <div className="text-sm text-gray-600">{t('Duplicate Types')}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">{stats.duplicateLines}</div>
                      <div className="text-sm text-gray-600">{t('Extra Duplicates')}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('Input Text')}</CardTitle>
                  <CardDescription>{t('Paste your text to find duplicate entries')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={t('Line 1\nLine 2\nLine 1\nLine 3\nLine 2\nLine 4')}
                    className="min-h-[300px] font-mono text-sm"
                  />
                  
                  {/* Settings */}
                  <Card className="bg-gray-50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        {t('Options')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="case-sensitive"
                            checked={caseSensitive}
                            onCheckedChange={setCaseSensitive}
                          />
                          <Label htmlFor="case-sensitive" className="text-xs">{t('Case sensitive')}</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="trim-spaces"
                            checked={trimSpaces}
                            onCheckedChange={setTrimSpaces}
                          />
                          <Label htmlFor="trim-spaces" className="text-xs">{t('Trim spaces')}</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="remove-extra-spaces"
                            checked={removeExtraSpaces}
                            onCheckedChange={setRemoveExtraSpaces}
                          />
                          <Label htmlFor="remove-extra-spaces" className="text-xs">{t('Remove extra spaces')}</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="show-only-duplicates"
                            checked={showOnlyDuplicates}
                            onCheckedChange={setShowOnlyDuplicates}
                          />
                          <Label htmlFor="show-only-duplicates" className="text-xs">{t('Only duplicates')}</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="include-count"
                            checked={includeCount}
                            onCheckedChange={setIncludeCount}
                          />
                          <Label htmlFor="include-count" className="text-xs">{t('Show count in result')}</Label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <div className="flex space-x-2">
                    <Button onClick={findDuplicates} disabled={!inputText}>
                      <Eye className="h-4 w-4 mr-2" />
                      {t('Find Duplicates')}
                    </Button>
                    <Button variant="outline" onClick={clearAll}>
                      {t('Clear')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Output */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('Results')}</CardTitle>
                  <CardDescription>
                    {showOnlyDuplicates 
                      ? includeCount 
                        ? t('Duplicate entries with frequency counts')
                        : t('Duplicate entries only')
                      : includeCount
                        ? t('All entries with frequency counts')
                        : t('All unique entries')
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={outputText}
                    readOnly
                    placeholder={showOnlyDuplicates 
                      ? t('Duplicate entries will appear here...') 
                      : t('All entries will appear here...')
                    }
                    className="min-h-[300px] font-mono text-sm bg-gray-50"
                  />
                  <Button 
                    onClick={copyToClipboard} 
                    disabled={!outputText || outputText === t(NO_DUPLICATES) || outputText === t(NO_ENTRIES)}
                    className="w-full"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('Copy Result')}
                  </Button>
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

export default FindDuplicateEntries;