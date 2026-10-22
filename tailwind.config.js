/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070b12',
          900: '#0b101a',
          850: '#0e1522',
          800: '#111a2b',
          700: '#1a2740',
          600: '#24334f',
          500: '#33456b'
        }
      }
    }
  },
  plugins: []
};
