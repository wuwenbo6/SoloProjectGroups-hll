/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0a0e17',
        'dark-surface': '#141a28',
        'dark-border': '#1e293b',
        'accent-blue': '#3b82f6',
        'accent-cyan': '#06b6d4',
        'accent-purple': '#8b5cf6',
      },
      fontFamily: {
        'display': ['Space Grotesk', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
