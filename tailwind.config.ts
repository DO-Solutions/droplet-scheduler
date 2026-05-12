import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        do: {
          blue: "#0080FF",
          dark: "#0C1B33",
          navy: "#1A2332",
          card: "#1E2D3D",
          border: "#2A3F55",
          text: "#E8EDF2",
          muted: "#7B9AB2",
        },
      },
    },
  },
  plugins: [],
};

export default config;
