import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Database, Download, Zap, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { ReactFlow, Node, Edge, Controls, Background, useNodesState, useEdgesState, ConnectionMode, NodeTypes, MarkerType, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import html2canvas from 'html2canvas';
import { parseSchema, relationshipCardinality } from '@/lib/tools/database-erd-generator';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { msg, useT } from '@/i18n';

const MOVE_DIRECTIONS: Record<string, string> = { up: msg('up'), down: msg('down'), left: msg('left'), right: msg('right') };

// Custom Table Node Component
const TableNode = ({ data }: { data: any }) => {
  const { tableName, columns, primaryKey, foreignKeys } = data;
  
  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg shadow-lg min-w-[250px] max-w-[320px] relative">
      <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-3 !h-3" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-3 !h-3" />
      
      <div className="bg-blue-600 text-white px-3 py-2 rounded-t-lg font-semibold text-sm">
        <Database className="inline h-4 w-4 mr-2" />
        {tableName}
      </div>
      <div className="p-2 space-y-1">
        {columns.map((column: any, index: number) => {
          const isPK = primaryKey.includes(column.name);
          const isFK = foreignKeys.some((fk: any) => fk.column === column.name);
          
          return (
            <div 
              key={index} 
              className={`flex justify-between items-center py-2 px-2 text-xs rounded-md ${
                isPK 
                  ? 'bg-yellow-100 border-l-4 border-yellow-500 font-semibold' 
                  : isFK
                  ? 'bg-blue-100 border-l-4 border-blue-500 font-medium'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                {isPK && <span className="text-yellow-600 font-bold">🔑</span>}
                {isFK && !isPK && <span className="text-blue-600 font-bold">🔗</span>}
                <span className={`font-mono ${isPK ? 'text-yellow-800' : isFK ? 'text-blue-800' : 'text-gray-700'}`}>
                  {column.name}
                </span>
              </div>
              <span className={`text-[10px] font-medium ${isPK ? 'text-yellow-600' : isFK ? 'text-blue-600' : 'text-gray-500'}`}>
                {column.type}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
const nodeTypes: NodeTypes = {
  tableNode: TableNode,
};

const DatabaseErdGenerator = () => {
  const { t: tx } = useT();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  
  const [input, setInput] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState('');
  const [reactFlowKey, setReactFlowKey] = useState(0);

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const generateERD = useCallback(() => {
    try {
      setError('');
      
      if (!input.trim()) {
        setError(msg('Please enter a database schema'));
        return;
      }

      const { tables, relationships } = parseSchema(input);
      
      if (tables.length === 0) {
        setError(msg('No valid table definitions found. Please check your SQL syntax.'));
        return;
      }

      // Create nodes for tables with better positioning
      const newNodes: Node[] = tables.map((table, index) => {
        const cols = Math.ceil(Math.sqrt(tables.length));
        const row = Math.floor(index / cols);
        const col = index % cols;
        
        const node = {
          id: table.name,
          type: 'tableNode',
          position: { 
            x: col * 350, 
            y: row * 300 
          },
          data: {
            tableName: table.name,
            columns: table.columns,
            primaryKey: table.primaryKey,
            foreignKeys: table.foreignKeys
          },
          draggable: true,
        };
        return node;
      });

      // Edges run from the child (foreign key) table to the parent it references.
      // Relationships to tables that are not in the input are skipped.
      const tableNames = new Set(tables.map(t => t.name));
      const newEdges: Edge[] = relationships
        .filter(rel => tableNames.has(rel.from) && tableNames.has(rel.to))
        .map((rel, index) => {
          const cardinality = relationshipCardinality(tables.find(t => t.name === rel.from), rel.fromColumn);
          return {
            id: `${rel.from}-${rel.fromColumn}-${rel.to}-${index}`,
            source: rel.from,
            target: rel.to,
            type: 'smoothstep',
            style: { stroke: '#000000', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#000000' },
            label: `${rel.fromColumn} ${cardinality}`,
            labelStyle: { fill: '#000000', fontWeight: 'bold', fontSize: '12px' },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.8 },
          };
        });

      setNodes(newNodes);
      setEdges(newEdges);
      
      // Force ReactFlow to completely re-render
      setReactFlowKey(prev => prev + 1);
      
      trackAction('erd_generate', { 
        tableCount: tables.length,
        relationshipCount: relationships.length 
      });
      
    } catch (err) {
      console.error('ERD generation error:', err);
      setError(msg('Failed to parse schema. Please check your SQL syntax.'));
      trackAction('erd_generate_error', { error: 'parse_error' });
    }
  }, [input, setNodes, setEdges, trackAction]);

  const exportDiagram = async (format: 'png' | 'jpeg') => {
    if (nodes.length === 0) return;
    
    try {
      // Get the ReactFlow instance and fit view first
      const reactFlowInstance = (window as any).reactFlowInstance;
      if (reactFlowInstance) {
        reactFlowInstance.fitView({ padding: 0.1 });
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Find the ReactFlow container
      const reactFlowElement = document.querySelector('.react-flow') as HTMLElement;
      if (!reactFlowElement) {
        throw new Error('ReactFlow element not found');
      }

      // Ensure the container is visible and properly sized
      const originalStyles = {
        position: reactFlowElement.style.position,
        left: reactFlowElement.style.left,
        top: reactFlowElement.style.top,
        zIndex: reactFlowElement.style.zIndex
      };

      // Temporarily modify styles for better capture
      reactFlowElement.style.position = 'static';
      reactFlowElement.style.left = 'auto';
      reactFlowElement.style.top = 'auto';
      reactFlowElement.style.zIndex = 'auto';

      const canvas = await html2canvas(reactFlowElement, {
        backgroundColor: '#f9fafb',
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        ignoreElements: (element) => {
          // Ignore controls and other UI elements, only capture the diagram
          return element.classList.contains('react-flow__controls') ||
                 element.classList.contains('react-flow__attribution');
        }
      });

      // Restore original styles
      Object.assign(reactFlowElement.style, originalStyles);
      
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const extension = format === 'png' ? 'png' : 'jpg';
      
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `database-erd.${extension}`;
          a.click();
          URL.revokeObjectURL(url);
          
          toast({
            title: tx('Export Successful'),
            description: tx('ERD exported as {value}', { value: format.toUpperCase() }),
          });
        }
      }, mimeType, 0.9);
      
      trackAction('erd_export', { format });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: tx('Export Failed'), 
        description: tx('There was an error exporting the diagram. Please try again.'),
        variant: "destructive"
      });
    }
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { input };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    const sampleSchema = `CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE post_categories (
  post_id INT NOT NULL,
  category_id INT NOT NULL,
  PRIMARY KEY (post_id, category_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);`;
    
    setInput(sampleSchema);
    trackAction('erd_load_sample');
  });

  return (
    <>
      <div className="max-w-7xl mx-auto px-8 -mt-5 pb-1 sm:pb-2">
        {/* Breadcrumb */}
        <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
        <ToolBreadcrumb 
          category={{ label: tx('Tech Tools'), href: "/category/development-tech" }}
          subcategory={{ label: tx('Database Tools'), href: "/category/development-tech/database-tools" }}
          toolName="Database ERD Generator"
        />
        </div>
      </div>


    <div className="w-full max-w-7xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{tx('ERD Generator from SQL')}</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {tx('Generate Entity Relationship Diagrams from SQL schemas. Visualize database relationships & structure with interactive diagrams.')}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8 mt-6 sm:mt-8">
        <div className="xl:col-span-1">
          <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-black text-lg sm:text-xl">{tx('SQL Schema Input')}</CardTitle>
              <CardDescription>{tx('Paste your CREATE TABLE statements')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="CREATE TABLE users (&#10;  id INT PRIMARY KEY,&#10;  name VARCHAR(100),&#10;  email VARCHAR(100)&#10;);"
                className="min-h-[400px] bg-gray-50 border-2 border-gray-300 text-gray-900 font-mono text-sm resize-none focus:border-blue-600"
              />
              
              <div className="flex flex-wrap gap-2 mt-4">
                <Button 
                  onClick={generateERD} 
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {tx('Generate ERD')}
                </Button>
                <Button 
                  onClick={loadSample} 
                  variant="outline"
                  className="border-2 border-gray-300"
                >
                  {tx('Load Sample')}
                </Button>
              </div>
              
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-700 text-sm">{tx(error)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2">
          <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                <span>{tx('Interactive ERD')}</span>
                {nodes.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        size="sm"
                        variant="outline"
                        className="border-2 border-gray-300"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {tx('Export')}
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => exportDiagram('png')}>
                        {tx('Export as PNG')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportDiagram('jpeg')}>
                        {tx('Export as JPEG')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardTitle>
              <CardDescription>{tx('Drag tables to reorganize • Relationships show automatically')}</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="h-[600px] bg-gray-50 border-2 border-gray-300 rounded-lg overflow-hidden">
                <ReactFlow
                  key={reactFlowKey}
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  connectionMode={ConnectionMode.Loose}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  proOptions={{ hideAttribution: true }}
                  ariaLabelConfig={{
                    'node.a11yDescription.default': tx('Press enter or space to select a node. Press delete to remove it and escape to cancel.'),
                    'node.a11yDescription.keyboardDisabled': tx('Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.'),
                    'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => tx('Moved selected node {direction}. New position, x: {x}, y: {y}', { direction: MOVE_DIRECTIONS[direction] ? tx(MOVE_DIRECTIONS[direction]) : direction, x, y }),
                    'edge.a11yDescription.default': tx('Press enter or space to select an edge. You can then press delete to remove it or escape to cancel.'),
                    'controls.ariaLabel': tx('Control Panel'),
                    'controls.zoomIn.ariaLabel': tx('Zoom In'),
                    'controls.zoomOut.ariaLabel': tx('Zoom Out'),
                    'controls.fitView.ariaLabel': tx('Fit View'),
                    'controls.interactive.ariaLabel': tx('Toggle Interactivity'),
                    'minimap.ariaLabel': tx('Mini Map'),
                    'handle.ariaLabel': tx('Handle'),
                  }}
                  onInit={(reactFlowInstance) => {
                    // Store reference for export functionality
                    (window as any).reactFlowInstance = reactFlowInstance;
                  }}
                >
                  <Background color="#e5e7eb" gap={20} />
                  <Controls />
                </ReactFlow>
                
                {nodes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center text-gray-500">
                      <Database className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-sm">{tx('Your ERD will appear here after generating')}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
    </div>
      {confirmDialog}
    </>
  );
};

export default DatabaseErdGenerator;