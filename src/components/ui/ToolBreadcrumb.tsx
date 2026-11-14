/**
 * Open-source build: a minimal Home > category > tool breadcrumb. Same props
 * as the hosted site's version, but category pages don't exist here, so the
 * intermediate crumbs render as plain text.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';
import { catalog } from '@/catalog';

interface Crumb {
  label: string;
  href?: string;
}

interface ToolBreadcrumbProps {
  category?: Crumb;
  subcategory?: Crumb;
  toolName?: string;
}

const ToolBreadcrumb = ({ category, subcategory, toolName }: ToolBreadcrumbProps) => {
  const { pathname } = useLocation();
  const name = toolName ?? catalog.find((t) => `/${t.id}` === pathname)?.name;
  const crumbs = [category?.label, subcategory?.label].filter(Boolean) as string[];
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
        <Home className="h-3.5 w-3.5" aria-hidden="true" /> Home
      </Link>
      {crumbs.map((label) => (
        <React.Fragment key={label}>
          <span aria-hidden="true">/</span>
          <span>{label}</span>
        </React.Fragment>
      ))}
      {name && (
        <>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{name}</span>
        </>
      )}
    </nav>
  );
};

export default ToolBreadcrumb;
