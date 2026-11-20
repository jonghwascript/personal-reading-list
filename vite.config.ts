/// <reference types="vitest/config" />
import { copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Deploy base path. "/" for local dev and Vercel; the GitHub Pages workflow sets
 * BASE_PATH=/personal-reading-list/ because project pages live under the repository name.
 */
const base = process.env.BASE_PATH ?? '/';

/**
 * GitHub Pages has no SPA rewrites: a refresh on /personal-reading-list/library would 404. Serving
 * a copy of index.html as 404.html boots the app on any deep link (React Router then reads the
 * URL). .nojekyll stops Pages from running Jekyll over the build.
 */
function githubPagesFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'github-pages-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    // After everything is written: index.html is produced by Vite's own HTML plugin late in the
    // build, so copy the finished file rather than reading it from the bundle.
    closeBundle() {
      copyFileSync(join(outDir, 'index.html'), join(outDir, '404.html'));
      writeFileSync(join(outDir, '.nojekyll'), '');
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), ...(base !== '/' ? [githubPagesFallback()] : [])],
  css: {
    modules: {
      // Readable class names in dev make DOM inspection and a11y audits easier.
      generateScopedName: process.env.NODE_ENV === 'production' ? '[hash:base64:6]' : '[name]__[local]',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
