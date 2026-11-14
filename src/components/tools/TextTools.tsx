import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Type, Hash, FileText, Maximize2, Undo2, Redo2, Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { addEscapes, removeEscapes } from '@/lib/tools/escape-characters';
import {
  collapseSpaces,
  commitHistory,
  lineCount,
  linesToComma,
  redoHistory,
  replaceAllLiteral,
  sortLines as sortTextLines,
  toCamelCase as camelCaseLines,
  undoHistory,
  type TextHistory,
} from '@/lib/tools/online-text-processor';
import { useT } from '@/i18n';

const TextTools = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const { trackAction } = useToolAnalytics();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [inPlaceEdit, setInPlaceEdit] = useState(true);
  const [quoteType, setQuoteType] = useState<'single' | 'double'>('double');
  const [history, setHistory] = useState<TextHistory>({ stack: [''], index: 0 });
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(true);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    trackAction('tool_viewed', { tool: 'online-text-processor' });
  }, [trackAction]);

  const undoLastChange = () => {
    const previous = undoHistory(history);
    if (previous) {
      setInput(previous.stack[previous.index]);
      setHistory(previous);
      toast({ title: t('Undone'), description: t('Last change has been undone!') });
    } else {
      toast({ title: t('No changes'), description: t('Nothing to undo!') });
    }
  };

  const redoLastChange = () => {
    const next = redoHistory(history);
    if (next) {
      setInput(next.stack[next.index]);
      setHistory(next);
      toast({ title: t('Redone'), description: t('Change has been redone!') });
    } else {
      toast({ title: t('No changes'), description: t('Nothing to redo!') });
    }
  };

  const findAndReplace = () => {
    if (!findText) {
      toast({ title: t('Error'), description: t('Please enter text to find!') });
      return;
    }
    
    updateText(replaceAllLiteral(input, findText, replaceText, caseSensitive));
    toast({ title: t('Success'), description: t('Text replaced successfully!') });
  };

  const updateText = (newText: string) => {
    if (inPlaceEdit) {
      setHistory(commitHistory(history, input, newText));
      setInput(newText);
    } else {
      setOutput(newText);
    }
  };

  const removeDuplicateLines = () => {
    const lines = input.split('\n');
    const uniqueLines = [...new Set(lines)];
    updateText(uniqueLines.join('\n'));
    trackAction('text_remove_duplicates', { inputLines: lines.length, outputLines: uniqueLines.length });
    toast({ title: t('Success'), description: t('Duplicate lines removed!') });
  };

  const removeExtraSpaces = () => {
    updateText(collapseSpaces(input));
    toast({ title: t('Success'), description: t('Extra spaces removed!') });
  };

  const toUpperCase = () => {
    updateText(input.toUpperCase());
    trackAction('text_to_uppercase', { textLength: input.length });
    toast({ title: t('Success'), description: t('Converted to uppercase!') });
  };

  const toLowerCase = () => {
    updateText(input.toLowerCase());
    toast({ title: t('Success'), description: t('Converted to lowercase!') });
  };

  const toTitleCase = () => {
    const titleCase = input.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
    updateText(titleCase);
    toast({ title: t('Success'), description: t('Converted to title case!') });
  };

  const toCamelCase = () => {
    updateText(camelCaseLines(input));
    toast({ title: t('Success'), description: t('Converted to camelCase!') });
  };

  const toCommaSeparated = () => {
    updateText(linesToComma(input));
    toast({ title: t('Success'), description: t('Converted to comma-separated!') });
  };

  const newLineToComma = () => {
    const result = input.replace(/\n/g, ', ');
    updateText(result);
    toast({ title: t('Success'), description: t('New lines converted to commas!') });
  };

  const commaToNewLine = () => {
    const result = input.replace(/,\s*/g, '\n');
    updateText(result);
    toast({ title: t('Success'), description: t('Commas converted to new lines!') });
  };

  const addQuotesToLines = () => {
    const quote = quoteType === 'single' ? "'" : '"';
    const lines = input.split('\n');
    const quotedLines = lines.map(line => line.trim() ? `${quote}${line}${quote}` : line);
    updateText(quotedLines.join('\n'));
    toast({ title: t('Success'), description: quoteType === 'single' ? t('Added single quotes to each line!') : t('Added double quotes to each line!') });
  };

  const removeEscapeCharacters = () => {
    updateText(removeEscapes(input));
    toast({ title: t('Success'), description: t('Escape characters removed!') });
  };

  const addEscapeCharacters = () => {
    updateText(addEscapes(input));
    toast({ title: t('Success'), description: t('Escape characters added!') });
  };

  const removeEmptyLines = () => {
    const lines = input.split('\n').filter(line => line.trim() !== '');
    updateText(lines.join('\n'));
    toast({ title: t('Success'), description: t('Empty lines removed!') });
  };

  const sortLines = () => {
    updateText(sortTextLines(input));
    toast({ title: t('Success'), description: t('Lines sorted alphabetically!') });
  };

  const reverseLines = () => {
    const lines = input.split('\n').reverse();
    updateText(lines.join('\n'));
    toast({ title: t('Success'), description: t('Lines reversed!') });
  };

  const copyToClipboard = () => {
    const textToCopy = inPlaceEdit ? input : output;
    navigator.clipboard.writeText(textToCopy);
    trackAction('text_copy', { outputLength: textToCopy.length });
    toast({ title: t('Copied'), description: t('Text copied to clipboard!') });
  };

  const getWordCount = () => {
    const words = input.trim().split(/\s+/).filter(word => word.length > 0);
    return words.length;
  };

  const getCharCount = () => input.length;
  const getLineCount = () => lineCount(input);

  return (
    <>
      
      <div className={`${false ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${false ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-full xl:max-w-[2800px] mx-auto px-1.5 sm:px-3 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: t('Text Processing'), href: "/category/development-tech/text-processing" }}
                toolName={t('Online Text Processor')}
              />
            </div>
            
            <div className="tool-header mt-0">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Type className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('Online Text Processor')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Clean, format, sort and convert text in your browser')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Text')}</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Processing')}</Badge>
                </div>
              </div>
            </div>
            
            <div className="mt-6">

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-2 sm:gap-3 max-w-full xl:max-w-[2800px] mx-auto">
          {/* Input */}
          <Card className="bg-white border-2 border-gray-200 shadow-lg tool-card xl:col-span-4">
            <CardHeader className="pb-2 px-1 pt-1">
              <div className="flex items-center">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                <CardTitle className="text-black text-lg sm:text-xl">{t('Input Text')}</CardTitle>
              </div>
              <div className="flex items-center justify-end space-x-3 mt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={undoLastChange}
                  aria-label={t('Undo')}
                  disabled={history.index <= 0}
                  className="p-2"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={redoLastChange}
                  aria-label={t('Redo')}
                  disabled={history.index >= history.stack.length - 1}
                  className="p-2"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="inPlaceEdit" 
                    checked={inPlaceEdit} 
                    onCheckedChange={(checked) => setInPlaceEdit(checked as boolean)}
                  />
                  <label htmlFor="inPlaceEdit" className="text-sm text-gray-700">{t('In-place edit')}</label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-1 pb-1">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('Enter your text here...')}
                className="min-h-[400px] sm:min-h-[450px] bg-white border-2 border-gray-300 text-black w-full"
              />
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs sm:text-sm text-gray-600">
                <div>{t('Words: {count}', { count: getWordCount() })}</div>
                <div>{t('Chars: {count}', { count: getCharCount() })}</div>
                <div>{t('Lines: {count}', { count: getLineCount() })}</div>
              </div>
            </CardContent>
          </Card>

          {/* Tools */}
          <Card className="bg-white border-2 border-gray-200 shadow-lg tool-card xl:col-span-4">
            <CardHeader className="pb-4 px-1 pt-1">
              <CardTitle className="text-black flex items-center text-lg sm:text-xl">
                <Type className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                {t('Text Operations')}
              </CardTitle>
              <CardDescription className="text-gray-600 text-xs">{t('Choose an operation to apply')}</CardDescription>
            </CardHeader>
            <CardContent className="px-1 pb-1">
              <Tabs defaultValue="cleaning" className="w-full">
                <TabsList className="grid w-full grid-cols-4 bg-gray-100">
                  <TabsTrigger value="cleaning" className="text-xs sm:text-sm">{t('Clean')}</TabsTrigger>
                  <TabsTrigger value="case" className="text-xs sm:text-sm">{t('Case')}</TabsTrigger>
                  <TabsTrigger value="format" className="text-xs sm:text-sm">{t('Format')}</TabsTrigger>
                  <TabsTrigger value="find" className="text-xs sm:text-sm">{t('Find')}</TabsTrigger>
                </TabsList>
                
                <TabsContent value="cleaning" className="space-y-2 mt-4">
                  <Button onClick={removeDuplicateLines} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Remove Duplicate Lines')}
                  </Button>
                  <Button onClick={removeExtraSpaces} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Remove Extra Spaces')}
                  </Button>
                  <Button onClick={removeEmptyLines} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Remove Empty Lines')}
                  </Button>
                  <Button onClick={removeEscapeCharacters} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Remove Escape Characters')}
                  </Button>
                </TabsContent>
                
                <TabsContent value="case" className="space-y-2 mt-4">
                  <Button onClick={toUpperCase} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('UPPERCASE')}
                  </Button>
                  <Button onClick={toLowerCase} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('lowercase')}
                  </Button>
                  <Button onClick={toTitleCase} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Title Case')}
                  </Button>
                  <Button onClick={toCamelCase} className="w-full text-xs sm:text-sm" variant="outline">
                    camelCase
                  </Button>
                </TabsContent>

                <TabsContent value="format" className="space-y-2 mt-4">
                  <Button onClick={toCommaSeparated} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Lines to Comma')}
                  </Button>
                  <Button onClick={newLineToComma} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Newline to Comma')}
                  </Button>
                  <Button onClick={commaToNewLine} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Comma to Newline')}
                  </Button>
                  
                  {/* Quote Settings and Button */}
                  <div className="p-3 bg-gray-50 rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-700">{t('Quote type:')}</label>
                      <select 
                        value={quoteType} 
                        onChange={(e) => setQuoteType(e.target.value as 'single' | 'double')}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="double">{t('Double (")')}</option>
                        <option value="single">{t('Single (\')')}</option>
                      </select>
                    </div>
                    <Button onClick={addQuotesToLines} className="w-full text-xs sm:text-sm" variant="outline">
                      {t('Add Quotes to Lines')}
                    </Button>
                  </div>
                  
                  <Button onClick={addEscapeCharacters} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Add Escape Characters')}
                  </Button>
                  <Button onClick={sortLines} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Sort Lines')}
                  </Button>
                  <Button onClick={reverseLines} className="w-full text-xs sm:text-sm" variant="outline">
                    {t('Reverse Lines')}
                  </Button>
                </TabsContent>

                <TabsContent value="find" className="space-y-3 mt-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">{t('Find:')}</label>
                    <Input
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                      placeholder={t('Text to find...')}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700">{t('Replace with:')}</label>
                    <Input
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      placeholder={t('Replacement text...')}
                      className="text-xs"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="caseSensitive" 
                      checked={caseSensitive} 
                      onCheckedChange={(checked) => setCaseSensitive(checked as boolean)}
                    />
                    <label htmlFor="caseSensitive" className="text-xs text-gray-700">{t('Case sensitive')}</label>
                  </div>
                  <Button onClick={findAndReplace} className="w-full text-xs sm:text-sm" variant="outline">
                    <Search className="h-4 w-4 mr-2" />
                    {t('Find & Replace All')}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Output */}
          <Card className="bg-white border-2 border-gray-200 shadow-lg tool-card xl:col-span-4">
            <CardHeader className="pb-4 px-1 pt-1">
              <CardTitle className="text-black flex items-center justify-between text-lg sm:text-xl">
                <span className="flex items-center">
                  <Hash className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                  {t('Output')}
                </span>
                <Button size="sm" variant="outline" onClick={copyToClipboard} disabled={inPlaceEdit ? !input : !output}>
                  <Copy className="h-4 w-4" />
                </Button>
              </CardTitle>
              <CardDescription className="text-gray-600 text-xs">{t('Processed text result')}</CardDescription>
            </CardHeader>
            <CardContent className="px-1 pb-1">
              <Textarea
                value={inPlaceEdit ? input : output}
                readOnly={inPlaceEdit}
                onChange={inPlaceEdit ? undefined : (e) => setOutput(e.target.value)}
                className="min-h-[400px] sm:min-h-[450px] bg-gray-50 border-2 border-gray-300 text-black w-full"
                placeholder={inPlaceEdit ? t('Result shows here (same as input when in-place edit is enabled)') : t('Processed text will appear here...')}
              />
            </CardContent>
          </Card>
        </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TextTools;
