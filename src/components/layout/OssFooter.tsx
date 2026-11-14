import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Github, HardDrive, Package, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PrivacyDialog from '@/components/layout/PrivacyDialog';
import type { PrivacySectionKey } from '@/components/layout/privacyContent';
import { FORTUNES, randomOf } from '@/components/layout/easterEggs';

const linkClass = 'inline-flex items-center gap-1.5 underline-offset-2 hover:text-foreground hover:underline';

/**
 * The standard RedBison template footer. The privacy disclosures open as
 * dialogs so you never lose your place in a tool; the GitHub repo and
 * hosted-version upsells live here and only here.
 */
const OssFooter = () => {
  const [fortune, setFortune] = useState<string | null>(null);
  const [section, setSection] = useState<PrivacySectionKey | null>(null);

  return (
    <footer className="mt-12 border-t border-border py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 text-center text-sm text-muted-foreground md:px-8">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <button type="button" onClick={() => setSection('privacy')} className={linkClass} aria-haspopup="dialog">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Privacy
          </button>
          <button type="button" onClick={() => setSection('local-storage')} className={linkClass} aria-haspopup="dialog">
            <HardDrive className="h-4 w-4" aria-hidden="true" /> Local storage
          </button>
          <button type="button" onClick={() => setSection('third-party')} className={linkClass} aria-haspopup="dialog">
            <Package className="h-4 w-4" aria-hidden="true" /> Third-party services &amp; libraries
          </button>
          <Link to="/privacy" className={linkClass}>
            Full privacy page
          </Link>
        </nav>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <a href="https://github.com/redbison-dev/redbison-tools" target="_blank" rel="noopener noreferrer" className={linkClass}>
            <Github className="h-4 w-4" aria-hidden="true" /> GitHub
          </a>
          <a href="https://redbison.dev" target="_blank" rel="noopener noreferrer" className={linkClass}>
            Hosted version (600+ tools)
          </a>
          <a
            href="https://github.com/redbison-dev/redbison-tools/blob/main/TOOLS.md"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Full tool list with source links
          </a>
          <a
            href="https://github.com/redbison-dev/redbison-tools/issues"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Report a bug
          </a>
          <button type="button" onClick={() => setFortune(randomOf(FORTUNES))} className={linkClass} aria-haspopup="dialog">
            <Cookie className="h-4 w-4" aria-hidden="true" /> Fortune cookie
          </button>
        </nav>
        <p>MIT licensed open source. Everything runs in your browser: nothing you type is uploaded.</p>
      </div>

      <PrivacyDialog section={section} onOpenChange={(open) => !open && setSection(null)} />

      <Dialog open={fortune !== null} onOpenChange={(open) => !open && setFortune(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie className="h-5 w-5" aria-hidden="true" /> Your fortune
            </DialogTitle>
            <DialogDescription className="pt-2 text-base text-foreground">{fortune}</DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => setFortune(randomOf(FORTUNES))}
            className="mt-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Crack another
          </button>
        </DialogContent>
      </Dialog>
    </footer>
  );
};

export default OssFooter;
