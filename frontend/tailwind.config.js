/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        tv: {
          bg: '#131722',
          panel: '#1e222d',
          grid: '#1f2430',
          border: '#2a2e39',
          hover: '#2a2e39',
          blue: '#2962ff',
          text: '#d1d4dc',
          muted: '#787b86',
          bull: '#089981',
          bear: '#f23645',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Trebuchet MS"',
          'Roboto',
          'Ubuntu',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        tv: '0 8px 24px rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [],
};
