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
        navy: {
          DEFAULT: "#0F172A",
          dark: "#0B1120",
          light: "#1E293B",
        },
        cyan: {
          DEFAULT: "#06B6D4",
          dark: "#0891B2",
        },
        amber: {
          DEFAULT: "#F59E0B",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
