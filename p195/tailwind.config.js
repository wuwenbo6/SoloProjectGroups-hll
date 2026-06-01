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
        'bg-primary': '#0a0e1a',
        'bg-secondary': '#141926',
        'bg-tertiary': '#1e2538',
        'accent': '#00ffc8',
        'accent-dim': '#00c89e',
        'accent-glow': 'rgba(0, 255, 200, 0.5)',
        'rtk': '#ff6b35',
        'imu': '#4d9fff',
        'text-primary': '#e0e0e0',
        'text-secondary': '#8892a0',
        'text-dim': '#5c6778',
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
