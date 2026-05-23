/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'Inter', 'sans-serif'],
        display: ['var(--font-display)', 'DM Sans', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // App-specific semantic colors
        todo: { DEFAULT: "hsl(var(--todo))", foreground: "hsl(var(--todo-foreground))" },
        "in-progress": { DEFAULT: "hsl(var(--in-progress))", foreground: "hsl(var(--in-progress-foreground))" },
        done: { DEFAULT: "hsl(var(--done))", foreground: "hsl(var(--done-foreground))" },
        blocked: { DEFAULT: "hsl(var(--blocked))", foreground: "hsl(var(--blocked-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in": { from: { opacity: "0", transform: "translateX(-12px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } },
        "shimmer": { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
        "panel-in": {
          "0%":   { opacity: "0", transform: "translateY(-8px) scale(0.96)" },
          "60%":  { opacity: "1", transform: "translateY(2px) scale(1.01)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "panel-out": {
          from: { opacity: "1", transform: "translateY(0) scale(1)" },
          to:   { opacity: "0", transform: "translateY(-6px) scale(0.97)" },
        },
        "bell-wiggle": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%":      { transform: "rotate(-14deg)" },
          "40%":      { transform: "rotate(10deg)" },
          "60%":      { transform: "rotate(-6deg)" },
          "80%":      { transform: "rotate(4deg)" },
        },
        // Direction-aware page transitions used when navigating the calendar
        // (swipe or arrow buttons). Slightly larger offset than the generic
        // slide-in so the motion is clearly visible on a month swap.
        "swipe-in-from-right": { from: { opacity: "0", transform: "translateX(36px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "swipe-in-from-left":  { from: { opacity: "0", transform: "translateX(-36px)" }, to: { opacity: "1", transform: "translateX(0)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "shimmer": "shimmer 2s linear infinite",
        "panel-in":  "panel-in 0.24s cubic-bezier(0.16, 1, 0.3, 1)",
        "panel-out": "panel-out 0.16s ease-in forwards",
        "bell-wiggle": "bell-wiggle 0.55s ease-in-out",
        "swipe-in-from-right": "swipe-in-from-right 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        "swipe-in-from-left":  "swipe-in-from-left  0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
