/**
 * useMediaSession - Hook for Media Session support
 * 
 * Uses native Capacitor plugin on Android/iOS for proper OS integration:
 * - Notification controls
 * - Lock screen album art and controls  
 * - Bluetooth/car system integration
 * - Background audio playback
 * 
 * Falls back to browser Media Session API on web for:
 * - Chrome/Edge (73+)
 * - Firefox (82+)
 * - Safari (15+)
 */

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { MediaSession as NativeMediaSession } from '@jofr/capacitor-media-session';
import { getServerUrl } from '../config';
import type { Track } from '../types';

interface MediaSessionOptions {
    currentTrack: Track | null;
    isPlaying: boolean;
    onPlay: () => void;
    onPause: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onSeekBackward?: (details: { seekOffset?: number }) => void;
    onSeekForward?: (details: { seekOffset?: number }) => void;
    onSeekTo?: (details: { seekTime?: number }) => void;
}

const isNative = Capacitor.isNativePlatform();

export function useMediaSession({
    currentTrack,
    isPlaying,
    onPlay,
    onPause,
    onPrevious,
    onNext,
    onSeekBackward,
    onSeekForward,
    onSeekTo,
}: MediaSessionOptions): void {
    // Track if action handlers have been registered
    const handlersRegistered = useRef(false);

    // Update metadata when track changes
    useEffect(() => {
        if (!currentTrack) return;

        const serverUrl = getServerUrl();
        const artworkUrl = currentTrack.has_art
            ? `${serverUrl}/api/art/${currentTrack.id}`
            : undefined;

        if (isNative) {
            // Use native Capacitor plugin on Android/iOS
            NativeMediaSession.setMetadata({
                title: currentTrack.title || 'Unknown Track',
                artist: currentTrack.artist || 'Unknown Artist',
                album: currentTrack.album || 'Unknown Album',
                artwork: artworkUrl ? [{ src: artworkUrl }] : undefined,
            });
        } else if ('mediaSession' in navigator) {
            // Use browser API on web
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentTrack.title || 'Unknown Track',
                artist: currentTrack.artist || 'Unknown Artist',
                album: currentTrack.album || 'Unknown Album',
                artwork: artworkUrl ? [
                    { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
                    { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
                    { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
                    { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
                    { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
                    { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
                ] : undefined,
            });
        }
    }, [currentTrack]);

    // Update playback state
    useEffect(() => {
        const state = isPlaying ? 'playing' : 'paused';

        if (isNative) {
            NativeMediaSession.setPlaybackState({ playbackState: state });
        } else if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = state;
        }
    }, [isPlaying]);

    // Set up action handlers (once)
    useEffect(() => {
        if (handlersRegistered.current) return;

        if (isNative) {
            // Register native action handlers
            NativeMediaSession.setActionHandler({ action: 'play' }, () => onPlay());
            NativeMediaSession.setActionHandler({ action: 'pause' }, () => onPause());
            NativeMediaSession.setActionHandler({ action: 'previoustrack' }, () => onPrevious());
            NativeMediaSession.setActionHandler({ action: 'nexttrack' }, () => onNext());

            if (onSeekBackward) {
                NativeMediaSession.setActionHandler({ action: 'seekbackward' }, (details) => {
                    onSeekBackward({ seekOffset: details.seekOffset ?? undefined });
                });
            }
            if (onSeekForward) {
                NativeMediaSession.setActionHandler({ action: 'seekforward' }, (details) => {
                    onSeekForward({ seekOffset: details.seekOffset ?? undefined });
                });
            }
            if (onSeekTo) {
                NativeMediaSession.setActionHandler({ action: 'seekto' }, (details) => {
                    onSeekTo({ seekTime: details.seekTime ?? undefined });
                });
            }
        } else if ('mediaSession' in navigator) {
            // Register browser action handlers
            const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
                ['play', onPlay],
                ['pause', onPause],
                ['previoustrack', onPrevious],
                ['nexttrack', onNext],
            ];

            if (onSeekBackward) handlers.push(['seekbackward', onSeekBackward as MediaSessionActionHandler]);
            if (onSeekForward) handlers.push(['seekforward', onSeekForward as MediaSessionActionHandler]);
            if (onSeekTo) handlers.push(['seekto', onSeekTo as MediaSessionActionHandler]);

            handlers.forEach(([action, handler]) => {
                try {
                    navigator.mediaSession.setActionHandler(action, handler);
                } catch (e) {
                    console.warn(`Media Session: ${action} not supported`);
                }
            });
        }

        handlersRegistered.current = true;

        // Cleanup
        return () => {
            if (isNative) {
                NativeMediaSession.setActionHandler({ action: 'play' }, null);
                NativeMediaSession.setActionHandler({ action: 'pause' }, null);
                NativeMediaSession.setActionHandler({ action: 'previoustrack' }, null);
                NativeMediaSession.setActionHandler({ action: 'nexttrack' }, null);
            } else if ('mediaSession' in navigator) {
                ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'].forEach(action => {
                    try {
                        navigator.mediaSession.setActionHandler(action as MediaSessionAction, null);
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                });
            }
            handlersRegistered.current = false;
        };
    }, [onPlay, onPause, onPrevious, onNext, onSeekBackward, onSeekForward, onSeekTo]);
}

/**
 * Update position state for seeking support
 * Call this periodically or on timeupdate events
 */
export function updatePositionState(
    duration: number,
    position: number,
    playbackRate: number = 1
): void {
    if (duration <= 0 || position < 0 || position > duration) return;

    if (isNative) {
        NativeMediaSession.setPositionState({
            duration,
            position,
            playbackRate,
        });
    } else if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
        try {
            navigator.mediaSession.setPositionState({
                duration,
                position,
                playbackRate,
            });
        } catch (e) {
            // Position state not supported or invalid values
        }
    }
}

export default useMediaSession;
