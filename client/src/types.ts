// OpenStream Client Types
// Re-exports shared types and adds client-specific types

// ============================================
// Core Entities (from shared types)
// ============================================

export interface Track {
    id: number;
    path: string;
    title: string;
    artist: string;
    album: string;
    duration: number;
    format: string;
    bpm?: number;
    key?: string;
    year?: number;
    genre?: string;
    rating?: number;
    has_art?: number;
    mood?: string;
    mbid?: string;
    release_mbid?: string;
    enriched?: number;
    added_at?: string;
}

export interface Artist {
    id: number;
    mbid?: string;
    name: string;
    sort_name?: string;
    disambiguation?: string;
    type?: string;
    country?: string;
    begin_date?: string;
    end_date?: string;
    description?: string;
    image_path?: string;
    wiki_url?: string;
    track_count?: number;
}

export interface Credit {
    id: number;
    track_id: number;
    name: string;
    role: string;
    artist_mbid?: string;
    instrument?: string;
    attributes?: string;
    track_title?: string;
}

export interface Playlist {
    id: number;
    name: string;
    description?: string;
    is_featured: number;
    created_at: string;
    updated_at: string;
}

export interface Tag {
    name: string;
    count?: number;
}

export interface AlbumImage {
    id: number;
    release_mbid?: string;
    type: string;
    path: string;
    source: string;
}

// ============================================
// API Response Types
// ============================================

export interface PaginatedResponse<T> {
    data?: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface TracksResponse extends PaginatedResponse<Track> {
    tracks: Track[];
}

export interface ArtistsResponse extends PaginatedResponse<Artist> {
    artists: Artist[];
}

export interface ArtistDetailsResponse {
    artist: Artist;
    credits: Record<string, Credit[]>;
    albums: AlbumSummary[];
    labels: string[];
    totalTracks: number;
}

export interface AlbumSummary {
    album: string;
    release_mbid?: string;
    title?: string;
    release_date?: string;
    track_year?: number;
    primary_type?: string;
    label_name?: string;
    art_path?: string;
    sample_track_id?: number;
}

export interface ScanStatus {
    isScanning: boolean;
    processedCount: number;
    currentFile: string;
}

export interface EnrichStatus {
    current: string;
    progress: number;
    total: number;
    status: 'idle' | 'running' | 'complete';
}

// ============================================
// Playback State Types
// ============================================

export type RepeatMode = 'off' | 'all' | 'one';
export type ViewTab = 'home' | 'tracks' | 'albums' | 'artists' | 'playlists' | 'search' | 'settings';
export type LibraryView = 'tracks' | 'albums' | 'artists';
export type AlbumSort = 'artist' | 'title' | 'year' | 'recent';
export type Theme = 'dark' | 'light';

export interface PlaybackState {
    currentTrackIndex: number;
    isPlaying: boolean;
    volume: number;
    shuffleMode: boolean;
    repeatMode: RepeatMode;
}

// ============================================
// Component Prop Types
// ============================================

export interface TrackRowProps {
    track: Track;
    index: number;
    isActive: boolean;
    onPlay: (index: number) => void;
    onFavorite: (id: number) => void;
}

export interface AlbumCardProps {
    album: string;
    artist: string;
    trackId: number;
    onClick: () => void;
}

export interface ArtistCardProps {
    artist: Artist;
    onClick: () => void;
}
