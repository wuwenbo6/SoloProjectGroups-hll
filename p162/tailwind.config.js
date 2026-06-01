/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#165DFF',
        secondary: '#0E42D2',
        success: '#00B42A',
        warning: '#FF7D00',
        danger: '#F53F3F',
        info: '#0FC6C2',
        dark: {
          900: '#1D2129',
          800: '#272E3B',
          700: '#4E5969',
          600: '#86909C',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #165DFF, 0 0 10px #165DFF' },
          '100%': { boxShadow: '0 0 20px #165DFF, 0 0 30px #165DFF' },
        }
      }
    },
  },
  plugins: [],
}
