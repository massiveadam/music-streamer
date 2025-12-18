/**
 * useLibrary - Custom hook for library data management
 * 
 * Encapsulates all library fetching and caching for improved performance.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getServerUrl } from '../config';
import axios from 'axios';
import type { Track, Artist, Playlist } from '../types';

interface Album {
    name: string;
    artist: string;
    tracks: Track[];
    year: number | null;
    genre: string | null;
}

interface LibraryState {
    tracks: Track[];
    artists: Artist[];
    albums: Album[];
    playlists: Playlist[];
    isLoading: boolean;
    error: string | null;
}

interface LibraryActions {
    fetchTracks: () => Promise<void>;
    fetchArtists: () => Promise<void>;
    fetchPlaylists: () => Promise<void>;
    refreshAll: () => Promise<void>;
    updateTrack: (id: number, updates: Partial<Track>) => void;
}

const CACHE_KEY = 'openstream_tracks_cache';
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export function useLibrary(): [LibraryState, LibraryActions] {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [artists, setArtists] = useState<Artist[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Derive albums from tracks with memoization
    const albums = useMemo(() => {
        const albumMap = new Map<string, Album>();

        tracks.forEach(track => {
            const key = `${track.album}|||${track.artist}`;
            if (!albumMap.has(key)) {
                albumMap.set(key, {
                    name: track.album,
                    artist: track.artist,
                    tracks: [],
                    year: track.year || null,
                    genre: track.genre || null,
                });
            }
            albumMap.get(key)!.tracks.push(track);
        });

        return Array.from(albumMap.values()).sort((a, b) =>
            a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name)
        );
    }, [tracks]);

    // Fetch tracks with caching
    const fetchTracks = useCallback(async () => {
        const serverUrl = getServerUrl();
        if (!serverUrl) {
            setError('No server URL configured');
            setIsLoading(false);
            return;
        }

        try {
            const res = await axios.get(`${serverUrl}/api/tracks?limit=100000`, { timeout: 30000 });
            const fetchedTracks = res.data.tracks || res.data;
            setTracks(fetchedTracks);
            setError(null);

            // Cache tracks
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    tracks: fetchedTracks,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.warn('Cache save failed:', e);
            }
        } catch (err) {
            console.error('Error fetching tracks:', err);
            if (tracks.length === 0) {
                setError('Failed to load tracks');
            }
        } finally {
            setIsLoading(false);
        }
    }, [tracks.length]);

    // Fetch artists
    const fetchArtists = useCallback(async () => {
        const serverUrl = getServerUrl();
        if (!serverUrl) return;

        try {
            const res = await axios.get(`${serverUrl}/api/artists`);
            setArtists(res.data.artists || res.data);
        } catch (err) {
            console.error('Error fetching artists:', err);
        }
    }, []);

    // Fetch playlists
    const fetchPlaylists = useCallback(async () => {
        const serverUrl = getServerUrl();
        if (!serverUrl) return;

        try {
            const res = await axios.get(`${serverUrl}/api/playlists`);
            setPlaylists(res.data.playlists || res.data);
        } catch (err) {
            console.error('Error fetching playlists:', err);
        }
    }, []);

    // Refresh all data
    const refreshAll = useCallback(async () => {
        setIsLoading(true);
        await Promise.all([fetchTracks(), fetchArtists(), fetchPlaylists()]);
        setIsLoading(false);
    }, [fetchTracks, fetchArtists, fetchPlaylists]);

    // Update a single track locally (optimistic update)
    const updateTrack = useCallback((id: number, updates: Partial<Track>) => {
        setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    }, []);

    // Load cached data on mount
    useEffect(() => {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const { tracks: cachedTracks, timestamp } = JSON.parse(cached);
                if (cachedTracks && cachedTracks.length > 0) {
                    setTracks(cachedTracks);
                    setIsLoading(false);
                }
            } catch (e) {
                console.error('Cache parse error:', e);
            }
        }

        // Fetch fresh data
        fetchTracks();
        fetchArtists();
        fetchPlaylists();
    }, []);

    const state: LibraryState = {
        tracks,
        artists,
        albums,
        playlists,
        isLoading,
        error,
    };

    const actions: LibraryActions = {
        fetchTracks,
        fetchArtists,
        fetchPlaylists,
        refreshAll,
        updateTrack,
    };

    return [state, actions];
}

export default useLibrary;
