import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Copy, Download, Shuffle, Type, Cloud, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { countWords, topWords } from '@/lib/tools/word-cloud-generator';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

interface WordData {
  word: string;
  frequency: number;
  size: number;
  color: string;
  x: number;
  y: number;
  angle: number;
}

const colorSchemes = {
  classic: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'],
  vibrant: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'],
  sunset: ['#ff6b6b', '#ffa726', '#ffcc02', '#66bb6a', '#42a5f5', '#ab47bc', '#ef5350', '#ff7043'],
  nature: ['#27ae60', '#2ecc71', '#16a085', '#f39c12', '#e67e22', '#d35400', '#8e44ad', '#2c3e50'],
  ocean: ['#3498db', '#2980b9', '#1abc9c', '#16a085', '#17a2b8', '#6f42c1', '#e83e8c', '#20c997'],
  monochrome: ['#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#bdc3c7', '#ecf0f1', '#3498db', '#e74c3c'],
  warm: ['#e74c3c', '#e67e22', '#f39c12', '#f1c40f', '#d35400', '#c0392b', '#a93226', '#922b21'],
  cool: ['#3498db', '#2980b9', '#21618c', '#1b4f72', '#85c1e9', '#5dade2', '#3498db', '#2e86de'],
  pastel: ['#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43', '#ff6b6b', '#c44569', '#f8b500']
};

const backgroundOptions = {
  white: '#ffffff',
  black: '#000000',
  light: '#f8f9fa',
  dark: '#2c3e50',
  blue: '#3498db',
  green: '#27ae60',
  purple: '#8e44ad',
  orange: '#e67e22',
  transparent: 'transparent'
};

