import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, Search, Share2, Smile } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { catalog } from '@/catalog';
import { toolIcons } from '@/catalogIcons';
import { searchCatalog } from '@/lib/searchCatalog';
import { isBookmarked, toggleBookmark } from '@/lib/bookmarks';
import { JOKES, randomOf } from '@/components/layout/easterEggs';

/**
 * The standard RedBison template header: logo, tool search, and the
 * bookmark / share / joke actions. Repo and hosted-version links live in
 * the footer only.
 */
const OssHeader = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const results = searchCatalog(query);
  const currentTool = catalog.find((t) => `/${t.id}` === pathname);
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    setMarked(currentTool ? isBookmarked(currentTool.id) : false);
  }, [currentTool]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (id: string) => {
    setQuery('');
    setOpen(false);
    navigate(`/${id}`);
  };

  const share = async () => {
    const url = window.location.href;
    const title = currentTool ? `${currentTool.name} — RedBison Tools` : 'RedBison Tools';
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      /* user dismissed the share sheet */
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: url });
    } catch {
      toast({ title: 'Copy failed', description: url });
    }
  };

  const bookmark = () => {
    if (!currentTool) {
      toast({ title: 'Open a tool to bookmark it', description: 'Bookmarks are saved in this browser only.' });
      return;
    }
    const list = toggleBookmark(currentTool.id);
    const nowMarked = list.includes(currentTool.id);
    setMarked(nowMarked);
    toast({
      title: nowMarked ? 'Bookmarked' : 'Bookmark removed',
      description: nowMarked ? `${currentTool.name} is pinned on the home page.` : currentTool.name,
    });
  };

  const joke = () => {
    toast({ title: 'A quick one', description: randomOf(JOKES) });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img src="/redbison-logo.png" alt="RedBison" width="32" height="32" className="h-8 w-8 rounded-sm object-contain" />
          <span className="hidden font-mono text-lg font-bold text-foreground sm:inline">RedBison Tools</span>
        </Link>
        <div ref={boxRef} className="relative mx-auto w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) go(results[0].id);
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="Search tools…"
            aria-label="Search tools"
            className="h-9 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:bg-background"
          />
          {open && query.trim() && (
            <ul className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
              {results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No tools match "{query}"</li>}
              {results.map((tool) => {
                const Icon = toolIcons[tool.id];
                return (
                  <li key={tool.id}>
                    <button
                      type="button"
                      onClick={() => go(tool.id)}
                      className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-muted"
                    >
                      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#ff3131]" aria-hidden="true" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{tool.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{tool.desc}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <nav className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={bookmark}
            aria-label={marked ? 'Remove bookmark' : 'Bookmark this tool'}
            title="Bookmark (saved in this browser only)"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Bookmark className={`h-4 w-4 ${marked ? 'fill-current text-foreground' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={share}
            aria-label="Share this page"
            title="Share"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={joke}
            aria-label="Tell me a programming joke"
            title="A quick joke"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Smile className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      </div>
    </header>
  );
};

export default OssHeader;
