import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Aileron', 'system-ui', 'sans-serif'],
                serif: ['Libre Baskerville', 'Georgia', 'serif'],
            },
            colors: {
                // Dark, premium palette
                'app-bg': '#0a0a0a',
                'app-surface': '#1a1a1a',
                'app-accent': 'var(--app-accent)', // Dynamic from album art
                'app-text': '#e5e5e5',
                'app-text-muted': '#a3a3a3',
            }
        },
    },
    plugins: [
        tailwindcssAnimate,
    ],
}
