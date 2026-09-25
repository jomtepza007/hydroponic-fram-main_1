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
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#52B788',
          600: '#2D6A4F',
          700: '#1B4332',
          800: '#14532d',
          900: '#052e16',
        },
        mint: {
          100: '#d8f3dc',
          200: '#b7e4c7',
          300: '#95d5b2',
          400: '#74c69d',
          500: '#52b788',
        },
        forest: {
          DEFAULT: '#2D6A4F',
          dark: '#1B4332',
          light: '#40916C',
        },
        surface: '#FFFFFF',
        background: '#F0FDF4',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: ['Sarabun', 'Inter', 'sans-serif'],
        display: ['Sarabun', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 12px rgba(45, 106, 79, 0.08)',
        'card-hover': '0 8px 30px rgba(45, 106, 79, 0.18)',
        'glow': '0 0 20px rgba(82, 183, 136, 0.35)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'bounce-soft': 'bounceSoft 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
}
