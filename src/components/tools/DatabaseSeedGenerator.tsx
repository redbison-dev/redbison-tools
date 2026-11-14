
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Database, Maximize, Minimize, Copy } from 'lucide-react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { generateSeedData, MAX_RECORDS } from '@/lib/tools/database-seed-generator';
import { msg, useT } from '@/i18n';

const DatabaseSeedGenerator = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [schema, setSchema] = useState('');
  const [recordCount, setRecordCount] = useState('10');
  const [format, setFormat] = useState('sql');
  const [seedData, setSeedData] = useState('');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const generateSeed = () => {
    if (!schema.trim()) {
      return;
    }

    let output: string;
    try {
      output = generateSeedData(schema, {
        count: parseInt(recordCount, 10) || 10,
        format: format === 'json' ? 'json' : 'sql',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : msg('Could not read the schema'));
      setSeedData('');
      return;
    }
    setError('');
    setSeedData(output);
    trackAction('generate_seed_data');
  };

  const copySeedData = () => {
    navigator.clipboard.writeText(seedData);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_seed_data');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-1 sm:py-2">
            <div className="tool-header">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Database className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-green-600" />
                    {t('Database Seed Data Generator')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Paste CREATE TABLE statements and get INSERTs or JSON with values matched to each column\'s type and name, parent tables first.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Generator')}</Badge>
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Database')}</Badge>
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
                  <CardTitle className="text-black text-lg sm:text-xl">{t('Configuration')}</CardTitle>
                  <CardDescription>{t('Set up your seed data generation parameters')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Database Schema')}</label>
                    <Textarea
                      value={schema}
                      onChange={(e) => setSchema(e.target.value)}
                      placeholder="CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  created_at TIMESTAMP
);"
                      className="min-h-[150px] font-mono text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Number of Records')}</label>
                    <Input
                      type="number"
                      value={recordCount}
                      onChange={(e) => setRecordCount(e.target.value)}
                      min="1"
                      max={MAX_RECORDS}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Output Format')}</label>
                    <Select value={format} onValueChange={setFormat}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sql">{t('SQL Inserts')}</SelectItem>
                        <SelectItem value="json">{t('JSON Data')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {error && <p className="text-sm text-red-600">{t(error)}</p>}

                  <Button 
                    onClick={generateSeed}
                    disabled={!schema.trim()}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {t('Generate Seed Data')}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                    {t('Generated Seed Data')}
                    {seedData && (
                      <Button
                        size="sm"
                        onClick={copySeedData}
                        className={`transition-all duration-300 ${
                          copyAnimation ? 'bg-green-600 scale-105' : 'bg-gray-600 hover:bg-gray-700'
                        } text-white`}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        {copyAnimation ? t('Copied!') : t('Copy')}
                      </Button>
                    )}
                  </CardTitle>
                  <CardDescription>{t('Generated seed data ready for use')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {seedData ? (
                    <Textarea
                      value={seedData}
                      readOnly
                      className="min-h-[300px] font-mono text-sm bg-gray-50"
                    />
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
                      {t('Generated seed data will appear here')}
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

export default DatabaseSeedGenerator;
