/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        primary: '#00D4FF',
        secondary: '#2DD4BF',
        dark: {
          900: '#0A1628',
          800: '#0D1B2E',
          700: '#1E3A5F',
          600: '#2A4F7A',
        },
        accent: {
          amber: '#F59E0B',
          purple: '#A78BFA',
          red: '#EF4444',
        },
      },
    },
  },
  plugins: [],
};
