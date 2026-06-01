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
          bg: '#0A0E17',
          card: '#111827',
          border: '#1F2937',
          green: '#00FF88',
          greenDark: '#00CC6A',
          red: '#FF4444',
          yellow: '#FFAA00',
          blue: '#00AAFF',
          purple: '#AA55FF',
          orange: '#FF7733',
          muted: '#6B7280',
          text: '#E5E7EB',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Noto Sans SC', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-green': 'pulseGreen 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'glow': 'glow 1.5s ease-in-out infinite alternate',
      },
      keyframes: {
        pulseGreen: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 255, 136, 0)' },
          '50%': { boxShadow: '0 0 12px 4px rgba(0, 255, 136, 0.3)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 4px rgba(0, 255, 136, 0.2)' },
          '100%': { boxShadow: '0 0 16px rgba(0, 255, 136, 0.4)' },
        },
      },
    },
  },
  plugins: [],
};
