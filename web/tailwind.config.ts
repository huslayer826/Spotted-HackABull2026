import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm cream/paper tones from the design
        paper: {
          50: "#FBF7F2",
          100: "#F5EEE5",
          200: "#EDE3D5",
          300: "#E2D5C2",
          400: "#C9B79E",
        },
        ink: {
          900: "#1C1814",
          800: "#2A241D",
          700: "#3F362C",
          600: "#544A3E",
          500: "#6B6055",
          400: "#8C8175",
          300: "#A89D90",
        },
        rust: {
          50: "#FAEEE7",
          100: "#F2D8C8",
          200: "#E5B59C",
          300: "#D38E6E",
          400: "#BD6A47",
          500: "#A04E2E",
          600: "#8B3F22",
          700: "#6F2F19",
        },
        amber: {
          400: "#E2A24C",
          500: "#D08B33",
        },
        moss: {
          400: "#9DAE85",
          500: "#7B9971",
          600: "#5F7E5A",
        },
        crimson: {
          500: "#9B2D24",
          600: "#7E2018",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,24,20,0.04), 0 4px 14px rgba(28,24,20,0.04)",
        soft: "0 1px 0 rgba(28,24,20,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
