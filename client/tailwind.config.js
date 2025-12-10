/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Dark, premium palette
                'app-bg': '#0a0a0a',
                'app-surface': '#1a1a1a',
                'app-accent': '#e11d48', // Rose-600 roughly
                'app-text': '#e5e5e5',
                'app-text-muted': '#a3a3a3',
            }
        },
    },
    plugins: [
        require("tailwindcss-animate"),
    ],
}
