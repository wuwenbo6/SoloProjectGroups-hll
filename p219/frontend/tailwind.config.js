/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0a0a0f',
        'dark-card': '#12121a',
        'dark-border': '#1e1e2e',
        'accent-blue': '#3b82f6',
        'accent-green': '#00ff88',
        'accent-red': '#ff6b6b',
        'accent-orange': '#ffb86b',
        'accent-cyan': '#8be9fd',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 255, 136, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 136, 0.8)' },
        },
      },
    },
  },
  plugins: [],
}
