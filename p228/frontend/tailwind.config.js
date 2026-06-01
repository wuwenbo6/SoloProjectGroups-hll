/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E8F0FF',
          100: '#CFE0FF',
          200: '#9FC2FF',
          300: '#6FA3FF',
          400: '#3F85FF',
          500: '#165DFF',
          600: '#0E47D9',
          700: '#0A35B3',
          800: '#07248C',
          900: '#041266',
        },
        success: '#00B42A',
        warning: '#FF7D00',
        danger: '#F53F3F',
        info: '#86909C',
        dark: {
          100: '#1D2129',
          200: '#2A2F3A',
          300: '#373E4B',
          400: '#4E5969',
          500: '#86909C',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'glow-green': 'glow-green 2s ease-in-out infinite',
        'glow-orange': 'glow-orange 1.5s ease-in-out infinite',
        'glow-red': 'glow-red 1s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'glow-green': {
          '0%, 100%': { boxShadow: '0 0 5px #00B42A, 0 0 10px #00B42A80' },
          '50%': { boxShadow: '0 0 15px #00B42A, 0 0 20px #00B42Ab3' },
        },
        'glow-orange': {
          '0%, 100%': { boxShadow: '0 0 5px #FF7D00, 0 0 10px #FF7D0080' },
          '50%': { boxShadow: '0 0 15px #FF7D00, 0 0 20px #FF7D00b3' },
        },
        'glow-red': {
          '0%, 100%': { boxShadow: '0 0 5px #F53F3F, 0 0 10px #F53F3F80' },
          '50%': { boxShadow: '0 0 15px #F53F3F, 0 0 20px #F53F3Fb3' },
        },
      },
    },
  },
  plugins: [],
}
