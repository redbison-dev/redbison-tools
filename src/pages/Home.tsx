import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import OssHeader from '@/components/layout/OssHeader';
import OssFooter from '@/components/layout/OssFooter';
import { catalog } from '@/catalog';
import { getBookmarks } from '@/lib/bookmarks';

const ToolCard = ({ id }: { id: string }) => {
  const tool = catalog.find((t) => t.id === id);
  if (!tool) return null;
  return (
    <li>
      <Link
        to={`/${tool.id}`}
        className="block rounded-lg border border-border p-3 transition-colors hover:border-foreground/30 hover:bg-muted/50"
      >
        <span className="block text-sm font-medium text-foreground">{tool.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{tool.desc}</span>
      </Link>
    </li>
  );
};

/** Bare-minimal home page: bookmarks first, then every tool grouped by subcategory. */
const Home = () => {
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  useEffect(() => {
    document.title = 'Safe, Browser-Only Online Developer Tools — RedBison Tools';
    setBookmarks(getBookmarks());
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
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
            Safe, Browser-Only Online Developer Tools
          </h1>
          <p className="mx-auto max-w-3xl text-muted-foreground">
            100 open-source tools from redbison.dev: formatters, converters, encoders, security,
            SQL, GraphQL and network utilities. Everything runs in your browser — nothing you type
            is uploaded.
          </p>
        </div>
        {bookmarks.length > 0 && (
          <section aria-labelledby="group-bookmarked" className="mb-8">
            <h2 id="group-bookmarked" className="mb-3 inline-flex items-center gap-2 text-xl font-bold text-foreground">
              <Bookmark className="h-5 w-5" aria-hidden="true" /> Bookmarked
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bookmarks.map((id) => (
                <ToolCard key={id} id={id} />
              ))}
            </ul>
          </section>
        )}
        <div className="space-y-8">
          {[...groups.entries()].map(([subcategory, tools]) => (
            <section key={subcategory} aria-labelledby={`group-${subcategory}`}>
              <h2 id={`group-${subcategory}`} className="mb-3 text-xl font-bold text-foreground">
                {subcategory}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <ToolCard key={tool.id} id={tool.id} />
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
