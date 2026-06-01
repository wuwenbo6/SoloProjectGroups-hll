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
        cyber: {
          bg: "#0f172a",
          card: "#1e293b",
          border: "#334155",
          accent: "#22d3ee",
          blue: "#3b82f6",
          green: "#10b981",
          purple: "#8b5cf6",
          orange: "#f59e0b",
          red: "#ef4444",
          muted: "#94a3b8",
          fg: "#e2e8f0",
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
