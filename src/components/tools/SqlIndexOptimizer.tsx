
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Zap, Database, Maximize, Minimize, Copy } from 'lucide-react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { suggestIndexes, type IndexSuggestion } from '@/lib/tools/sql-index-optimizer';
import { useT } from '@/i18n';

const SqlIndexOptimizer = () => {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<IndexSuggestion[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const analyzeQuery = () => {
    if (!query.trim()) {
      return;
    }

    const optimizations = suggestIndexes(query, t);
    setSuggestions(optimizations);
    setAnalyzed(true);
    trackAction('analyze_query_performance');
  };

  const copySuggestions = () => {
    const suggestionsText = suggestions.map((s) => `-- ${s.reason}\n${s.sql}`).join('\n\n');
    navigator.clipboard.writeText(suggestionsText);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_index_suggestions');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-8 -mt-5 pb-1 sm:pb-2">
        {/* Breadcrumb */}
        <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
        <ToolBreadcrumb 
          category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
          subcategory={{ label: t('Database Tools'), href: "/category/development-tech/database-tools" }}
          toolName={t('SQL Index Optimizer')}
        />
        </div>
      </div>


      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Zap className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-yellow-600" />
                    {t('SQL Index Optimizer')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Reads the WHERE, JOIN and ORDER BY columns of a query and proposes composite indexes. A heuristic: confirm each one with EXPLAIN.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600 px-3 py-1 bg-yellow-50 text-xs sm:text-sm">{t('Performance')}</Badge>
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">SQL</Badge>
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
                  <CardTitle className="text-black text-lg sm:text-xl">{t('SQL Query')}</CardTitle>
                  <CardDescription>{t('Enter your SQL query for performance analysis')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="SELECT u.name, o.total 
FROM users u 
JOIN orders o ON u.id = o.user_id 
WHERE u.status = 'active' 
ORDER BY o.created_at DESC;"
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <Button 
                    onClick={analyzeQuery}
                    disabled={!query.trim()}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    {t('Analyze Query')}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                    {t('Index Suggestions')}
                    {suggestions.length > 0 && (
                      <Button
                        size="sm"
                        onClick={copySuggestions}
                        className={`transition-all duration-300 ${
                          copyAnimation ? 'bg-green-600 scale-105' : 'bg-gray-600 hover:bg-gray-700'
                        } text-white`}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        {copyAnimation ? t('Copied!') : t('Copy')}
                      </Button>
                    )}
                  </CardTitle>
                  <CardDescription>{t('Candidate indexes, equality columns first. Check them against the indexes you already have.')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {suggestions.length > 0 ? (
                    <div className="space-y-3">
                      {suggestions.map((suggestion, index) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-lg border space-y-1">
                          <code className="text-sm text-gray-800 block break-all">{suggestion.sql}</code>
                          <p className="text-xs text-gray-500">{suggestion.reason}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
                      {analyzed
                        ? t('No filter, join or sort columns found that an index would serve. Check that the query has a WHERE, JOIN ... ON or ORDER BY clause.')
                        : t('Index suggestions will appear here after analysis')}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SqlIndexOptimizer;
