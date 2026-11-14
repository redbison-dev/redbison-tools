
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Copy, Download, Search, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { analyzeSqlQuery, type QueryAnalysis } from '@/lib/tools/sql-query-analyzer';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { msg, useT } from '@/i18n';

type AnalysisResult = QueryAnalysis;

const COMPLEXITY_LABELS = { Low: msg('Low'), Medium: msg('Medium'), High: msg('High') } as const;

const SqlQueryAnalyzer = () => {
  const { t } = useT();
  const [sqlQuery, setSqlQuery] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleQuery = `SELECT 
  u.id, 
  u.name, 
  u.email,
  COUNT(o.id) as order_count,
  SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2023-01-01'
  AND u.status = 'active'
  AND EXISTS (
    SELECT 1 
    FROM user_preferences up 
    WHERE up.user_id = u.id 
      AND up.newsletter = true
  )
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 100;`;

  const analyzeQuery = (query: string): AnalysisResult => analyzeSqlQuery(query);

  const handleAnalyze = () => {
    if (!sqlQuery.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter a SQL query to analyze'),
        variant: "destructive",
      });
      return;
    }

    trackAction('analyze_query');
    
    const result = analyzeQuery(sqlQuery);
    setAnalysis(result);

    toast({
      title: t('Success'),
      description: t('SQL query analyzed successfully'),
    });
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { sqlQuery };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setSqlQuery(sampleQuery);
    trackAction('load_sample');
  });

  const copyQuery = () => {
    navigator.clipboard.writeText(sqlQuery);
    toast({
      title: t('Copied'),
      description: t('SQL query copied to clipboard'),
    });
    trackAction('copy_query');
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'Low': return 'bg-green-100 text-green-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'High': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-8 -mt-5 pb-1 sm:pb-2">
        {/* Breadcrumb */}
        <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
        <ToolBreadcrumb 
          category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
          subcategory={{ label: t('Database Tools'), href: "/category/development-tech/database-tools" }}
          toolName={t('SQL Query Analyzer')}
        />
        </div>
      </div>


    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('SQL Query Analyzer')}</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {t('A heuristic, text-based review: counts joins, subqueries and filters and flags common anti-patterns. It does not run the query or see your indexes.')}
        </p>
      </div>

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
              {t('Paste your SQL query for analysis')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={t('Enter your SQL query here...')}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />
            <div className="flex space-x-2">
              <Button onClick={handleAnalyze} className="flex-1">
                <Search className="h-4 w-4 mr-2" />
                {t('Analyze Query')}
              </Button>
              <Button variant="outline" onClick={copyQuery}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {analysis && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    {t('Query Metrics')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>{t('Complexity:')}</span>
                    <Badge className={getComplexityColor(analysis.complexity)}>
                      {t(COMPLEXITY_LABELS[analysis.complexity])}
                    </Badge>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{t('Complexity Score')}</span>
                      <span>{analysis.score}/100</span>
                    </div>
                    <Progress value={analysis.score} className="h-2" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{analysis.metrics.joins}</div>
                      <div className="text-xs text-gray-600">JOINs</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{analysis.metrics.subqueries}</div>
                      <div className="text-xs text-gray-600">{t('Subqueries')}</div>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{analysis.metrics.aggregates}</div>
                      <div className="text-xs text-gray-600">{t('Aggregates')}</div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{analysis.metrics.conditions}</div>
                      <div className="text-xs text-gray-600">{t('Conditions')}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {analysis.issues.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
                      {t('Issues Found')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analysis.issues.map((issue, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{t(issue)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {analysis.suggestions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
                      {t('Optimization Suggestions')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analysis.suggestions.map((suggestion, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{t(suggestion)}</span>
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
    </div>
      {confirmDialog}
    </>
  );
};

export default SqlQueryAnalyzer;
