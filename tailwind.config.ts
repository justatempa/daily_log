import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        secondary: "#818CF8",
        neutral: "#F5F7FA",
        dark: "#1E293B",
      },
    },
  },
  plugins: [],
};

export default config;
