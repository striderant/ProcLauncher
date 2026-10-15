/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        proc: {
          background: '#0a0a0a',
          surface: '#17171c',
          border: '#2b2b33',
          muted: '#8b8b95',
          accent: '#ffffff',
          ink: '#000000',
        }
      }
    },
  },
  plugins: [],
}
