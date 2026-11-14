import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cache Components stays off: every page here is client-rendered over a JSON
  // API (nothing to prerender), and antd's CSS-in-JS registry generates random
  // cache ids, which Cache Components prerendering rejects.
  // The repo also contains the Lambda package; pin the app root to this folder.
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  poweredByHeader: false,
};

export default nextConfig;
