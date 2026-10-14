/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#090b10',
        surface: '#10131d',
        surface2: '#161b29',
        surface3: '#1e2436',
        border: '#1f273b',
        borderSoft: '#151b2a',
        accent: '#ff3366',
        accentHover: '#e11d48',
        accentSoft: 'rgba(255, 51, 102, 0.12)',
        muted: '#8e98ad',
        faint: '#5b6478',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        studio: '0 10px 36px -8px rgba(0, 0, 0, 0.7)',
        card: '0 4px 20px -6px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        glow: '0 0 24px rgba(255, 51, 102, 0.3)',
        pop: '0 20px 50px -12px rgba(0, 0, 0, 0.8)',
      },
      borderRadius: {
        studio: '14px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};
