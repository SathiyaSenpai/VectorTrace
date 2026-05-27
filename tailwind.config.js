/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        gray: {
          250: "#dbdee3",
          550: "#5a6270",
          650: "#414b5a",
          750: "#2b3544",
          850: "#17202e",
        }
      }
    },
  },
  plugins: [],
}
