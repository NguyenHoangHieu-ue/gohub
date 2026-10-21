import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      // Nền và viền xanh-xám nhạt (thay slate/gray mặc định) cho cả app; khối "card" bo 14–18px, bóng 2 lớp rất nhẹ (s238).
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: {
        sm: "0 1px 2px rgba(15,35,70,0.05), 0 2px 8px rgba(15,35,70,0.04)",
        DEFAULT: "0 1px 3px rgba(15,35,70,0.07), 0 4px 14px rgba(15,35,70,0.05)",
        md: "0 2px 6px rgba(15,35,70,0.07), 0 10px 24px rgba(15,35,70,0.07)",
      },
      colors: {
        slate: { 50: "#f6f9fc", 100: "#ecf1f7", 200: "#dce4ee", 300: "#c4d0df" },
        gray:  { 50: "#f6f9fc", 100: "#ecf1f7", 200: "#dce4ee", 300: "#c4d0df" },
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
