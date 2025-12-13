/**
 * Discogs API Integration
 * Fallback for albums not found in MusicBrainz
 * 
 * Provides: genres, styles (descriptors), year, label, country
 */

import axios from 'axios';
import { getSetting } from './db';

const DISCOGS_API_BASE = 'https://api.discogs.com';
const USER_AGENT = 'OpenStream/1.0 +https://github.com/openstream';

// Rate limiter
let lastDiscogsRequest = 0;
const DISCOGS_MIN_INTERVAL = 1100; // 1 request per second

interface DiscogsRelease {
    id: number;
    title: string;
    year?: number;
    country?: string;
    genres?: string[];
    styles?: string[];
    labels?: { name: string; catno?: string }[];
    artists?: { name: string; id: number }[];
    tracklist?: { position: string; title: string; duration?: string }[];
    images?: { type: string; uri: string; uri150: string }[];
    master_id?: number;
}

interface DiscogsSearchResult {
    id: number;
    title: string;
    year?: string;
    country?: string;
    genre?: string[];
    style?: string[];
    label?: string[];
    type: string;
    cover_image?: string;
    thumb?: string;
}

interface DiscogsSearchResponse {
    pagination: { items: number; page: number; pages: number };
    results: DiscogsSearchResult[];
}

/**
 * Get Discogs API credentials
 */
function getCredentials(): { key: string; secret: string } | null {
    const key = getSetting('discogs_consumer_key');
    const secret = getSetting('discogs_consumer_secret');

    if (!key || !secret) {
        return null;
    }

    return { key, secret };
}

/**
 * Rate-limited Discogs request
 */
async function discogsRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    const credentials = getCredentials();

    // Rate limiting
    const now = Date.now();
    const timeSince = now - lastDiscogsRequest;
    if (timeSince < DISCOGS_MIN_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, DISCOGS_MIN_INTERVAL - timeSince));
    }
    lastDiscogsRequest = Date.now();

    try {
        const queryParams = new URLSearchParams(params);

        // Add auth if available
        if (credentials) {
            queryParams.set('key', credentials.key);
            queryParams.set('secret', credentials.secret);
        }

        const url = `${DISCOGS_API_BASE}${endpoint}?${queryParams.toString()}`;

        const res = await axios.get<T>(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        return res.data;
    } catch (err) {
        console.error(`Discogs API error for ${endpoint}:`, (err as Error).message);
        return null;
    }
}

/**
 * Search Discogs for a release by artist and album
 */
export async function searchRelease(artist: string, album: string): Promise<DiscogsSearchResult | null> {
    const query = `${artist} ${album}`.replace(/['"]/g, '');

    const result = await discogsRequest<DiscogsSearchResponse>('/database/search', {
        q: query,
        type: 'release',
        per_page: '5'
    });

    if (!result || result.results.length === 0) {
        return null;
    }

    // Find best match - prefer releases with genres
    const withGenres = result.results.filter(r => r.genre && r.genre.length > 0);
    if (withGenres.length > 0) {
        return withGenres[0];
    }

    return result.results[0];
}

/**
 * Get full release details from Discogs
 */
export async function getReleaseDetails(releaseId: number): Promise<DiscogsRelease | null> {
    return await discogsRequest<DiscogsRelease>(`/releases/${releaseId}`);
}

/**
 * Extract metadata from Discogs release
 */
export function extractMetadata(release: DiscogsRelease): {
    genres: string[];
    styles: string[];
    year: number | null;
    label: string | null;
    country: string | null;
} {
    return {
        genres: release.genres || [],
        styles: release.styles || [], // These are like RYM descriptors
        year: release.year || null,
        label: release.labels?.[0]?.name || null,
        country: release.country || null
    };
}

/**
 * Search and get metadata in one call
 */
export async function getAlbumMetadata(artist: string, album: string): Promise<{
    found: boolean;
    genres: string[];
    styles: string[];
    year: number | null;
    label: string | null;
    country: string | null;
    discogsId: number | null;
} | null> {
    const searchResult = await searchRelease(artist, album);

    if (!searchResult) {
        return { found: false, genres: [], styles: [], year: null, label: null, country: null, discogsId: null };
    }

    // Quick metadata from search result
    const quickMeta = {
        found: true,
        genres: searchResult.genre || [],
        styles: searchResult.style || [],
        year: searchResult.year ? parseInt(searchResult.year) : null,
        label: searchResult.label?.[0] || null,
        country: searchResult.country || null,
        discogsId: searchResult.id
    };

    // If we got genres from search, that's often enough
    if (quickMeta.genres.length > 0 && quickMeta.styles.length > 0) {
        return quickMeta;
    }

    // Otherwise fetch full release for more details
    const full = await getReleaseDetails(searchResult.id);
    if (full) {
        const meta = extractMetadata(full);
        return {
            found: true,
            genres: meta.genres.length > 0 ? meta.genres : quickMeta.genres,
            styles: meta.styles.length > 0 ? meta.styles : quickMeta.styles,
            year: meta.year || quickMeta.year,
            label: meta.label || quickMeta.label,
            country: meta.country || quickMeta.country,
            discogsId: searchResult.id
        };
    }

    return quickMeta;
}

export default {
    searchRelease,
    getReleaseDetails,
    getAlbumMetadata,
    extractMetadata
};
