
import db from './db';

/**
 * Migration: Consolidate Indexes
 * Drops redundant and duplicate indexes to optimize performance.
 */
export function runConsolidateIndexesMigration(): boolean {
    const redundantIndexes = [
        'idx_artists_name',        // Covered by idx_artists_name_unique
        'idx_artists_mbid',        // Covered by idx_artists_mbid_unique
        'idx_releases_mbid',       // Covered by idx_releases_mbid_unique
        'idx_entity_tags_lookup',  // Covered by idx_entity_tags_unique prefix
        'idx_entity_tags_entity_lookup', // Duplicate of idx_entity_tags_unique
        'idx_collection_albums_collection', // Covered by idx_collection_albums_collection_position prefix
    ];

    try {
        console.log('[Migration] Dropping redundant indexes...');
        db.transaction(() => {
            for (const idx of redundantIndexes) {
                db.prepare(`DROP INDEX IF EXISTS ${idx}`).run();
            }
        })();
        console.log('[Migration] Redundant indexes dropped.');
        return true;
    } catch (error) {
        console.error('[Migration] Failed to consolidate indexes:', error);
        return false;
    }
}
