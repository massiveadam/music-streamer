import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo } from 'react';
import axios from 'axios';
import type { Track, Artist, Playlist } from '../types';

const SERVER_URL = 'http://localhost:3001';

// Album type for computed albums
interface Album {
    name: string;
    artist: string;
    tracks: Track[];
    year: number | null;
}

type LibraryView = 'grid' | 'list' | 'artists' | 'labels';
type MainTab = 'home' | 'library' | 'playlists' | 'settings';
type AlbumSort = 'artist' | 'title' | 'year' | 'recent';

interface LibraryContextType {
    // Core data
    tracks: Track[];
    setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
    isLoading: boolean;

    // Computed
    albums: Album[];
    artists: Artist[];

    // Labels
    allLabels: any[];
    selectedLabel: any | null;
    setSelectedLabel: React.Dispatch<React.SetStateAction<any | null>>;

    // Collections
    allCollections: any[];
    setAllCollections: React.Dispatch<React.SetStateAction<any[]>>;
    selectedCollection: any | null;
    setSelectedCollection: React.Dispatch<React.SetStateAction<any | null>>;
    addToCollectionAlbum: { name: string; artist: string } | null;
    setAddToCollectionAlbum: React.Dispatch<React.SetStateAction<{ name: string; artist: string } | null>>;

    // Playlists
    allPlaylists: Playlist[];
    setAllPlaylists: React.Dispatch<React.SetStateAction<Playlist[]>>;
    homePlaylists: Playlist[];
    selectedPlaylist: any | null;
    setSelectedPlaylist: React.Dispatch<React.SetStateAction<any | null>>;
    showPlaylistModal: boolean;
    setShowPlaylistModal: React.Dispatch<React.SetStateAction<boolean>>;
    editingPlaylist: Playlist | null;
    setEditingPlaylist: React.Dispatch<React.SetStateAction<Playlist | null>>;
    addToPlaylistTrack: Track | null;
    setAddToPlaylistTrack: React.Dispatch<React.SetStateAction<Track | null>>;

    // Home page data
    recentlyAdded: Track[];
    recentlyPlayed: Track[];
    pinnedCollections: any[];

    // UI State
    view: LibraryView;
    setView: React.Dispatch<React.SetStateAction<LibraryView>>;
    mainTab: MainTab;
    setMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
    playlistsViewMode: 'playlists' | 'collections';
    setPlaylistsViewMode: React.Dispatch<React.SetStateAction<'playlists' | 'collections'>>;

    // Filters
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    moodFilter: string;
    setMoodFilter: React.Dispatch<React.SetStateAction<string>>;
    albumSort: AlbumSort;
    setAlbumSort: React.Dispatch<React.SetStateAction<AlbumSort>>;

    // Selected items
    selectedAlbum: Album | null;
    setSelectedAlbum: React.Dispatch<React.SetStateAction<Album | null>>;
    selectedArtist: Artist | null;
    setSelectedArtist: React.Dispatch<React.SetStateAction<Artist | null>>;

    // Background status
    backgroundStatus: {
        enrichment?: { running: boolean; albumsProcessed: number; albumsTotal: number; currentTrack?: string };
        scanning?: { running: boolean; filesScanned: number };
    };

    // Theme
    theme: string;
    setTheme: React.Dispatch<React.SetStateAction<string>>;

