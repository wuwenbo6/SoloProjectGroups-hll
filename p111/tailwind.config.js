/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        'sonar-dark': '#0a1628',
        'sonar-scan': '#00ffaa',
        'sonar-echo': '#ffdd00',
      },
    },
  },
  plugins: [],
}
