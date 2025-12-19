import db from './db';

/**
 * Phase 2 Data Migration: Populate Junction Tables
 * 
 * This script migrates existing data to the new junction tables:
 * 1. Parse tracks.artist strings → create track_artists entries
 * 2. Use tracks.release_mbid → create track_releases entries  
 * 3. Deduplicate artists by name (case-insensitive merge)
 * 4. Deduplicate labels by name (case-insensitive merge)
 */

console.log('[Phase 2] Starting data migration...');

// ===== HELPER FUNCTIONS =====

/**
 * Parse artist string to extract primary and featured artists
 * Handles: "Artist feat. Artist2", "Artist & Artist2", "Artist, Artist2"
 */
function parseArtistString(artistString: string): { primary: string; featured: string[]; joinPhrases: string[] } {
    if (!artistString) return { primary: '', featured: [], joinPhrases: [] };

    // Common featuring patterns
    const featPatterns = [
        /\s+feat\.?\s+/i,
        /\s+ft\.?\s+/i,
        /\s+featuring\s+/i,
        /\s+with\s+/i,
    ];

    let primary = artistString;
    const featured: string[] = [];
    const joinPhrases: string[] = [];

    // Extract featured artists
    for (const pattern of featPatterns) {
        const match = artistString.match(pattern);
        if (match) {
            const parts = artistString.split(pattern);
            primary = parts[0].trim();
            if (parts[1]) {
                // Further split by comma or &
                const featArtists = parts[1].split(/[,&]/).map(a => a.trim()).filter(a => a);
                featured.push(...featArtists);
                joinPhrases.push(match[0].trim());
            }
            break;
        }
    }

    // Handle remaining & or , in primary (for "Artist1 & Artist2" style credits)
    const primaryParts = primary.split(/\s*[&,]\s*/);
    if (primaryParts.length > 1) {
        primary = primaryParts[0];
        // These are additional primary artists, not featured
        featured.unshift(...primaryParts.slice(1));
        joinPhrases.unshift('&');
    }

    return { primary: primary.trim(), featured, joinPhrases };
}

/**
 * Get or create artist by name (case-insensitive)
 */
function getOrCreateArtist(name: string): number | null {
    if (!name || !name.trim()) return null;

    const trimmedName = name.trim();

    // Check if artist exists (case-insensitive)
    const existing = db.prepare('SELECT id FROM artists WHERE name COLLATE NOCASE = ?').get(trimmedName) as { id: number } | undefined;
    if (existing) return existing.id;

    // Create new artist - use 'manual' since artists table doesn't allow 'file'
    const result = db.prepare(`
        INSERT INTO artists (name, sort_name, data_source, enriched_at)
        VALUES (?, ?, 'manual', datetime('now'))
    `).run(trimmedName, trimmedName);

    return Number(result.lastInsertRowid);
}

/**
 * Get release ID from MBID
 */
function getReleaseIdFromMbid(mbid: string): number | null {
    if (!mbid) return null;
    const release = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(mbid) as { id: number } | undefined;
    return release?.id || null;
}

// ===== MIGRATION FUNCTIONS =====

/**
 * Migrate track.artist strings to track_artists junction table
 */