const WordCloudGenerator: React.FC = () => {
  const { t } = useT();
  const [inputText, setInputText] = useState('');
  const [wordData, setWordData] = useState<WordData[]>([]);
  const [maxWords, setMaxWords] = useState([50]);
  const [minWordLength, setMinWordLength] = useState([3]);
  const [colorScheme, setColorScheme] = useState('classic');
  const [backgroundColor, setBackgroundColor] = useState('white');
  const [wordCloudStyle, setWordCloudStyle] = useState('random');
  const [removeStopWords, setRemoveStopWords] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showFrequency, setShowFrequency] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { trackTool } = useAnalytics();
  const navigate = useNavigate();

  useEffect(() => {
    trackTool('Word Cloud Generator', 'view');
  }, [trackTool]);

  const processText = (text: string): Map<string, number> =>
    countWords(text, { caseSensitive, minWordLength: minWordLength[0], removeStopWords });

  const generateWordCloud = () => {
    if (!inputText.trim()) {
      toast.error(t('Please enter some text to generate a word cloud'));
      return;
    }

    trackTool('Word Cloud Generator', 'generate');

    const wordCount = processText(inputText);
    const sortedWords = topWords(wordCount, maxWords[0]);

    if (sortedWords.length === 0) {
      toast.error(t('No words found after filtering. Try adjusting your settings.'));
      return;
    }

    const maxFreq = sortedWords[0][1];
    const minFreq = sortedWords[sortedWords.length - 1][1];
    const colors = colorSchemes[colorScheme as keyof typeof colorSchemes];

    const words: WordData[] = sortedWords.map(([word, freq], index) => {
      const normalizedFreq = minFreq === maxFreq ? 1 : (freq - minFreq) / (maxFreq - minFreq);
      const size = 12 + normalizedFreq * 48; // Size range: 12-60px
      const color = colors[index % colors.length];
      
      // Position based on style
      let x, y, angle;
      switch (wordCloudStyle) {
        case 'circular':
          const radius = 150 + (normalizedFreq * 100);
          const theta = (index / sortedWords.length) * 2 * Math.PI;
          x = 400 + radius * Math.cos(theta);
          y = 300 + radius * Math.sin(theta);
          angle = 0;
          break;
        case 'horizontal':
          x = Math.random() * 600 + 100;
          y = Math.random() * 400 + 100;
          angle = 0;
          break;
        case 'vertical':
          x = Math.random() * 600 + 100;
          y = Math.random() * 400 + 100;
          angle = 90;
          break;
        case 'spiral':
          const spiralRadius = Math.sqrt(index) * 30;
          const spiralAngle = index * 0.5;
          x = 400 + spiralRadius * Math.cos(spiralAngle);
          y = 300 + spiralRadius * Math.sin(spiralAngle);
          angle = 0;
          break;
        default: // random
          x = Math.random() * 600 + 100;
          y = Math.random() * 400 + 100;
          angle = Math.random() * 360;
      }
      
      return {
        word,
        frequency: freq,
        size,
        color,
        x: Math.max(50, Math.min(750, x)), // Keep within canvas bounds
        y: Math.max(50, Math.min(550, y)),
        angle
      };
    });

    setWordData(words);
    setTimeout(() => drawWordCloud(words), 100);
    toast.success(t('Generated word cloud with {n} words', { n: words.length }));
  };

  const drawWordCloud = (words: WordData[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get device pixel ratio for high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = 800;
    const displayHeight = 600;

    // Set actual canvas size in memory (scaled up for high-DPI)
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    // Scale the canvas back down using CSS
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    // Scale the drawing context so everything draws at the correct size
    ctx.scale(dpr, dpr);

    // Enable text antialiasing for crisp text
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    
    // Set canvas background
    const bgColor = backgroundOptions[backgroundColor as keyof typeof backgroundOptions];
    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, displayWidth, displayHeight);
    }

    // Draw words with improved quality
    words.forEach(word => {
      ctx.save();
      ctx.translate(word.x, word.y);
      ctx.rotate((word.angle * Math.PI) / 180);
      ctx.fillStyle = word.color;
      
      // Use high-quality font rendering
      ctx.font = `bold ${word.size}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add subtle text shadow for better contrast
      ctx.shadowColor = backgroundColor === 'white' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
      ctx.shadowBlur = 1;
      ctx.shadowOffsetX = 0.5;
      ctx.shadowOffsetY = 0.5;
      
      ctx.fillText(word.word, 0, 0);
      ctx.restore();
    });
  };

  // Initialize canvas with high-DPI support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set initial canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = 800;
    const displayHeight = 600;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    
    ctx.scale(dpr, dpr);
  }, []);

  const shuffleWords = () => {
    if (wordData.length === 0) return;

    const shuffled = wordData.map((word, index) => {
      let x, y, angle;
      switch (wordCloudStyle) {
        case 'circular':
          const radius = 150 + ((word.size - 12) / 48) * 100;
          const theta = (index / wordData.length) * 2 * Math.PI;
          x = 400 + radius * Math.cos(theta);
          y = 300 + radius * Math.sin(theta);
          angle = 0;
          break;
        case 'horizontal':
          x = Math.random() * 600 + 100;
          y = Math.random() * 400 + 100;
          angle = 0;
          break;
        case 'vertical':
          x = Math.random() * 600 + 100;
          y = Math.random() * 400 + 100;
          angle = 90;
          break;
        case 'spiral':
          const spiralRadius = Math.sqrt(index) * 30;
          const spiralAngle = index * 0.5;
          x = 400 + spiralRadius * Math.cos(spiralAngle);
          y = 300 + spiralRadius * Math.sin(spiralAngle);
          angle = 0;
          break;
        default: // random
          x = Math.random() * 600 + 100;
          y = Math.random() * 400 + 100;
          angle = Math.random() * 360;
      }
      
      return {
        ...word,
        x: Math.max(50, Math.min(750, x)),
        y: Math.max(50, Math.min(550, y)),
        angle
      };
    });

    setWordData(shuffled);
    drawWordCloud(shuffled);
    trackTool('Word Cloud Generator', 'shuffle');
    toast.success(t('Word positions shuffled'));
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a temporary canvas with proper sizing for download
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Use high resolution for download
    const downloadWidth = 1600; // 2x resolution for crisp download
    const downloadHeight = 1200;
    tempCanvas.width = downloadWidth;
    tempCanvas.height = downloadHeight;

    // Scale factor for higher resolution
    const scaleX = downloadWidth / 800;
    const scaleY = downloadHeight / 600;

    // Enable high-quality rendering
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';

    // Draw background
    const bgColor = backgroundOptions[backgroundColor as keyof typeof backgroundOptions];
    if (bgColor !== 'transparent') {
      tempCtx.fillStyle = bgColor;
      tempCtx.fillRect(0, 0, downloadWidth, downloadHeight);
    }

    // Draw words at higher resolution
    wordData.forEach(word => {
      tempCtx.save();
      tempCtx.translate(word.x * scaleX, word.y * scaleY);
      tempCtx.rotate((word.angle * Math.PI) / 180);
      tempCtx.fillStyle = word.color;
      tempCtx.font = `bold ${word.size * scaleX}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      tempCtx.textAlign = 'center';
      tempCtx.textBaseline = 'middle';
      
      // Add subtle shadow for better quality
      tempCtx.shadowColor = backgroundColor === 'white' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
      tempCtx.shadowBlur = 2;
      tempCtx.shadowOffsetX = 1;
      tempCtx.shadowOffsetY = 1;
      
      tempCtx.fillText(word.word, 0, 0);
      tempCtx.restore();
    });

    const link = document.createElement('a');
    link.download = 'wordcloud-hd.png';
    link.href = tempCanvas.toDataURL('image/png', 1.0); // Maximum quality
    link.click();
    
    trackTool('Word Cloud Generator', 'download');
    toast.success(t('High-quality word cloud downloaded'));
  };

  const copyToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      // Create high-quality version for clipboard
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCanvas.width = 1200;
      tempCanvas.height = 900;
      const scaleX = 1200 / 800;
      const scaleY = 900 / 600;

      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';

      // Draw background
      const bgColor = backgroundOptions[backgroundColor as keyof typeof backgroundOptions];
      if (bgColor !== 'transparent') {
        tempCtx.fillStyle = bgColor;
        tempCtx.fillRect(0, 0, 1200, 900);
      }

      // Draw words at higher resolution
      wordData.forEach(word => {
        tempCtx.save();
        tempCtx.translate(word.x * scaleX, word.y * scaleY);
        tempCtx.rotate((word.angle * Math.PI) / 180);
        tempCtx.fillStyle = word.color;
        tempCtx.font = `bold ${word.size * scaleX}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        tempCtx.textAlign = 'center';
        tempCtx.textBaseline = 'middle';
        tempCtx.fillText(word.word, 0, 0);
        tempCtx.restore();
      });

      tempCanvas.toBlob(async (blob) => {
        try {
          if (!blob || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard not supported');
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          trackTool('Word Cloud Generator', 'copy');
          toast.success(t('High-quality word cloud copied to clipboard'));
        } catch {
          toast.error(t('Copying images is not supported in this browser. Use Download instead.'));
        }
      }, 'image/png', 1.0);
    } catch (error) {
      toast.error(t('Failed to copy to clipboard'));
    }
  };

  const sampleText = t("Technology innovation drives progress in software development. Modern applications require scalable architecture, robust security measures, and exceptional user experience. Developers utilize various programming languages, frameworks, and tools to create efficient solutions. Continuous integration, automated testing, and agile methodologies ensure quality delivery. Cloud computing, artificial intelligence, and machine learning transform how we build and deploy applications.");

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { inputText };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSampleText = () => requestSampleLoad(() => {
    setInputText(sampleText);
    toast.success(t('Sample text loaded'));
  });

  const onToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  return (
    <>

      <div className={`${false ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${false ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: t('Text Processing'), href: "/category/development-tech/text-processing" }}
                toolName="Word Cloud Generator"
              />
            </div>
            
    <div className="container max-w-7xl mx-auto p-4 space-y-6 mt-3">
      <div className="text-left space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <Cloud className="h-8 w-8 text-blue-500" />
          <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold">{t('Word Cloud Generator')}</h1>
        </div>
        <p className="tool-description text-gray-600 text-sm sm:text-base">
          {t('Create beautiful word clouds from your text. Visualize word frequency with customizable colors, sizes, and layouts.')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Section */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="input-text" className="text-sm font-medium">{t('Input Text')}</Label>
                <Button variant="outline" size="sm" onClick={loadSampleText}>
                  {t('Load Sample')}
                </Button>
              </div>
              <Textarea
                id="input-text"
                placeholder={t('Enter your text here...')}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={8}
                className="min-h-[200px]"
              />
              
              <Separator />
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('Maximum Words: {value}', { value: maxWords[0] })}</Label>
                  <Slider
                    value={maxWords}
                    onValueChange={setMaxWords}
                    min={10}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('Minimum Word Length: {value}', { value: minWordLength[0] })}</Label>
                  <Slider
                    value={minWordLength}
                    onValueChange={setMinWordLength}
                    min={1}
                    max={8}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('Color Scheme')}</Label>
                  <Select value={colorScheme} onValueChange={setColorScheme}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">{t('Classic')}</SelectItem>
                      <SelectItem value="vibrant">{t('Vibrant')}</SelectItem>
                      <SelectItem value="sunset">{t('Sunset')}</SelectItem>
                      <SelectItem value="nature">{t('Nature')}</SelectItem>
                      <SelectItem value="ocean">{t('Ocean')}</SelectItem>
                      <SelectItem value="monochrome">{t('Monochrome')}</SelectItem>
                      <SelectItem value="warm">{t('Warm')}</SelectItem>
                      <SelectItem value="cool">{t('Cool')}</SelectItem>
                      <SelectItem value="pastel">{t('Pastel')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('Background Color')}</Label>
                  <Select value={backgroundColor} onValueChange={setBackgroundColor}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="white">{t('White')}</SelectItem>
                      <SelectItem value="black">{t('Black')}</SelectItem>
                      <SelectItem value="light">{t('Light Gray')}</SelectItem>
                      <SelectItem value="dark">{t('Dark')}</SelectItem>
                      <SelectItem value="blue">{t('Blue')}</SelectItem>
                      <SelectItem value="green">{t('Green')}</SelectItem>
                      <SelectItem value="purple">{t('Purple')}</SelectItem>
                      <SelectItem value="orange">{t('Orange')}</SelectItem>
                      <SelectItem value="transparent">{t('Transparent')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('Word Cloud Style')}</Label>
                  <Select value={wordCloudStyle} onValueChange={setWordCloudStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="random">{t('Random Layout')}</SelectItem>
                      <SelectItem value="circular">{t('Circular Layout')}</SelectItem>
                      <SelectItem value="horizontal">{t('Horizontal Layout')}</SelectItem>
                      <SelectItem value="vertical">{t('Vertical Layout')}</SelectItem>
                      <SelectItem value="spiral">{t('Spiral Layout')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="remove-stop-words"
                      checked={removeStopWords}
                      onCheckedChange={setRemoveStopWords}
                    />
                    <Label htmlFor="remove-stop-words">{t('Remove stop words')}</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="case-sensitive"
                      checked={caseSensitive}
                      onCheckedChange={setCaseSensitive}
                    />
                    <Label htmlFor="case-sensitive">{t('Case sensitive')}</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="show-frequency"
                      checked={showFrequency}
                      onCheckedChange={setShowFrequency}
                    />
                    <Label htmlFor="show-frequency">{t('Show frequency list')}</Label>
                  </div>
                </div>
              </div>

              <Button onClick={generateWordCloud} className="w-full" size="lg">
                <Type className="mr-2 h-4 w-4" />
                {t('Generate Word Cloud')}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Visualization Section */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{t('Word Cloud Visualization')}</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={shuffleWords} disabled={wordData.length === 0}>
                    <Shuffle className="mr-2 h-4 w-4" />
                    {t('Shuffle')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyToClipboard} disabled={wordData.length === 0}>
                    <Copy className="mr-2 h-4 w-4" />
                    {t('Copy')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadImage} disabled={wordData.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    {t('Download')}
                  </Button>
                </div>
              </div>
              
              <div className="border rounded-lg bg-background overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={600}
                  className="w-full h-auto max-w-full"
                  style={{ display: 'block' }}
                />
              </div>
              
              {wordData.length === 0 && (
                <div className="flex items-center justify-center h-[600px] border rounded-lg bg-muted/30">
                  <div className="text-center space-y-2">
                    <Cloud className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">{t('Your word cloud will appear here')}</p>
                    <p className="text-sm text-muted-foreground">{t('Enter text and click "Generate Word Cloud"')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Word Frequency List */}
          {showFrequency && wordData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-lg font-semibold mb-4">{t('Word Frequencies')}</h3>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                  {wordData.map((word, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="text-xs"
                      style={{ backgroundColor: word.color + '20', color: word.color, borderColor: word.color }}
                    >
                      {word.word} ({word.frequency})
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

    </div>
    </div>
  </div>
</div>
  {confirmDialog}
</>
  );
};

export default WordCloudGenerator;