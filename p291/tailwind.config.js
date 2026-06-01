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
        brand: {
          DEFAULT: "#00e5a0",
          dark: "#00b880",
          glow: "rgba(0, 229, 160, 0.3)",
        },
        surface: {
          base: "#0a0e17",
          card: "#0f1624",
          hover: "#111b28",
          border: "#1a2332",
        },
        text: {
          primary: "#c0d0e0",
          secondary: "#6b7f99",
          muted: "#4a5e78",
          dim: "#2a3e55",
        },
        danger: "#ff4d6a",
        info: "#4dd0e1",
        purple: "#b388ff",
      },
    },
  },
  plugins: [],
};