    // Functions
    fetchTracks: () => Promise<void>;
    fetchArtists: () => Promise<void>;
    refreshPlaylists: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextType | null>(null);

export function useLibrary() {
    const context = useContext(LibraryContext);
    if (!context) {
        throw new Error('useLibrary must be used within LibraryProvider');
    }
    return context;
}

interface LibraryProviderProps {
    children: ReactNode;
}

export function LibraryProvider({ children }: LibraryProviderProps) {
    // Core data
    const [tracks, setTracks] = useState<Track[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [artists, setArtists] = useState<Artist[]>([]);

    // Labels
    const [allLabels, setAllLabels] = useState<any[]>([]);
    const [selectedLabel, setSelectedLabel] = useState<any | null>(null);

    // Collections
    const [allCollections, setAllCollections] = useState<any[]>([]);
    const [selectedCollection, setSelectedCollection] = useState<any | null>(null);
    const [addToCollectionAlbum, setAddToCollectionAlbum] = useState<{ name: string; artist: string } | null>(null);

    // Playlists
    const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
    const [homePlaylists, setHomePlaylists] = useState<Playlist[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
    const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);

    // Home page data
    const [recentlyAdded, setRecentlyAdded] = useState<Track[]>([]);
    const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
    const [pinnedCollections, setPinnedCollections] = useState<any[]>([]);

    // UI State
    const [view, setView] = useState<LibraryView>('grid');
    const [mainTab, setMainTab] = useState<MainTab>('library');
    const [playlistsViewMode, setPlaylistsViewMode] = useState<'playlists' | 'collections'>('playlists');

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [moodFilter, setMoodFilter] = useState<string>('');
    const [albumSort, setAlbumSort] = useState<AlbumSort>('artist');

    // Selected items
    const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);

    // Background status
    const [backgroundStatus, setBackgroundStatus] = useState<{
        enrichment?: { running: boolean; albumsProcessed: number; albumsTotal: number; currentTrack?: string };
        scanning?: { running: boolean; filesScanned: number };
    }>({});

    // Theme
    const [theme, setTheme] = useState<string>(() => localStorage.getItem('theme') || 'dark');

    // Computed albums from tracks
    const albums = useMemo((): Album[] => {
        if (!Array.isArray(tracks) || tracks.length === 0) return [];

        const albumMap = new Map<string, Album>();
        tracks.forEach(track => {
            const key = `${track.album}|||${track.artist}`;
            if (!albumMap.has(key)) {
                albumMap.set(key, {
                    name: track.album,
                    artist: track.artist,
                    tracks: [],
                    year: track.year || null,
                });
            }
            albumMap.get(key)!.tracks.push(track);
        });

        const albumArray = Array.from(albumMap.values());

        // Sort albums
        switch (albumSort) {
            case 'title':
                return albumArray.sort((a, b) => a.name.localeCompare(b.name));
            case 'year':
                return albumArray.sort((a, b) => (b.year || 0) - (a.year || 0));
            case 'recent':
                return albumArray.sort((a, b) => {
                    const aDate = a.tracks[0]?.added_at || '';
                    const bDate = b.tracks[0]?.added_at || '';
                    return bDate.localeCompare(aDate);
                });
            default: // artist
                return albumArray.sort((a, b) => a.artist.localeCompare(b.artist));
        }
    }, [tracks, albumSort]);

    // Fetch tracks
    const fetchTracks = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${SERVER_URL}/api/tracks?limit=100000`);
            setTracks(res.data.tracks || res.data);
        } catch (err) {
            console.error('Error fetching tracks:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch artists
    const fetchArtists = useCallback(async () => {
        try {
            const res = await axios.get(`${SERVER_URL}/api/artists`);
            setArtists(res.data.artists || res.data);
        } catch (err) {
            console.error('Error fetching artists:', err);
        }
    }, []);

    // Refresh playlists
    const refreshPlaylists = useCallback(async () => {
        const [all, home] = await Promise.all([
            axios.get(`${SERVER_URL}/api/playlists`),
            axios.get(`${SERVER_URL}/api/playlists/home`)
        ]);
        setAllPlaylists(all.data);
        setHomePlaylists(home.data);
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchTracks();
    }, [fetchTracks]);

    // Fetch based on view
    useEffect(() => {
        if (view === 'artists') {
            fetchArtists();
        } else if (view === 'labels') {
            axios.get(`${SERVER_URL}/api/labels`)
                .then(res => setAllLabels(res.data))
                .catch(err => console.error('Error fetching labels:', err));
        }
    }, [view, fetchArtists]);

    // Fetch home page data
    useEffect(() => {
        if (mainTab === 'home') {
            axios.get(`${SERVER_URL}/api/tracks/recent?limit=60`)
                .then(res => setRecentlyAdded(res.data))
                .catch(err => console.error('Error fetching recent:', err));
            axios.get(`${SERVER_URL}/api/history/recent?limit=60`)
                .then(res => setRecentlyPlayed(res.data))
                .catch(err => console.error('Error fetching history:', err));
            axios.get(`${SERVER_URL}/api/collections/home`)
                .then(res => setPinnedCollections(res.data))
                .catch(err => console.error('Error fetching pinned collections:', err));
            fetchArtists();
        }

        if (mainTab === 'home' || mainTab === 'playlists') {
            axios.get(`${SERVER_URL}/api/playlists`)
                .then(res => setAllPlaylists(res.data))
                .catch(err => console.error('Error fetching playlists:', err));
            axios.get(`${SERVER_URL}/api/collections`)
                .then(res => setAllCollections(res.data))
                .catch(err => console.error('Error fetching collections:', err));
        }
    }, [mainTab, fetchArtists]);

    // Background status polling
    useEffect(() => {
        const pollStatus = () => {
            axios.get(`${SERVER_URL}/api/enrich/status`)
                .then(res => setBackgroundStatus(prev => ({ ...prev, enrichment: res.data })))
                .catch(() => { });
        };
        pollStatus();
        const interval = setInterval(pollStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    // Theme persistence
    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const value: LibraryContextType = {
        tracks,
        setTracks,
        isLoading,
        albums,
        artists,
        allLabels,
        selectedLabel,
        setSelectedLabel,
        allCollections,
        setAllCollections,
        selectedCollection,
        setSelectedCollection,
        addToCollectionAlbum,
        setAddToCollectionAlbum,
        allPlaylists,
        setAllPlaylists,
        homePlaylists,
        selectedPlaylist,
        setSelectedPlaylist,
        showPlaylistModal,
        setShowPlaylistModal,
        editingPlaylist,
        setEditingPlaylist,
        addToPlaylistTrack,
        setAddToPlaylistTrack,
        recentlyAdded,
        recentlyPlayed,
        pinnedCollections,
        view,
        setView,
        mainTab,
        setMainTab,
        playlistsViewMode,
        setPlaylistsViewMode,
        searchQuery,
        setSearchQuery,
        moodFilter,
        setMoodFilter,
        albumSort,
        setAlbumSort,
        selectedAlbum,
        setSelectedAlbum,
        selectedArtist,
        setSelectedArtist,
        backgroundStatus,
        theme,
        setTheme,
        fetchTracks,
        fetchArtists,
        refreshPlaylists,
    };

    return (
        <LibraryContext.Provider value={value}>
            {children}
        </LibraryContext.Provider>
    );
}

export default LibraryContext;