function migrateTrackArtists() {
    console.log('[Phase 2] Migrating track artists...');

    const tracks = db.prepare('SELECT id, artist FROM tracks WHERE artist IS NOT NULL').all() as { id: number; artist: string }[];

    let migrated = 0;
    let skipped = 0;

    const insertTrackArtist = db.prepare(`
        INSERT OR IGNORE INTO track_artists (track_id, artist_id, role, position, join_phrase)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const track of tracks) {
        const parsed = parseArtistString(track.artist);

        // Insert primary artist
        const primaryId = getOrCreateArtist(parsed.primary);
        if (primaryId) {
            try {
                insertTrackArtist.run(track.id, primaryId, 'primary', 0, null);
                migrated++;
            } catch (e) {
                skipped++;
            }
        }

        // Insert featured artists
        for (let i = 0; i < parsed.featured.length; i++) {
            const featuredId = getOrCreateArtist(parsed.featured[i]);
            if (featuredId) {
                const joinPhrase = parsed.joinPhrases[i] || 'feat.';
                try {
                    insertTrackArtist.run(track.id, featuredId, 'featured', i + 1, joinPhrase);
                    migrated++;
                } catch (e) {
                    skipped++;
                }
            }
        }
    }

    console.log(`[Phase 2] Migrated ${migrated} track-artist links (${skipped} skipped/duplicates)`);
}

/**
 * Migrate track.release_mbid to track_releases junction table
 */
function migrateTrackReleases() {
    console.log('[Phase 2] Migrating track releases...');

    const tracks = db.prepare(`
        SELECT id, release_mbid, title, duration
        FROM tracks 
        WHERE release_mbid IS NOT NULL
        ORDER BY release_mbid, id
    `).all() as { id: number; release_mbid: string; title: string; duration: number }[];

    let migrated = 0;
    let skipped = 0;

    const insertTrackRelease = db.prepare(`
        INSERT OR IGNORE INTO track_releases (track_id, release_id, track_number, disc_number, track_position, title, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Group tracks by release to assign sequential track numbers
    const releaseGroups = new Map<string, typeof tracks>();
    for (const track of tracks) {
        if (!releaseGroups.has(track.release_mbid)) {
            releaseGroups.set(track.release_mbid, []);
        }
        releaseGroups.get(track.release_mbid)!.push(track);
    }

    for (const [mbid, releaseTracks] of releaseGroups) {
        const releaseId = getReleaseIdFromMbid(mbid);
        if (!releaseId) {
            skipped += releaseTracks.length;
            continue;
        }

        for (let i = 0; i < releaseTracks.length; i++) {
            const track = releaseTracks[i];
            try {
                insertTrackRelease.run(
                    track.id,
                    releaseId,
                    i + 1,  // track_number
                    1,      // disc_number (default)
                    i + 1,  // track_position
                    track.title,
                    track.duration || null
                );
                migrated++;
            } catch (e) {
                skipped++;
            }
        }
    }

    console.log(`[Phase 2] Migrated ${migrated} track-release links (${skipped} skipped)`);
}

/**
 * Deduplicate artists by merging case-insensitive duplicates
 */
function deduplicateArtists() {
    console.log('[Phase 2] Deduplicating artists...');

    // Find duplicate artists (case-insensitive)
    const duplicates = db.prepare(`
        SELECT name COLLATE NOCASE as normalized_name, 
               GROUP_CONCAT(id) as ids,
               COUNT(*) as count
        FROM artists 
        GROUP BY name COLLATE NOCASE 
        HAVING count > 1
    `).all() as { normalized_name: string; ids: string; count: number }[];

    let merged = 0;

    for (const dupe of duplicates) {
        const ids = dupe.ids.split(',').map(Number);

        // Keep the one with an MBID if available, otherwise the first one
        const artists = db.prepare(`SELECT id, mbid, name FROM artists WHERE id IN (${ids.join(',')})`).all() as { id: number; mbid: string | null; name: string }[];

        // Prefer the one with MBID, then the one with most proper casing
        const keeper = artists.find(a => a.mbid) || artists[0];
        const toMerge = ids.filter(id => id !== keeper.id);

        if (toMerge.length === 0) continue;

        // Update references to point to keeper
        for (const oldId of toMerge) {
            // Update track_artists
            db.prepare('UPDATE OR IGNORE track_artists SET artist_id = ? WHERE artist_id = ?').run(keeper.id, oldId);
            // Update credits
            db.prepare('UPDATE OR IGNORE credits SET artist_mbid = (SELECT mbid FROM artists WHERE id = ?) WHERE artist_mbid = (SELECT mbid FROM artists WHERE id = ?)').run(keeper.id, oldId);
            // Delete the duplicate artist
            db.prepare('DELETE FROM artists WHERE id = ?').run(oldId);
            merged++;
        }
    }

    console.log(`[Phase 2] Merged ${merged} duplicate artists`);
}

/**
 * Deduplicate labels by merging case-insensitive duplicates
 */
function deduplicateLabels() {
    console.log('[Phase 2] Deduplicating labels...');

    const duplicates = db.prepare(`
        SELECT name COLLATE NOCASE as normalized_name, 
               GROUP_CONCAT(id) as ids,
               COUNT(*) as count
        FROM labels 
        GROUP BY name COLLATE NOCASE 
        HAVING count > 1
    `).all() as { normalized_name: string; ids: string; count: number }[];

    let merged = 0;

    for (const dupe of duplicates) {
        const ids = dupe.ids.split(',').map(Number);
        const labels = db.prepare(`SELECT id, mbid FROM labels WHERE id IN (${ids.join(',')})`).all() as { id: number; mbid: string | null }[];

        const keeper = labels.find(l => l.mbid) || labels[0];
        const toMerge = ids.filter(id => id !== keeper.id);

        for (const oldId of toMerge) {
            // Update release_labels
            db.prepare('UPDATE OR IGNORE release_labels SET label_id = ? WHERE label_id = ?').run(keeper.id, oldId);
            // Update releases
            db.prepare('UPDATE releases SET label_mbid = (SELECT mbid FROM labels WHERE id = ?) WHERE label_mbid = (SELECT mbid FROM labels WHERE id = ?)').run(keeper.id, oldId);
            // Delete duplicate
            db.prepare('DELETE FROM labels WHERE id = ?').run(oldId);
            merged++;
        }
    }

    console.log(`[Phase 2] Merged ${merged} duplicate labels`);
}

/**
 * Log data quality issues for manual review
 */
function logDataQualityIssues() {
    console.log('[Phase 2] Logging data quality issues...');

    // Find tracks without release links
    const orphanTracks = db.prepare(`
        SELECT COUNT(*) as count FROM tracks 
        WHERE release_mbid IS NULL 
        AND album IS NOT NULL
    `).get() as { count: number };

    if (orphanTracks.count > 0) {
        db.prepare(`
            INSERT INTO metadata_quality_log (entity_type, entity_id, quality_issue, severity, details)
            VALUES ('system', 0, 'orphan_tracks', 'medium', ?)
        `).run(JSON.stringify({ count: orphanTracks.count, description: 'Tracks with album but no release_mbid' }));
    }

    // Find artists without MBIDs
    const unlinkedArtists = db.prepare(`SELECT COUNT(*) as count FROM artists WHERE mbid IS NULL`).get() as { count: number };

    if (unlinkedArtists.count > 0) {
        db.prepare(`
            INSERT INTO metadata_quality_log (entity_type, entity_id, quality_issue, severity, details)
            VALUES ('system', 0, 'unlinked_artists', 'low', ?)
        `).run(JSON.stringify({ count: unlinkedArtists.count, description: 'Artists without MusicBrainz IDs' }));
    }

    console.log(`[Phase 2] Logged ${orphanTracks.count} orphan tracks, ${unlinkedArtists.count} unlinked artists`);
}

// ===== RUN MIGRATION =====

export function runPhase2Migration() {
    try {
        console.log('[Phase 2] Starting Phase 2 data migration...');

        db.exec('BEGIN TRANSACTION');

        migrateTrackArtists();
        migrateTrackReleases();
        deduplicateArtists();
        deduplicateLabels();
        logDataQualityIssues();

        db.exec('COMMIT');

        console.log('[Phase 2] Migration completed successfully!');
        return true;
    } catch (error) {
        db.exec('ROLLBACK');
        console.error('[Phase 2] Migration failed:', error);
        return false;
    }
}

// Run if executed directly
if (require.main === module) {
    const success = runPhase2Migration();
    process.exit(success ? 0 : 1);
}

export default { runPhase2Migration };
