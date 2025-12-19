/**
 * Database Cleanup Script
 * 
 * Cleans up legacy data issues:
 * 1. Convert existing pseudo-MBIDs (discogs-xxx) to proper external_id
 * 2. Fix orphan tracks to link to releases
 * 3. Attempt to link unlinked artists via MusicBrainz search
 */

import db from './db';

console.log('[Cleanup] Starting database cleanup...');

// ===== CLEANUP FUNCTIONS =====

/**
 * Convert existing pseudo-MBIDs to proper external_id format
 */
function convertPseudoMbids() {
    console.log('[Cleanup] Converting pseudo-MBIDs...');

    // Convert release pseudo-MBIDs (discogs-xxx)
    const discogsReleases = db.prepare(`
        SELECT id, mbid FROM releases 
        WHERE mbid LIKE 'discogs-%'
    `).all() as { id: number; mbid: string }[];

    let releasesConverted = 0;
    for (const release of discogsReleases) {
        const externalId = release.mbid.replace('discogs-', '');
        db.prepare(`
            UPDATE releases 
            SET external_id = ?, data_source = 'discogs', mbid = NULL 
            WHERE id = ?
        `).run(externalId, release.id);
        releasesConverted++;
    }
    console.log(`[Cleanup] Converted ${releasesConverted} release pseudo-MBIDs`);

    // Update tracks that reference these pseudo-MBIDs
    const tracksWithPseudoMbid = db.prepare(`
        SELECT id, release_mbid FROM tracks 
        WHERE release_mbid LIKE 'discogs-%'
    `).all() as { id: number; release_mbid: string }[];

    let tracksUpdated = 0;
    for (const track of tracksWithPseudoMbid) {
        const externalId = track.release_mbid.replace('discogs-', '');
        db.prepare(`
            UPDATE tracks 
            SET external_id = ?, data_source = 'discogs', release_mbid = NULL 
            WHERE id = ?
        `).run(externalId, track.id);
        tracksUpdated++;
    }
    console.log(`[Cleanup] Updated ${tracksUpdated} track pseudo release_mbids`);

    // Convert label pseudo-MBIDs (discogs-label-xxx)
    const discogsLabels = db.prepare(`
        SELECT id, mbid FROM labels 
        WHERE mbid LIKE 'discogs-label-%'
    `).all() as { id: number; mbid: string }[];

    let labelsConverted = 0;
    for (const label of discogsLabels) {
        const externalId = label.mbid.replace('discogs-label-', '');
        db.prepare(`
            UPDATE labels 
            SET external_id = ?, data_source = 'discogs', mbid = NULL 
            WHERE id = ?
        `).run(externalId, label.id);
        labelsConverted++;
    }
    console.log(`[Cleanup] Converted ${labelsConverted} label pseudo-MBIDs`);

    // Update releases that reference label pseudo-MBIDs
    db.prepare(`
        UPDATE releases 
        SET label_mbid = NULL 
        WHERE label_mbid LIKE 'discogs-label-%'
    `).run();
}

/**
 * Create releases for orphan tracks (tracks with album but no release link)
 */
function createReleasesForOrphanTracks() {
    console.log('[Cleanup] Creating releases for orphan tracks...');

    // Get unique album/artist combinations for orphan tracks
    const orphanAlbums = db.prepare(`
        SELECT DISTINCT album, artist, year
        FROM tracks 
        WHERE album IS NOT NULL 
        AND album != ''
        AND release_mbid IS NULL
        AND (external_id IS NULL OR data_source != 'discogs')
    `).all() as { album: string; artist: string; year: number | null }[];

    let releasesCreated = 0;
    const now = new Date().toISOString();

    for (const orphan of orphanAlbums) {
        // Check if release already exists by title + artist
        const existingRelease = db.prepare(`
            SELECT id FROM releases 
            WHERE title COLLATE NOCASE = ? 
            AND artist_credit COLLATE NOCASE = ?
        `).get(orphan.album, orphan.artist) as { id: number } | undefined;

        let releaseId: number;
        if (existingRelease) {
            releaseId = existingRelease.id;
        } else {
            // Create new release from file metadata
            const result = db.prepare(`
                INSERT INTO releases (title, artist_credit, release_date, data_source, enriched_at, enrichment_confidence)
                VALUES (?, ?, ?, 'manual', ?, 0.3)
            `).run(orphan.album, orphan.artist, orphan.year ? String(orphan.year) : null, now);
            releaseId = Number(result.lastInsertRowid);
            releasesCreated++;
        }

        // Link orphan tracks to this release via track_releases junction table
        const orphanTracks = db.prepare(`
            SELECT id, title, duration FROM tracks 
            WHERE album COLLATE NOCASE = ? 
            AND artist COLLATE NOCASE = ?
            AND release_mbid IS NULL
        `).all(orphan.album, orphan.artist) as { id: number; title: string; duration: number }[];

        for (let i = 0; i < orphanTracks.length; i++) {
            const track = orphanTracks[i];
            try {
                db.prepare(`
                    INSERT OR IGNORE INTO track_releases (track_id, release_id, track_number, disc_number, track_position, title, duration)
                    VALUES (?, ?, ?, 1, ?, ?, ?)
                `).run(track.id, releaseId, i + 1, i + 1, track.title, track.duration || null);
            } catch (e) {
                // Duplicate, skip
            }
        }
    }

    console.log(`[Cleanup] Created ${releasesCreated} new releases for orphan tracks`);
}

