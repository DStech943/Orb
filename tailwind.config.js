/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Orb design tokens. The legacy names (ink, purple, primary, peach…) are kept
        // so every existing page picks up the refreshed palette automatically.
        peach: '#F1F2FB',
        ink: '#25263A',
        muted: '#77798C',
        purple: '#635BFF',
        primary: '#635BFF',
        'primary-dark': '#4F46E5',
        'primary-tint': '#EEEDFF',
        orange: '#FF9B3D',
        canvas: '#FFFAF3',
        surface: '#FFFFFF',
        line: '#E9EAF2',
        'line-strong': '#D9DBE8',
        subtle: '#FAF4EC',
        fg: '#25263A',
        'fg-muted': '#77798C',
        success: { DEFAULT: '#1F9D6B', tint: '#E8F6EF' },
        warning: { DEFAULT: '#B7791F', tint: '#FDF5E4' },
        danger: { DEFAULT: '#C2410C', tint: '#FDEEE8' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        // Friendly soft serif for headings, with a real italic for the accent word.
        display: ['"Fraunces Variable"', 'Fraunces', 'Georgia', 'serif'],
      },
      borderRadius: {
        control: '10px',
        card: '14px',
      },
      boxShadow: {
        brutal: '4px 4px 0 #25263A',
        'brutal-lg': '8px 8px 0 #25263A',
        orange: '5px 5px 0 #FF9B3D',
        card: 'inset 0 1px 0 rgba(255,255,255,.95), 0 1px 2px rgba(24,24,60,.06), 0 2px 8px -2px rgba(24,24,60,.08)',
        pop: 'inset 0 1px 0 rgba(255,255,255,.95), 0 2px 4px rgba(24,24,60,.05), 0 12px 32px -10px rgba(120,70,20,.18)',
      },
      backgroundImage: { 'orb-gradient': 'linear-gradient(100deg, #635BFF 0%, #FF9B3D 100%)' },
      transitionDuration: { 180: '180ms' },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(24px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'page-in': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'page-out': { '0%': { opacity: '1', transform: 'translateY(0)' }, '100%': { opacity: '0', transform: 'translateY(-6px)' } },
        'pop-in': { '0%': { opacity: '0', transform: 'translateY(-4px) scale(.98)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'auth-in': { '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'auth-out': { '0%': { opacity: '1', transform: 'translateX(0)' }, '100%': { opacity: '0', transform: 'translateX(-12px)' } },
        'tick-pop': { '0%': { opacity: '0', transform: 'scale(.5) rotate(-18deg)' }, '70%': { transform: 'scale(1.18) rotate(4deg)' }, '100%': { opacity: '1', transform: 'scale(1) rotate(0)' } },
      },
      animation: {
        rise: 'rise 650ms cubic-bezier(.2,.8,.2,1) both',
        'page-in': 'page-in 200ms cubic-bezier(.2,.8,.2,1) both',
        'page-out': 'page-out 180ms ease-in both',
        'pop-in': 'pop-in 160ms cubic-bezier(.2,.8,.2,1) both',
        'fade-in': 'fade-in 180ms ease-out both',
        'auth-in': 'auth-in 320ms cubic-bezier(.2,.8,.2,1) both',
        'auth-out': 'auth-out 160ms ease-in both',
        'tick-pop': 'tick-pop 360ms cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
}
