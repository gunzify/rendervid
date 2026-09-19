import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0a0b",
          900: "#111113",
          850: "#17171a",
          800: "#1e1e22",
          700: "#2a2a30",
          600: "#3a3a42",
        },
        fog: {
          400: "#8a8a94",
          300: "#a6a6b0",
          200: "#c9c9d1",
          100: "#e8e8ec",
          50: "#f7f7f9",
        },
        accent: {
          DEFAULT: "#e8ff54",
          muted: "#d4eb3e",
        },
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
