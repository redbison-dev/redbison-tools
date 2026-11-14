import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useT } from '@/i18n';

/**
 * Shared frame for the specialty converter pages: breadcrumb, the page's one
 * H1 (always passed as the msg() literal from the page file so the SEO test
 * can see it), tagline, and a card for the tool body.
 */
export default function ConverterShell({
  category,
  subcategory,
  h1,
  tagline,
  children,
}: {
  category: { label: string; href: string };
  subcategory: { label: string; href: string };
  h1: string;
  tagline: string;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="tool-page bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-6 pb-1 sm:pb-2">
        <ToolBreadcrumb category={category} subcategory={subcategory} toolName={t(h1)} />
        <div className="tool-header mt-3">
          <div className="space-y-1">
            <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
              <ArrowRightLeft className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-red-600" aria-hidden="true" />
              {t(h1)}
            </h1>
            <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t(tagline)}</p>
          </div>
        </div>
      </div>
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 -mt-4">
        <Card>
          <CardContent className="p-6 space-y-5">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
