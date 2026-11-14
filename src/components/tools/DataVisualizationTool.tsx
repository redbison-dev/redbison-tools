import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TerminalTextarea } from '@/components/ui/terminal-textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Upload, Download, BarChart3, PieChart, LineChart, ScatterChart, Thermometer, TrendingUp, Activity, GitBranch, AreaChart, Radar, Zap, Palette } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useAnalytics } from '@/hooks/useAnalytics';
import { parseChartCsv, computeHistogram, heatColorIndex, pickColumns, isSampleCsv } from '@/lib/tools/data-visualization-tool';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Cell,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ScatterChart as RechartsScatterChart,
  Scatter as RechartsScatter,
  AreaChart as RechartsAreaChart,
  Area,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
  ResponsiveContainer,
  Sankey,
  ReferenceLine,
  Cell as RechartsCell,
  Pie
} from 'recharts';
import { useSampleOverwriteConfirm } from '@/components/tools/shared/SampleOverwriteConfirm';
import { msg, useFormat, useT } from '@/i18n';

// Sample datasets optimized for different chart types
const SAMPLE_DATASETS = {
  sales: {
    name: msg('Sales Data'),
    csv: `Product,Q1_Sales,Q2_Sales,Q3_Sales,Q4_Sales,Category,Price,Region
Laptop,150,180,165,200,Electronics,999,North
Mouse,300,280,320,350,Electronics,25,South
Keyboard,250,230,280,300,Electronics,75,East
Monitor,100,120,115,140,Electronics,299,West
Tablet,80,95,110,125,Electronics,499,North
Phone,200,220,250,280,Electronics,699,South`,
    bestFor: ['bar', 'stackedBar', 'pie', 'line', 'area']
  },
  
  timeSeries: {
    name: msg('Time Series Data'),
    csv: `Date,Revenue,Users,Orders,Conversion_Rate
2024-01-01,45000,1200,890,2.1
2024-02-01,52000,1450,1020,2.3
2024-03-01,48000,1350,950,2.0
2024-04-01,61000,1680,1240,2.5
2024-05-01,58000,1590,1180,2.2
2024-06-01,67000,1820,1350,2.6`,
    bestFor: ['line', 'area', 'bar']
  },
  
  correlation: {
    name: msg('Correlation Data'),
    csv: `Product,Price,Rating,Sales,Marketing_Spend,Customer_Satisfaction
Laptop,999,4.2,150,15000,8.5
Mouse,25,4.5,300,2500,9.1
Keyboard,75,4.3,250,5000,8.8
Monitor,299,4.1,100,8000,7.9
Tablet,499,4.4,80,12000,8.6
Phone,699,4.6,200,20000,9.3`,
    bestFor: ['scatter', 'bubble']
  },
  
  distribution: {
    name: msg('Distribution Data'),
    csv: `Employee_Salary,Department,Years_Experience,Performance_Score
45000,Engineering,2,7.8
65000,Engineering,5,8.5
85000,Engineering,8,9.1
42000,Marketing,1,7.2
55000,Marketing,3,8.0
38000,Sales,1,6.9
52000,Sales,4,8.2
75000,Engineering,7,8.8
48000,Marketing,2,7.5
62000,Sales,6,8.6`,
    bestFor: ['histogram', 'box']
  },
  
  flow: {
    name: msg('Flow Data (Sankey)'),
    csv: `Source,Target,Value
iPhone,Revenue,394
Mac,Revenue,40
iPad,Revenue,29
Services,Revenue,78
Revenue,Operating_Cost,180
Revenue,Net_Profit,361
Operating_Cost,R&D,26
Operating_Cost,Marketing,45
Operating_Cost,Operations,109`,
    bestFor: ['sankey']
  },
  
  geographic: {
    name: msg('Regional Data'),
    csv: `Region,Country,Sales,Population,GDP_Per_Capita
North America,USA,125000,331000000,65000
North America,Canada,28000,38000000,52000
Europe,Germany,45000,83000000,54000
Europe,France,38000,67000000,48000
Asia,Japan,52000,125000000,42000
Asia,China,89000,1400000000,12000`,
    bestFor: ['bar', 'pie', 'heatmap']
  }
};

