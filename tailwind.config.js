/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/index.html'],
  theme: {
    extend: {
      colors: {
        ink: { 900: '#060D1B', 800: '#0A1428', 700: '#0D1930', 600: '#12213D' },
        navy: {
          50: '#F2F6FC', 100: '#E3EBF6', 200: '#C4D3E9', 300: '#9BB6D8',
          400: '#6D95BF', 500: '#4A77A2', 600: '#355D86', 700: '#28496E',
          800: '#1C3554', 900: '#10253F', 950: '#0A1A33', DEFAULT: '#0A1A33'
        },
        accent: {
          50: '#F0F9FF', 100: '#E0F2FE', 200: '#BAE6FD', 300: '#7DD3FC',
          400: '#38BDF8', 500: '#0EA5E9', 600: '#0284C7', 700: '#0369A1', DEFAULT: '#0EA5E9'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      maxWidth: { report: '480px' },
      keyframes: {
        'slide-up': { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } }
      },
      animation: {
        'slide-up': 'slide-up .28s cubic-bezier(.16,1,.3,1)',
        'fade-in': 'fade-in .25s ease-out'
      }
    }
  },
  plugins: []
};
