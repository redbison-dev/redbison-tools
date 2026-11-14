import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, Download, FileText, GitCompare, ArrowRight, AlertCircle, CheckCircle, Minus, Plus, ArrowUp, ArrowDown, Navigation, Eye, EyeOff, Upload, File, X, ArrowLeftRight } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useToast } from '@/hooks/use-toast';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { computeLineDiff } from '@/lib/tools/online-diff-tool';
import { useT } from '@/i18n';

interface OnlineDiffToolProps {
  onToolSelect?: (toolId: string) => void;
}

interface DiffLine {
  content: string;
  type: 'context' | 'added' | 'removed';
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffResult {
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  totalChanges: number;
}

const OnlineDiffTool: React.FC<OnlineDiffToolProps> = ({ onToolSelect }) => {
  const { t } = useT();
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [leftFileName, setLeftFileName] = useState('');
  const [rightFileName, setRightFileName] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'file'>('text');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [currentDiffIndex, setCurrentDiffIndex] = useState(0);
  
  const { trackTool } = useAnalytics();
  const { toast } = useToast();

  // File upload handlers
  const onDropLeft = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setLeftFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLeftText(e.target?.result as string || '');
      };
      reader.readAsText(file);
      trackTool('Online Diff Tool', 'file_upload_left');
    }
  }, [trackTool]);

  const onDropRight = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setRightFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        setRightText(e.target?.result as string || '');
      };
      reader.readAsText(file);
      trackTool('Online Diff Tool', 'file_upload_right');
    }
  }, [trackTool]);

  const { getRootProps: getLeftRootProps, getInputProps: getLeftInputProps, isDragActive: isLeftDragActive } = useDropzone({
    onDrop: onDropLeft,
    accept: {
      'text/*': ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.py', '.java', '.cpp', '.c', '.php', '.rb', '.go', '.rs', '.sh'],
    },
    multiple: false
  });

  const { getRootProps: getRightRootProps, getInputProps: getRightInputProps, isDragActive: isRightDragActive } = useDropzone({
    onDrop: onDropRight,
    accept: {
      'text/*': ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.py', '.java', '.cpp', '.c', '.php', '.rb', '.go', '.rs', '.sh'],
    },
    multiple: false
  });

  const diffResult: DiffResult = useMemo(() => {
    return computeLineDiff(leftText, rightText, { ignoreWhitespace, ignoreCase });
  }, [leftText, rightText, ignoreWhitespace, ignoreCase]);

  const allDiffLines = diffResult.hunks.flatMap(hunk => hunk.lines.filter(line => line.type !== 'context'));

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied to clipboard'),
      description: t('{label} copied successfully', { label }),
    });
    trackTool('Online Diff Tool', 'copy');
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackTool('Online Diff Tool', 'download');
  };

  const generateDiffReport = () => {
    const yesNo = (on: boolean) => (on ? t('Yes') : t('No'));
    const report = `${t('Git-style Diff Report')}
${t('Generated: {date}', { date: new Date().toLocaleString() })}

${t('Configuration:')}
- ${t('Ignore Whitespace: {value}', { value: yesNo(ignoreWhitespace) })}
- ${t('Ignore Case: {value}', { value: yesNo(ignoreCase) })}

${t('Summary:')}
- ${t('Hunks: {n}', { n: diffResult.hunks.length })}
- ${t('Additions: {n}', { n: diffResult.additions })}
- ${t('Deletions: {n}', { n: diffResult.deletions })}
- ${t('Total Changes: {n}', { n: diffResult.totalChanges })}

=== ${t('GIT-STYLE DIFF')} ===
${diffResult.hunks.map((hunk, hunkIndex) => {
  const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
  const hunkLines = hunk.lines.map(line => {
    let prefix = ' ';
    if (line.type === 'added') prefix = '+';
    else if (line.type === 'removed') prefix = '-';
    return `${prefix}${line.content}`;
  }).join('\n');
  
  return `${header}\n${hunkLines}`;
}).join('\n\n')}
`;
    return report;
  };

  const navigateToNextDiff = () => {
    if (allDiffLines.length > 0) {
      setCurrentDiffIndex((prev) => (prev + 1) % allDiffLines.length);
    }
  };

  const navigateToPrevDiff = () => {
    if (allDiffLines.length > 0) {
      setCurrentDiffIndex((prev) => (prev - 1 + allDiffLines.length) % allDiffLines.length);
    }
  };

  const getLineStyle = (line: DiffLine): string => {
    switch (line.type) {
      case 'added':
        return 'bg-green-50 dark:bg-green-950/30 border-l-4 border-green-500';
      case 'removed':
        return 'bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500';
      case 'context':
        return 'bg-background border-l-4 border-transparent';
      default:
        return 'bg-background border-l-4 border-transparent';
    }
  };

  const swapTexts = () => {
    const tempText = leftText;
    const tempFileName = leftFileName;
    setLeftText(rightText);
    setRightText(tempText);
    setLeftFileName(rightFileName);
    setRightFileName(tempFileName);
    trackTool('Online Diff Tool', 'swap_texts');
  };

  const clearFiles = () => {
    setLeftText('');
    setRightText('');
    setLeftFileName('');
    setRightFileName('');
  };

  return (
    <TooltipProvider>
      <>
        
        <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
          <div className="container mx-auto px-4 pt-6 max-w-7xl">
            <ToolBreadcrumb 
              category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
              subcategory={{ label: t('Diff Tools'), href: '/category/development-tech#diff-tools' }}
              toolName="Online Diff Tool"
            />
            
            <div className="mt-6 mb-6 text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <GitCompare className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                  {t('Online Diff Tool')}
                </h1>
              </div>
              <p className="text-muted-foreground text-sm sm:text-base max-w-3xl mx-auto leading-relaxed">
                {t('Compare two texts or files side-by-side with highlighted differences, just like GitHub or Beyond Compare')}
              </p>
            </div>

            {/* Input Mode Toggle */}
            <div className="mb-6 flex justify-center">
              <Tabs value={inputMode} onValueChange={(value) => setInputMode(value as 'text' | 'file')} className="w-auto">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t('Text Input')}
                  </TabsTrigger>
                  <TabsTrigger value="file" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    {t('File Upload')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Input Section */}
            <Card className="shadow-lg border-0 bg-card/50 backdrop-blur mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle>{inputMode === 'file' ? t('Input Files') : t('Input Texts')}</CardTitle>
                  </div>
                  {(leftText || rightText) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFiles}
                      className="flex items-center gap-2"
                    >
                      <X className="h-4 w-4" />
                      {t('Clear All')}
                    </Button>
                  )}
                </div>
                <CardDescription>
                  {inputMode === 'file' 
                    ? t('Upload two files to compare them side-by-side')
                    : t('Enter two texts to compare them side-by-side')
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 relative">
                  {/* Left Input */}
                  <div className="space-y-2">
                    <Label htmlFor="leftInput" className="flex items-center gap-2">
                      <span className="text-red-600 dark:text-red-400">●</span>
                      {inputMode === 'file' ? t('Original File') : t('Original Text')}
                      {leftFileName && (
                        <Badge variant="secondary" className="ml-2">
                          <File className="h-3 w-3 mr-1" />
                          {leftFileName}
                        </Badge>
                      )}
                    </Label>
                    {inputMode === 'file' ? (
                      <div
                        {...getLeftRootProps()}
                        className={`min-h-48 xl:min-h-64 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                          isLeftDragActive 
                            ? 'border-primary bg-primary/10' 
                            : 'border-muted-foreground/20 hover:border-primary/50'
                        }`}
                      >
                        <input {...getLeftInputProps()} />
                        {leftText ? (
                          <div className="space-y-2">
                            <File className="h-8 w-8 mx-auto text-green-500" />
                            <p className="text-sm text-green-600 dark:text-green-400">{t('File loaded successfully')}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('{length} lines • {length2} characters', { length: leftText.split('\n').length, length2: leftText.length })}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              {t('Drag & drop a file here, or click to select')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('Supports: .txt, .md, .js, .ts, .json, .html, .css, .py and more')}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Textarea
                        id="leftInput"
                        placeholder={t('Enter original text here...')}
                        value={leftText}
                        onChange={(e) => setLeftText(e.target.value)}
                        className="min-h-48 xl:min-h-64 font-mono text-sm border-muted-foreground/20 focus:border-primary"
                      />
                    )}
                   </div>
                   
                   {/* Swap Button */}
                   <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 hidden xl:block">
                     <Tooltip>
                       <TooltipTrigger asChild>
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={swapTexts}
                           className="h-10 w-10 rounded-full bg-background border-2 shadow-lg hover:scale-110 transition-transform"
                         >
                           <ArrowLeftRight className="h-4 w-4" />
                         </Button>
                       </TooltipTrigger>
                       <TooltipContent>
                         <p>{t('Swap original and modified')}</p>
                       </TooltipContent>
                     </Tooltip>
                   </div>
                   
                   {/* Right Input */}
                  <div className="space-y-2">
                    <Label htmlFor="rightInput" className="flex items-center gap-2">
                      <span className="text-green-600 dark:text-green-400">●</span>
                      {inputMode === 'file' ? t('Modified File') : t('Modified Text')}
                      {rightFileName && (
                        <Badge variant="secondary" className="ml-2">
                          <File className="h-3 w-3 mr-1" />
                          {rightFileName}
                        </Badge>
                      )}
                    </Label>
                    {inputMode === 'file' ? (
                      <div
                        {...getRightRootProps()}
                        className={`min-h-48 xl:min-h-64 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                          isRightDragActive 
                            ? 'border-primary bg-primary/10' 
                            : 'border-muted-foreground/20 hover:border-primary/50'
                        }`}
                      >
                        <input {...getRightInputProps()} />
                        {rightText ? (
                          <div className="space-y-2">
                            <File className="h-8 w-8 mx-auto text-green-500" />
                            <p className="text-sm text-green-600 dark:text-green-400">{t('File loaded successfully')}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('{length} lines • {length2} characters', { length: rightText.split('\n').length, length2: rightText.length })}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              {t('Drag & drop a file here, or click to select')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('Supports: .txt, .md, .js, .ts, .json, .html, .css, .py and more')}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Textarea
                        id="rightInput"
                        placeholder={t('Enter modified text here...')}
                        value={rightText}
                        onChange={(e) => setRightText(e.target.value)}
                        className="min-h-48 xl:min-h-64 font-mono text-sm border-muted-foreground/20 focus:border-primary"
                      />
                    )}
                  </div>
                </div>

                {/* Mobile Swap Button */}
                <div className="xl:hidden flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={swapTexts}
                    className="flex items-center gap-2"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                    {t('Swap Original & Modified')}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ignoreWhitespace}
                      onChange={(e) => setIgnoreWhitespace(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{t('Ignore whitespace')}</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ignoreCase}
                      onChange={(e) => setIgnoreCase(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{t('Ignore case')}</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showLineNumbers}
                      onChange={(e) => setShowLineNumbers(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{t('Show line numbers')}</span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Summary - GitHub-style stats */}
            <Card className="shadow-lg border-0 bg-card/50 backdrop-blur mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5 text-primary" />
                  {t('Diff Summary')}
                  {allDiffLines.length > 0 && (
                    <div className="flex gap-2 ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={navigateToPrevDiff}
                         disabled={allDiffLines.length === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground flex items-center px-2">
                        {allDiffLines.length > 0 ? t('{n} of {total}', { n: currentDiffIndex + 1, total: allDiffLines.length }) : t('{n} of {total}', { n: 0, total: 0 })}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={navigateToNextDiff}
                        disabled={allDiffLines.length === 0}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leftText.trim() || rightText.trim() ? (
                  <div className="space-y-4">
                    {/* GitHub-style diff stats bar */}
                    <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {leftFileName || t('Original')} → {rightFileName || t('Modified')}
                        </span>
                       </div>
                       <div className="flex items-center gap-1 text-sm text-muted-foreground">
                         {diffResult.additions > 0 && (
                           <span className="text-green-600 dark:text-green-400">
                             +{diffResult.additions}
                           </span>
                         )}
                         {diffResult.deletions > 0 && (
                           <span className="text-red-600 dark:text-red-400">
                             -{diffResult.deletions}
                           </span>
                         )}
                       </div>
                     </div>

                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">+{diffResult.additions}</div>
                        <div className="text-sm text-green-600 dark:text-green-400">{t('Additions')}</div>
                      </div>
                      <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                        <div className="text-2xl font-bold text-red-700 dark:text-red-300">-{diffResult.deletions}</div>
                        <div className="text-sm text-red-600 dark:text-red-400">{t('Deletions')}</div>
                      </div>
                       <div className="p-3 bg-muted/10 rounded-lg border border-muted/20">
                         <div className="text-2xl font-bold text-muted-foreground">{diffResult.hunks.length}</div>
                         <div className="text-sm text-muted-foreground">{t('Hunks')}</div>
                       </div>
                       <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                         <div className="text-2xl font-bold text-primary">{diffResult.totalChanges}</div>
                         <div className="text-sm text-muted-foreground">{t('Total Changes')}</div>
                       </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleDownload(generateDiffReport(), 'diff-report.txt')}
                        className="flex-1"
                        variant="outline"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {t('Download Report')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('Enter text in both fields to see differences')}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* GitHub-style side-by-side comparison */}
            {(leftText.trim() || rightText.trim()) && (
              <Card className="shadow-lg border-0 bg-card/50 backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <GitCompare className="h-5 w-5 text-primary" />
                    {t('Diff View')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* File headers */}
                  <div className="grid grid-cols-2 border-b">
                    <div className="p-3 border-r bg-red-50 dark:bg-red-950/20">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-red-600 dark:text-red-400">●</span>
                        {leftFileName || t('Original')}
                        <Button
                          onClick={() => handleCopy(leftText, t('Original text'))}
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 w-6 p-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-950/20">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-green-600 dark:text-green-400">●</span>
                        {rightFileName || t('Modified')}
                        <Button
                          onClick={() => handleCopy(rightText, t('Modified text'))}
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 w-6 p-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                   {/* Git-style unified diff view */}
                   <div className="max-h-96 overflow-auto font-mono text-sm">
                     {diffResult.hunks.map((hunk, hunkIndex) => (
                       <div key={hunkIndex} className="border-b border-muted/20 last:border-0">
                         {/* Hunk header */}
                         <div className="bg-muted/20 px-3 py-2 text-xs text-muted-foreground border-b">
                           @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                         </div>
                         
                         {/* Hunk lines */}
                         {hunk.lines.map((line, lineIndex) => (
                           <div
                             key={`${hunkIndex}-${lineIndex}`}
                             className={`flex ${getLineStyle(line)} hover:bg-muted/20`}
                           >
                             {showLineNumbers && (
                               <>
                                 <div className="w-12 px-2 py-1 text-xs text-muted-foreground bg-muted/30 border-r shrink-0 text-right select-none">
                                   {line.oldLineNumber || ''}
                                 </div>
                                 <div className="w-12 px-2 py-1 text-xs text-muted-foreground bg-muted/30 border-r shrink-0 text-right select-none">
                                   {line.newLineNumber || ''}
                                 </div>
                               </>
                             )}
                             <div className="w-4 px-1 py-1 text-xs text-center shrink-0 select-none">
                               {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                             </div>
                             <div className="px-3 py-1 flex-1 whitespace-pre-wrap break-words">
                               <span className={
                                 line.type === 'added' ? 'bg-green-100 dark:bg-green-900/30' : 
                                 line.type === 'removed' ? 'bg-red-100 dark:bg-red-900/30' : ''
                               }>
                                 {line.content}
                               </span>
                             </div>
                           </div>
                         ))}
                       </div>
                     ))}
                   </div>

                   {/* Legend */}
                   <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                     <div className="flex flex-wrap gap-4 text-sm">
                       <div className="flex items-center gap-2">
                         <div className="w-4 h-4 bg-green-100 dark:bg-green-900 border-l-4 border-green-500 rounded-sm"></div>
                         <span>{t('Added lines')}</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <div className="w-4 h-4 bg-red-100 dark:bg-red-900 border-l-4 border-red-500 rounded-sm"></div>
                         <span>{t('Removed lines')}</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <div className="w-4 h-4 bg-background border-l-4 border-transparent rounded-sm"></div>
                         <span>{t('Context lines')}</span>
                       </div>
                     </div>
                   </div>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </>
    </TooltipProvider>
  );
};

export default OnlineDiffTool;