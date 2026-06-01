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
        atalk: {
          bg: "#0f172a",
          surface: "#1e293b",
          border: "#334155",
          accent: "#22d3ee",
          accentDim: "#0e7490",
          warn: "#f59e0b",
          danger: "#ef4444",
          good: "#22c55e",
          text: "#e2e8f0",
          muted: "#94a3b8",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Noto Sans SC", "sans-serif"],
      },
    },
  },
  plugins: [],
};
