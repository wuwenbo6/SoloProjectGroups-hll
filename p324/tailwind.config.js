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
          primary: "#0D1117",
          secondary: "#161B22",
          tertiary: "#21262D",
          quaternary: "#30363D",
        },
        accent: {
          DEFAULT: "#00D4AA",
          dim: "#00D4AA33",
          bright: "#00FFD0",
        },
        fg: {
          primary: "#E6EDF3",
          secondary: "#8B949E",
          muted: "#6E7681",
        },
        border: {
          DEFAULT: "#30363D",
          bright: "#484F58",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
