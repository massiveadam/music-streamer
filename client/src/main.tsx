import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Handle Android back button - dispatch custom event for app to handle
if (Capacitor.isNativePlatform()) {
    CapApp.addListener('backButton', () => {
        // Dispatch custom event - App component will handle closing modals
        const event = new CustomEvent('app:back');
        const handled = window.dispatchEvent(event);

        // If no handler returned true, check if we can go back in history
        if (!handled) {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                CapApp.exitApp();
            }
        }
    });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

