import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.openstream.app',
  appName: 'OpenStream',
  webDir: 'dist',

  // Use HTTP scheme to avoid mixed content issues with HTTP backend
  server: {
    androidScheme: 'http',
    cleartext: true,
  },

  android: {
    backgroundColor: '#0a0a0a', // Match your app's dark theme
    allowMixedContent: true,    // Allow HTTP during dev
  }
};

export default config;
