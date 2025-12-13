/**
 * MusicBrainz Service Module
 * Handles metadata enrichment from MusicBrainz API
 */

import { MusicBrainzApi } from 'musicbrainz-api';
import db from './db';
import type { Track, Artist as ArtistType, Release, Credit, Label } from '../types';
import * as lastfm from './lastfm';
import * as discogs from './discogs';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Types for MusicBrainz API responses
interface MBRecording {
    id: string;
    title: string;
    relations?: MBRelation[];
    releases?: MBRelease[];
    tags?: MBTag[];
    'artist-credit'?: MBArtistCredit[];
}

interface MBRelease {
    id: string;
    title: string;
    date?: string;
    country?: string;
    barcode?: string;
    status?: string;
    packaging?: string;
    'label-info'?: { label?: MBLabel; 'catalog-number'?: string }[];
    'release-group'?: { 'primary-type'?: string };
    tags?: MBTag[];
    description?: string;
}

interface MBArtist {
    id: string;
    name: string;
    'sort-name'?: string;
    disambiguation?: string;
    type?: string;
    country?: string;
    'life-span'?: { begin?: string; end?: string };
    tags?: MBTag[];
}

interface MBLabel {
    id: string;
    name: string;
    type?: string;
    country?: string;
    'life-span'?: { begin?: string };
}

interface MBRelation {
    type: string;
    artist?: MBArtist;
    attributes?: string[];
    'attribute-values'?: Record<string, string>;
}

interface MBArtistCredit {
    artist: MBArtist;
}

interface MBTag {
    name: string;
    count?: number;
}

// Initialize MusicBrainz API client
const mbApi = new MusicBrainzApi({
    appName: 'OpenStream',
    appVersion: '1.0.0',
    appContactInfo: 'openstream@localhost'
});

// Enrichment status
interface EnrichmentStatus {
    isEnriching: boolean;
    total: number;
    processed: number;
    currentTrack: string | null;
    errors: { track: string; error: string }[];
    mode: 'track' | 'album'; // Track which mode we're using
    albumsTotal?: number;
    albumsProcessed?: number;
}

let enrichmentStatus: EnrichmentStatus = {
    isEnriching: false,
    total: 0,
    processed: 0,
    currentTrack: null,
    errors: [],
    mode: 'track'
};

// Cache for fetched releases to avoid duplicate API calls
const releaseCache = new Map<string, MBRelease>();
const artistCache = new Map<string, MBArtist>();
// Session caches for expensive external API calls (Wikipedia, release-group tags)
const wikiDescriptionCache = new Map<string, string | null>(); // album_artist -> description
const releaseGroupTagsCache = new Map<string, MBTag[]>(); // release-group-id -> tags

// Rate limiter for parallel workers
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second (MusicBrainz allows 1 req/sec)

async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();
    return fn();
}

/**
 * Clean up search terms by removing parenthetical suffixes, edition info, etc.
 * Beets-style cleaning for better MusicBrainz matching
 */
function cleanSearchTerm(term: string): string {
    return term
        // Remove slash-separated editions: (Remastered 2003/Rudy Van Gelder Edition)
        .replace(/\s*\([^)]*\/[^)]*\)/gi, '')
        // Remove common parenthetical suffixes
        .replace(/\s*\(\d{4}\s*Remaster(ed)?\)/gi, '')
        .replace(/\s*\(Remaster(ed)?\s*\d{0,4}\)/gi, '')
        .replace(/\s*\(Album Version\)/gi, '')
        .replace(/\s*\(Mono|Stereo\)/gi, '')
        .replace(/\s*\(Single Version\)/gi, '')
        .replace(/\s*\(Radio Edit\)/gi, '')
        .replace(/\s*\(Extended.*?\)/gi, '')
        .replace(/\s*\(Original.*?\)/gi, '')
        .replace(/\s*\(Live.*?\)/gi, '')
        .replace(/\s*\(Deluxe.*?\)/gi, '')
        .replace(/\s*\(Bonus.*?\)/gi, '')
        .replace(/\s*\(Anniversary.*?\)/gi, '')
        .replace(/\s*\(feat\..*?\)/gi, '')
        .replace(/\s*\(ft\..*?\)/gi, '')
        .replace(/\s*\(with .*?\)/gi, '')
        // Remove trailing formats
        .replace(/\s*-\s*Remaster(ed)?$/gi, '')
        .replace(/\s*-\s*\d{4}\s*Remaster(ed)?$/gi, '')
        .replace(/\s*-\s*\d{4}\s*Digital Remaster$/gi, '')
        // Remove bracketed location/date: [London 03.06.17]
        .replace(/\s*\[[^\]]*\d{2}\.\d{2}\.\d{2,4}[^\]]*\]/gi, '')
        .replace(/\s*\[.*?\]/gi, '')
        // Remove trailing year
        .replace(/\s+\d{4}$/, '')
        .trim();
}

/**
 * Normalize artist name for fuzzy matching
 */
