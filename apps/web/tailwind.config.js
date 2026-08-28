/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter var"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e2',
          300: '#b0b8c9',
          400: '#8592aa',
          500: '#65738e',
          600: '#505c75',
          700: '#414a5f',
          800: '#383f50',
          900: '#232833',
          950: '#161a22',
        },
        accent: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(22, 26, 34, 0.04), 0 1px 3px rgba(22, 26, 34, 0.06)',
        pop: '0 10px 30px -12px rgba(22, 26, 34, 0.25)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(2px)' }, to: { opacity: '1', transform: 'none' } },
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.55' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
