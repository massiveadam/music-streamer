/**
 * useOfflineStorage - Hook for managing offline music downloads
 * 
 * Provides functions to download, delete, and check offline status of tracks.
 * Uses IndexedDB via Dexie.js for storage.
 */

import { useState, useEffect, useCallback } from 'react';
import { offlineDb, OfflineTrack, OfflineMetadata } from '../db/offlineDb';
import { getServerUrl } from '../config';
import type { Track } from '../types';

export interface DownloadProgress {
    trackId: number;
    progress: number;  // 0-100
    status: 'pending' | 'downloading' | 'complete' | 'error';
}

export interface OfflineStorageInfo {
    totalTracks: number;
    totalSize: number;  // bytes
    tracks: number[];   // IDs of offline tracks
}

/**
 * Check if a track is available offline
 */
export async function isTrackOffline(trackId: number): Promise<boolean> {
    const track = await offlineDb.tracks.get(trackId);
    return !!track;
}

/**
 * Get all offline track IDs
 */
export async function getOfflineTrackIds(): Promise<number[]> {
    const tracks = await offlineDb.tracks.toArray();
    return tracks.map(t => t.id);
}

/**
 * Get storage usage info
 */
export async function getStorageInfo(): Promise<OfflineStorageInfo> {
    const tracks = await offlineDb.tracks.toArray();
    return {
        totalTracks: tracks.length,
        totalSize: tracks.reduce((acc, t) => acc + t.size, 0),
        tracks: tracks.map(t => t.id)
    };
}

/**
 * Download a track for offline playback
 */
export async function downloadTrack(
    track: Track,
    onProgress?: (progress: number) => void
): Promise<void> {
    const serverUrl = getServerUrl();

    // Download audio file
    const response = await fetch(`${serverUrl}/api/stream/${track.id}`);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    // Stream the response for progress tracking
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        received += value.length;

        if (total && onProgress) {
            onProgress(Math.round((received / total) * 100));
        }
    }

    // Combine chunks into a single ArrayBuffer, then create blob
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }
    const blob = new Blob([combined], { type: 'audio/mpeg' });

    // Download artwork if available
    let artworkBlob: Blob | undefined;
    if (track.has_art) {
        try {
            const artResponse = await fetch(`${serverUrl}/api/art/${track.id}`);
            if (artResponse.ok) {
                artworkBlob = await artResponse.blob();
            }
        } catch {
            // Artwork download optional
        }
    }

    // Store in IndexedDB
    await offlineDb.tracks.put({
        id: track.id,
        blob,
        size: blob.size,
        downloadedAt: new Date()
    });

    await offlineDb.metadata.put({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration || 0,
        hasArt: !!track.has_art,
        artworkBlob
    });
}

/**
 * Delete a track from offline storage
 */
export async function deleteOfflineTrack(trackId: number): Promise<void> {
    await offlineDb.tracks.delete(trackId);
    await offlineDb.metadata.delete(trackId);
}

/**
 * Get the audio blob for offline playback
 */
export async function getOfflineAudioBlob(trackId: number): Promise<Blob | null> {
    const track = await offlineDb.tracks.get(trackId);
    return track?.blob || null;
}

/**
 * Hook for offline storage management
 */
export function useOfflineStorage() {
    const [offlineTrackIds, setOfflineTrackIds] = useState<Set<number>>(new Set());
    const [storageInfo, setStorageInfo] = useState<OfflineStorageInfo>({
        totalTracks: 0,
        totalSize: 0,
        tracks: []
    });
    const [downloadProgress, setDownloadProgress] = useState<Map<number, DownloadProgress>>(new Map());

    // Load offline track IDs on mount
    useEffect(() => {
        const loadOfflineIds = async () => {
            const ids = await getOfflineTrackIds();
            setOfflineTrackIds(new Set(ids));
            const info = await getStorageInfo();
            setStorageInfo(info);
        };
        loadOfflineIds();
    }, []);

    const isOffline = useCallback((trackId: number) => {
        return offlineTrackIds.has(trackId);
    }, [offlineTrackIds]);

    const download = useCallback(async (track: Track) => {
        const progress: DownloadProgress = {
            trackId: track.id,
            progress: 0,
            status: 'downloading'
        };

        setDownloadProgress(prev => new Map(prev).set(track.id, progress));

        try {
            await downloadTrack(track, (percent) => {
                setDownloadProgress(prev => {
                    const updated = new Map(prev);
                    updated.set(track.id, { ...progress, progress: percent });
                    return updated;
                });
            });

            setDownloadProgress(prev => {
                const updated = new Map(prev);
                updated.set(track.id, { ...progress, progress: 100, status: 'complete' });
                return updated;
            });

            // Update offline IDs
            setOfflineTrackIds(prev => new Set([...prev, track.id]));
            const info = await getStorageInfo();
            setStorageInfo(info);

            // Clear progress after a delay
            setTimeout(() => {
                setDownloadProgress(prev => {
                    const updated = new Map(prev);
                    updated.delete(track.id);
                    return updated;
                });
            }, 2000);

        } catch (error) {
            console.error('Download failed:', error);
            setDownloadProgress(prev => {
                const updated = new Map(prev);
                updated.set(track.id, { ...progress, status: 'error' });
                return updated;
            });
        }
    }, []);

    const remove = useCallback(async (trackId: number) => {
        await deleteOfflineTrack(trackId);
        setOfflineTrackIds(prev => {
            const updated = new Set(prev);
            updated.delete(trackId);
            return updated;
        });
        const info = await getStorageInfo();
        setStorageInfo(info);
    }, []);

    return {
        offlineTrackIds,
        storageInfo,
        downloadProgress,
        isOffline,
        download,
        remove
    };
}

export default useOfflineStorage;