function normalizeArtist(artist: string): string {
    return artist
        .toLowerCase()
        .replace(/^the\s+/i, '')
        .replace(/['']/g, "'")
        .replace(/[&]/g, 'and')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculate string similarity (0-1) using Dice coefficient
 */
function calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0;

    const getBigrams = (s: string) => {
        const bigrams = new Set<string>();
        for (let i = 0; i < s.length - 1; i++) bigrams.add(s.substring(i, i + 2));
        return bigrams;
    };

    const bigrams1 = getBigrams(s1);
    const bigrams2 = getBigrams(s2);
    let intersection = 0;
    for (const bg of bigrams1) if (bigrams2.has(bg)) intersection++;
    return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

/**
 * Search MusicBrainz for a recording by metadata
 * Uses fuzzy matching and multiple search strategies
 */
export async function searchRecording(
    artist: string,
    title: string,
    album?: string
): Promise<MBRecording | null> {
    try {
        const cleanTitle = cleanSearchTerm(title);
        const cleanAlbum = album ? cleanSearchTerm(album) : undefined;
        const normalizedArtist = normalizeArtist(artist);

        // Strategy 1: Cleaned search with album, score results
        let query = `recording:"${cleanTitle}" AND artist:"${artist}"${cleanAlbum ? ` AND release:"${cleanAlbum}"` : ''}`;
        let result = await mbApi.search('recording', { query, limit: 10 });

        if (result.recordings && result.recordings.length > 0) {
            const recordings = result.recordings as unknown as MBRecording[];
            let bestMatch: MBRecording | null = null;
            let bestScore = 0;

            for (const rec of recordings) {
                const titleSim = calculateStringSimilarity(cleanTitle, rec.title);
                const artistSim = rec['artist-credit']?.[0]?.artist
                    ? calculateStringSimilarity(normalizedArtist, normalizeArtist(rec['artist-credit'][0].artist.name))
                    : 0;
                const score = (titleSim * 0.6) + (artistSim * 0.4);
                if (score > bestScore && score > 0.6) {
                    bestScore = score;
                    bestMatch = rec;
                }
            }
            if (bestMatch) return bestMatch;
        }

        // Strategy 2: Without album filter
        if (cleanAlbum) {
            query = `recording:"${cleanTitle}" AND artist:"${artist}"`;
            result = await mbApi.search('recording', { query, limit: 10 });
            if (result.recordings && result.recordings.length > 0) {
                return result.recordings[0] as unknown as MBRecording;
            }
        }

        // Strategy 3: Fuzzy search without quotes
        query = `recording:${cleanTitle.replace(/['"]/g, '')} AND artist:${artist.replace(/['"]/g, '')}`;
        result = await mbApi.search('recording', { query, limit: 5 });
        if (result.recordings && result.recordings.length > 0) {
            return result.recordings[0] as unknown as MBRecording;
        }

        return null;
    } catch (err) {
        console.error(`MusicBrainz search error for "${title}":`, (err as Error).message);
        return null;
    }
}

/**
 * Get full recording details including artist-rels (credits)
 */
export async function getRecordingDetails(mbid: string): Promise<MBRecording | null> {
    try {
        const recording = await mbApi.lookup('recording', mbid, [
            'artists',
            'artist-rels',
            'work-rels',
            'releases',
            'tags',
            'genres'
        ]);
        return recording as unknown as MBRecording;
    } catch (err) {
        console.error(`Failed to get recording details for ${mbid}:`, (err as Error).message);
        return null;
    }
}

/**
 * Get full release (album) details including credits
 */
export async function getReleaseDetails(mbid: string): Promise<MBRelease | null> {
    try {
        const release = await mbApi.lookup('release', mbid, [
            'artists',
            'artist-rels',
            'labels',
            'recordings',
            'release-groups',
            'tags',
            'genres'
        ]);
        return release as MBRelease;
    } catch (err) {
        console.error(`Failed to get release details for ${mbid}:`, (err as Error).message);
        return null;
    }
}

/**
 * Get artist details
 */
export async function getArtistDetails(mbid: string): Promise<MBArtist | null> {
    try {
        const artist = await mbApi.lookup('artist', mbid, [
            'releases',
            'release-groups',
            'works',
            'tags',
            'genres'
        ]);
        return artist as MBArtist;
    } catch (err) {
        console.error(`Failed to get artist details for ${mbid}:`, (err as Error).message);
        return null;
    }
}

/**
 * Store or update an artist in the database
 * Checks by name first to prevent duplicates, then by mbid
 */
export function upsertArtist(artistData: MBArtist | null): number | null {
    if (!artistData || !artistData.name) return null;

    // First check by name to avoid duplicates
    const existingByName = db.prepare('SELECT id, mbid FROM artists WHERE name = ?').get(artistData.name) as { id: number; mbid: string | null } | undefined;

    if (existingByName) {
        // Update with new data if we have more info (like mbid or description)
        if (artistData.id && !existingByName.mbid) {
            db.prepare(`UPDATE artists SET mbid = ?, sort_name = ?, disambiguation = ?, type = ?, country = ? WHERE id = ?`)
                .run(artistData.id, artistData['sort-name'] || artistData.name, artistData.disambiguation || null, artistData.type || null, artistData.country || null, existingByName.id);
        }
        return existingByName.id;
    }

    // Also check by mbid if not found by name
    if (artistData.id) {
        const existingByMbid = db.prepare('SELECT id FROM artists WHERE mbid = ?').get(artistData.id) as { id: number } | undefined;
        if (existingByMbid) return existingByMbid.id;
    }

    // Insert new artist
    const result = db.prepare(`
        INSERT INTO artists (mbid, name, sort_name, disambiguation, type, country)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        artistData.id || null,
        artistData.name,
        artistData['sort-name'] || artistData.name,
        artistData.disambiguation || null,
        artistData.type || null,
        artistData.country || null
    );

    return Number(result.lastInsertRowid);
}

/**
 * Map MusicBrainz relation type to human-readable role
 */
function mapRelationType(type?: string): string {
    const typeMap: Record<string, string> = {
        'producer': 'Producer',
        'engineer': 'Engineer',
        'mix': 'Mixer',
        'mastering': 'Mastering Engineer',
        'recording': 'Recording Engineer',
        'instrument': 'Performer',
        'vocal': 'Vocals',
        'performer': 'Performer',
        'composer': 'Composer',
        'lyricist': 'Lyricist',
        'writer': 'Writer',
        'arranger': 'Arranger',
        'orchestrator': 'Orchestrator',
        'conductor': 'Conductor',
        'remixer': 'Remixer',
        'programming': 'Programming',
        'chorus master': 'Chorus Master',
        'concertmaster': 'Concertmaster',
        'instrumentator': 'Instrumentator',
        'librettist': 'Librettist',
        'translator': 'Translator'
    };

    return typeMap[type?.toLowerCase() || ''] || type || 'Contributor';
}

/**
 * Fetch album description from Wikipedia API
 * Tries multiple title variations for best match
 */
async function fetchWikipediaDescription(albumTitle: string, artistName: string): Promise<string | null> {
    const cacheKey = `${albumTitle.toLowerCase()}|||${artistName.toLowerCase()}`;

    // Check cache first
    if (wikiDescriptionCache.has(cacheKey)) {
        return wikiDescriptionCache.get(cacheKey) || null;
    }

    const cleanedAlbum = cleanSearchTerm(albumTitle);

    // Extract primary artist name (remove "Trio", "Quartet", "Band", etc.)
    const primaryArtist = artistName
        .replace(/\s+(Trio|Quartet|Quintet|Sextet|Band|Orchestra|Ensemble|Group)$/i, '')
        .trim();

    // Try different Wikipedia title patterns (order matters - most specific first)
    const titlePatterns = [
        `${cleanedAlbum}_(${primaryArtist}_album)`,    // Ahmad_Jamal album
        `${cleanedAlbum}_(${artistName}_album)`,       // Full artist name album  
        `${cleanedAlbum}_(album)`,                     // Generic album suffix
        `${cleanedAlbum}_(music_album)`,               // Music album disambiguation
        `${cleanedAlbum}_(${primaryArtist})`,          // Just artist name in parens
        cleanedAlbum,                                  // Just the album name (last resort)
    ];

    for (const pattern of titlePatterns) {
        try {
            const encoded = encodeURIComponent(pattern.replace(/\s+/g, '_'));
            const res = await axios.get(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
                {
                    timeout: 5000,
                    headers: { 'User-Agent': 'OpenStream/1.0' }
                }
            );

            if (res.data && res.data.extract && res.data.type !== 'disambiguation') {
                console.log(`[Wikipedia] Found description for "${albumTitle}" via pattern: ${pattern}`);
                wikiDescriptionCache.set(cacheKey, res.data.extract);
                return res.data.extract;
            }
        } catch (e) {
            // Try next pattern
        }
    }

    console.log(`[Wikipedia] No description found for "${albumTitle}" by ${artistName}`);
    wikiDescriptionCache.set(cacheKey, null);
    return null;
}

/**
 * Fetch release-group tags from MusicBrainz
 * Returns all tags (not limited) for richer metadata
 */
async function fetchReleaseGroupTags(releaseGroupId: string): Promise<MBTag[]> {
    // Check cache first
    if (releaseGroupTagsCache.has(releaseGroupId)) {
        return releaseGroupTagsCache.get(releaseGroupId) || [];
    }

    try {
        const url = `https://musicbrainz.org/ws/2/release-group/${releaseGroupId}?fmt=json&inc=tags+genres`;
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'OpenStream/1.0' },
            timeout: 5000
        });

        // Combine tags and genres (genres are a subset of tags in MB)
        const tags: MBTag[] = [];
        if (res.data.tags) {
            tags.push(...res.data.tags);
        }
        if (res.data.genres) {
            for (const genre of res.data.genres) {
                if (!tags.find(t => t.name === genre.name)) {
                    tags.push({ name: genre.name, count: genre.count });
                }
            }
        }

        console.log(`[MusicBrainz] Found ${tags.length} tags for release-group ${releaseGroupId}`);
        const sortedTags = tags.sort((a, b) => (b.count || 0) - (a.count || 0));
        releaseGroupTagsCache.set(releaseGroupId, sortedTags);
        return sortedTags;
    } catch (e) {
        console.error(`[MusicBrainz] Failed to fetch release-group tags:`, (e as Error).message);
        return [];
    }
}

