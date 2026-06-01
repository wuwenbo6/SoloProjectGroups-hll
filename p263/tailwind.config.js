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
        bg: {
          primary: '#0A1628',
          secondary: '#131E33',
          tertiary: '#1A2740',
        },
        accent: {
          primary: '#00E5A0',
          warning: '#FF6B35',
          info: '#4A9EFF',
        },
        text: {
          primary: '#E6EDF5',
          secondary: '#8899AA',
          muted: '#556677',
        }
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['"Source Sans 3"', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
