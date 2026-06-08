import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50:  "#e8f1fb",
          100: "#c5d9f4",
          200: "#92b8ec",
          300: "#5f9de3",
          400: "#2e7dd4",
          500: "#1565c0",
          600: "#0f4c81",
          700: "#0a3560",
          800: "#072448",
        },
      },
      keyframes: {
        bounce: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
    },
  },
  plugins: [],
}
export default config
