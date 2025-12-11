// OpenStream Shared Types
// Used by both client and server

// ============================================
// Core Entities
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

export interface Release {
    id: number;
    mbid?: string;
    title: string;
    artist_credit?: string;
    label_mbid?: string;
    release_date?: string;
    country?: string;
    barcode?: string;
    catalog_number?: string;
    status?: string;
    packaging?: string;
    description?: string;
    primary_type?: string;
}

export interface Label {
    id: number;
    mbid?: string;
    name: string;
    type?: string;
    country?: string;
    founded?: string;
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

export interface Tag {
    id: number;
    name: string;
    count: number;
}


export interface Playlist {
    id: number;
    name: string;
    description?: string;
    is_featured: number;
    pinned_to_home?: number;
    cover_art_path?: string;
    user_id?: number;
    type?: string;
    rules?: string;
    created_at: string;
    updated_at: string;
}

export interface PlaylistTrack {
    id: number;
    playlist_id: number;
    track_id: number;
    position: number;
    added_at: string;
}

export interface ListeningHistoryEntry {
    id: number;
    track_id: number;
    user_id?: number;
    played_at: string;
}

export interface AlbumCollection {
    id: number;
    name: string;
    description?: string;
    pinned_to_home: number;
    cover_art_path?: string;
    user_id?: number;
    is_shared: number;
    created_at: string;
    updated_at: string;
}

export interface CollectionAlbum {
    id: number;
    collection_id: number;
    album_name: string;
    artist_name: string;
    position: number;
    added_at: string;
}

export interface AlbumImage {
    id: number;
    release_mbid?: string;
    entity_type: string;
    type: string;
    path: string;
    source: string;
}

// ============================================
// API Response Types
// ============================================

export interface PaginatedResponse<T> {
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
// Request Types
// ============================================

export interface ScanRequest {
    path: string;
    limit?: number;
}

export interface SearchResult extends Track { }

// ============================================
// Playback State (Client-only)
// ============================================

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackState {
    currentTrackIndex: number;
    isPlaying: boolean;
    volume: number;
    shuffleMode: boolean;
    repeatMode: RepeatMode;
}
