import React, { Suspense, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import OssHeader from '@/components/layout/OssHeader';
import OssFooter from '@/components/layout/OssFooter';
import { catalog } from '@/catalog';
import { toolRoutes } from '@/toolRoutes';
import NotFound from '@/pages/NotFound';

/** Renders one tool component inside the shared page frame. */
const ToolPage = () => {
  const { toolId = '' } = useParams();
  const tool = catalog.find((t) => t.id === toolId);
  const Component = toolRoutes[toolId];

  useEffect(() => {
    if (tool) document.title = `${tool.name} — RedBison Tools`;
  }, [tool]);

  if (!tool || !Component) return <NotFound />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OssHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8">
        <Suspense fallback={<p className="py-12 text-center text-muted-foreground">Loading…</p>}>
          <Component />
        </Suspense>
      </main>
      <OssFooter />
    </div>
  );
};

export default ToolPage;
