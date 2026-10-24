import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/modules/**/*.{ts,tsx}",
    "./src/shared/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          soft: "hsl(var(--accent-soft) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft) / <alpha-value>)",
        },
        surface: {
          1: "hsl(var(--surface-1) / <alpha-value>)",
          2: "hsl(var(--surface-2) / <alpha-value>)",
          3: "hsl(var(--surface-3) / <alpha-value>)",
        },
      },
      borderRadius: {
        sm: "calc(var(--radius) - 8px)",
        md: "calc(var(--radius) - 4px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 6px)",
        "2xl": "calc(var(--radius) + 14px)",
        "3xl": "calc(var(--radius) + 26px)",
      },
      boxShadow: {
        "glass-xs":
          "0 1px 2px hsl(var(--shadow-color) / 0.06), inset 0 0 0 1px hsl(var(--glass-edge) / 0.5)",
        "glass-sm":
          "0 2px 8px hsl(var(--shadow-color) / 0.08), inset 0 0 0 1px hsl(var(--glass-edge) / 0.6), inset 0 1px 0 hsl(var(--glass-highlight) / 0.4)",
        glass:
          "0 8px 28px hsl(var(--shadow-color) / 0.12), inset 0 0 0 1px hsl(var(--glass-edge) / 0.6), inset 0 1px 0 hsl(var(--glass-highlight) / 0.5)",
        "glass-lg":
          "0 18px 48px hsl(var(--shadow-color) / 0.18), inset 0 0 0 1px hsl(var(--glass-edge) / 0.7), inset 0 1px 0 hsl(var(--glass-highlight) / 0.6)",
        "glass-xl":
          "0 32px 80px hsl(var(--shadow-color) / 0.22), inset 0 0 0 1px hsl(var(--glass-edge) / 0.7), inset 0 1px 0 hsl(var(--glass-highlight) / 0.7)",
        "glow-primary":
          "0 0 0 1px hsl(var(--primary) / 0.3), 0 0 28px hsl(var(--primary) / 0.25)",
        "glow-success":
          "0 0 0 1px hsl(var(--success) / 0.3), 0 0 24px hsl(var(--success) / 0.22)",
        "glow-destructive":
          "0 0 0 1px hsl(var(--destructive) / 0.35), 0 0 24px hsl(var(--destructive) / 0.25)",
      },
      backdropBlur: {
        xs: "4px",
        "2xl": "32px",
        "3xl": "48px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        slideDown: {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        slideUp: {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-down": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        sheen: {
          "0%": { transform: "translateX(-120%) skewX(-18deg)" },
          "60%, 100%": { transform: "translateX(220%) skewX(-18deg)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "1" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "mesh-drift": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(2%, -1.5%, 0) scale(1.05)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        slideDown: "slideDown 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        slideUp: "slideUp 300ms cubic-bezier(0.87, 0, 0.13, 1)",
        "fade-in": "fade-in 0.4s ease-out",
        "fade-in-up": "fade-in-up 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
        "fade-in-down": "fade-in-down 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
        "scale-in": "scale-in 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        shimmer: "shimmer 2.4s linear infinite",
        sheen: "sheen 2.6s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.5s cubic-bezier(0.24, 0, 0.38, 1) infinite",
        float: "float 6s ease-in-out infinite",
        "mesh-drift": "mesh-drift 22s ease-in-out infinite",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(var(--tw-gradient-stops))",
        "grid-pattern":
          "linear-gradient(to right, hsl(var(--border) / 0.18) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.18) 1px, transparent 1px)",
      },
    },
  },
  plugins: [animate],
};

export default config;
