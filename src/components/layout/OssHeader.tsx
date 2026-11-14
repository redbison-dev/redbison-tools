import React from 'react';
import { Link } from 'react-router-dom';
import { Github } from 'lucide-react';

/** The standard RedBison template header, minus search, socials and menus. */
const OssHeader = () => (
  <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
    <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:px-8">
      <Link to="/" className="flex items-center gap-2">
        <img src="/redbison-logo.png" alt="RedBison" width="32" height="32" className="h-8 w-8 rounded-sm object-contain" />
        <span className="font-mono text-lg font-bold text-foreground">RedBison Tools</span>
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <a
          href="https://redbison.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground"
        >
          Hosted version
        </a>
        <a
          href="https://github.com/redbison-dev/redbison-tools"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Github className="h-4 w-4" aria-hidden="true" /> GitHub
        </a>
      </nav>
    </div>
  </header>
);

export default OssHeader;
