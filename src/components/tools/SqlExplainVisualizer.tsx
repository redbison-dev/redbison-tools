
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Copy, Download, Search, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import {
  analyzePerformance,
  generateRecommendations,
  parseExplainPlan,
  type ExecutionNode,
} from '@/lib/tools/sql-explain-visualizer';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

const SqlExplainVisualizer = () => {
  const { t, tr } = useT();
  const [explainPlan, setExplainPlan] = useState('');
  const [parsedPlan, setParsedPlan] = useState<ExecutionNode | null>(null);
  const [analysis, setAnalysis] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleExplainPlan = `[
  {
    "Plan": {
      "Node Type": "Hash Join",
      "Join Type": "Inner",
      "Startup Cost": 30.5,
      "Total Cost": 1543.2,
      "Plan Rows": 5000,
      "Actual Startup Time": 1.2,
      "Actual Total Time": 38.4,
      "Actual Rows": 4890,
      "Actual Loops": 1,
      "Hash Cond": "(o.user_id = u.id)",
      "Plans": [
        {
          "Node Type": "Seq Scan",
          "Relation Name": "orders",
          "Alias": "o",
          "Total Cost": 1250.0,
          "Plan Rows": 50000,
          "Actual Total Time": 21.7,
          "Actual Rows": 50000,
          "Actual Loops": 1,
          "Filter": "(status = 'paid'::text)"
        },
        {
          "Node Type": "Hash",
          "Total Cost": 18.0,
          "Plan Rows": 1500,
          "Actual Total Time": 0.9,
          "Actual Rows": 120,
          "Actual Loops": 1,
          "Plans": [
            {
              "Node Type": "Index Scan",
              "Relation Name": "users",
              "Index Name": "users_created_at_idx",
              "Alias": "u",
              "Total Cost": 18.0,
              "Plan Rows": 1500,
              "Actual Total Time": 0.6,
              "Actual Rows": 120,
              "Actual Loops": 1,
              "Index Cond": "(created_at >= '2026-01-01'::date)"
            }
          ]
        }
      ]
    },
    "Planning Time": 0.3,
    "Execution Time": 39.1
  }
]`;

  const visualizePlan = () => {
    if (!explainPlan.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter an execution plan'),
        variant: "destructive",
      });
      return;
    }

    trackAction('visualize_plan');

    const parsed = parseExplainPlan(explainPlan);
    if (!parsed) {
      toast({
        title: t('Error'),
        description: t('Could not read this plan. Paste PostgreSQL EXPLAIN (FORMAT JSON) output.'),
        variant: "destructive",
      });
      return;
    }

    setParsedPlan(parsed);
    setAnalysis(analyzePerformance(parsed, t));
    setRecommendations(generateRecommendations(parsed, t));

    toast({
      title: t('Success'),
      description: t('Execution plan analyzed successfully'),
    });
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { explainPlan };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setExplainPlan(sampleExplainPlan);
    trackAction('load_sample');
  });

  const copyPlan = () => {
    navigator.clipboard.writeText(explainPlan);
    toast({
      title: t('Copied'),
      description: t('Execution plan copied to clipboard'),
    });
    trackAction('copy_plan');
  };

  const getOperationColor = (type: ExecutionNode['type']) => {
    switch (type) {
      case 'scan': return 'bg-blue-100 text-blue-800';
      case 'join': return 'bg-green-100 text-green-800';
      case 'sort': return 'bg-yellow-100 text-yellow-800';
      case 'filter': return 'bg-purple-100 text-purple-800';
      case 'aggregate': return 'bg-orange-100 text-orange-800';
      case 'other': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const renderExecutionNode = (node: ExecutionNode, level: number = 0) => (
    <div key={node.id} className="mb-3" style={{ marginLeft: level ? '1rem' : 0 }}>
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Badge className={getOperationColor(node.type)}>
                {node.operation}
              </Badge>
              {node.table && <span className="text-sm text-gray-600">{t('on {table}', { table: node.table })}</span>}
              {node.index && <span className="text-sm text-green-600">{t('using {index}', { index: node.index })}</span>}
            </div>
            <div className="text-sm text-gray-500">
              {t('Cost: {value} | Est. rows: {rows}', { value: node.cost.toFixed(2), rows: node.rows })}{node.actualRows !== undefined ? t(' | Actual rows: {rows}', { rows: node.actualRows }) : ''}{' '}{t('| Time: {value}ms', { value: node.time.toFixed(3) })}{node.loops > 1 ? t(' ({loops} loops)', { loops: node.loops }) : ''}
            </div>
          </div>
          
          {node.details && (
            <div className="text-sm text-gray-600 mb-2">
              {tr('{label} {details}', { label: <strong>{t('Details:')}</strong>, details: node.details })}
            </div>
          )}
          
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span>{t('Cost Impact')}</span>
                <span>{((node.cost / (parsedPlan?.cost || 1)) * 100).toFixed(1)}%</span>
              </div>
              <Progress value={(node.cost / (parsedPlan?.cost || 1)) * 100} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {node.children.map(child => renderExecutionNode(child, level + 1))}
    </div>
  );

  return (
    <>
      <div className="max-w-7xl mx-auto px-8 -mt-5 pb-1 sm:pb-2">
        {/* Breadcrumb */}
        <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
        <ToolBreadcrumb 
          category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
          subcategory={{ label: t('Database Tools'), href: "/category/development-tech/database-tools" }}
          toolName={t('SQL Explain Visualizer')}
        />
        </div>
      </div>


    <div className="w-full max-w-7xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('PostgreSQL EXPLAIN Plan Visualizer')}</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {t('Paste PostgreSQL EXPLAIN (FORMAT JSON) output, with or without ANALYZE, to see the plan as a tree with cost share, row estimates and flagged hot spots.')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('Execution Plan Input')}
              <Button variant="outline" size="sm" onClick={loadSample}>
                {t('Load Sample')}
              </Button>
            </CardTitle>
            <CardDescription>
              {t('Paste the output of EXPLAIN (ANALYZE, FORMAT JSON) from PostgreSQL')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={t('Paste the JSON from EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ...')}
              value={explainPlan}
              onChange={(e) => setExplainPlan(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />
            <div className="flex space-x-2">
              <Button onClick={visualizePlan} className="flex-1">
                <Search className="h-4 w-4 mr-2" />
                {t('Analyze Plan')}
              </Button>
              <Button variant="outline" onClick={copyPlan}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {analysis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
                  {t('Performance Issues')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.map((issue, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{issue}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
                  {t('Optimization Recommendations')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recommendations.map((rec, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{rec}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {parsedPlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Info className="h-5 w-5 mr-2" />
              {t('Execution Plan Visualization')}
            </CardTitle>
            <CardDescription>
              {t('Visual representation of your query execution plan')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{parsedPlan.cost.toFixed(2)}</div>
                    <div className="text-sm text-gray-600">{t('Total Cost')}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{parsedPlan.rows}</div>
                    <div className="text-sm text-gray-600">{t('Estimated Rows')}</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-600">{parsedPlan.time.toFixed(3)}ms</div>
                    <div className="text-sm text-gray-600">{t('Actual Time (root)')}</div>
                  </div>
                </div>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {renderExecutionNode(parsedPlan)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
      {confirmDialog}
    </>
  );
};

export default SqlExplainVisualizer;
