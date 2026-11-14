import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, Download, FileText, GitCompare, ArrowRight, AlertCircle, CheckCircle, Minus, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useToast } from '@/hooks/use-toast';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { compareLists, sortItems, splitItems, type SortDirection } from '@/lib/tools/list-comparison';
import { useFormat, useT } from '@/i18n';

interface ListComparisonProps {
  onToolSelect?: (toolId: string) => void;
}

interface ComparisonResult {
  leftOnly: string[];
  rightOnly: string[];
  common: string[];
  leftTotal: number;
  rightTotal: number;
  commonCount: number;
  uniqueLeft: number;
  uniqueRight: number;
  similarityPercentage: number;
}

const ListComparison: React.FC<ListComparisonProps> = ({ onToolSelect }) => {
  const { t } = useT();
  const fmt = useFormat();
  const [leftList, setLeftList] = useState('');
  const [rightList, setRightList] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [trimWhitespace, setTrimWhitespace] = useState(true);
  const [ignoreEmpty, setIgnoreEmpty] = useState(true);
  const [leftSortDirection, setLeftSortDirection] = useState<'none' | 'asc' | 'desc'>('none');
  const [rightSortDirection, setRightSortDirection] = useState<'none' | 'asc' | 'desc'>('none');
  
  const { trackTool } = useAnalytics();
  const { toast } = useToast();

  const options = { caseSensitive, trimWhitespace, ignoreEmpty };

  const applySortToTextarea = (text: string, direction: SortDirection): string => {
    if (direction === 'none') return text;
    return sortItems(splitItems(text, options), direction).join('\n');
  };

  const handleLeftSort = (direction: 'asc' | 'desc') => {
    const newDirection = leftSortDirection === direction ? 'none' : direction;
    setLeftSortDirection(newDirection);
    if (newDirection !== 'none') {
      setLeftList(applySortToTextarea(leftList, newDirection));
    }
  };

  const handleRightSort = (direction: 'asc' | 'desc') => {
    const newDirection = rightSortDirection === direction ? 'none' : direction;
    setRightSortDirection(newDirection);
    if (newDirection !== 'none') {
      setRightList(applySortToTextarea(rightList, newDirection));
    }
  };

  const comparisonResult: ComparisonResult = useMemo(() => {
    if (!leftList.trim() || !rightList.trim()) {
      return {
        leftOnly: [],
        rightOnly: [],
        common: [],
        leftTotal: 0,
        rightTotal: 0,
        commonCount: 0,
        uniqueLeft: 0,
        uniqueRight: 0,
        similarityPercentage: 0
      };
    }

    return compareLists(leftList, rightList, options, leftSortDirection, rightSortDirection);
  }, [leftList, rightList, caseSensitive, trimWhitespace, ignoreEmpty, leftSortDirection, rightSortDirection]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied to clipboard'),
      description: t('{label} copied successfully', { label }),
    });
    trackTool('List Comparison', 'copy');
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackTool('List Comparison', 'download');
  };

  const generateReport = () => {
    const yesNo = (on: boolean) => (on ? t('Yes') : t('No'));
    const sortName = { none: t('none'), asc: t('asc'), desc: t('desc') };
    const report = `${t('List Comparison Report')}
${t('Generated: {date}', { date: fmt.date(new Date(), { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) })}

${t('Configuration:')}
- ${t('Case Sensitive: {value}', { value: yesNo(caseSensitive) })}
- ${t('Trim Whitespace: {value}', { value: yesNo(trimWhitespace) })}
- ${t('Ignore Empty Lines: {value}', { value: yesNo(ignoreEmpty) })}
- ${t('Sort List A: {value}', { value: sortName[leftSortDirection] })}
- ${t('Sort List B: {value}', { value: sortName[rightSortDirection] })}

${t('Summary:')}
- ${t('List A Items: {n}', { n: comparisonResult.leftTotal })}
- ${t('List B Items: {n}', { n: comparisonResult.rightTotal })}
- ${t('Common Items: {n}', { n: comparisonResult.commonCount })}
- ${t('Only in List A: {n}', { n: comparisonResult.uniqueLeft })}
- ${t('Only in List B: {n}', { n: comparisonResult.uniqueRight })}
- ${t('Similarity: {value}%', { value: fmt.number(comparisonResult.similarityPercentage) })}

=== ${t('ITEMS ONLY IN LIST A')} ===
${comparisonResult.leftOnly.join('\n')}

=== ${t('ITEMS ONLY IN LIST B')} ===
${comparisonResult.rightOnly.join('\n')}

=== ${t('COMMON ITEMS')} ===
${comparisonResult.common.join('\n')}
`;
    return report;
  };

  return (
    <TooltipProvider>
      <>
        
        <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
          <div className="container mx-auto px-4 pt-6 max-w-6xl">
            <ToolBreadcrumb 
              category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
              subcategory={{ label: t('Diff Tools'), href: '/category/development-tech#diff-tools' }}
              toolName={t('List Comparison Tool')}
            />
            
            <div className="mt-6 mb-6 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <GitCompare className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                  {t('Compare Two Lists')}
                </h1>
              </div>
              <p className="text-muted-foreground text-sm sm:text-base max-w-3xl mx-auto leading-relaxed">
                {t('Compare two lists to find differences, similarities, and unique items with advanced filtering options')}
              </p>
            </div>

            {/* Input Section - Full width on desktop */}
            <Card className="shadow-lg border-0 bg-card/50 backdrop-blur mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  {t('Input Lists')}
                </CardTitle>
                <CardDescription>
                  {t('Enter two lists to compare (one item per line)')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="leftList">{t('List A')}</Label>
                    <div className="relative">
                      <Textarea
                        id="leftList"
                        placeholder={t('Enter first list here (one item per line)...')}
                        value={leftList}
                        onChange={(e) => setLeftList(e.target.value)}
                        className="min-h-48 xl:min-h-64 font-mono text-sm pr-12 border-muted-foreground/20 focus:border-primary"
                      />
                      <div className="absolute top-2 right-2 flex flex-col gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-6 w-6 p-0 ${leftSortDirection === 'asc' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                              onClick={() => handleLeftSort('asc')}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{leftSortDirection === 'asc' ? t('Remove sort') : t('Sort ascending (A-Z)')}</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-6 w-6 p-0 ${leftSortDirection === 'desc' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                              onClick={() => handleLeftSort('desc')}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{leftSortDirection === 'desc' ? t('Remove sort') : t('Sort descending (Z-A)')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="rightList">{t('List B')}</Label>
                    <div className="relative">
                      <Textarea
                        id="rightList"
                        placeholder={t('Enter second list here (one item per line)...')}
                        value={rightList}
                        onChange={(e) => setRightList(e.target.value)}
                        className="min-h-48 xl:min-h-64 font-mono text-sm pr-12 border-muted-foreground/20 focus:border-primary"
                      />
                      <div className="absolute top-2 right-2 flex flex-col gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-6 w-6 p-0 ${rightSortDirection === 'asc' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                              onClick={() => handleRightSort('asc')}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{rightSortDirection === 'asc' ? t('Remove sort') : t('Sort ascending (A-Z)')}</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-6 w-6 p-0 ${rightSortDirection === 'desc' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                              onClick={() => handleRightSort('desc')}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{rightSortDirection === 'desc' ? t('Remove sort') : t('Sort descending (Z-A)')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={caseSensitive}
                      onChange={(e) => setCaseSensitive(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{t('Case sensitive')}</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trimWhitespace}
                      onChange={(e) => setTrimWhitespace(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{t('Trim whitespace')}</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ignoreEmpty}
                      onChange={(e) => setIgnoreEmpty(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{t('Ignore empty lines')}</span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Summary Section - Below inputs */}
            <Card className="shadow-lg border-0 bg-card/50 backdrop-blur mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  {t('Comparison Summary')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leftList.trim() && rightList.trim() ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-primary">{comparisonResult.leftTotal}</div>
                        <div className="text-sm text-muted-foreground">{t('List A Items')}</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-bold text-primary">{comparisonResult.rightTotal}</div>
                        <div className="text-sm text-muted-foreground">{t('List B Items')}</div>
                      </div>
                    </div>
                    
                    <div className="text-center p-4 bg-primary/10 rounded-lg">
                      <div className="text-3xl font-bold text-primary">{fmt.number(comparisonResult.similarityPercentage)}%</div>
                      <div className="text-sm text-muted-foreground">{t('Similarity')}</div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-green-50 dark:bg-green-950 rounded">
                        <div className="font-semibold text-green-700 dark:text-green-300">{comparisonResult.commonCount}</div>
                        <div className="text-xs text-green-600 dark:text-green-400">{t('Common')}</div>
                      </div>
                      <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded">
                        <div className="font-semibold text-blue-700 dark:text-blue-300">{comparisonResult.uniqueLeft}</div>
                        <div className="text-xs text-blue-600 dark:text-blue-400">{t('Only A')}</div>
                      </div>
                      <div className="p-2 bg-orange-50 dark:bg-orange-950 rounded">
                        <div className="font-semibold text-orange-700 dark:text-orange-300">{comparisonResult.uniqueRight}</div>
                        <div className="text-xs text-orange-600 dark:text-orange-400">{t('Only B')}</div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleDownload(generateReport(), 'list-comparison-report.txt')}
                        className="flex-1"
                        variant="outline"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {t('Download Report')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('Enter both lists to see comparison results')}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Results Section */}
            {leftList.trim() && rightList.trim() && (
              <Card className="shadow-lg border-0 bg-card/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitCompare className="h-5 w-5 text-primary" />
                    {t('Detailed Results')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="common" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="common" className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        {t('Common ({commonCount})', { commonCount: comparisonResult.commonCount })}
                      </TabsTrigger>
                      <TabsTrigger value="leftOnly" className="flex items-center gap-2">
                        <Minus className="h-4 w-4" />
                        {t('Only in A ({uniqueLeft})', { uniqueLeft: comparisonResult.uniqueLeft })}
                      </TabsTrigger>
                      <TabsTrigger value="rightOnly" className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        {t('Only in B ({uniqueRight})', { uniqueRight: comparisonResult.uniqueRight })}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="common" className="mt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-green-700 dark:text-green-300">
                            {t('Items in Both Lists')}
                          </h3>
                          <Button
                            onClick={() => handleCopy(comparisonResult.common.join('\n'), t('Common items'))}
                            variant="outline"
                            size="sm"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            {t('Copy')}
                          </Button>
                        </div>
                        <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg max-h-64 overflow-y-auto">
                          {comparisonResult.common.length > 0 ? (
                            <div className="space-y-1">
                              {comparisonResult.common.map((item, index) => (
                                <div key={index} className="font-mono text-sm text-green-800 dark:text-green-200">
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-green-600 dark:text-green-400 italic">{t('No common items found')}</p>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="leftOnly" className="mt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                            {t('Items Only in List A')}
                          </h3>
                          <Button
                            onClick={() => handleCopy(comparisonResult.leftOnly.join('\n'), t('List A unique items'))}
                            variant="outline"
                            size="sm"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            {t('Copy')}
                          </Button>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg max-h-64 overflow-y-auto">
                          {comparisonResult.leftOnly.length > 0 ? (
                            <div className="space-y-1">
                              {comparisonResult.leftOnly.map((item, index) => (
                                <div key={index} className="font-mono text-sm text-blue-800 dark:text-blue-200">
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-blue-600 dark:text-blue-400 italic">{t('No unique items in List A')}</p>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="rightOnly" className="mt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-300">
                            {t('Items Only in List B')}
                          </h3>
                          <Button
                            onClick={() => handleCopy(comparisonResult.rightOnly.join('\n'), t('List B unique items'))}
                            variant="outline"
                            size="sm"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            {t('Copy')}
                          </Button>
                        </div>
                        <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg max-h-64 overflow-y-auto">
                          {comparisonResult.rightOnly.length > 0 ? (
                            <div className="space-y-1">
                              {comparisonResult.rightOnly.map((item, index) => (
                                <div key={index} className="font-mono text-sm text-orange-800 dark:text-orange-200">
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-orange-600 dark:text-orange-400 italic">{t('No unique items in List B')}</p>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </>
    </TooltipProvider>
  );
};

export default ListComparison;