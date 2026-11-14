
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Copy, Download, BarChart3, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';

import { analyzeComplexity, COMPLEXITY_LEVEL_TEXT, type ComplexityMsg, type ComplexityResult } from '@/lib/tools/graphql-complexity-analyzer';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useFormat, useT } from '@/i18n';

const GraphqlComplexityAnalyzer = () => {
  const { t } = useT();
  const format = useFormat();
  // Issues and suggestions in the page's language; the estimate is formatted the page's way.
  const say = (m: ComplexityMsg) => t(m.text, m.vars && 'score' in m.vars && analysis ? { ...m.vars, score: format.number(analysis.score) } : m.vars);
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [graphqlQuery, setGraphqlQuery] = useState('');
  const [analysis, setAnalysis] = useState<ComplexityResult | null>(null);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleQuery = `query GetUserWithPosts($userId: ID!, $first: Int = 10) {
  user(id: $userId) {
    id
    name
    email
    profile {
      bio
      avatar
      socialLinks {
        platform
        url
      }
    }
    posts(first: $first) {
      edges {
        node {
          id
          title
          content
          createdAt
          author {
            name
            profile {
              avatar
            }
          }
          comments(first: 5) {
            edges {
              node {
                id
                content
                author {
                  name
                }
                replies(first: 3) {
                  edges {
                    node {
                      content
                      author {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
          tags {
            name
            color
          }
        }
      }
    }
  }
}`;

  const handleAnalyze = () => {
    if (!graphqlQuery.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter a GraphQL query to analyze'),
        variant: "destructive",
      });
      return;
    }

    trackAction('analyze_complexity');
    
    const result = analyzeComplexity(graphqlQuery);
    setAnalysis(result);

    toast({
      title: t('Success'),
      description: t('Query complexity analyzed - {complexity} complexity detected', { complexity: t(COMPLEXITY_LEVEL_TEXT[result.complexity]) }),
    });
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { graphqlQuery };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setGraphqlQuery(sampleQuery);
    trackAction('load_sample');
  });

  const copyQuery = () => {
    navigator.clipboard.writeText(graphqlQuery);
    toast({
      title: t('Copied'),
      description: t('GraphQL query copied to clipboard'),
    });
    trackAction('copy_query');
  };

  const downloadReport = () => {
    if (!analysis) return;
    
    const report = `${t('GraphQL Query Complexity Analysis Report')}
==========================================

${t('Estimated field resolutions: {score}', { score: analysis.score })}
${t('Complexity Level: {level}', { level: t(COMPLEXITY_LEVEL_TEXT[analysis.complexity]) })}
${t('Query Depth: {depth} levels', { depth: analysis.depth })}
${t('Field Count: {count}', { count: analysis.fieldCount })}

${t('Breakdown:')}
- ${t('Queries: {n}', { n: analysis.breakdown.queries })}
- ${t('Mutations: {n}', { n: analysis.breakdown.mutations })}
- ${t('Subscriptions: {n}', { n: analysis.breakdown.subscriptions })}
- ${t('Fragments: {n}', { n: analysis.breakdown.fragments })}
- ${t('Nested Levels: {n}', { n: analysis.breakdown.nestedLevels })}

${t('Issues Found:')}
${analysis.issueMsgs.map(issue => `- ${say(issue)}`).join('\n')}

${t('Suggestions:')}
${analysis.suggestionMsgs.map(suggestion => `- ${say(suggestion)}`).join('\n')}

${t('Query:')}
${graphqlQuery}
`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graphql-complexity-report.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('download_report');
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'Low': return 'bg-green-100 text-green-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'High': return 'bg-orange-100 text-orange-800';
      case 'Critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('GraphQL Query Complexity Analyzer')}</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {t('Analyze your GraphQL queries for complexity and depth. Prevent expensive operations and optimize performance.')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('GraphQL Query Input')}
              <Button variant="outline" size="sm" onClick={loadSample}>
                {t('Load Sample')}
              </Button>
            </CardTitle>
            <CardDescription>
              {t('Paste your GraphQL query for complexity analysis')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="query GetUser($id: ID!) {
  user(id: $id) {
    name
    email
    posts {
      title
      content
    }
  }
}"
              value={graphqlQuery}
              onChange={(e) => setGraphqlQuery(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
            />
            <div className="flex space-x-2">
              <Button onClick={handleAnalyze} className="flex-1">
                <BarChart3 className="h-4 w-4 mr-2" />
                {t('Analyze Complexity')}
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
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center">
                      <TrendingUp className="h-5 w-5 mr-2" />
                      {t('Complexity Metrics')}
                    </div>
                    <Button variant="outline" size="sm" onClick={downloadReport}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>{t('Complexity Level:')}</span>
                    <Badge className={getComplexityColor(analysis.complexity)}>
                      {t(COMPLEXITY_LEVEL_TEXT[analysis.complexity])}
                    </Badge>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{t('Estimated cost (field resolutions)')}</span>
                      <span>{format.number(analysis.score)}</span>
                    </div>
                    <Progress value={analysis.percent} className="h-2" />
                    <p className="text-xs text-gray-500 mt-1">{t('Log scale: 10 is a sliver, 10,000 fills the bar. Page sizes (first, last, limit) multiply everything nested under them.')}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{analysis.depth}</div>
                      <div className="text-xs text-gray-600">{t('Max Depth')}</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{analysis.fieldCount}</div>
                      <div className="text-xs text-gray-600">{t('Field Count')}</div>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{analysis.breakdown.queries}</div>
                      <div className="text-xs text-gray-600">{t('Queries')}</div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{analysis.breakdown.mutations}</div>
                      <div className="text-xs text-gray-600">{t('Mutations')}</div>
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
                      {analysis.issueMsgs.map((issue, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{say(issue)}</span>
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
                      {analysis.suggestionMsgs.map((suggestion, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{say(suggestion)}</span>
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
      
      {confirmDialog}
    </div>
  );
};

export default GraphqlComplexityAnalyzer;
