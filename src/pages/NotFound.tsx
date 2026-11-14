import React from 'react';
import { Link } from 'react-router-dom';
import OssHeader from '@/components/layout/OssHeader';
import OssFooter from '@/components/layout/OssFooter';

const NotFound = () => (
  <div className="flex min-h-screen flex-col bg-background">
    <OssHeader />
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="mb-2 text-3xl font-bold text-foreground">Page not found</h1>
      <p className="mb-6 text-muted-foreground">That tool doesn't exist in this build.</p>
      <Link to="/" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
        Back to all tools
      </Link>
    </main>
    <OssFooter />
  </div>
);

export default NotFound;
