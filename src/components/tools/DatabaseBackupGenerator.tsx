import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download, Database, Shield, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { DB_TYPES, generateBackupScripts, type BackupConfig } from '@/lib/tools/database-backup-generator';
import { useT } from '@/i18n';

const DatabaseBackupGenerator = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [config, setConfig] = useState<BackupConfig>({
    dbType: 'mysql',
    host: 'localhost',
    port: '3306',
    database: '',
    username: '',
    includeTables: true,
    includeData: true,
    compression: false,
    customOptions: ''
  });

  const [backupScript, setBackupScript] = useState('');
  const [restoreScript, setRestoreScript] = useState('');
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const dbTypes = DB_TYPES;

  const generateScripts = () => {
    let scripts;
    try {
      scripts = generateBackupScripts(config);
    } catch (err) {
      toast({
        title: t('Error'),
        description: err instanceof Error ? t(err.message) : t('Could not generate scripts'),
        variant: "destructive",
      });
      return;
    }

    trackAction('generate_scripts');
    setBackupScript(scripts.backup);
    setRestoreScript(scripts.restore);

    toast({
      title: t('Success'),
      description: t('Backup and restore scripts generated successfully'),
    });
  };

  const copyScript = (script: string, type: string) => {
    navigator.clipboard.writeText(script);
    toast({
      title: t('Copied'),
      description: t('{type} script copied to clipboard', { type }),
    });
    trackAction('copy_script');
  };

  const downloadScript = (script: string, filename: string) => {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('download_script');
  };

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          <ToolBreadcrumb 
            category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
            subcategory={{ label: t('Database Tools'), href: "/category/development-tech/database-tools" }}
            toolName="Database Backup Generator"
          />
          
          <div className="tool-header mt-6">
            <div className="space-y-2">
              <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                <Database className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-red-600" />
                {t('Database Backup Script Generator')}
              </h1>
              <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Generate backup and restore shell scripts for MySQL, PostgreSQL, SQLite, SQL Server and Oracle using each database\'s own dump tool.')}</p>
            </div>
          </div>

          <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Configuration Panel */}
              <Card className="xl:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Database className="h-5 w-5 mr-2" />
                    {t('Database Configuration')}
                  </CardTitle>
                  <CardDescription>
                    {t('Configure your database connection and backup options')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Database Type')}</label>
                    <Select
                      value={config.dbType}
                      onValueChange={(value) => {
                        const dbType = dbTypes.find(db => db.value === value);
                        setConfig(prev => ({
                          ...prev,
                          dbType: value,
                          port: dbType?.port || prev.port
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dbTypes.map(db => (
                          <SelectItem key={db.value} value={db.value}>
                            {db.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {config.dbType !== 'sqlite' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t('Host')}</label>
                          <Input
                            value={config.host}
                            onChange={(e) => setConfig(prev => ({ ...prev, host: e.target.value }))}
                            placeholder={t('localhost')}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">{t('Port')}</label>
                          <Input
                            value={config.port}
                            onChange={(e) => setConfig(prev => ({ ...prev, port: e.target.value }))}
                            placeholder="3306"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Username')}</label>
                        <Input
                          value={config.username}
                          onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                          placeholder={t('database_user')}
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Database Name')}</label>
                    <Input
                      value={config.database}
                      onChange={(e) => setConfig(prev => ({ ...prev, database: e.target.value }))}
                      placeholder={config.dbType === 'sqlite' ? 'app.db' : config.dbType === 'oracle' ? t('{name} (service name)', { name: 'ORCLPDB1' }) : t('my_database')}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium">{t('Backup Options')}</label>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeTables"
                        checked={config.includeTables}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, includeTables: !!checked }))
                        }
                      />
                      <label htmlFor="includeTables" className="text-sm">{t('Include table structure')}</label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeData"
                        checked={config.includeData}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, includeData: !!checked }))
                        }
                      />
                      <label htmlFor="includeData" className="text-sm">{t('Include data')}</label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="compression"
                        checked={config.compression}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, compression: !!checked }))
                        }
                      />
                      <label htmlFor="compression" className="text-sm">{config.dbType === 'postgresql' ? t('Compressed custom format ({tool})', { tool: 'pg_restore' }) : t('Enable compression')}</label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Custom Options')}</label>
                    <Input
                      value={config.customOptions}
                      onChange={(e) => setConfig(prev => ({ ...prev, customOptions: e.target.value }))}
                      placeholder={t('--additional-options')}
                    />
                  </div>

                  <Button onClick={generateScripts} className="w-full">
                    <FileText className="h-4 w-4 mr-2" />
                    {t('Generate Scripts')}
                  </Button>
                </CardContent>
              </Card>

              {/* Scripts Panel */}
              <div className="xl:col-span-2">
                <Tabs defaultValue="backup" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="backup">{t('Backup Script')}</TabsTrigger>
                    <TabsTrigger value="restore">{t('Restore Script')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="backup">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          {t('Backup Script')}
                          {backupScript && (
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyScript(backupScript, t('Backup'))}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadScript(backupScript, `${config.database}_backup.sh`)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {t('Shell script to create database backups')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {backupScript ? (
                          <Textarea
                            value={backupScript}
                            readOnly
                            className="min-h-[400px] font-mono text-sm bg-gray-50"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-[400px] text-gray-500">
                            <div className="text-center">
                              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>{t('Configure database settings and click "Generate Scripts"')}</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="restore">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          {t('Restore Script')}
                          {restoreScript && (
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyScript(restoreScript, t('Restore'))}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadScript(restoreScript, `${config.database}_restore.sh`)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </CardTitle>
                        <CardDescription>
                          {t('Shell script to restore database from backup')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {restoreScript ? (
                          <Textarea
                            value={restoreScript}
                            readOnly
                            className="min-h-[400px] font-mono text-sm bg-gray-50"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-[400px] text-gray-500">
                            <div className="text-center">
                              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>{t('Configure database settings and click "Generate Scripts"')}</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* Usage Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>{t('Usage Instructions')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">{t('Running Backup Scripts:')}</h4>
                    <ul className="space-y-1 text-gray-600">
                      <li>{t('• Make scripts executable:')}{' '}<code>chmod +x backup.sh</code></li>
                      <li>{t('• Run the script:')}{' '}<code>./backup.sh</code></li>
                      <li>{t('• Schedule with cron for automation')}</li>
                      <li>{t('• Monitor backup file sizes and success')}</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">{t('Running Restore Scripts:')}</h4>
                    <ul className="space-y-1 text-gray-600">
                      <li>{t('• Make scripts executable:')}{' '}<code>chmod +x restore.sh</code></li>
                      <li>{t('• Run with backup file:')}{' '}<code>./restore.sh backup.sql</code></li>
                      <li>{t('• Test restores on non-production systems first')}</li>
                      <li>{t('• Verify data integrity after restore')}</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
            
          </div>
        </div>
      </div>
    </>
  );
};

export default DatabaseBackupGenerator;