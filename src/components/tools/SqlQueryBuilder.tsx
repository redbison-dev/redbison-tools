
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Play, Plus, Trash2, Database, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { buildSqlQuery, OPERATORS, type QueryType } from '@/lib/tools/sql-query-builder';
import { useT } from '@/i18n';

interface QueryField {
  id: string;
  field: string;
  alias?: string;
}

interface QueryCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

const SqlQueryBuilder = () => {
  const { t } = useT();
  const [queryType, setQueryType] = useState('SELECT');
  const [tableName, setTableName] = useState('');
  const [fields, setFields] = useState<QueryField[]>([]);
  const [conditions, setConditions] = useState<QueryCondition[]>([]);
  const [joinType, setJoinType] = useState('INNER');
  const [joinTable, setJoinTable] = useState('');
  const [joinCondition, setJoinCondition] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [limit, setLimit] = useState('');
  const [generatedQuery, setGeneratedQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const [downloadAnimation, setDownloadAnimation] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const operators = OPERATORS;
  const isSelect = queryType === 'SELECT';

  const addField = () => {
    const newField: QueryField = {
      id: `${Date.now()}-${Math.random()}`,
      field: '',
    };
    setFields([...fields, newField]);
  };

  const updateField = (id: string, key: keyof QueryField, value: string) => {
    setFields(fields.map(field => 
      field.id === id ? { ...field, [key]: value } : field
    ));
  };

  const removeField = (id: string) => {
    setFields(fields.filter(field => field.id !== id));
  };

  const addCondition = () => {
    const newCondition: QueryCondition = {
      id: `${Date.now()}-${Math.random()}`,
      field: '',
      operator: '=',
      value: '',
    };
    setConditions([...conditions, newCondition]);
  };

  const updateCondition = (id: string, key: keyof QueryCondition, value: string) => {
    setConditions(conditions.map(condition => 
      condition.id === id ? { ...condition, [key]: value } : condition
    ));
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(condition => condition.id !== id));
  };

  const buildQuery = () => {
    let query: string;
    try {
      query = buildSqlQuery({
        queryType: queryType as QueryType,
        tableName,
        fields,
        conditions,
        joinType,
        joinTable,
        joinCondition,
        orderBy,
        limit,
      });
    } catch (err) {
      toast({
        title: t('Error'),
        description: err instanceof Error ? t(err.message) : t('Could not build the query'),
        variant: "destructive",
      });
      return;
    }

    trackAction('build_query');
    setGeneratedQuery(query);

    toast({
      title: t('Success'),
      description: t('SQL query generated successfully'),
    });
  };

  const copyQuery = () => {
    navigator.clipboard.writeText(generatedQuery);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_query');
  };

  const downloadQuery = () => {
    const blob = new Blob([generatedQuery], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadAnimation(true);
    setTimeout(() => setDownloadAnimation(false), 1000);
    trackAction('download_query');
  };

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
              subcategory={{ label: t('Database Tools'), href: "/category/development-tech/database-tools" }}
              toolName={t('SQL Query Builder')}
            />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Database className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('SQL Query Builder')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Build complex SQL queries visually without writing code')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Database')}</Badge>
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{t('Query Builder')}</Badge>
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
              <div className="space-y-6">
                <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-black text-lg sm:text-xl">{t('Query Configuration')}</CardTitle>
                    <CardDescription>{t('Set up your SQL query parameters')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">{t('Query Type')}</label>
                        <Select value={queryType} onValueChange={setQueryType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SELECT">SELECT</SelectItem>
                            <SelectItem value="INSERT">INSERT</SelectItem>
                            <SelectItem value="UPDATE">UPDATE</SelectItem>
                            <SelectItem value="DELETE">DELETE</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">{t('Table Name')}</label>
                        <Input
                          placeholder={t('users')}
                          value={tableName}
                          onChange={(e) => setTableName(e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {queryType !== 'DELETE' && (
                    <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                          {isSelect ? t('Fields') : t('Columns and Values')}
                          <Button variant="outline" size="sm" onClick={addField}>
                            <Plus className="h-4 w-4 mr-2" />
                            {t('Add Field')}
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {fields.length === 0 ? (
                          <p className="text-sm text-gray-500">{isSelect ? t('No fields added. Will use SELECT *') : t('Add a column and the value to write into it')}</p>
                        ) : (
                          fields.map((field) => (
                            <div key={field.id} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                              <Input
                                placeholder={isSelect ? t('Field name') : t('Column name')}
                                value={field.field}
                                onChange={(e) => updateField(field.id, 'field', e.target.value)}
                                className="flex-1"
                              />
                              <Input
                                placeholder={isSelect ? t('Alias (optional)') : t('Value (NULL for null)')}
                                value={field.alias || ''}
                                onChange={(e) => updateField(field.id, 'alias', e.target.value)}
                                className="flex-1"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeField(field.id)}
                                className="w-full sm:w-auto"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                )}

                {queryType !== 'INSERT' && (
                    <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                          {t('WHERE Conditions')}
                          <Button variant="outline" size="sm" onClick={addCondition}>
                            <Plus className="h-4 w-4 mr-2" />
                            {t('Add Condition')}
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {conditions.length === 0 ? (
                          <p className="text-sm text-gray-500">{t('No conditions added')}</p>
                        ) : (
                          conditions.map((condition) => (
                            <div key={condition.id} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                              <Input
                                placeholder={t('Field')}
                                value={condition.field}
                                onChange={(e) => updateCondition(condition.id, 'field', e.target.value)}
                                className="flex-1"
                              />
                              <Select
                                value={condition.operator}
                                onValueChange={(value) => updateCondition(condition.id, 'operator', value)}
                              >
                                <SelectTrigger className="w-full sm:w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {operators.map((op) => (
                                    <SelectItem key={op} value={op}>{op}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder={condition.operator === 'IN' || condition.operator === 'NOT IN' ? 'a, b, c' : t('Value')}
                                value={condition.value}
                                onChange={(e) => updateCondition(condition.id, 'value', e.target.value)}
                                className="flex-1"
                                disabled={condition.operator.includes('NULL')}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeCondition(condition.id)}
                                className="w-full sm:w-auto"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                )}

                {isSelect && (
                    <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-black text-lg sm:text-xl">{t('Additional Options')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm font-medium">{t('JOIN Type')}</label>
                            <Select value={joinType} onValueChange={setJoinType}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {['INNER', 'LEFT', 'RIGHT', 'FULL OUTER'].map((t) => (
                                  <SelectItem key={t} value={t}>{t} JOIN</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-sm font-medium">{t('JOIN Table')}</label>
                            <Input
                              placeholder={t('orders o')}
                              value={joinTable}
                              onChange={(e) => setJoinTable(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">ON</label>
                            <Input
                              placeholder={t('users.id = o.user_id')}
                              value={joinCondition}
                              onChange={(e) => setJoinCondition(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium">ORDER BY</label>
                            <Input
                              placeholder={t('column_name ASC/DESC')}
                              value={orderBy}
                              onChange={(e) => setOrderBy(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">LIMIT</label>
                            <Input
                              type="number"
                              placeholder="100"
                              value={limit}
                              onChange={(e) => setLimit(e.target.value)}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                )}

                <Button onClick={buildQuery} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium">
                  <Play className="h-4 w-4 mr-2" />
                  {t('Generate Query')}
                </Button>
              </div>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span>{t('Generated SQL Query')}</span>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={copyQuery} 
                        disabled={!generatedQuery}
                        className={`transition-all duration-300 ${
                          copyAnimation ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                        }`}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        {copyAnimation ? t('Copied!') : t('Copy')}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={downloadQuery} 
                        disabled={!generatedQuery}
                        className={`transition-all duration-300 ${
                          downloadAnimation ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                        }`}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        {downloadAnimation ? t('Downloaded!') : t('Download')}
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    {t('Your generated SQL query will appear here')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedQuery ? (
                    <Textarea
                      value={generatedQuery}
                      readOnly
                      className="min-h-[400px] font-mono text-sm bg-gray-50"
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t('Configure your query parameters and click "Generate Query" to see the SQL')}</p>
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

export default SqlQueryBuilder;
