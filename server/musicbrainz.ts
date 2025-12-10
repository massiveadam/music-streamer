/**
 * MusicBrainz Service Module
 * Handles metadata enrichment from MusicBrainz API
 */

import { MusicBrainzApi } from 'musicbrainz-api';
import db from './db';
import type { Track, Artist as ArtistType, Release, Credit, Label } from '../types';
import * as lastfm from './lastfm';
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
}

let enrichmentStatus: EnrichmentStatus = {
    isEnriching: false,
    total: 0,
    processed: 0,
    currentTrack: null,
    errors: []
};

/**
 * Search MusicBrainz for a recording by metadata
 */
export async function searchRecording(
    artist: string,
    title: string,
    album?: string
): Promise<MBRecording | null> {
    try {
        const query = `recording:"${title}" AND artist:"${artist}"${album ? ` AND release:"${album}"` : ''}`;
        const result = await mbApi.search('recording', { query, limit: 5 });

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
 */
export function upsertArtist(artistData: MBArtist | null): number | null {
    if (!artistData || !artistData.id) return null;

    const existing = db.prepare('SELECT id FROM artists WHERE mbid = ?').get(artistData.id) as { id: number } | undefined;
    if (existing) return existing.id;

    const insert = db.prepare(`
    INSERT INTO artists (mbid, name, sort_name, disambiguation, type, country)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

    const result = insert.run(
        artistData.id,
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
 */
function storeEntityTags(entityType: string, entityId: number | null, tags: MBTag[]): void {
    if (!tags || !tags.length || !entityId) return;

    const sortedTags = tags.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10);

    for (const tag of sortedTags) {
        let tagId: number;
        const existingTag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag.name) as { id: number } | undefined;

        if (existingTag) {
            tagId = existingTag.id;
        } else {
            const info = db.prepare('INSERT INTO tags (name) VALUES (?)').run(tag.name);
            tagId = Number(info.lastInsertRowid);
        }

        try {
            db.prepare(`
        INSERT INTO entity_tags (entity_type, entity_id, tag_id, count)
        VALUES (?, ?, ?, ?)
      `).run(entityType, entityId, tagId, tag.count || 1);
        } catch (e) {
            // Probably already exists
        }
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

    const existing = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(releaseData.id) as { id: number } | undefined;
    if (existing) return existing.id;

    let labelMbid: string | null = null;
    if (releaseData['label-info'] && releaseData['label-info'].length > 0) {
        const li = releaseData['label-info'][0];
        if (li.label) {
            upsertLabel(li.label);
            labelMbid = li.label.id;
        }
    }

    const info = db.prepare(`
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

    return Number(info.lastInsertRowid);
}

/**
 * Fetch and store extra cover art from CoverArtArchive
 */
async function fetchAndStoreCoverArt(mbid: string): Promise<void> {
    if (!mbid) return;

    const existing = db.prepare('SELECT COUNT(*) as count FROM album_images WHERE release_mbid = ?').get(mbid) as { count: number };
    if (existing && existing.count > 0) return;

    try {
        const url = `http://coverartarchive.org/release/${mbid}`;
        const res = await axios.get(url, { validateStatus: () => true });

        if (res.status === 200 && res.data.images) {
            const artDir = path.join(__dirname, 'storage', 'art');
            if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true });

            for (const img of res.data.images) {
                const isBack = img.types.includes('Back');
                const isFront = img.types.includes('Front');

                if (isBack || isFront) {
                    const type = isBack ? 'back' : 'front';
                    const ext = path.extname(img.image) || '.jpg';
                    const filename = `${mbid}_${type}${ext}`;
                    const localPath = path.join(artDir, filename);

                    const writer = fs.createWriteStream(localPath);
                    const response = await axios({
                        url: img.image,
                        method: 'GET',
                        responseType: 'stream'
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
                }
            }
        }
    } catch (err) {
        // Ignore errors
    }
}

/**
 * Enrich a single track with MusicBrainz data
 */
export async function enrichTrack(track: Track): Promise<{ success: boolean; mbid?: string; reason?: string }> {
    // 1. FETCH PHASE
    const recording = await searchRecording(track.artist, track.title, track.album);
    if (!recording) return { success: false, reason: 'No match found' };

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

    // 2. WRITE PHASE (Transaction)
    const txn = db.transaction(() => {
        db.prepare('UPDATE tracks SET mbid = ?, enriched = 1 WHERE id = ?').run(recording.id, track.id);

        if (details.relations) storeCredits(track.id, details.relations);
        if (details.tags) storeEntityTags('track', track.id, details.tags);

        if (releaseFull) {
            releaseFull.description = lfmDescription || undefined;
            const releaseId = upsertRelease(releaseFull);

            db.prepare('UPDATE tracks SET release_mbid = ? WHERE id = ?').run(releaseFull.id, track.id);

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

    // 3. POST-TRANSACTION (External resources)
    if (matchedRelease) {
        await fetchAndStoreCoverArt(matchedRelease.id);
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
        errors: []
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

export default {
    searchRecording,
    getRecordingDetails,
    getReleaseDetails,
    getArtistDetails,
    enrichTrack,
    startEnrichment,
    getEnrichmentStatus,
    upsertArtist
};
