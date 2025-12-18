/**
 * useMediaSession - Hook for browser Media Session API
 * 
 * Provides lock screen controls and media key support for:
 * - iOS Safari (15+) 
 * - Chrome/Edge (73+)
 * - Firefox (82+)
 * - Linux desktop browsers
 * 
 * Works as a PWA and regular web app - no additional packages needed.
 */

import { useEffect, useCallback } from 'react';
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

    // Update metadata when track changes
    useEffect(() => {
        if (!('mediaSession' in navigator) || !currentTrack) return;

        const serverUrl = getServerUrl();
        const artworkUrl = currentTrack.has_art
            ? `${serverUrl}/api/art/${currentTrack.id}`
            : undefined;

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
    }, [currentTrack]);

    // Update playback state
    useEffect(() => {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }, [isPlaying]);

    // Set up action handlers
    useEffect(() => {
        if (!('mediaSession' in navigator)) return;

        const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
            ['play', onPlay],
            ['pause', onPause],
            ['previoustrack', onPrevious],
            ['nexttrack', onNext],
        ];

        // Optional handlers
        if (onSeekBackward) handlers.push(['seekbackward', onSeekBackward as MediaSessionActionHandler]);
        if (onSeekForward) handlers.push(['seekforward', onSeekForward as MediaSessionActionHandler]);
        if (onSeekTo) handlers.push(['seekto', onSeekTo as MediaSessionActionHandler]);

        // Register handlers
        handlers.forEach(([action, handler]) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (e) {
                console.warn(`Media Session: ${action} not supported`);
            }
        });

        // Cleanup
        return () => {
            handlers.forEach(([action]) => {
                try {
                    navigator.mediaSession.setActionHandler(action, null);
                } catch (e) {
                    // Ignore cleanup errors
                }
            });
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
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;

    try {
        if (duration > 0 && position >= 0 && position <= duration) {
            navigator.mediaSession.setPositionState({
                duration,
                position,
                playbackRate,
            });
        }
    } catch (e) {
        // Position state not supported or invalid values
    }
}

export default useMediaSession;
