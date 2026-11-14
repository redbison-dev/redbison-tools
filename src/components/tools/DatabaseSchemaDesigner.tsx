
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Plus, Trash2, Database, Link, Layers, Maximize, Minimize, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { generateSchemaSql, renameTableInRelations, removeTableFromRelations } from '@/lib/tools/database-schema-designer';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

interface TableColumn {
  id: string;
  name: string;
  type: string;
  length?: string;
  nullable: boolean;
  primaryKey: boolean;
  foreignKey?: string;
  defaultValue?: string;
}

interface DatabaseTable {
  id: string;
  name: string;
  columns: TableColumn[];
}

interface TableRelation {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

interface SchemaDesignerState {
  tables: DatabaseTable[];
  relations: TableRelation[];
  generatedSQL: string;
}

const DatabaseSchemaDesigner = () => {
  const { t: tx } = useT();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  // Local storage state
  const { state, updateState, resetState } = useLocalStorageState<SchemaDesignerState>('database-schema-designer', {
    tables: [],
    relations: [],
    generatedSQL: ''
  });

  const [currentTable, setCurrentTable] = useState<DatabaseTable | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dataTypes = [
    'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
    'VARCHAR', 'CHAR', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
    'DECIMAL', 'FLOAT', 'DOUBLE',
    'DATE', 'DATETIME', 'TIMESTAMP', 'TIME',
    'BOOLEAN', 'JSON', 'BLOB'
  ];

  // Sample data
  const sampleSchema: SchemaDesignerState = {
    tables: [
      {
        id: '1',
        name: 'users',
        columns: [
          { id: '1', name: 'id', type: 'INT', nullable: false, primaryKey: true },
          { id: '2', name: 'email', type: 'VARCHAR', length: '255', nullable: false, primaryKey: false },
          { id: '3', name: 'name', type: 'VARCHAR', length: '100', nullable: false, primaryKey: false },
          { id: '4', name: 'created_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, defaultValue: 'CURRENT_TIMESTAMP' },
        ]
      },
      {
        id: '2',
        name: 'posts',
        columns: [
          { id: '5', name: 'id', type: 'INT', nullable: false, primaryKey: true },
          { id: '6', name: 'user_id', type: 'INT', nullable: false, primaryKey: false },
          { id: '7', name: 'title', type: 'VARCHAR', length: '255', nullable: false, primaryKey: false },
          { id: '8', name: 'content', type: 'TEXT', nullable: true, primaryKey: false },
          { id: '9', name: 'published_at', type: 'TIMESTAMP', nullable: true, primaryKey: false },
        ]
      }
    ],
    relations: [],
    generatedSQL: ''
  };

  // Input validation functions
  const validateTableName = (name: string): boolean => {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length <= 64;
  };

  const validateColumnName = (name: string): boolean => {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length <= 64;
  };

  const validateLength = (type: string, length: string): boolean => {
    if (!length) return true;
    const num = parseInt(length);
    if (isNaN(num) || num <= 0) return false;
    
    if (type === 'VARCHAR' || type === 'CHAR') return num <= 65535;
    if (type === 'DECIMAL') return num <= 65;
    return true;
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { tables: state.tables, relations: state.relations };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSampleData = () => requestSampleLoad(() => {
    updateState(sampleSchema);
    setCurrentTable(null);
    setIsEditing(false);
    toast({
      title: tx('Sample loaded'),
      description: tx('Sample database schema has been loaded'),
    });
    trackAction('load_sample');
  });

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    trackAction('toggle_fullscreen');
  };

  const createNewTable = () => {
    const newTable: DatabaseTable = {
      id: Date.now().toString(),
      name: `table_${state.tables.length + 1}`,
      columns: [
        {
          id: Date.now().toString(),
          name: 'id',
          type: 'INT',
          nullable: false,
          primaryKey: true,
        }
      ]
    };
    updateState({
      ...state,
      tables: [...state.tables, newTable]
    });
    setCurrentTable(newTable);
    setIsEditing(true);
    trackAction('create_table');
  };

  const editTable = (table: DatabaseTable) => {
    setCurrentTable(table);
    setIsEditing(true);
  };

  const saveTable = () => {
    if (!currentTable) return;

    // Validate table name
    if (!validateTableName(currentTable.name)) {
      toast({
        title: tx('Invalid table name'),
        description: tx('Table name must start with a letter or underscore and contain only letters, numbers, and underscores (max 64 chars)'),
        variant: "destructive",
      });
      return;
    }

    // Validate columns
    for (const column of currentTable.columns) {
      if (!validateColumnName(column.name)) {
        toast({
          title: tx('Invalid column name'),
          description: tx('Column name "{name}" is invalid. Must start with a letter or underscore and contain only letters, numbers, and underscores (max 64 chars)', { name: column.name }),
          variant: "destructive",
        });
        return;
      }
      
      if (column.length && !validateLength(column.type, column.length)) {
        toast({
          title: tx('Invalid length'),
          description: tx('Length for column "{name}" is invalid', { name: column.name }),
          variant: "destructive",
        });
        return;
      }
    }

    const previousName = state.tables.find(t => t.id === currentTable.id)?.name;
    updateState({
      ...state,
      tables: state.tables.map(t => t.id === currentTable.id ? currentTable : t),
      relations: previousName ? renameTableInRelations(state.relations, previousName, currentTable.name) : state.relations
    });
    setIsEditing(false);
    setCurrentTable(null);
    trackAction('save_table');
  };

  const deleteTable = (tableId: string) => {
    const tableName = state.tables.find(t => t.id === tableId)?.name ?? '';
    updateState({
      ...state,
      tables: state.tables.filter(t => t.id !== tableId),
      relations: removeTableFromRelations(state.relations, tableName)
    });
    if (currentTable?.id === tableId) {
      setCurrentTable(null);
      setIsEditing(false);
    }
    trackAction('delete_table');
  };

  const addColumn = () => {
    if (!currentTable) return;

    const newColumn: TableColumn = {
      id: `${Date.now()}-${Math.random()}`,
      name: '',
      type: 'VARCHAR',
      length: '255',
      nullable: true,
      primaryKey: false,
    };

    setCurrentTable({
      ...currentTable,
      columns: [...currentTable.columns, newColumn]
    });
  };

  const updateColumn = (columnId: string, field: keyof TableColumn, value: any) => {
    if (!currentTable) return;

    setCurrentTable({
      ...currentTable,
      columns: currentTable.columns.map(col =>
        col.id === columnId ? { ...col, [field]: value } : col
      )
    });
  };

  const deleteColumn = (columnId: string) => {
    if (!currentTable) return;

    setCurrentTable({
      ...currentTable,
      columns: currentTable.columns.filter(col => col.id !== columnId)
    });
  };

  const generateSQL = () => {
    if (state.tables.length === 0) {
      toast({
        title: tx('Error'),
        description: tx('Please create at least one table'),
        variant: "destructive",
      });
      return;
    }

    trackAction('generate_sql');

    const sql = generateSchemaSql(state.tables, state.relations);

    updateState({
      ...state,
      generatedSQL: sql
    });

    toast({
      title: tx('Success'),
      description: tx('SQL schema generated successfully'),
    });
  };

  const copySQL = () => {
    navigator.clipboard.writeText(state.generatedSQL);
    toast({
      title: tx('Copied'),
      description: tx('SQL schema copied to clipboard'),
    });
    trackAction('copy_sql');
  };

  const downloadSQL = () => {
    const blob = new Blob([state.generatedSQL], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'database_schema.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('download_sql');
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-8 -mt-5 pb-1 sm:pb-2">
        {/* Breadcrumb */}
        <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
        <ToolBreadcrumb 
          category={{ label: tx('Tech Tools'), href: "/category/development-tech" }}
          subcategory={{ label: tx('Database Tools'), href: "/category/development-tech/database-tools" }}
          toolName="Database Schema Designer"
        />
        </div>
      </div>

    <div className={`w-full mx-auto p-4 space-y-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900 overflow-auto' : 'max-w-7xl'}`}>

      <div className="text-left space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Layers className="h-8 w-8 text-[#ff3131]" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{tx('Database Schema Designer')}</h1>
              <p className="text-gray-600 dark:text-gray-400">
                {tx('Design & visualize database schemas with tables, relationships & constraints. Generate SQL DDL scripts automatically.')}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={loadSampleData}
              className="flex items-center space-x-2"
            >
              <FileText className="h-4 w-4" />
              <span>{tx('Load Sample')}</span>
            </Button>
            <Button
              variant="outline"
              onClick={toggleFullscreen}
              className="flex items-center space-x-2"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              <span>{isFullscreen ? tx('Exit Fullscreen') : tx('Fullscreen')}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {tx('Database Tables')}
                <Button onClick={createNewTable}>
                  <Plus className="h-4 w-4 mr-2" />
                  {tx('New Table')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {state.tables.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{tx('No tables created yet. Click "New Table" to get started.')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {state.tables.map(table => (
                    <Card key={table.id} className="border-2 border-gray-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between">
                          {table.name}
                          <div className="flex space-x-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => editTable(table)}
                            >
                              {tx('Edit')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteTable(table.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-1">
                          {table.columns.map(col => (
                            <div key={col.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center space-x-2">
                                <span className={col.primaryKey ? 'font-bold' : ''}>{col.name}</span>
                                {col.primaryKey && <Badge variant="secondary" className="text-xs">PK</Badge>}
                              </div>
                              <span className="text-gray-500">{col.type}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {isEditing && currentTable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {tx('Edit Table: {name}', { name: currentTable.name })}
                  <div className="flex space-x-2">
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      {tx('Cancel')}
                    </Button>
                    <Button onClick={saveTable}>
                      {tx('Save Table')}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">{tx('Table Name')}</label>
                  <Input
                    value={currentTable.name}
                    onChange={(e) => setCurrentTable({ ...currentTable, name: e.target.value })}
                    placeholder={tx('Enter table name (letters, numbers, underscores only)')}
                    className={!validateTableName(currentTable.name) && currentTable.name ? 'border-red-500' : ''}
                  />
                  {!validateTableName(currentTable.name) && currentTable.name && (
                    <p className="text-sm text-red-500 mt-1">
                      {tx('Table name must start with a letter or underscore and contain only letters, numbers, and underscores (max 64 chars)')}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium">{tx('Columns')}</label>
                    <Button variant="outline" size="sm" onClick={addColumn}>
                      <Plus className="h-4 w-4 mr-2" />
                      {tx('Add Column')}
                    </Button>
                  </div>

                  {/* Column Headers */}
                  <div className="grid grid-cols-12 gap-2 items-center mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                    <div className="col-span-3">{tx('Column Name')}</div>
                    <div className="col-span-2">{tx('Data Type')}</div>
                    <div className="col-span-2">{tx('Length')}</div>
                    <div className="col-span-1 text-center">{tx('Nullable')}</div>
                    <div className="col-span-1 text-center">{tx('Primary Key')}</div>
                    <div className="col-span-2">{tx('Default Value')}</div>
                    <div className="col-span-1 text-center">{tx('Actions')}</div>
                  </div>

                  <div className="space-y-3">
                    {currentTable.columns.map(column => (
                      <div key={column.id} className="grid grid-cols-12 gap-2 items-center">
                        <Input
                          placeholder={tx('Column name')}
                          value={column.name}
                          onChange={(e) => updateColumn(column.id, 'name', e.target.value)}
                          className={`col-span-3 ${!validateColumnName(column.name) && column.name ? 'border-red-500' : ''}`}
                        />
                        <Select
                          value={column.type}
                          onValueChange={(value) => updateColumn(column.id, 'type', value)}
                        >
                          <SelectTrigger className="col-span-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {dataTypes.map(type => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder={tx('Length')}
                          value={column.length || ''}
                          onChange={(e) => updateColumn(column.id, 'length', e.target.value)}
                          className={`col-span-2 ${column.length && !validateLength(column.type, column.length) ? 'border-red-500' : ''}`}
                        />
                        <div className="col-span-1 flex justify-center">
                          <input
                            type="checkbox"
                            checked={column.nullable}
                            onChange={(e) => updateColumn(column.id, 'nullable', e.target.checked)}
                            title={tx('Nullable')}
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <input
                            type="checkbox"
                            checked={column.primaryKey}
                            onChange={(e) => updateColumn(column.id, 'primaryKey', e.target.checked)}
                            title={tx('Primary Key')}
                          />
                        </div>
                        <Input
                          placeholder={tx('Default')}
                          value={column.defaultValue || ''}
                          onChange={(e) => updateColumn(column.id, 'defaultValue', e.target.value)}
                          className="col-span-2"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteColumn(column.id)}
                          className="col-span-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Relationships Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {tx('Table Relationships')}
                <Button 
                  onClick={() => {
                    if (state.tables.length < 2) {
                      toast({
                        title: tx('Need more tables'),
                        description: tx('Create at least 2 tables to define relationships'),
                        variant: "destructive",
                      });
                      return;
                    }
                    const newRelation: TableRelation = {
                      id: Date.now().toString(),
                      fromTable: state.tables[0].name,
                      fromColumn: state.tables[0].columns[0]?.name || '',
                      toTable: state.tables.length > 1 ? state.tables[1].name : state.tables[0].name,
                      toColumn: state.tables.length > 1 ? (state.tables[1].columns[0]?.name || '') : '',
                      type: 'one-to-many'
                    };
                    updateState({
                      ...state,
                      relations: [...state.relations, newRelation]
                    });
                    trackAction('add_relationship');
                  }}
                >
                  <Link className="h-4 w-4 mr-2" />
                  {tx('Add Relationship')}
                </Button>
              </CardTitle>
              <CardDescription>
                {tx('Define foreign key relationships between tables')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {state.relations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Link className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{tx('No relationships defined. Click "Add Relationship" to create foreign key connections.')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {state.relations.map((relation, index) => (
                    <div key={relation.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{tx('Relationship')}{' '}{index + 1}</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            updateState({
                              ...state,
                              relations: state.relations.filter(r => r.id !== relation.id)
                            });
                            trackAction('delete_relationship');
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">{tx('From Table')}</label>
                          <Select
                            value={relation.fromTable}
                            onValueChange={(value) => {
                              const updatedRelations = state.relations.map(r =>
                                r.id === relation.id 
                                  ? { ...r, fromTable: value, fromColumn: state.tables.find(t => t.name === value)?.columns[0]?.name || '' }
                                  : r
                              );
                              updateState({ ...state, relations: updatedRelations });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {state.tables.map(table => (
                                <SelectItem key={table.id} value={table.name}>{table.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium">{tx('From Column')}</label>
                          <Select
                            value={relation.fromColumn}
                            onValueChange={(value) => {
                              const updatedRelations = state.relations.map(r =>
                                r.id === relation.id ? { ...r, fromColumn: value } : r
                              );
                              updateState({ ...state, relations: updatedRelations });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {state.tables.find(t => t.name === relation.fromTable)?.columns.map(col => (
                                <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                              )) || []}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium">{tx('To Table')}</label>
                          <Select
                            value={relation.toTable}
                            onValueChange={(value) => {
                              const updatedRelations = state.relations.map(r =>
                                r.id === relation.id 
                                  ? { ...r, toTable: value, toColumn: state.tables.find(t => t.name === value)?.columns[0]?.name || '' }
                                  : r
                              );
                              updateState({ ...state, relations: updatedRelations });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {state.tables.map(table => (
                                <SelectItem key={table.id} value={table.name}>{table.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium">{tx('To Column')}</label>
                          <Select
                            value={relation.toColumn}
                            onValueChange={(value) => {
                              const updatedRelations = state.relations.map(r =>
                                r.id === relation.id ? { ...r, toColumn: value } : r
                              );
                              updateState({ ...state, relations: updatedRelations });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {state.tables.find(t => t.name === relation.toTable)?.columns.map(col => (
                                <SelectItem key={col.id} value={col.name}>{col.name}</SelectItem>
                              )) || []}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium">{tx('Relationship Type')}</label>
                        <Select
                          value={relation.type}
                          onValueChange={(value: 'one-to-one' | 'one-to-many' | 'many-to-many') => {
                            const updatedRelations = state.relations.map(r =>
                              r.id === relation.id ? { ...r, type: value } : r
                            );
                            updateState({ ...state, relations: updatedRelations });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one-to-one">{tx('One-to-One')}</SelectItem>
                            <SelectItem value="one-to-many">{tx('One-to-Many')}</SelectItem>
                            <SelectItem value="many-to-many">{tx('Many-to-Many')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                        <strong>{tx('Foreign Key:')}</strong> {relation.fromTable}.{relation.fromColumn} → {relation.toTable}.{relation.toColumn}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {tx('Generated SQL Schema')}
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={copySQL} disabled={!state.generatedSQL}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={downloadSQL} disabled={!state.generatedSQL}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              {tx('Generate SQL DDL from your schema design')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={generateSQL} className="w-full">
              <Database className="h-4 w-4 mr-2" />
              {tx('Generate SQL')}
            </Button>

            {state.generatedSQL ? (
              <Textarea
                value={state.generatedSQL}
                readOnly
                className="min-h-[400px] font-mono text-sm bg-gray-50 dark:bg-gray-800"
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{tx('Design your tables and click "Generate SQL" to see the schema')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
    </div>
      {confirmDialog}
    </>
  );
};

export default DatabaseSchemaDesigner;
