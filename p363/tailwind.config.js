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
        'rbd-bg': '#0A0E17',
        'rbd-surface': '#0D1117',
        'rbd-border': '#1A1F2E',
        'rbd-cyan': '#00F0FF',
        'rbd-green': '#00FF88',
        'rbd-red': '#FF4D4D',
        'rbd-amber': '#FFB800',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Noto Sans SC', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
