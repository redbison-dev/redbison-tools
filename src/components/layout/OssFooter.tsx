import React from 'react';

/** The standard RedBison template footer, minus socials, blog and newsletter. */
const OssFooter = () => (
  <footer className="mt-12 border-t border-border py-6">
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground md:px-8">
      <p>
        MIT licensed open source. Hosted version with more tools at{' '}
        <a href="https://redbison.dev" className="underline underline-offset-2 hover:text-foreground" target="_blank" rel="noopener noreferrer">
          redbison.dev
        </a>
        .
      </p>
      <p>
        Found a bug?{' '}
        <a
          href="https://github.com/redbison-dev/redbison-tools/issues"
          className="underline underline-offset-2 hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open an issue
        </a>
        . Everything runs in your browser — nothing you type is uploaded.
      </p>
    </div>
  </footer>
);

export default OssFooter;
