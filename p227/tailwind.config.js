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
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1e3a5f',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        medical: {
          blue: '#1e3a5f',
          cyan: '#0ea5e9',
          red: '#ef4444',
          green: '#22c55e',
          amber: '#f59e0b',
        }
      },
      fontFamily: {
        display: ['"DM Sans"', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
