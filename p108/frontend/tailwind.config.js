/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#0a192f',
        'secondary': '#64ffda',
        'accent': '#00ff88',
        'dark': '#020c1b',
        'light-slate': '#8892b0',
        'slate': '#8892b0',
      },
      fontFamily: {
        'orbitron': ['Orbitron', 'sans-serif'],
        'mono': ['Roboto Mono', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(100, 255, 218, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(100, 255, 218, 0.6)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
