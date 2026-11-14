import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import OssHeader from '@/components/layout/OssHeader';
import OssFooter from '@/components/layout/OssFooter';
import { catalog } from '@/catalog';

/** Bare-minimal home page: every tool, grouped by subcategory. */
const Home = () => {
  useEffect(() => {
    document.title = 'RedBison Tools — 100 free developer tools';
  }, []);

  const groups = new Map<string, typeof catalog>();
  for (const tool of catalog) {
    const list = groups.get(tool.subcategory) ?? [];
    list.push(tool);
    groups.set(tool.subcategory, list);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OssHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">
        <h1 className="mb-2 text-3xl font-bold text-foreground">100 free developer tools</h1>
        <p className="mb-8 max-w-3xl text-muted-foreground">
          The open-source core of redbison.dev: formatters, converters, encoders, security, SQL,
          GraphQL and network utilities. Everything runs in your browser — nothing you type is uploaded.
        </p>
        <div className="space-y-8">
          {[...groups.entries()].map(([subcategory, tools]) => (
            <section key={subcategory} aria-labelledby={`group-${subcategory}`}>
              <h2 id={`group-${subcategory}`} className="mb-3 text-xl font-bold text-foreground">
                {subcategory}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <li key={tool.id}>
                    <Link
                      to={`/${tool.id}`}
                      className="block rounded-lg border border-border p-3 transition-colors hover:border-foreground/30 hover:bg-muted/50"
                    >
                      <span className="block text-sm font-medium text-foreground">{tool.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{tool.desc}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <OssFooter />
    </div>
  );
};

export default Home;
