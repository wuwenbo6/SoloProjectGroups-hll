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
        'terminal-bg': '#0a0e17',
        'terminal-fg': '#00ff88',
        'terminal-blue': '#0ea5e9',
        'terminal-surface': '#111827',
        'terminal-border': '#1e293b',
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", 'monospace'],
        sans: ["'Outfit'", 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'data-flow': 'data-flow 2s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': {
            'box-shadow': '0 0 4px rgba(0, 255, 136, 0.2)',
          },
          '50%': {
            'box-shadow': '0 0 16px rgba(0, 255, 136, 0.4)',
          },
        },
        'data-flow': {
          '0%': {
            'background-position': '0% 50%',
          },
          '100%': {
            'background-position': '200% 50%',
          },
        },
      },
    },
  },
  plugins: [],
};
