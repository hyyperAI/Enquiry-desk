/** @type {import('tailwindcss').Config} */
// Jetwing Travels tokens — see docs/jetwing-brand-guidelines/SKILL.md
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        jw: {
          olive: '#ADAB3F', 'olive-dark': '#8C8A01', 'olive-deep': '#737101', 'olive-light': '#D3D162',
          magenta: '#E30079', 'magenta-dark': '#C9036C',
          pale: '#F6F6E6', 'mid-gray': '#999999',
          ink: '#000000', offwhite: '#F8F8F8', gray: '#555555', border: '#D4D4D4', line: '#EEEEEE',
        },
      },
      fontFamily: {
        head: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['Raleway', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '0', card: '4px' },
    },
  },
  plugins: [],
};
