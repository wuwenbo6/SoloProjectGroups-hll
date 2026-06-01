/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"Noto Sans SC"', 'sans-serif'],
      },
      colors: {
        brand: {
          bg: "#0a0e1a",
          panel: "#0d1225",
          cyan: "#00e5ff",
          amber: "#ffab00",
          purple: "#7c4dff",
          red: "#ff5252",
        },
      },
      boxShadow: {
        glow: "0 0 15px rgba(0,229,255,0.3)",
        "glow-sm": "0 0 8px rgba(0,229,255,0.2)",
      },
    },
  },
  plugins: [],
};
