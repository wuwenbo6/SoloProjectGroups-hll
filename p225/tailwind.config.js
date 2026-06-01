/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        console: {
          bg: "#0a0a0f",
          panel: "#12121a",
          border: "#2a2a3a",
          accent: "#f59e0b",
          accentHover: "#fbbf24",
          active: "#22c55e",
          warning: "#ef4444",
          text: "#e5e7eb",
          muted: "#6b7280",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
