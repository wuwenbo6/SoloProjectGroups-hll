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
          bg: "#0a0e1a",
          surface: "#111827",
          border: "#1e293b",
          cyan: "#00f0ff",
          cyanDim: "#00a0aa",
          orange: "#ff6b35",
          orangeDim: "#cc5529",
          green: "#00ff88",
          red: "#ff3355",
          muted: "#64748b",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Source Sans 3", "Source Sans Pro", "sans-serif"],
      },
      animation: {
        pulse_glow: "pulse_glow 2s ease-in-out infinite",
        slide_in: "slide_in 0.3s ease-out",
      },
      keyframes: {
        pulse_glow: {
          "0%, 100%": { boxShadow: "0 0 8px 2px rgba(0,240,255,0.3)" },
          "50%": { boxShadow: "0 0 20px 6px rgba(0,240,255,0.6)" },
        },
        slide_in: {
          "0%": { opacity: "0", transform: "translateX(-10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