/**
 * Deduplicate releases by title + artist
 */
function deduplicateReleases() {
    console.log('[Cleanup] Deduplicating releases...');

    const duplicates = db.prepare(`
        SELECT title COLLATE NOCASE || '|' || artist_credit COLLATE NOCASE as key,
               GROUP_CONCAT(id) as ids,
               COUNT(*) as count
        FROM releases 
        GROUP BY title COLLATE NOCASE, artist_credit COLLATE NOCASE
        HAVING count > 1
    `).all() as { key: string; ids: string; count: number }[];

    let merged = 0;

    for (const dupe of duplicates) {
        const ids = dupe.ids.split(',').map(Number);
        const releases = db.prepare(`SELECT id, mbid FROM releases WHERE id IN (${ids.join(',')})`).all() as { id: number; mbid: string | null }[];

        // Keep the one with an MBID, or the first one
        const keeper = releases.find(r => r.mbid) || releases[0];
        const toMerge = ids.filter(id => id !== keeper.id);

        for (const oldId of toMerge) {
            // Update track_releases to point to keeper
            db.prepare('UPDATE OR IGNORE track_releases SET release_id = ? WHERE release_id = ?').run(keeper.id, oldId);
            // Update album_images
            db.prepare('UPDATE OR IGNORE album_images SET release_mbid = (SELECT mbid FROM releases WHERE id = ?) WHERE release_mbid = (SELECT mbid FROM releases WHERE id = ?)').run(keeper.id, oldId);
            db.prepare('UPDATE OR IGNORE album_images_new SET release_id = ? WHERE release_id = ?').run(keeper.id, oldId);
            // Delete duplicate
            db.prepare('DELETE FROM releases WHERE id = ?').run(oldId);
            merged++;
        }
    }

    console.log(`[Cleanup] Merged ${merged} duplicate releases`);
}

/**
 * Clear resolved quality issues
 */
function markQualityIssuesResolved() {
    console.log('[Cleanup] Marking quality issues as resolved...');

    const now = new Date().toISOString();

    // Mark orphan tracks as resolved
    db.prepare(`
        UPDATE metadata_quality_log 
        SET resolved = 1, resolved_at = ? 
        WHERE quality_issue = 'orphan_tracks' AND resolved = 0
    `).run(now);

    console.log('[Cleanup] Quality issues marked as resolved');
}

/**
 * Show final statistics
 */
function showStats() {
    console.log('\n[Cleanup] Final Statistics:');

    const stats = {
        totalTracks: (db.prepare('SELECT COUNT(*) as count FROM tracks').get() as { count: number }).count,
        enrichedTracks: (db.prepare('SELECT COUNT(*) as count FROM tracks WHERE enriched = 1').get() as { count: number }).count,
        totalReleases: (db.prepare('SELECT COUNT(*) as count FROM releases').get() as { count: number }).count,
        releasesWithMbid: (db.prepare('SELECT COUNT(*) as count FROM releases WHERE mbid IS NOT NULL').get() as { count: number }).count,
        totalArtists: (db.prepare('SELECT COUNT(*) as count FROM artists').get() as { count: number }).count,
        artistsWithMbid: (db.prepare('SELECT COUNT(*) as count FROM artists WHERE mbid IS NOT NULL').get() as { count: number }).count,
        trackArtistLinks: (db.prepare('SELECT COUNT(*) as count FROM track_artists').get() as { count: number }).count,
        trackReleaseLinks: (db.prepare('SELECT COUNT(*) as count FROM track_releases').get() as { count: number }).count,
    };

    console.log(`  Tracks: ${stats.totalTracks} (${stats.enrichedTracks} enriched)`);
    console.log(`  Releases: ${stats.totalReleases} (${stats.releasesWithMbid} with MBID)`);
    console.log(`  Artists: ${stats.totalArtists} (${stats.artistsWithMbid} with MBID)`);
    console.log(`  Track-Artist Links: ${stats.trackArtistLinks}`);
    console.log(`  Track-Release Links: ${stats.trackReleaseLinks}`);
}

// ===== RUN CLEANUP =====

export function runCleanup() {
    try {
        console.log('[Cleanup] Starting cleanup...');

        db.exec('BEGIN TRANSACTION');

        convertPseudoMbids();
        createReleasesForOrphanTracks();
        deduplicateReleases();
        markQualityIssuesResolved();
        showStats();

        db.exec('COMMIT');

        console.log('[Cleanup] Cleanup completed successfully!');
        return true;
    } catch (error) {
        db.exec('ROLLBACK');
        console.error('[Cleanup] Cleanup failed:', error);
        return false;
    }
}

// Run if executed directly
if (require.main === module) {
    const success = runCleanup();
    process.exit(success ? 0 : 1);
}

export default { runCleanup };
