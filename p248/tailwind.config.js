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
        background: "#0d1117",
        card: "#161b22",
        border: "#30363d",
        foreground: "#e6edf3",
        "muted-foreground": "#8b949e",
        accent: "#00e5a0",
        warning: "#f59e0b",
        error: "#ef4444",
        info: "#58a6ff",
      },
      fontFamily: {
        sans: ['"Outfit"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        "slide-in": "slide-in 0.3s ease-out",
      },
      keyframes: {
        "slide-in": {
          from: {
            transform: "translateX(100%)",
            opacity: "0",
          },
          to: {
            transform: "translateX(0)",
            opacity: "1",
          },
        },
      },
    },
  },
  plugins: [],
};