const CHART_TYPES = [
  { 
    id: 'bar', 
    name: msg('Bar Chart'), 
    icon: BarChart3, 
    description: msg('Compare categories and values'),
    requirements: msg('X: Categories, Y: Numeric values'),
    bestDataset: msg('sales')
  },
  { 
    id: 'pie', 
    name: msg('Pie Chart'), 
    icon: PieChart, 
    description: msg('Show proportions of a whole'),
    requirements: msg('X: Categories, Y: Numeric values'),
    bestDataset: msg('sales')
  },
  { 
    id: 'line', 
    name: msg('Line Chart'), 
    icon: LineChart, 
    description: msg('Show trends over time'),
    requirements: msg('X: Time/Sequence, Y: Numeric values'),
    bestDataset: msg('timeSeries')
  },
  { 
    id: 'area', 
    name: msg('Area Chart'), 
    icon: AreaChart, 
    description: msg('Show volume trends over time'),
    requirements: msg('X: Time/Sequence, Y: Numeric values'),
    bestDataset: msg('timeSeries')
  },
  { 
    id: 'scatter', 
    name: msg('Scatter Plot'), 
    icon: ScatterChart, 
    description: msg('Show correlation between variables'),
    requirements: msg('X: Numeric, Y: Numeric'),
    bestDataset: msg('correlation')
  },
  { 
    id: 'histogram', 
    name: msg('Histogram'), 
    icon: BarChart3, 
    description: msg('Show distribution of values'),
    requirements: msg('Y: Numeric values (auto-binned)'),
    bestDataset: msg('distribution')
  },
  { 
    id: 'heatmap', 
    name: msg('Heat Map'), 
    icon: Thermometer, 
    description: msg('Show data intensity patterns'),
    requirements: msg('X: Categories, Y: Numeric (intensity)'),
    bestDataset: msg('geographic')
  },
  { 
    id: 'sankey', 
    name: msg('Sankey Diagram'), 
    icon: GitBranch, 
    description: msg('Show flow between categories'),
    requirements: msg('Source, Target, Value columns'),
    bestDataset: msg('flow')
  }
];

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--accent))',
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#00ff00',
  '#0088fe',
  '#ffbb28'
];

const HEATMAP_COLORS = [
  '#ff0000', // Red
  '#ff3333',
  '#ff6666',
  '#ff9999',
  '#ffcccc'
];

