/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0A",
        surface: "#141414",
        surfaceHover: "#1F1F1F",
        accent: "#2ECC71", // Emerald green for positive metrics
        coral: "#E94560", // Keeping a hint of the original brand for warnings
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Geist', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
