/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  important: true,
  theme: {
    extend: {
      colors: {
        'dark-base':    '#0d1b2e',
        'dark-surface': '#0f2140',
        'dark-header':  '#07111e',
        'dark-sidebar': '#081726',
      },
    },
  },
  plugins: [],
};
