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
          DEFAULT: '#0A1628',
          50: '#E8F4F8',
          100: '#B4D4E8',
          200: '#7FB3D5',
          300: '#4A93C2',
          400: '#1E72AF',
          500: '#0A1628',
          600: '#081220',
          700: '#060D18',
          800: '#040910',
          900: '#020408',
        },
        accent: {
          DEFAULT: '#00D4AA',
          50: '#E6FCF6',
          100: '#B3F5E3',
          200: '#80EED0',
          300: '#4DE7BD',
          400: '#1AE0AA',
          500: '#00D4AA',
          600: '#00AA88',
          700: '#007F66',
          800: '#005544',
          900: '#002A22',
        },
        warning: {
          DEFAULT: '#FF6B35',
          500: '#FF6B35',
          600: '#E65A2B',
        },
        card: {
          DEFAULT: '#1E293B',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
};
