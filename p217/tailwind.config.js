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
        "nfv-bg": "#0B1120",
        "nfov-card": "#0F1A2E",
        "nfv-dark": "#060D1B",
        "nfv-cyan": "#00F0FF",
        "nfv-green": "#00FF88",
        "nfv-amber": "#FFB800",
        "nfv-rose": "#FF3366",
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