/**
 * Store credits from MusicBrainz relations
 */
function storeCredits(trackId: number, relations: MBRelation[]): void {
    if (!relations || !Array.isArray(relations)) return;

    const insertCredit = db.prepare(`
    INSERT INTO credits (track_id, name, role, artist_mbid, instrument, attributes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

    for (const rel of relations) {
        if (rel.artist) {
            let role = mapRelationType(rel.type);
            let instrument: string | null = null;
            let attributes: string | null = null;

            if (rel.attributes && rel.attributes.length > 0) {
                instrument = rel.attributes.join(', ');
                if (role === 'Performer') {
                    role = instrument;
                }
            }

            if (rel['attribute-values']) {
                attributes = JSON.stringify(rel['attribute-values']);
            }

            try {
                insertCredit.run(
                    trackId,
                    rel.artist.name,
                    role,
                    rel.artist.id,
                    instrument,
                    attributes
                );
                upsertArtist(rel.artist);
            } catch (e) {
                // Possibly duplicate, ignore
            }
        }
    }
}

/**
 * Upsert a Tag and link it to an entity
 * Optimized with prepared statement caching and conflict handling
 */
// Cached prepared statements for tag operations
const preparedStatements = {
    selectTag: db.prepare('SELECT id FROM tags WHERE name = ?'),
    insertTag: db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)'),
    insertEntityTag: db.prepare(`
        INSERT OR IGNORE INTO entity_tags (entity_type, entity_id, tag_id, count)
        VALUES (?, ?, ?, ?)
    `),
};

function storeEntityTags(entityType: string, entityId: number | null, tags: MBTag[]): void {
    if (!tags || !tags.length || !entityId) return;

    // Sort by count but keep ALL tags (no limit)
    const sortedTags = tags.sort((a, b) => (b.count || 0) - (a.count || 0));

    for (const tag of sortedTags) {
        // Insert tag if not exists
        preparedStatements.insertTag.run(tag.name);

        // Get tag ID (will exist after INSERT OR IGNORE)
        const existingTag = preparedStatements.selectTag.get(tag.name) as { id: number } | undefined;
        if (!existingTag) continue;

        // Link tag to entity (ignore duplicates)
        preparedStatements.insertEntityTag.run(entityType, entityId, existingTag.id, tag.count || 1);
    }
}

/**
 * Upsert Label
 */
function upsertLabel(labelData: MBLabel): number | null {
    if (!labelData || !labelData.id) return null;

    const existing = db.prepare('SELECT id FROM labels WHERE mbid = ?').get(labelData.id) as { id: number } | undefined;
    if (existing) return existing.id;

    const info = db.prepare(`
    INSERT INTO labels (mbid, name, type, country, founded)
    VALUES (?, ?, ?, ?, ?)
  `).run(
        labelData.id,
        labelData.name,
        labelData.type,
        labelData.country,
        labelData['life-span']?.begin || null
    );

    return Number(info.lastInsertRowid);
}

/**
 * Upsert Release (Album)
 */
function upsertRelease(releaseData: MBRelease): number | null {
    if (!releaseData || !releaseData.id) return null;

    // Check if release exists
    const existing = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(releaseData.id) as { id: number } | undefined;

    // Always update description if we have new data (for re-enrichment)
    if (existing && releaseData.description) {
        db.prepare('UPDATE releases SET description = ? WHERE id = ?').run(releaseData.description, existing.id);
        return existing.id;
    } else if (existing) {
        return existing.id;
    }

    let labelMbid: string | null = null;
    if (releaseData['label-info'] && releaseData['label-info'].length > 0) {
        const li = releaseData['label-info'][0];
        if (li.label) {
            upsertLabel(li.label);
            labelMbid = li.label.id;
        }
    }

    db.prepare(`
    INSERT INTO releases (mbid, title, release_date, country, barcode, label_mbid, status, packaging, description, primary_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mbid) DO UPDATE SET description = excluded.description, primary_type = COALESCE(excluded.primary_type, releases.primary_type)
  `).run(
        releaseData.id,
        releaseData.title,
        releaseData.date,
        releaseData.country,
        releaseData.barcode,
        labelMbid,
        releaseData.status,
        releaseData.packaging,
        releaseData.description || null,
        releaseData['release-group']?.['primary-type'] || null
    );

    // Re-query to get correct ID (lastInsertRowid is unreliable with ON CONFLICT DO UPDATE)
    const inserted = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(releaseData.id) as { id: number } | undefined;
    return inserted ? inserted.id : null;
}

/**
 * Fetch and store cover art with multi-source fallbacks:
 * 1. CoverArtArchive - release-specific
 * 2. CoverArtArchive - release-group (fallback)
 * 3. Also sets has_art on tracks for this release
 */
async function fetchAndStoreCoverArt(mbid: string, releaseGroupId?: string): Promise<void> {
    if (!mbid) return;

    const existing = db.prepare('SELECT COUNT(*) as count FROM album_images WHERE release_mbid = ?').get(mbid) as { count: number };
    if (existing && existing.count > 0) return;

    const artDir = path.join(__dirname, 'storage', 'art');
    if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true });

    let foundArt = false;

    // Strategy 1: Try release-specific art from CoverArtArchive
    try {
        const url = `http://coverartarchive.org/release/${mbid}`;
        const res = await axios.get(url, { validateStatus: () => true, timeout: 10000 });

        if (res.status === 200 && res.data.images && res.data.images.length > 0) {
            foundArt = await downloadCoverArt(res.data.images, mbid, artDir);
        }
    } catch (err) {
        console.log(`[CoverArt] Release-specific art not found for ${mbid}`);
    }

    // Strategy 2: Try release-group art as fallback
    if (!foundArt && releaseGroupId) {
        try {
            const rgUrl = `http://coverartarchive.org/release-group/${releaseGroupId}`;
            const res = await axios.get(rgUrl, { validateStatus: () => true, timeout: 10000 });

            if (res.status === 200 && res.data.images && res.data.images.length > 0) {
                console.log(`[CoverArt] Found release-group art for ${releaseGroupId}`);
                foundArt = await downloadCoverArt(res.data.images, mbid, artDir);
            }
        } catch (err) {
            console.log(`[CoverArt] Release-group art not found for ${releaseGroupId}`);
        }
    }

    // Strategy 3: Get release-group from MusicBrainz if not provided
    if (!foundArt && !releaseGroupId) {
        try {
            const releaseInfo = await mbApi.lookup('release', mbid, ['release-groups']);
            const rgid = (releaseInfo as any)['release-group']?.id;
            if (rgid) {
                const rgUrl = `http://coverartarchive.org/release-group/${rgid}`;
                const res = await axios.get(rgUrl, { validateStatus: () => true, timeout: 10000 });

                if (res.status === 200 && res.data.images && res.data.images.length > 0) {
                    console.log(`[CoverArt] Found release-group art (fetched) for ${rgid}`);
                    foundArt = await downloadCoverArt(res.data.images, mbid, artDir);
                }
            }
        } catch (err) {
            // Final fallback failed
        }
    }

    // Update has_art on all tracks with this release_mbid if we found art
    if (foundArt) {
        db.prepare('UPDATE tracks SET has_art = 1 WHERE release_mbid = ?').run(mbid);
        console.log(`[CoverArt] Set has_art=1 for tracks with release ${mbid}`);
    }
}

