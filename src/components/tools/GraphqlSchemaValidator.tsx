
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { validateSchemaSDL, type SchemaIssue, type SchemaValidationResult as ValidationResult } from '@/lib/tools/graphql-schema-validator';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';


const GraphqlSchemaValidator = () => {
  const { t } = useT();
  // An issue in the page's language (parser syntax errors have no template and stay as written).
  const issueText = (i: SchemaIssue) => {
    const message = i.text ? t(i.text, i.vars) : i.message;
    return i.line ? t('Line {line}: {message}', { line: i.line, message }) : message;
  };
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [schema, setSchema] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleSchema = `type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  createdAt: String!
}

type Query {
  users: [User!]!
  user(id: ID!): User
  posts: [Post!]!
  post(id: ID!): Post
}

type Mutation {
  createUser(name: String!, email: String!): User!
  createPost(title: String!, content: String!, authorId: ID!): Post!
}`;

  const validateSchema = () => {
    if (!schema.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter a GraphQL schema to validate'),
        variant: "destructive",
      });
      return;
    }

    setIsValidating(true);
    trackAction('validate_schema');

    // Parse and validate synchronously; schemas of a few thousand lines take milliseconds.
    const result = validateSchemaSDL(schema);
    setValidationResult(result);
    setIsValidating(false);

    toast({
      title: result.isValid ? t('Validation Successful') : t('Validation Failed'),
      description: result.isValid
        ? t('Your GraphQL schema is valid!')
        : t('Found {length} error(s)', { length: result.errors.length }),
      variant: result.isValid ? "default" : "destructive",
    });
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { schema };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setSchema(sampleSchema);
    setValidationResult(null);
    trackAction('load_sample');
  });

  const copySchema = () => {
    navigator.clipboard.writeText(schema);
    toast({
      title: t('Copied'),
      description: t('Schema copied to clipboard'),
    });
    trackAction('copy_schema');
  };

  const downloadSchema = () => {
    const blob = new Blob([schema], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema.graphql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('download_schema');
  };

  const clearSchema = () => {
    setSchema('');
    setValidationResult(null);
    trackAction('clear_schema');
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          {/* Breadcrumb */}
          <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
            subcategory={{ label: t('API Tools'), href: "/category/development-tech/api-tools" }}
            toolName="GraphQL Schema Validator"
          />
          </div>
          
          <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('GraphQL Schema Validator')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Check GraphQL SDL for syntax errors, unknown types, broken interfaces and missing root types')}</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('GraphQL')}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Validator')}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('GraphQL Schema')}
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={loadSample}>
                  {t('Load Sample')}
                </Button>
                <Button variant="outline" size="sm" onClick={copySchema} disabled={!schema}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={downloadSchema} disabled={!schema}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              {t('Paste your GraphQL schema definition here')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={t('Enter your GraphQL schema...')}
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
            />
            <div className="flex space-x-2">
              <Button onClick={validateSchema} disabled={isValidating} className="flex-1">
                {isValidating ? t('Validating...') : t('Validate Schema')}
              </Button>
              <Button variant="outline" onClick={clearSchema}>
                {t('Clear')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Validation Results')}</CardTitle>
            <CardDescription>
              {t('Schema validation status and recommendations')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validationResult ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  {validationResult.isValid ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={`font-medium ${validationResult.isValid ? 'text-green-700' : 'text-red-700'}`}>
                    {validationResult.isValid ? t('Schema is valid!') : t('Schema has errors')}
                  </span>
                </div>

                {validationResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <Badge variant="destructive" className="mb-2">
                      {t('{length} Error(s)', { length: validationResult.errors.length })}
                    </Badge>
                    {validationResult.errors.map((error, index) => (
                      <div key={index} className="flex items-start space-x-2 p-2 bg-red-50 rounded border-l-4 border-red-500">
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-red-700">{issueText(error)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {validationResult.warnings.length > 0 && (
                  <div className="space-y-2">
                    <Badge variant="secondary" className="mb-2">
                      {t('{length} Warning(s)', { length: validationResult.warnings.length })}
                    </Badge>
                    {validationResult.warnings.map((warning, index) => (
                      <div key={index} className="flex items-start space-x-2 p-2 bg-yellow-50 rounded border-l-4 border-yellow-500">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-yellow-700">{issueText(warning)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {validationResult.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <Badge variant="outline" className="mb-2">
                      {t('{length} Suggestion(s)', { length: validationResult.suggestions.length })}
                    </Badge>
                    {validationResult.suggestions.map((suggestion, index) => (
                      <div key={index} className="flex items-start space-x-2 p-2 bg-blue-50 rounded border-l-4 border-blue-500">
                        <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-blue-700">{issueText(suggestion)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('Enter a GraphQL schema and click "Validate Schema" to see results')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
          </div>
      
        </div>
      </div>
      {confirmDialog}
    </div>
  );
};

export default GraphqlSchemaValidator;
