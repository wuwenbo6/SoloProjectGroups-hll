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
          bg: "#0a0e17",
          card: "#0d1117",
          border: "#1e293b",
          primary: "#00d4ff",
          warning: "#ff9f1c",
        },
      },
      fontFamily: {
        dm: ['"DM Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      animation: {
        "dash-flow": "dashFlow 20s linear infinite",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite alternate",
        "slide-in-top": "slideInTop 0.3s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "count-up": "countUp 0.6s ease-out",
      },
      keyframes: {
        dashFlow: {
          "0%": { strokeDashoffset: "0" },
          "100%": { strokeDashoffset: "-200" },
        },
        pulseGlow: {
          "0%": { boxShadow: "0 0 5px rgba(0,212,255,0.1)" },
          "100%": { boxShadow: "0 0 20px rgba(0,212,255,0.3)" },
        },
        slideInTop: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        countUp: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
