
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Copy, ArrowRightLeft, Database, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { convertSchema, DIALECTS, type Dialect } from '@/lib/tools/sql-data-type-converter';
import { useT } from '@/i18n';

const SqlDataTypeConverter = () => {
  const { t } = useT();
  const [sourceDb, setSourceDb] = useState('');
  const [targetDb, setTargetDb] = useState('');
  const [inputSchema, setInputSchema] = useState('');
  const [convertedSchema, setConvertedSchema] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const databases = DIALECTS;

  const convertDataTypes = () => {
    if (!sourceDb || !targetDb || !inputSchema.trim()) {
      toast({
        title: t('Missing Information'),
        description: t('Please select source and target databases and provide schema.'),
        variant: "destructive"
      });
      return;
    }

    if (sourceDb === targetDb) {
      toast({
        title: t('Same Database'),
        description: t('Source and target databases cannot be the same.'),
        variant: "destructive"
      });
      return;
    }

    const converted = convertSchema(inputSchema, sourceDb as Dialect, targetDb as Dialect).sql;
    setConvertedSchema(converted);
    trackAction('convert_schema');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_schema');
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
          toolName={t('SQL Data Type Converter')}
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
                    <Database className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('SQL Data Type Converter')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Convert CREATE TABLE column types, auto-increment columns and defaults between MySQL, PostgreSQL, SQLite, SQL Server and Oracle.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Database')}</Badge>
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{t('Converter')}</Badge>
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
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center">
                    <Database className="h-5 w-5 mr-2" />
                    {t('Database Selection')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Source Database')}</label>
                    <Select value={sourceDb} onValueChange={setSourceDb}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select source database')} />
                      </SelectTrigger>
                      <SelectContent>
                        {databases.map(db => (
                          <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Target Database')}</label>
                    <Select value={targetDb} onValueChange={setTargetDb}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select target database')} />
                      </SelectTrigger>
                      <SelectContent>
                        {databases.map(db => (
                          <SelectItem key={db.id} value={db.id}>{db.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={convertDataTypes} 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={!sourceDb || !targetDb || !inputSchema.trim()}
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    {t('Convert Schema')}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl">{t('Input Schema')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={inputSchema}
                    onChange={(e) => setInputSchema(e.target.value)}
                    placeholder="CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  created_at DATETIME
);"
                    className="min-h-[300px] font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </div>

            {convertedSchema && (
              <Card className="mt-6 sm:mt-8 bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                    {t('Converted Schema')}
                    <Button 
                      onClick={() => copyToClipboard(convertedSchema)}
                      variant="outline"
                      size="sm"
                      className={`transition-all duration-300 ${
                        copyAnimation ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                      }`}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {copyAnimation ? t('Copied!') : t('Copy')}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={convertedSchema}
                    readOnly
                    className="min-h-[300px] font-mono text-sm bg-gray-50"
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SqlDataTypeConverter;
