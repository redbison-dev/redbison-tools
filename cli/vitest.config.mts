import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
  },
  /*
   * The CLI has no stylesheet, but Vite still hunts for a PostCSS config and
   * the hunt walks *upward* out of cli/. In this repo it finds the site's
   * postcss.config.js, whose tailwindcss plugin is a root dependency the CLI
   * does not install, and vitest exits before collecting a single test.
   *
   * It only bites where nothing above cli/ has tailwindcss installed, which
   * is any clean checkout: the open-source repo's CI failed this way for two
   * commits while every local run passed, because node resolution escaped the
   * exported tree and found the main repo's own node_modules one level up.
   * An inline config, even an empty one, stops the search.
   */
  css: { postcss: { plugins: [] } },
});

/*
 * Keep cli/package.json's vitest major in step with the root package.json's.
 * Nothing run from inside this repo resolves the copy cli/ installs: node
 * walks up and finds the root's, so a mismatch is invisible here and shows up
 * only in a standalone checkout. It declared ^2.1.8 while being typechecked
 * against 4 for months, and the open-source repo's CI was the first thing to
 * say so — a spy cast in run-server.test.ts does not compile under vitest 2.
 */