/**
 * Helper function to download cover art images
 */
async function downloadCoverArt(images: any[], mbid: string, artDir: string): Promise<boolean> {
    let downloaded = false;

    for (const img of images) {
        const isBack = img.types?.includes('Back');
        const isFront = img.types?.includes('Front');

        if (isBack || isFront) {
            const type = isBack ? 'back' : 'front';
            const ext = path.extname(img.image) || '.jpg';
            const filename = `${mbid}_${type}${ext}`;
            const localPath = path.join(artDir, filename);

            try {
                const writer = fs.createWriteStream(localPath);
                const response = await axios({
                    url: img.image,
                    method: 'GET',
                    responseType: 'stream',
                    timeout: 30000
                });

                response.data.pipe(writer);

                await new Promise<void>((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                try {
                    db.prepare(`
                        INSERT INTO album_images (release_mbid, type, path, source)
                        VALUES (?, ?, ?, 'coverartarchive')
                    `).run(mbid, type, localPath);
                } catch (e) { }

                // Also save as track art for first track with this release
                if (isFront) {
                    const firstTrack = db.prepare('SELECT id FROM tracks WHERE release_mbid = ? LIMIT 1').get(mbid) as { id: number } | undefined;
                    if (firstTrack) {
                        const trackArtPath = path.join(artDir, `${firstTrack.id}.jpg`);
                        fs.copyFileSync(localPath, trackArtPath);
                    }
                }

                downloaded = true;
            } catch (e) {
                console.error(`[CoverArt] Failed to download ${type} art:`, (e as Error).message);
            }
        }
    }

    return downloaded;
}

/**
 * Enrich a single track with MusicBrainz data
 */
export async function enrichTrack(track: Track): Promise<{ success: boolean; mbid?: string; reason?: string }> {
    // 1. FETCH PHASE - Try MusicBrainz first
    const recording = await searchRecording(track.artist, track.title, track.album);

    // If MusicBrainz fails, try Discogs as fallback
    if (!recording) {
        if (track.album) {
            try {
                const discogsData = await discogs.getAlbumMetadata(track.artist, track.album);
                if (discogsData && discogsData.found && (discogsData.genres.length > 0 || discogsData.styles.length > 0)) {
                    // Store Discogs metadata
                    const genre = discogsData.genres[0] || null;
                    const styles = discogsData.styles.slice(0, 3).join(', ') || null; // Descriptors

                    db.prepare(`
                        UPDATE tracks SET
                            genre = COALESCE(genre, ?),
                            mood = COALESCE(mood, ?),
                            year = COALESCE(year, ?),
                            enriched = 1
                        WHERE id = ?
                    `).run(genre, styles, discogsData.year, track.id);

                    // Store styles as tags using proper tag_id reference
                    if (discogsData.styles.length > 0) {
                        for (const style of discogsData.styles) {
                            const styleName = style.toLowerCase();
                            // Find or create tag
                            let tagId: number;
                            const existingTag = db.prepare('SELECT id FROM tags WHERE name = ?').get(styleName) as { id: number } | undefined;
                            if (existingTag) {
                                tagId = existingTag.id;
                            } else {
                                const info = db.prepare('INSERT INTO tags (name) VALUES (?)').run(styleName);
                                tagId = Number(info.lastInsertRowid);
                            }
                            // Link tag to track
                            try {
                                db.prepare('INSERT INTO entity_tags (entity_type, entity_id, tag_id, count) VALUES (?, ?, ?, ?)').run('track', track.id, tagId, 1);
                            } catch (e) { /* already exists */ }
                        }
                    }

                    console.log(`[Discogs] Enriched: ${track.artist} - ${track.title} (genres: ${discogsData.genres.join(', ')})`);
                    return { success: true, reason: 'Discogs fallback' };
                }
            } catch (e) {
                console.error(`Discogs fallback error for ${track.title}:`, (e as Error).message);
            }
        }
        return { success: false, reason: 'No match found (MB + Discogs)' };
    }

    const details = await getRecordingDetails(recording.id);
    if (!details) return { success: false, reason: 'Failed to fetch details' };

    let matchedRelease: MBRelease | null = null;
    let releaseFull: MBRelease | null = null;

    if (track.album && details.releases && details.releases.length > 0) {
        matchedRelease = details.releases.find(r => r.title.toLowerCase() === track.album.toLowerCase()) || details.releases[0];
        if (matchedRelease) {
            releaseFull = await getReleaseDetails(matchedRelease.id);
        }
    }

    let artistFull: MBArtist | null = null;
    if (details['artist-credit'] && details['artist-credit'][0]?.artist) {
        const mainArtistMbid = details['artist-credit'][0].artist.id;
        artistFull = await getArtistDetails(mainArtistMbid);
    }

    // Last.fm data
    let lfmArtistTags: lastfm.LastFmTag[] = [];
    if (details['artist-credit'] && details['artist-credit'][0]?.artist) {
        try {
            lfmArtistTags = await lastfm.getArtistTags(track.artist);
        } catch (e) { }
    }

    let lfmAlbumTags: lastfm.LastFmTag[] = [];
    let lfmDescription: string | null = null;
    if (track.album) {
        try {
            lfmAlbumTags = await lastfm.getAlbumTags(track.artist, track.album);
            lfmDescription = await lastfm.getAlbumInfo(track.artist, track.album);
        } catch (e) { }
    }

    // Wikipedia description (prioritize over Last.fm)
    let wikiDescription: string | null = null;
    if (track.album) {
        try {
            wikiDescription = await fetchWikipediaDescription(track.album, track.artist);
        } catch (e) { }
    }

    // Release-group tags (richer than release tags)
    let releaseGroupTags: MBTag[] = [];
    if (releaseFull && (releaseFull as any)['release-group']?.id) {
        try {
            releaseGroupTags = await fetchReleaseGroupTags((releaseFull as any)['release-group'].id);
        } catch (e) { }
    }

    // 2. WRITE PHASE (Transaction)
    const txn = db.transaction(() => {
        // Compute genre from all tags (use first tag as primary genre)
        const allTags = [
            ...releaseGroupTags,  // Release-group tags first (best quality)
            ...(details.tags || []),
            ...(releaseFull?.tags || []),
            ...(artistFull?.tags || []),
            ...lfmAlbumTags,
            ...lfmArtistTags
        ];
        const genreTag = allTags.find(t => t.name && t.name.length > 0)?.name || null;

        // Update track with mbid, enriched flag, and genre
        db.prepare(`
            UPDATE tracks SET 
                mbid = ?, 
                enriched = 1,
                genre = COALESCE(genre, ?)
            WHERE id = ?
        `).run(recording.id, genreTag, track.id);

        if (details.relations) storeCredits(track.id, details.relations);
        if (details.tags) storeEntityTags('track', track.id, details.tags);

        if (releaseFull) {
            // Use Wikipedia description if available, fallback to Last.fm
            releaseFull.description = wikiDescription || lfmDescription || undefined;
            const releaseId = upsertRelease(releaseFull);

            db.prepare('UPDATE tracks SET release_mbid = ? WHERE id = ?').run(releaseFull.id, track.id);

            // Store all tags from all sources
            if (releaseGroupTags.length > 0) storeEntityTags('release', releaseId, releaseGroupTags);
            if (releaseFull.tags) storeEntityTags('release', releaseId, releaseFull.tags);
            if (lfmAlbumTags.length > 0) storeEntityTags('release', releaseId, lfmAlbumTags);
        }

        if (artistFull) {
            const artistId = upsertArtist(artistFull);
            if (artistFull.tags) storeEntityTags('artist', artistId, artistFull.tags);
            if (lfmArtistTags.length > 0) storeEntityTags('artist', artistId, lfmArtistTags);
        }
    });

    try {
        txn();
    } catch (err) {
        console.error("Transaction failed for track " + track.id, err);
        return { success: false, reason: "Database error during write" };
    }

    // 3. POST-TRANSACTION (External resources) - fire-and-forget, don't block enrichment
    if (matchedRelease) {
        fetchAndStoreCoverArt(matchedRelease.id).catch(e =>
            console.error(`Cover art fetch error: ${(e as Error).message}`)
        );
    }

    return { success: true, mbid: recording.id };
}

/**
 * Background enrichment worker
 */
export async function startEnrichment(): Promise<{ error?: string; message?: string; processed?: number; errors?: number }> {
    if (enrichmentStatus.isEnriching) {
        return { error: 'Enrichment already in progress' };
    }

    const tracks = db.prepare('SELECT * FROM tracks WHERE enriched IS NULL OR enriched = 0').all() as Track[];

    if (tracks.length === 0) {
        return { message: 'All tracks already enriched' };
    }

    enrichmentStatus = {
        isEnriching: true,
        total: tracks.length,
        processed: 0,
        currentTrack: null,
        errors: [],
        mode: 'track'
    };

    console.log(`Starting MusicBrainz enrichment for ${tracks.length} tracks...`);

    for (const track of tracks) {
        enrichmentStatus.currentTrack = `${track.artist} - ${track.title}`;

        try {
            const result = await enrichTrack(track);
            if (!result.success) {
                enrichmentStatus.errors.push({
                    track: `${track.artist} - ${track.title}`,
                    error: result.reason || 'Unknown error'
                });
            }
        } catch (err) {
            enrichmentStatus.errors.push({
                track: `${track.artist} - ${track.title}`,
                error: (err as Error).message
            });
        }

        enrichmentStatus.processed++;
        await new Promise(resolve => setTimeout(resolve, 1100));
    }

    enrichmentStatus.isEnriching = false;
    enrichmentStatus.currentTrack = null;

    console.log(`Enrichment complete. ${enrichmentStatus.processed} tracks processed.`);

    return {
        processed: enrichmentStatus.processed,
        errors: enrichmentStatus.errors.length
    };
}

/**
 * Get enrichment status
 */
export function getEnrichmentStatus(): EnrichmentStatus {
    return enrichmentStatus;
}

/**
 * Album-based enrichment - groups tracks by album and uses parallel workers
 * This is ~10x faster than per-track enrichment
 */
export async function startAlbumEnrichment(workerCount: number = 3): Promise<{ error?: string; message?: string; processed?: number; errors?: number; albumsProcessed?: number }> {
    if (enrichmentStatus.isEnriching) {
        return { error: 'Enrichment already in progress' };
    }

    // Get all unenriched tracks grouped by album
    // OPTIMIZATION: Prioritize albums with art (more likely to be complete/high-quality)
    const tracks = db.prepare(`
        SELECT * FROM tracks 
        WHERE enriched IS NULL OR enriched = 0 
        ORDER BY 
            CASE WHEN has_art = 1 THEN 0 ELSE 1 END,
            CASE WHEN genre IS NOT NULL THEN 0 ELSE 1 END,
            album, artist
    `).all() as Track[];

    if (tracks.length === 0) {
        return { message: 'All tracks already enriched' };
    }

    // Group tracks by album+artist key
    const albumGroups = new Map<string, Track[]>();
    for (const track of tracks) {
        const key = `${track.artist}|||${track.album}`;
        if (!albumGroups.has(key)) {
            albumGroups.set(key, []);
        }
        albumGroups.get(key)!.push(track);
    }

    const albums = Array.from(albumGroups.entries());

    // OPTIMIZATION: Dynamic worker count based on library size
    // More workers for larger libraries, up to 8
    const dynamicWorkerCount = Math.min(8, Math.max(workerCount, Math.ceil(albums.length / 50)));
    console.log(`Starting album-based enrichment: ${tracks.length} tracks in ${albums.length} albums with ${dynamicWorkerCount} workers...`);

    // Clear caches for fresh run (including new session caches)
    releaseCache.clear();
    artistCache.clear();
    wikiDescriptionCache.clear();
    releaseGroupTagsCache.clear();

    enrichmentStatus = {
        isEnriching: true,
        total: tracks.length,
        processed: 0,
        currentTrack: null,
        errors: [],
        mode: 'album',
        albumsTotal: albums.length,
        albumsProcessed: 0
    };

    // Process albums with parallel workers
    let albumIndex = 0;

    async function processNextAlbum(): Promise<void> {
        while (albumIndex < albums.length) {
            const currentIndex = albumIndex++;
            const [key, albumTracks] = albums[currentIndex];
            const [artist, album] = key.split('|||');

            enrichmentStatus.currentTrack = `Album: ${artist} - ${album} (${albumTracks.length} tracks)`;

            try {
                // OPTIMIZATION: Start Last.fm in parallel (name-based)
                const lfmArtistPromise = lastfm.getArtistInfo(artist as string).catch(() => null);
                const lfmAlbumPromise = lastfm.getAlbumInfo(artist as string, album as string).catch(() => null);

                let recordingId: string | null = null;

                // SHORTCUT: Use embedded MBID if available (skips search)
                if (albumTracks[0].mbid) {
                    recordingId = albumTracks[0].mbid;
                } else {
                    const searchResult = await rateLimitedRequest(() =>
                        searchRecording(artist, albumTracks[0].title, album)
                    );
                    if (searchResult) recordingId = searchResult.id;
                }

                if (!recordingId) {
                    // Mark all tracks in album as enriched with no data
                    for (const track of albumTracks) {
                        db.prepare('UPDATE tracks SET enriched = 1 WHERE id = ?').run(track.id);
                        enrichmentStatus.processed++;
                    }
                    enrichmentStatus.errors.push({
                        track: `Album: ${artist} - ${album}`,
                        error: 'No match found'
                    });
                    enrichmentStatus.albumsProcessed!++;
                    continue;
                }

                // Get recording details (Credits, Relations)
                const details = await rateLimitedRequest(() => getRecordingDetails(recordingId!));
                if (!details) {
                    for (const track of albumTracks) {
                        db.prepare('UPDATE tracks SET enriched = 1 WHERE id = ?').run(track.id);
                        enrichmentStatus.processed++;
                    }
                    enrichmentStatus.errors.push({
                        track: `Album: ${artist} - ${album}`,
                        error: 'Failed to fetch details'
                    });
                    enrichmentStatus.albumsProcessed!++;
                    continue;
                }

                // Find matching release
                let releaseFull: MBRelease | null = null;

                // SHORTCUT: Use embedded Release MBID
                if (albumTracks[0].release_mbid) {
                    const rId = albumTracks[0].release_mbid;
                    if (releaseCache.has(rId)) {
                        releaseFull = releaseCache.get(rId)!;
                    } else {
                        releaseFull = await rateLimitedRequest(() => getReleaseDetails(rId));
                        if (releaseFull) releaseCache.set(rId, releaseFull);
                    }
                }

                // Fallback: Match release from recording details
                if (!releaseFull && album && details.releases && details.releases.length > 0) {
                    const matchedRelease = details.releases.find(r =>
                        r.title.toLowerCase() === album.toLowerCase()
                    ) || details.releases[0];

                    if (matchedRelease) {
                        // Check cache first
                        if (releaseCache.has(matchedRelease.id)) {
                            releaseFull = releaseCache.get(matchedRelease.id)!;
                        } else {
                            releaseFull = await rateLimitedRequest(() => getReleaseDetails(matchedRelease.id));
                            if (releaseFull) releaseCache.set(matchedRelease.id, releaseFull);
                        }
                    }
                }

                // Get artist details (cached)
                let artistFull: MBArtist | null = null;
                if (details['artist-credit'] && details['artist-credit'][0]?.artist) {
                    const mainArtistMbid = details['artist-credit'][0].artist.id;
                    if (artistCache.has(mainArtistMbid)) {
                        artistFull = artistCache.get(mainArtistMbid)!;
                    } else {
                        artistFull = await rateLimitedRequest(() => getArtistDetails(mainArtistMbid));
                        if (artistFull) artistCache.set(mainArtistMbid, artistFull);
                    }
                }

                // Await Last.fm Parallel Requests
                let lfmArtistBio: { bio: string, image: string } | null = null;
                const lfmInfo = await lfmArtistPromise;
                if (lfmInfo && (lfmInfo.description || lfmInfo.image)) {
                    lfmArtistBio = { bio: lfmInfo.description, image: lfmInfo.image };
                }

                let lfmDescription: string | null = await lfmAlbumPromise;

                // Apply enrichment to all tracks in the album
                // Compute genre from tags
                const allTags = [
                    ...(details.tags || []),
                    ...(releaseFull?.tags || []),
                    ...(artistFull?.tags || [])
                ];
                const genreTag = allTags.find(t => t.name && t.name.length > 0)?.name || null;

                const txn = db.transaction(() => {
                    // Store release once
                    if (releaseFull) {
                        releaseFull.description = lfmDescription || undefined;
                        upsertRelease(releaseFull);
                    }

                    // Store artist once
                    if (artistFull) {
                        const artistId = upsertArtist(artistFull);

                        // Update bio if found and missing
                        if (artistId && lfmArtistBio) {
                            db.prepare(`
                                UPDATE artists 
                                SET description = COALESCE(description, ?), 
                                    image_path = COALESCE(image_path, ?)
                                WHERE id = ?
                            `).run(lfmArtistBio.bio, lfmArtistBio.image, artistId);
                        }
                    }

                    // Update all tracks in this album with genre
                    for (const track of albumTracks) {
                        db.prepare(`
                            UPDATE tracks SET 
                                mbid = ?, 
                                enriched = 1, 
                                release_mbid = ?,
                                genre = COALESCE(genre, ?)
                            WHERE id = ?
                        `).run(recordingId!, releaseFull?.id || null, genreTag, track.id);

                        if (details.relations) storeCredits(track.id, details.relations);
                    }
                });

                try {
                    txn();
                    enrichmentStatus.processed += albumTracks.length;
                } catch (err) {
                    console.error(`Transaction failed for album ${artist} - ${album}:`, err);
                    enrichmentStatus.errors.push({
                        track: `Album: ${artist} - ${album}`,
                        error: 'Database error during write'
                    });
                    enrichmentStatus.processed += albumTracks.length;
                }

                // Fetch cover art (non-blocking)
                if (releaseFull?.id) {
                    fetchAndStoreCoverArt(releaseFull.id).catch(() => { });
                }

                enrichmentStatus.albumsProcessed!++;

            } catch (err) {
                enrichmentStatus.errors.push({
                    track: `Album: ${artist} - ${album}`,
                    error: (err as Error).message
                });
                enrichmentStatus.processed += albumTracks.length;
                enrichmentStatus.albumsProcessed!++;
            }
        }
    }

    // Start parallel workers
    const workers = Array(dynamicWorkerCount).fill(null).map(() => processNextAlbum());
    await Promise.all(workers);

    enrichmentStatus.isEnriching = false;
    enrichmentStatus.currentTrack = null;

    console.log(`Album enrichment complete. ${enrichmentStatus.albumsProcessed} albums (${enrichmentStatus.processed} tracks) processed.`);

    return {
        processed: enrichmentStatus.processed,
        errors: enrichmentStatus.errors.length,
        albumsProcessed: enrichmentStatus.albumsProcessed
    };
}

/**
 * Search MusicBrainz for releases matching album/artist (for manual matching UI)
 */
export async function searchReleases(albumTitle: string, artistName: string): Promise<any[]> {
    try {
        const cleanAlbum = cleanSearchTerm(albumTitle);
        const query = `release:"${cleanAlbum}" AND artist:"${artistName}"`;

        const result = await rateLimitedRequest(() =>
            mbApi.search('release', { query, limit: 10 })
        );

        if (!result.releases) return [];

        // Return simplified release data for UI
        return result.releases.map((rel: any) => ({
            id: rel.id,
            title: rel.title,
            artist: rel['artist-credit']?.[0]?.artist?.name || artistName,
            date: rel.date,
            country: rel.country,
            label: rel['label-info']?.[0]?.label?.name,
            trackCount: rel['track-count'],
            status: rel.status,
            barcode: rel.barcode
        }));
    } catch (e) {
        console.error('MusicBrainz release search error:', e);
        return [];
    }
}

/**
 * Enrich a track using a specific release (for manual matching)
 */
export async function enrichTrackWithRelease(trackId: number, release: MBRelease): Promise<boolean> {
    if (!trackId || !release) return false;

    try {
        // Upsert the release
        const releaseId = upsertRelease(release);

        // Update track with release_mbid
        db.prepare('UPDATE tracks SET release_mbid = ?, enriched = 1 WHERE id = ?')
            .run(release.id, trackId);

        // Store tags if available
        if (release.tags) {
            storeEntityTags('release', releaseId, release.tags);
        }

        // Fetch and store cover art
        fetchAndStoreCoverArt(release.id).catch(e =>
            console.error(`Cover art fetch error: ${(e as Error).message}`)
        );

        return true;
    } catch (e) {
        console.error('Enrich track with release error:', e);
        return false;
    }
}

export default {
    searchRecording,
    getRecordingDetails,
    getReleaseDetails,
    getArtistDetails,
    enrichTrack,
    startEnrichment,
    startAlbumEnrichment,
    getEnrichmentStatus,
    upsertArtist,
    searchReleases,
    enrichTrackWithRelease
};
