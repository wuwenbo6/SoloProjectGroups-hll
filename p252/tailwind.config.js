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
        eapol: {
          bg: "#070f1d",
          surface: "#0d1b2a",
          card: "#111d2e",
          border: "#2d3a4a",
          cyan: "#00e5cc",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        sans: ["'Noto Sans SC'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
