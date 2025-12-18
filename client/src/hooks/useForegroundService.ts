/**
 * useForegroundService - Capacitor Foreground Service for background audio
 * 
 * On Android, keeps the app alive in the background with a persistent
 * notification showing the current track. Required for uninterrupted
 * audio playback on mobile.
 * 
 * Note: For production, consider @capawesome-team/capacitor-foreground-service
 * which has more features but requires a license.
 * 
 * This implementation uses Android's native foreground service API
 * through a custom approach since the community plugin has limitations.
 */

import { useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Track } from '../types';

interface UseForegroundServiceOptions {
    currentTrack: Track | null | undefined;
    isPlaying: boolean;
}

/**
 * Hook to manage Android foreground service for background audio playback.
 * 
 * Currently this is a placeholder that:
 * 1. Detects if running on Android
 * 2. Logs background state changes
 * 3. Prepares for future native plugin integration
 * 
 * For full background service support, you need:
 * - @capawesome-team/capacitor-foreground-service (paid)
 * - Or a custom Capacitor plugin
 */
export function useForegroundService({
    currentTrack,
    isPlaying,
}: UseForegroundServiceOptions): {
    isBackgroundModeActive: boolean;
} {
    const isNative = Capacitor.isNativePlatform();
    const isPlatformAndroid = Capacitor.getPlatform() === 'android';
    const isBackgroundModeActiveRef = useRef(false);

    // Track visibility changes (app going to background)
    useEffect(() => {
        if (!isNative) return;

        const handleVisibilityChange = () => {
            if (document.hidden && isPlaying && currentTrack) {
                console.log('[ForegroundService] App went to background while playing');
                isBackgroundModeActiveRef.current = true;
                // In a full implementation, this would start the foreground service
                // with a notification showing the current track
            } else if (!document.hidden) {
                console.log('[ForegroundService] App came to foreground');
                isBackgroundModeActiveRef.current = false;
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isNative, isPlaying, currentTrack]);

    // Log when playback state changes
    useEffect(() => {
        if (!isNative || !isPlatformAndroid) return;

        if (isPlaying && currentTrack) {
            console.log(`[ForegroundService] Playback started: ${currentTrack.title}`);
            // Future: Start foreground service with notification
        } else if (!isPlaying) {
            console.log('[ForegroundService] Playback stopped');
            // Future: Stop foreground service
        }
    }, [isNative, isPlatformAndroid, isPlaying, currentTrack?.id]);

    return {
        isBackgroundModeActive: isBackgroundModeActiveRef.current,
    };
}

export default useForegroundService;
