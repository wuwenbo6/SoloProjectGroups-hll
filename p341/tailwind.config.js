/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        'pd-dark': '#0F1923',
        'pd-darker': '#0A111A',
        'pd-panel': '#1A2733',
        'pd-border': '#2D3A47',
        'pd-cyan': '#00D4FF',
        'pd-green': '#00FF88',
        'pd-red': '#FF4757',
        'pd-amber': '#FFB800',
        'pd-gray': '#6B7280',
        'pd-text': '#E2E8F0',
      },
      fontFamily: {
        'sans': ['Outfit', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
