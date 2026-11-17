import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16162a", // primary text
        panel: "#ffffff", // cards
        panel2: "#f6f3ec", // inset surfaces
        line: "#e6e1d6", // borders
        mute: "#6a6a80", // secondary text
        brand: { DEFAULT: "#4f46e5", dark: "#3730a3", soft: "#eeedff" },
        good: "#047857", // verified
        amber: "#d97706",
        coral: "#dc2626",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: { card: "0 1px 2px rgba(22,22,42,.04), 0 8px 24px -12px rgba(22,22,42,.12)" },
      keyframes: {
        sweep: { to: { transform: "rotate(360deg)" } },
        ping: { "0%": { opacity: "0.8", transform: "scale(0.6)" }, "100%": { opacity: "0", transform: "scale(2.4)" } },
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        sweep: "sweep 4s linear infinite",
        blip: "ping 2.4s ease-out infinite",
        rise: "rise .45s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
