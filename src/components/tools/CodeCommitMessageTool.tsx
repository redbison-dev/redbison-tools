import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { GitBranch, Copy, Loader2, Maximize, RefreshCw, Code } from 'lucide-react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useToast } from '@/hooks/use-toast';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { buildCommitMessage, type CommitInputs, type GeneratedCommit } from '@/lib/tools/code-commit-message-tool';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

interface CodeCommitProps {
  onToolSelect?: (toolId: string) => void;
}

const CodeCommitMessageTool: React.FC<CodeCommitProps> = ({ onToolSelect }) => {
  const { t: tx } = useT();
  const { trackTool } = useAnalytics();
  const { toast } = useToast();
  const [inputs, setInputs] = useState<CommitInputs>({
    changeType: '',
    changeDescription: '',
    filesChanged: '',
    bugDescription: '',
    rootCause: '',
    testingTypes: [],
    testingDescription: '',
    breakingChange: false,
    additionalNotes: ''
  });
  const [generatedCommit, setGeneratedCommit] = useState<GeneratedCommit | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  React.useEffect(() => {
    trackTool('Code Commit Message Tool');
  }, [trackTool]);

  const handleInputChange = (field: keyof CommitInputs, value: string | boolean | string[]) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };

  const handleTestingTypeChange = (testType: string, checked: boolean) => {
    setInputs(prev => ({
      ...prev,
      testingTypes: checked 
        ? [...prev.testingTypes, testType]
        : prev.testingTypes.filter(t => t !== testType)
    }));
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = inputs;
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSampleData = () => requestSampleLoad(() => {
    setInputs({
      changeType: 'fix',
      changeDescription: 'Fixed memory leak in user session management',
      filesChanged: 'src/auth/SessionManager.js, src/utils/MemoryUtils.js, tests/auth/SessionManager.test.js',
      bugDescription: 'User sessions were not being properly cleaned up after logout, causing memory consumption to grow over time',
      rootCause: 'Event listeners were not being removed from session objects when users logged out, preventing garbage collection',
      testingTypes: ['unit', 'integration', 'manual'],
      testingDescription: 'Added unit tests for session cleanup, ran integration tests for auth flow, manually tested memory usage over 24h period',
      breakingChange: false,
      additionalNotes: 'This fix resolves the production memory alerts we have been receiving'
    });
    
    toast({
      title: tx('Sample Data Loaded'),
      description: tx('You can now generate a commit message with the sample data.')
    });
  });

  const generateCommitMessage = async () => {
    if (!inputs.changeType || !inputs.changeDescription) {
      toast({
        title: tx('Missing Information'),
        description: tx('Please fill in at least the change type and description.'),
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const mockCommit: GeneratedCommit = buildCommitMessage(inputs);

      setGeneratedCommit(mockCommit);
      
      toast({
        title: tx('Commit Message Generated!'),
        description: tx('Your git commit message has been created following conventional commit standards.')
      });
      
    } catch (error) {
      toast({
        title: tx('Generation Failed'),
        description: tx('There was an error generating your commit message.'),
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: tx('Copied to Clipboard'),
        description: tx('{type} has been copied to clipboard.', { type })
      });
    } catch (error) {
      toast({
        title: tx('Copy Failed'),
        description: tx('Unable to copy to clipboard.'),
        variant: "destructive"
      });
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const resetForm = () => {
    setInputs({
      changeType: '',
      changeDescription: '',
      filesChanged: '',
      bugDescription: '',
      rootCause: '',
      testingTypes: [],
      testingDescription: '',
      breakingChange: false,
      additionalNotes: ''
    });
    setGeneratedCommit(null);
  };

  const testingOptions = [
    { id: 'unit', label: tx('Unit Tests') },
    { id: 'integration', label: tx('Integration Tests') },
    { id: 'e2e', label: tx('End-to-End Tests') },
    { id: 'manual', label: tx('Manual Testing') },
    { id: 'performance', label: tx('Performance Testing') },
    { id: 'security', label: tx('Security Testing') }
  ];

  return (
    <>
      
      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: tx('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: tx('Documentation & Review'), href: "/category/development-tech/documentation-tools" }}
                toolName="Code Commit Message Tool"
              />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <GitBranch className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-green-600" />
                    {tx('Conventional Commit Message Generator')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{tx('Write git commit messages that follow the Conventional Commits format')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{tx('Git')}</Badge>
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{tx('Developer')}</Badge>
                  <Button
                    onClick={toggleFullscreen}
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-600 hover:bg-gray-100"
                  >
                    <Maximize className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="mt-6">
                <p className="text-muted-foreground max-w-3xl">
                  {tx('Write git commit messages that follow the Conventional Commits format. Describe your changes and get properly formatted commit titles and descriptions.')}
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Input Form */}
              <Card>
                <CardHeader>
                  <CardTitle>{tx('Change Information')}</CardTitle>
                  <CardDescription>
                    {tx('Describe your code changes to generate a conventional commit message.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="changeType">{tx('Change Type *')}</Label>
                <Select value={inputs.changeType} onValueChange={(value) => handleInputChange('changeType', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={tx('Select change type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feat">{tx('feat - New feature')}</SelectItem>
                    <SelectItem value="fix">{tx('fix - Bug fix')}</SelectItem>
                    <SelectItem value="docs">{tx('docs - Documentation')}</SelectItem>
                    <SelectItem value="style">{tx('style - Code style')}</SelectItem>
                    <SelectItem value="refactor">{tx('refactor - Code refactoring')}</SelectItem>
                    <SelectItem value="test">{tx('test - Adding tests')}</SelectItem>
                    <SelectItem value="chore">{tx('chore - Maintenance')}</SelectItem>
                    <SelectItem value="perf">{tx('perf - Performance improvement')}</SelectItem>
                    <SelectItem value="ci">{tx('ci - CI/CD changes')}</SelectItem>
                    <SelectItem value="build">{tx('build - Build system or dependencies')}</SelectItem>
                    <SelectItem value="revert">{tx('revert - Revert a previous commit')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filesChanged">{tx('Files Changed')}</Label>
                <Input
                  id="filesChanged"
                  placeholder={tx('e.g., src/auth/login.js, tests/auth.test.js')}
                  value={inputs.filesChanged}
                  onChange={(e) => handleInputChange('filesChanged', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="changeDescription">{tx('Change Description *')}</Label>
              <Textarea
                id="changeDescription"
                placeholder={tx('Brief description of what was changed...')}
                value={inputs.changeDescription}
                onChange={(e) => handleInputChange('changeDescription', e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            {(inputs.changeType === 'fix') && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="bugDescription">{tx('Bug Description')}</Label>
                  <Textarea
                    id="bugDescription"
                    placeholder={tx('What was the bug or issue that was fixed?')}
                    value={inputs.bugDescription}
                    onChange={(e) => handleInputChange('bugDescription', e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rootCause">{tx('Root Cause')}</Label>
                  <Textarea
                    id="rootCause"
                    placeholder={tx('What was the root cause of the bug?')}
                    value={inputs.rootCause}
                    onChange={(e) => handleInputChange('rootCause', e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
              </>
            )}

            <div className="space-y-3">
              <Label>{tx('Testing Performed')}</Label>
              <div className="grid grid-cols-2 gap-3">
                {testingOptions.map((option) => (
                  <div key={option.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={option.id}
                      checked={inputs.testingTypes.includes(option.id)}
                      onCheckedChange={(checked) => handleTestingTypeChange(option.id, checked as boolean)}
                    />
                    <Label htmlFor={option.id} className="text-sm">{option.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="testingDescription">{tx('Testing Details')}</Label>
              <Textarea
                id="testingDescription"
                placeholder={tx('Describe the testing that was performed...')}
                value={inputs.testingDescription}
                onChange={(e) => handleInputChange('testingDescription', e.target.value)}
                className="min-h-[60px]"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="breakingChange"
                checked={inputs.breakingChange}
                onCheckedChange={(checked) => handleInputChange('breakingChange', checked as boolean)}
              />
              <Label htmlFor="breakingChange" className="text-sm">{tx('This is a breaking change')}</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalNotes">{tx('Additional Notes')}</Label>
              <Textarea
                id="additionalNotes"
                placeholder={tx('Any additional information about this change...')}
                value={inputs.additionalNotes}
                onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
                className="min-h-[60px]"
              />
            </div>

            <div className="pt-4 flex gap-3">
              <Button 
                onClick={generateCommitMessage} 
                disabled={isGenerating || !inputs.changeType || !inputs.changeDescription}
                className="flex-1"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {tx('Generating...')}
                  </>
                ) : (
                  <>
                    <Code className="h-4 w-4 mr-2" />
                    {tx('Generate Commit Message')}
                  </>
                )}
              </Button>
              <Button 
                onClick={loadSampleData} 
                variant="outline"
                disabled={isGenerating}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {tx('Load Sample')}
              </Button>
            </div>
                </CardContent>
              </Card>

              {/* Generated Commit Message */}
              <div className="space-y-6">
                {generatedCommit && (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{tx('Commit Title')}</span>
                          <Button 
                            onClick={() => copyToClipboard(generatedCommit.title, tx('Commit title'))} 
                            variant="outline" 
                            size="sm"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="p-3 bg-gray-50 rounded-lg border font-mono text-sm">
                          {generatedCommit.title}
                        </div>
                      </CardContent>
                    </Card>

                    {generatedCommit.description && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <span>{tx('Commit Description')}</span>
                            <Button 
                              onClick={() => copyToClipboard(generatedCommit.description, tx('Commit description'))} 
                              variant="outline" 
                              size="sm"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="p-3 bg-gray-50 rounded-lg border">
                            <pre className="text-sm whitespace-pre-wrap">{generatedCommit.description}</pre>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{tx('Full Commit Message')}</span>
                          <div className="flex gap-2">
                            <Button 
                              onClick={() => copyToClipboard(generatedCommit.fullMessage, tx('Full commit message'))} 
                              variant="outline" 
                              size="sm"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button onClick={resetForm} variant="outline" size="sm">
                              {tx('Reset')}
                            </Button>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="p-3 bg-gray-50 rounded-lg border">
                          <pre className="text-sm whitespace-pre-wrap font-mono">{generatedCommit.fullMessage}</pre>
                        </div>
                        {generatedCommit.warnings.length > 0 && (
                          <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-1">
                            {generatedCommit.warningMsgs.map((w, i) => (
                              <p key={i} className="text-sm text-amber-800">{tx(w.text, w.vars)}</p>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-sm text-green-700">
                            {tx('Header follows Conventional Commits 1.0.0 and the body is wrapped at 72 columns. Save it to a file and run git commit -F msg.txt, or paste it into your editor.')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}

                {!generatedCommit && (
                  <Card>
                    <CardHeader>
                      <CardTitle>{tx('Preview')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-8 text-center text-gray-500">
                        <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{tx('Fill in the form and click "Generate Commit Message" to see your conventional commit message here.')}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default CodeCommitMessageTool;