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
          DEFAULT: '#1e3a5f',
          50: '#f0f4f9',
          100: '#dbe7f3',
          200: '#b8cfe7',
          300: '#8cb1d6',
          400: '#5a8dc2',
          500: '#386eab',
          600: '#28578e',
          700: '#1e3a5f',
          800: '#1a2f4e',
          900: '#16263f',
          950: '#0f1a2a',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
