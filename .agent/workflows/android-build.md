---
description: how to build and test the Android app with Capacitor
---

# Android Build Workflow

## Prerequisites
- Android Studio installed
- Android SDK configured
- A connected device or emulator running

## Quick Commands (from `client/` directory)

### 1. Build and sync web assets to Android
```bash
npm run cap:build
```

### 2. Open in Android Studio
```bash
npm run cap:android
```
Then click Run (▶️) in Android Studio to deploy to device/emulator.

### 3. Quick sync (after minor changes, no full rebuild)
```bash
npm run cap:sync
```

## Live Reload Development

For faster iteration, you can enable live reload:

1. Find your local IP address:
   ```bash
   ip addr show | grep "inet " | grep -v 127.0.0.1
   ```

2. Edit `capacitor.config.ts` and uncomment the server section:
   ```typescript
   server: {
     url: 'http://YOUR_LOCAL_IP:5173',
     cleartext: true
   }
   ```

3. Run the dev server with host binding:
   ```bash
   npm run dev -- --host
   ```

4. Sync and run on device:
   ```bash
   npm run cap:sync
   npm run cap:android
   ```

Now changes in the browser will instantly reflect on the device!

## Building a Release APK

1. Open in Android Studio: `npm run cap:android`
2. Go to Build → Build Bundle(s) / APK(s) → Build APK(s)
3. APK will be in `android/app/build/outputs/apk/debug/`

For a signed release APK, you'll need to configure signing in Android Studio.

## Troubleshooting

- **White screen on device**: Make sure `npm run build` completed successfully
- **Network errors**: Check that the device can reach your server's IP
- **Audio issues**: May need native plugins for background playback
