// Centralized server configuration
// Supports user-configured server URL with localStorage persistence

const STORAGE_KEY = 'openstream_server_url';

// Check if we're running in a Capacitor native app
const isNativeApp = typeof (window as any).Capacitor !== 'undefined';

// Get the server URL from localStorage or fall back to defaults
export const getServerUrl = (): string => {
    // First, check localStorage for user-configured URL
    const savedUrl = localStorage.getItem(STORAGE_KEY);
    console.log('[Config] getServerUrl called, savedUrl:', savedUrl, 'isNativeApp:', isNativeApp);

    if (savedUrl) {
        return savedUrl;
    }

    // If VITE_SERVER_URL is set, use it as default
    if (import.meta.env.VITE_SERVER_URL) {
        return import.meta.env.VITE_SERVER_URL;
    }

    // For native apps without saved config, return empty to trigger config screen
    if (isNativeApp) {
        return '';
    }

    // Production web: use same-origin (empty string = relative API calls)
    if (window.location.hostname !== 'localhost') {
        return '';
    }

    // For web development, localhost works fine
    return 'http://localhost:3001';
};

// Save the server URL to localStorage
export const saveServerUrl = (url: string): void => {
    console.log('[Config] saveServerUrl:', url);
    localStorage.setItem(STORAGE_KEY, url);
};

// Clear saved server configuration
export const clearServerConfig = (): void => {
    localStorage.removeItem(STORAGE_KEY);
};

// Check if server is configured
export const isServerConfigured = (): boolean => {
    return !!getServerUrl();
};

// SERVER_URL evaluated at module load time
// After page reload, this will read the saved value from localStorage
export const SERVER_URL = getServerUrl();
export const API_URL = SERVER_URL;

// Log initial value for debugging
console.log('[Config] Module loaded, SERVER_URL:', SERVER_URL);

