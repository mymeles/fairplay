import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        background: '#09090B',
        surface: {
          DEFAULT: '#18181B',
          raised: '#1F1F23',
          muted: '#27272A',
        },
        border: '#27272A',
        ink: {
          DEFAULT: '#FAFAFA',
          muted: '#A1A1AA',
          subtle: '#71717A',
        },
        accent: {
          purple: '#A855F7',
          pink: '#EC4899',
          cyan: '#22D3EE',
        },
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#FB7185',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        'gradient-party':
          'linear-gradient(135deg, #A855F7 0%, #EC4899 50%, #22D3EE 100%)',
        'gradient-party-soft':
          'linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(236,72,153,0.14) 50%, rgba(34,211,238,0.18) 100%)',
      },
      keyframes: {
        'lock-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(168,85,247,0.4)' },
          '50%': { boxShadow: '0 0 0 12px rgba(168,85,247,0)' },
        },
        'token-pop': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '60%': { transform: 'scale(1.25)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'lock-pulse': 'lock-pulse 2.4s ease-in-out infinite',
        'token-pop': 'token-pop 600ms ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [animate],
};

export default config;