const COLOR_SCHEMES = {
  default: COLORS,
  red: ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca'],
  blue: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
  green: ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'],
  purple: ['#9333ea', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'],
  orange: ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa']
};

const DataVisualizationTool = () => {
  const { t } = useT();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { trackTool } = useAnalytics();
  const [csvInput, setCsvInput] = useState(SAMPLE_DATASETS.sales.csv);
  const [selectedChart, setSelectedChart] = useState('bar');
  const [currentDataset, setCurrentDataset] = useState('sales');
  const [xColumn, setXColumn] = useState('Product');
  const [yColumn, setYColumn] = useState('Q1_Sales');
  const [groupColumn, setGroupColumn] = useState('Category');
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartColor, setChartColor] = useState('default');
  const [showLegend, setShowLegend] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const parsedData = useMemo(() => parseChartCsv(csvInput), [csvInput]);
  const usingSample = isSampleCsv(csvInput, SAMPLE_DATASETS);

  const applyColumns = (chartType: string, datasetKey: string | null, data = parsedData) => {
    const choice = pickColumns(chartType, datasetKey, data);
    setXColumn(choice.x);
    setYColumn(choice.y);
    setGroupColumn(choice.group);
    if (chartType === 'heatmap') setChartColor('red');
  };

  // When pasted or uploaded data no longer has the selected columns, pick new ones.
  const headerKey = parsedData.headers.join('\u0000');
  useEffect(() => {
    if (!parsedData.headers.length) return;
    const xOk = !xColumn || parsedData.headers.includes(xColumn);
    const yOk = parsedData.headers.includes(yColumn);
    if (!xOk || !yOk) applyColumns(selectedChart, usingSample ? currentDataset : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerKey]);

  // Picking a sample dataset asks before replacing CSV the user pasted or uploaded.
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(
    { csvInput },
    { csvInput: SAMPLE_DATASETS.sales.csv },
    Object.values(SAMPLE_DATASETS).map((d) => ({ csvInput: d.csv })),
  );
  const pickSampleDataset = (datasetKey: string) => requestSampleLoad(() => loadSampleData(datasetKey));

  const loadSampleData = (datasetKey: string, chartType: string = selectedChart) => {
    const dataset = SAMPLE_DATASETS[datasetKey as keyof typeof SAMPLE_DATASETS];
    if (dataset) {
      setCsvInput(dataset.csv);
      setCurrentDataset(datasetKey);
      applyColumns(chartType, datasetKey, parseChartCsv(dataset.csv));
      toast({
        title: t('📊 {name} loaded', { name: t(dataset.name) }),
        description: t('Optimized for {value} charts', { value: dataset.bestFor.join(', ') })
      });
      trackTool('Data Visualization Tool', 'sample_data_loaded');
    }
  };

  const handleChartTypeChange = (chartType: string) => {
    setSelectedChart(chartType);
    // Swap in the matching sample only while the user is still on sample data;
    // never overwrite CSV they pasted or uploaded.
    const chartTypeInfo = CHART_TYPES.find(ct => ct.id === chartType);
    if (usingSample && chartTypeInfo && chartTypeInfo.bestDataset !== currentDataset) {
      loadSampleData(chartTypeInfo.bestDataset, chartType);
    } else {
      applyColumns(chartType, usingSample ? currentDataset : null);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'text/csv' || /\.csv$/i.test(file.name))) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCsvInput(content);
        applyColumns(selectedChart, null, parseChartCsv(content));
        toast({
          title: t('File uploaded'),
          description: t('CSV file has been loaded successfully')
        });
        trackTool('Data Visualization Tool', 'file_uploaded');
      };
      reader.readAsText(file);
    } else {
      toast({
        title: t('Invalid file'),
        description: t('Please upload a CSV file'),
        variant: "destructive"
      });
    }
  };

  const downloadChart = () => {
    const svg = chartRef.current?.querySelector('svg.recharts-surface') as SVGSVGElement | null;
    if (!svg) {
      toast({
        title: t('Nothing to download'),
        description: t('This view has no SVG chart. The heat map is drawn with HTML; take a screenshot instead.'),
        variant: "destructive"
      });
      return;
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const styles = getComputedStyle(chartRef.current as Element);
    // Resolve CSS custom properties such as hsl(var(--primary)) so the file renders on its own.
    const markup = new XMLSerializer()
      .serializeToString(clone)
      .replace(/var\((--[\w-]+)\)/g, (match, name) => styles.getPropertyValue(name).trim() || match);
    const blob = new Blob([markup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedChart}-chart.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackTool('Data Visualization Tool', 'chart_downloaded');
  };

  const copyData = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(parsedData.data, null, 2));
      toast({
        title: t('Data copied'),
        description: t('Parsed data has been copied to clipboard')
      });
    } catch (error) {
      toast({
        title: t('Copy failed'),
        description: t('Unable to copy data to clipboard'),
        variant: "destructive"
      });
    }
  };

  const renderChart = () => {
    if (!parsedData.data.length) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p>{t('Upload CSV data or load sample data to generate charts')}</p>
        </div>
      );
    }

    // For histogram, only Y column is needed
    if (selectedChart === 'histogram' && !yColumn) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p>{t('Select a numeric column for histogram')}</p>
        </div>
      );
    }

    // For other charts, both X and Y are needed (except heatmap which can work with just Y)
    if (!yColumn || (!xColumn && selectedChart !== 'heatmap' && selectedChart !== 'histogram')) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <p>{t('Select columns to generate chart')}</p>
        </div>
      );
    }

    const currentColors = COLOR_SCHEMES[chartColor as keyof typeof COLOR_SCHEMES] || COLORS;

    const chartConfig = {
      [yColumn]: {
        label: yColumn,
        color: currentColors[0],
      },
    };

    switch (selectedChart) {
      case 'pie':
        const pieData = parsedData.data.map((item, index) => ({
          name: item[xColumn],
          value: Number(item[yColumn]) || 0,
          fill: currentColors[index % currentColors.length]
        }));
        
        return (
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[400px]">
            <RechartsPieChart>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                label={showLegend}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </RechartsPieChart>
          </ChartContainer>
        );

      case 'bar':
        return (
          <ChartContainer config={chartConfig} className="min-h-[400px]">
            <BarChart data={parsedData.data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xColumn} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey={yColumn} fill={currentColors[0]} />
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </BarChart>
          </ChartContainer>
        );

      case 'stackedBar':
        const stackedData = parsedData.data;
        const numericColumns = parsedData.headers.filter(h => 
          parsedData.data.some(row => typeof row[h] === 'number')
        );
        
        return (
          <ChartContainer config={chartConfig} className="min-h-[400px]">
            <BarChart data={stackedData}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xColumn} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              {numericColumns.slice(0, 5).map((col, index) => (
                <Bar key={col} dataKey={col} stackId="a" fill={currentColors[index % currentColors.length]} />
              ))}
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </BarChart>
          </ChartContainer>
        );

      case 'line':
        return (
          <ChartContainer config={chartConfig} className="min-h-[400px]">
            <RechartsLineChart data={parsedData.data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xColumn} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey={yColumn} stroke={currentColors[0]} strokeWidth={2} />
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </RechartsLineChart>
          </ChartContainer>
        );

      case 'scatter':
        return (
          <ChartContainer config={chartConfig} className="min-h-[400px]">
            <RechartsScatterChart data={parsedData.data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xColumn} type="number" />
              <YAxis dataKey={yColumn} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <RechartsScatter dataKey={yColumn} fill={currentColors[0]} />
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </RechartsScatterChart>
          </ChartContainer>
        );

      case 'area':
        return (
          <ChartContainer config={chartConfig} className="min-h-[400px]">
            <RechartsAreaChart data={parsedData.data}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey={xColumn} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey={yColumn} stroke={currentColors[0]} fill={currentColors[0]} fillOpacity={0.6} />
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </RechartsAreaChart>
          </ChartContainer>
        );

      case 'radar':
        const radarData = parsedData.data.slice(0, 6); // Limit for readability
        return (
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[400px]">
            <RechartsRadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey={xColumn} />
              <PolarRadiusAxis />
              <RechartsRadar dataKey={yColumn} stroke={currentColors[0]} fill={currentColors[0]} fillOpacity={0.6} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </RechartsRadarChart>
          </ChartContainer>
        );

      case 'histogram':
        // Create histogram buckets
        const histogramData = computeHistogram(parsedData.data.map(row => row[yColumn]));

        return (
          <ChartContainer config={chartConfig} className="min-h-[400px]">
            <BarChart data={histogramData}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey="range" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="frequency" fill={currentColors[0]} />
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </BarChart>
          </ChartContainer>
        );

      case 'heatmap':
        // Use red color scheme for heatmap
        const heatmapColors = chartColor === 'red' ? HEATMAP_COLORS : currentColors;
        const maxValue = Math.max(0, ...parsedData.data.map(r => Number(r[yColumn]) || 0));
        const heatmapData = parsedData.data.slice(0, 10).map((row, rowIndex) => {
          const value = Number(row[yColumn]) || 0;
          const colorIndex = heatColorIndex(value, maxValue, heatmapColors.length);
          return {
            name: row[xColumn] || t('Item {n}', { n: rowIndex + 1 }),
            value,
            color: heatmapColors[colorIndex],
            darkText: colorIndex >= 2
          };
        });

        return (
          <div className="min-h-[400px] p-4">
            <div className="grid grid-cols-1 gap-2">
              {heatmapData.map((item, index) => (
                <div key={index} className="flex items-center gap-4">
                  <span className="w-24 text-sm truncate">{item.name}</span>
                  <div className="flex-1 h-8 rounded" style={{
                    backgroundColor: item.color,
                    border: '1px solid hsl(var(--border))'
                  }}>
                    <div className={`h-full flex items-center px-2 text-xs font-medium ${item.darkText ? 'text-gray-900' : 'text-white'}`}>
                      {item.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'waterfall':
        let cumulativeValue = 0;
        const waterfallData = parsedData.data.map((row, index) => {
          const value = Number(row[yColumn]) || 0;
          const start = cumulativeValue;
          cumulativeValue += value;
          return {
            name: row[xColumn],
            value,
            cumulative: cumulativeValue,
            start,
            end: cumulativeValue
          };
        });

        return (
          <ChartContainer config={chartConfig} className="min-h-[400px]">
            <BarChart data={waterfallData}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis dataKey="name" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill={currentColors[0]} />
              <Line dataKey="cumulative" stroke={currentColors[1]} strokeWidth={2} />
              {showLegend && <ChartLegend content={<ChartLegendContent />} />}
            </BarChart>
          </ChartContainer>
        );

      case 'sankey':
        // Create Recharts-based Sankey diagram using stacked bars
        if (xColumn && yColumn && groupColumn && groupColumn !== 'none') {
          const sankeyData = parsedData.data
            .filter(row => {
              const hasSource = row[xColumn] !== undefined && row[xColumn] !== null && row[xColumn] !== '';
              const hasTarget = row[groupColumn] !== undefined && row[groupColumn] !== null && row[groupColumn] !== '';
              const hasValue = row[yColumn] !== undefined && row[yColumn] !== null && !isNaN(Number(row[yColumn]));
              return hasSource && hasTarget && hasValue;
            })
            .map(row => ({
              source: String(row[xColumn] || '').replace(/\s+/g, '_'),
              target: String(row[groupColumn] || '').replace(/\s+/g, '_'),
              value: Number(row[yColumn]) || 0
            }));

          if (!sankeyData.length) {
            return (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <p>{t('No valid flow data found. Check your Source, Target, and Value columns.')}</p>
              </div>
            );
          }

          // Group by source and create stacked bar representation
          const groupedData = sankeyData.reduce((acc, item) => {
            if (!acc[item.source]) {
              acc[item.source] = { source: item.source, total: 0 };
            }
            acc[item.source][item.target] = (acc[item.source][item.target] || 0) + item.value;
            acc[item.source].total += item.value;
            return acc;
          }, {} as any);

          const flowData = Object.values(groupedData);
          const allTargets = [...new Set(sankeyData.map(item => item.target))];

          return (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">{t('Flow Distribution (Sankey-style)')}</h3>
                <p className="text-sm text-muted-foreground">{t('Showing flow from {xColumn} to {groupColumn}', { xColumn, groupColumn })}</p>
              </div>
              <ChartContainer config={chartConfig} className="min-h-[400px]">
                <BarChart data={flowData} layout="vertical">
                  {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                  <XAxis type="number" />
                  <YAxis dataKey="source" type="category" width={80} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {allTargets.map((target, index) => (
                    <Bar 
                      key={target} 
                      dataKey={target} 
                      stackId="flow" 
                      fill={currentColors[index % currentColors.length]}
                      name={target}
                    />
                  ))}
                  {showLegend && <ChartLegend content={<ChartLegendContent />} />}
                </BarChart>
              </ChartContainer>
              
              {/* Flow summary table */}
              <div className="bg-muted/20 p-4 rounded-lg">
                <h4 className="font-medium mb-2">{t('Flow Summary')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {sankeyData.slice(0, 8).map((flow, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-background rounded border">
                      <span>{flow.source} → {flow.target}</span>
                      <span className="font-mono text-primary">{fmt.number(flow.value, { maximumFractionDigits: 3 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        } else {
          return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <p className="mb-2">{t('For Sankey diagrams, you need:')}</p>
                <ul className="text-sm space-y-1">
                  <li>{t('• Source column (X): Categories where flow starts')}</li>
                  <li>{t('• Target column (Group): Categories where flow ends')}</li>
                  <li>{t('• Value column (Y): Numeric flow amounts')}</li>
                </ul>
              </div>
            </div>
          );
        }

      default:
        return null;
    }
  };

  const numericColumns = parsedData.headers.filter(header => 
    parsedData.data.some(row => typeof row[header] === 'number')
  );

  const stringColumns = parsedData.headers.filter(header => 
    parsedData.data.some(row => typeof row[header] === 'string')
  );

  return (
    <div className="min-h-screen bg-background">
      
      <div className="container mx-auto px-4 py-8">
      <ToolBreadcrumb 
        category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
        subcategory={{ label: t('Data Conversion'), href: "/category/development-tech/data-conversion" }}
        toolName="Data Visualization Tool"
      />
        
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">{t('CSV Chart Maker')}</h1>
          <p className="text-xl text-muted-foreground mb-6">
            {t('Upload CSV data and create beautiful interactive charts with multiple visualization types')}
          </p>
          
          <div className="flex flex-wrap gap-2 mb-6">
            <Badge variant="secondary">{t('CSV Import')}</Badge>
            <Badge variant="secondary">{t('Multiple Chart Types')}</Badge>
            <Badge variant="secondary">{t('Interactive')}</Badge>
            <Badge variant="secondary">{t('Real-time Preview')}</Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Data Input Section */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  {t('Data Input')}
                </CardTitle>
                <CardDescription>
                  {t('Upload a CSV file or paste your data below')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={currentDataset} onValueChange={pickSampleDataset}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('Choose sample data')} />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SAMPLE_DATASETS).map(([key, dataset]) => (
                            <SelectItem key={key} value={key}>
                              {t(dataset.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                     <div>
                       <input
                         type="file"
                         accept=".csv"
                         onChange={handleFileUpload}
                         className="hidden"
                         id="csv-upload"
                       />
                       <label htmlFor="csv-upload">
                         <Button variant="outline" size="sm" asChild>
                           <span>
                             <Upload className="h-4 w-4 mr-2" />
                             {t('Upload')}
                           </span>
                         </Button>
                       </label>
                     </div>
                   </div>
                   
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <h4 className="text-sm font-medium mb-2">
                        {currentDataset === 'flow' ? t('🌊 Sankey Flow Data:') : t('📊 Current Dataset:')}
                      </h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {currentDataset === 'flow' ? (
                         <>
                           <li>{t('• Apple-style income statement flow')}</li>
                           <li>{t('• Revenue sources: iPhone, Mac, iPad, etc.')}</li>
                           <li>{t('• Cost breakdown and profit analysis')}</li>
                           <li>{t('• Color-coded by flow type (revenue/expense/profit)')}</li>
                           <li>{t('• Values in billions ($394.3B total revenue)')}</li>
                         </>
                        ) : (
                          <>
                            <li>• {t(SAMPLE_DATASETS[currentDataset as keyof typeof SAMPLE_DATASETS]?.name ?? '')}</li>
                            <li>{t('• Best for: {value}', { value: SAMPLE_DATASETS[currentDataset as keyof typeof SAMPLE_DATASETS]?.bestFor.join(', ') })}</li>
                            <li>{t('• {rows} rows, {columns} columns', { rows: parsedData.data.length, columns: parsedData.headers.length })}</li>
                          </>
                        )}
                     </ul>
                   </div>
                 </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('CSV Data:')}</label>
                  <TerminalTextarea
                    value={csvInput}
                    onChange={(e) => setCsvInput(e.target.value)}
                    placeholder={t('Paste your CSV data here...')}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>

                 {parsedData.headers.length > 0 && (
                   <div className="space-y-4 pt-4 border-t">
                     {/* Chart Requirements Guide */}
                     <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                       <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                         <Activity className="h-4 w-4" />
                         {t('Current Chart: {name}', { name: t(CHART_TYPES.find(c => c.id === selectedChart)?.name ?? '') })}
                       </h4>
                       <div className="text-xs text-muted-foreground space-y-1">
                          <p><strong>{t('Requirements:')}</strong> {t(CHART_TYPES.find(c => c.id === selectedChart)?.requirements ?? '')}</p>
                          <p><strong>{t('Best Dataset:')}</strong> {t(CHART_TYPES.find(c => c.id === selectedChart)?.bestDataset ?? '')}</p>
                       </div>
                     </div>

                     <div>
                       <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                         {t('📍 X-Axis Column:')}
                         <span className="text-xs text-muted-foreground">{t('({length} categorical columns available)', { length: stringColumns.length })}</span>
                       </label>
                       <Select value={xColumn} onValueChange={setXColumn}>
                         <SelectTrigger>
                           <SelectValue placeholder={t('Select X column')} />
                         </SelectTrigger>
                         <SelectContent>
                           {parsedData.headers.map(header => {
                             const isNumeric = numericColumns.includes(header);
                             const isString = stringColumns.includes(header);
                             return (
                               <SelectItem key={header} value={header}>
                                 {header} {isNumeric ? '🔢' : isString ? '📝' : ''}
                               </SelectItem>
                             );
                           })}
                         </SelectContent>
                       </Select>
                     </div>

                     <div>
                       <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                         {t('📊 Y-Axis Column:')}
                         <span className="text-xs text-muted-foreground">{t('({length} numeric columns available)', { length: numericColumns.length })}</span>
                       </label>
                       <Select value={yColumn} onValueChange={setYColumn}>
                         <SelectTrigger>
                           <SelectValue placeholder={t('Select Y column')} />
                         </SelectTrigger>
                         <SelectContent>
                           {numericColumns.map(header => (
                             <SelectItem key={header} value={header}>
                               🔢 {header}
                             </SelectItem>
                           ))}
                         </SelectContent>
                       </Select>
                     </div>

                     {stringColumns.length > 0 && (
                       <div>
                         <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                           {t('🏷️ Group By (Optional):')}
                           <span className="text-xs text-muted-foreground">{t('(for color coding)')}</span>
                         </label>
                         <Select value={groupColumn} onValueChange={setGroupColumn}>
                           <SelectTrigger>
                             <SelectValue placeholder={t('Select group column')} />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="none">{t('None')}</SelectItem>
                             {stringColumns.map(header => (
                               <SelectItem key={header} value={header}>
                                 📝 {header}
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                     )}

                     {/* Quick Column Info */}
                     <div className="grid grid-cols-2 gap-2 text-xs">
                       <div className="p-2 bg-green-50 rounded">
                         <span className="font-medium">{t('📝 Text Columns:')}</span>
                         <div className="text-muted-foreground">{stringColumns.join(', ') || t('None')}</div>
                       </div>
                       <div className="p-2 bg-blue-50 rounded">
                         <span className="font-medium">{t('🔢 Number Columns:')}</span>
                         <div className="text-muted-foreground">{numericColumns.join(', ') || t('None')}</div>
                       </div>
                     </div>
                   </div>
                 )}
              </CardContent>
            </Card>
          </div>

          {/* Visualization Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    {t('Data Visualization')}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button onClick={copyData} variant="outline" size="sm">
                      <Copy className="h-4 w-4 mr-2" />
                      {t('Copy Data')}
                    </Button>
                    <Button onClick={downloadChart} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      {t('Download')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                 <Tabs value={selectedChart} onValueChange={handleChartTypeChange} className="w-full">
                  <TabsList className="grid grid-cols-6 mb-6">
                    {CHART_TYPES.slice(0, 6).map(chart => (
                      <TabsTrigger key={chart.id} value={chart.id} className="flex items-center gap-1">
                        <chart.icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{t(chart.name)}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsList className="grid grid-cols-5 mb-6">
                    {CHART_TYPES.slice(6).map(chart => (
                      <TabsTrigger key={chart.id} value={chart.id} className="flex items-center gap-1">
                        <chart.icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{t(chart.name)}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {/* Chart Controls */}
                  <div className="mb-6 p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      {t('Chart Controls')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">{t('Color Scheme:')}</label>
                        <Select value={chartColor} onValueChange={setChartColor}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('Select color scheme')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">{t('Default')}</SelectItem>
                            <SelectItem value="red">{t('Red')}</SelectItem>
                            <SelectItem value="blue">{t('Blue')}</SelectItem>
                            <SelectItem value="green">{t('Green')}</SelectItem>
                            <SelectItem value="purple">{t('Purple')}</SelectItem>
                            <SelectItem value="orange">{t('Orange')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="showLegend"
                          checked={showLegend}
                          onChange={(e) => setShowLegend(e.target.checked)}
                          className="rounded"
                        />
                        <label htmlFor="showLegend" className="text-sm font-medium">{t('Show Legend')}</label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="showGrid"
                          checked={showGrid}
                          onChange={(e) => setShowGrid(e.target.checked)}
                          className="rounded"
                        />
                        <label htmlFor="showGrid" className="text-sm font-medium">{t('Show Grid')}</label>
                      </div>
                    </div>
                  </div>

                   {CHART_TYPES.map(chart => (
                     <TabsContent key={chart.id} value={chart.id}>
                       <div className="mb-4 p-4 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-lg border">
                         <h3 className="font-semibold flex items-center gap-2 mb-2">
                           <chart.icon className="h-5 w-5" />
                           {t(chart.name)}
                         </h3>
                         <p className="text-sm text-muted-foreground mb-3">{t(chart.description)}</p>
                         <div className="flex flex-col sm:flex-row gap-2 text-xs">
                           <div className="flex items-center gap-1">
                             <span className="font-medium">{t('📋 Requirements:')}</span>
                             <span className="text-muted-foreground">{t(chart.requirements)}</span>
                           </div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{t('📊 Best Dataset:')}</span>
                              <span className="text-muted-foreground">{t(chart.bestDataset)}</span>
                            </div>
                         </div>
                       </div>
                       <div ref={chart.id === selectedChart ? chartRef : undefined}>{renderChart()}</div>
                     </TabsContent>
                   ))}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Data Table */}
        {parsedData.data.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t('Data Preview')}</CardTitle>
              <CardDescription>
                {t('Showing {rows} rows with {columns} columns', { rows: parsedData.data.length, columns: parsedData.headers.length })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {parsedData.headers.map(header => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.data.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        {parsedData.headers.map(header => (
                          <TableCell key={header}>
                            {typeof row[header] === 'number' ? fmt.number(row[header] as number, { maximumFractionDigits: 3 }) : row[header]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsedData.data.length > 10 && (
                  <p className="text-sm text-muted-foreground mt-2 text-center">
                    {t('Showing first 10 rows of {length} total rows', { length: parsedData.data.length })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('How to Use')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="font-semibold mb-2">{t('1. Prepare Your Data')}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>{t('• CSV format with headers in the first row')}</li>
                  <li>{t('• Numeric columns for Y-axis values')}</li>
                  <li>{t('• Text columns for categories and grouping')}</li>
                  <li>{t('• Clean data without missing values')}</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">{t('2. Select Chart Type')}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>{t('• Pie charts for proportions')}</li>
                  <li>{t('• Bar charts for comparisons')}</li>
                  <li>{t('• Line charts for trends')}</li>
                  <li>{t('• Scatter plots for correlations')}</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">{t('3. Configure Axes')}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>{t('• Choose X-axis column (categories)')}</li>
                  <li>{t('• Choose Y-axis column (numeric values)')}</li>
                  <li>{t('• Optional: Select grouping column')}</li>
                  <li>{t('• Chart updates automatically')}</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">{t('4. Export Results')}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>{t('• Download the chart as an SVG file')}</li>
                  <li>{t('• Copy parsed data as JSON')}</li>
                  <li>{t('• Share visualizations')}</li>
                  <li>{t('• Use in presentations')}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
      {confirmDialog}
    </div>
  );
};

export default DataVisualizationTool;
