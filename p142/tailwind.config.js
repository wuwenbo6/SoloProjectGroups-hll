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
        'space-blue': '#0a1628',
        'star-silver': '#1a2a4a',
        'laser-cyan': '#00d4ff',
        'satellite-green': '#00ff88',
        'alert-red': '#ff4466',
        'orbit-purple': '#8866ff',
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
      },
    },
  },
  plugins: [],
};