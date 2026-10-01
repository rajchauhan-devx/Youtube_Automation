/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#08090d',
        surface: '#10131b',
        surface2: '#181d29',
        surface3: '#202636',
        border: '#232b3d',
        borderSoft: '#1a2130',
        accent: '#ff2d55',
        accentHover: '#e11d44',
        accentSoft: 'rgba(255, 45, 85, 0.12)',
        muted: '#8b94a7',
        faint: '#5b6478',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        studio: '0 8px 32px -8px rgba(0, 0, 0, 0.6)',
        card: '0 4px 24px -6px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        glow: '0 0 24px rgba(255, 45, 85, 0.35)',
        pop: '0 16px 48px -12px rgba(0, 0, 0, 0.7)',
      },
      borderRadius: {
        studio: '14px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
};
