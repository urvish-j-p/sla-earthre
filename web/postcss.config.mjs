// Tailwind v4 through PostCSS, as documented by Next.js. PostCSS reports the
// files Tailwind scanned as dependencies, so the dev cache rebuilds the CSS
// whenever a class name changes in a component.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
