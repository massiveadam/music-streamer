/**
 * useSessionPersistence - Persist and restore playback session
 * 
 * Saves current playback state to localStorage every 10 seconds.
 * On app launch, can restore to previous track and position.
 * 
 * Inspired by Plexamp's session persistence.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Track } from '../types';

const SESSION_KEY = 'openstream_session';
const SAVE_INTERVAL_MS = 10000; // Save every 10 seconds
const REWIND_SECONDS = 3; // Rewind this much on resume

export interface PlaybackSession {
    trackId: number;
    trackIndex: number;
    position: number;  // seconds
    queue: number[];   // track IDs
    isPlaying: boolean;
    timestamp: number; // when saved
}

interface UseSessionPersistenceOptions {
    tracks: Track[];
    currentTrackIndex: number;
    currentTime: number;
    isPlaying: boolean;
    onRestore: (trackIndex: number, position: number, queue: number[]) => void;
}

/**
 * Save session to localStorage
 */
export function saveSession(session: PlaybackSession): void {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
        console.warn('Failed to save session:', e);
    }
}

/**
 * Load session from localStorage
 */
export function loadSession(): PlaybackSession | null {
    try {
        const data = localStorage.getItem(SESSION_KEY);
        if (!data) return null;
        return JSON.parse(data);
    } catch (e) {
        console.warn('Failed to load session:', e);
        return null;
    }
}

/**
 * Clear saved session
 */
export function clearSession(): void {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch (e) {
        // Ignore
    }
}

/**
 * Check if a saved session exists and is valid
 */
export function hasValidSession(tracks: Track[]): boolean {
    const session = loadSession();
    if (!session) return false;

    // Session is valid if the track still exists
    const trackExists = tracks.some(t => t.id === session.trackId);

    // And it's not too old (24 hours)
    const isRecent = Date.now() - session.timestamp < 24 * 60 * 60 * 1000;

    return trackExists && isRecent;
}

/**
 * Get session info for display in resume prompt
 */
export function getSessionInfo(tracks: Track[]): { track: Track; position: number } | null {
    const session = loadSession();
    if (!session) return null;

    const track = tracks.find(t => t.id === session.trackId);
    if (!track) return null;

    // Apply rewind
    const position = Math.max(0, session.position - REWIND_SECONDS);

    return { track, position };
}

/**
 * Hook for session persistence
 */
export function useSessionPersistence({
    tracks,
    currentTrackIndex,
    currentTime,
    isPlaying,
    onRestore,
}: UseSessionPersistenceOptions): {
    hasSession: boolean;
    sessionInfo: { track: Track; position: number } | null;
    restoreSession: () => void;
    dismissSession: () => void;
} {
    const saveIntervalRef = useRef<number | null>(null);
    const hasCheckedRef = useRef(false);

    // Check for existing session on mount
    const hasSession = !hasCheckedRef.current && tracks.length > 0 && hasValidSession(tracks);
    const sessionInfo = hasSession ? getSessionInfo(tracks) : null;

    // Auto-save session periodically while playing
    useEffect(() => {
        if (currentTrackIndex < 0 || !tracks[currentTrackIndex]) {
            return;
        }

        const currentTrack = tracks[currentTrackIndex];

        // Save immediately on track change
        const session: PlaybackSession = {
            trackId: currentTrack.id,
            trackIndex: currentTrackIndex,
            position: currentTime,
            queue: tracks.map(t => t.id),
            isPlaying,
            timestamp: Date.now(),
        };
        saveSession(session);

        // Set up periodic save
        if (saveIntervalRef.current) {
            window.clearInterval(saveIntervalRef.current);
        }

        saveIntervalRef.current = window.setInterval(() => {
            const updatedSession: PlaybackSession = {
                ...session,
                position: currentTime,
                isPlaying,
                timestamp: Date.now(),
            };
            saveSession(updatedSession);
        }, SAVE_INTERVAL_MS);

        return () => {
            if (saveIntervalRef.current) {
                window.clearInterval(saveIntervalRef.current);
            }
        };
    }, [currentTrackIndex, tracks, isPlaying]);

    // Save position on every second (for more accurate resume)
    useEffect(() => {
        if (currentTrackIndex < 0 || !isPlaying) return;

        const session = loadSession();
        if (session) {
            session.position = currentTime;
            session.timestamp = Date.now();
            saveSession(session);
        }
    }, [Math.floor(currentTime)]); // Only when second changes

    const restoreSession = useCallback(() => {
        const session = loadSession();
        if (!session) return;

        // Find track index by ID (in case order changed)
        const trackIndex = tracks.findIndex(t => t.id === session.trackId);
        if (trackIndex === -1) return;

        // Apply rewind
        const position = Math.max(0, session.position - REWIND_SECONDS);

        hasCheckedRef.current = true;
        onRestore(trackIndex, position, session.queue);
    }, [tracks, onRestore]);

    const dismissSession = useCallback(() => {
        hasCheckedRef.current = true;
        clearSession();
    }, []);

    return {
        hasSession,
        sessionInfo,
        restoreSession,
        dismissSession,
    };
}

export default useSessionPersistence;
