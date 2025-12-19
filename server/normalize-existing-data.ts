/**
 * Migration Script: Normalize Existing Metadata
 * 
 * This script normalizes all existing tags and credit roles in the database
 * to their canonical forms. Run after deploying normalization.ts.
 * 
 * Usage: npx ts-node normalize-existing-data.ts
 */

import db from './db';
import * as normalization from './normalization';

console.log('=== Metadata Normalization Migration ===\n');

// =============================================================================
// 1. Normalize Tags
// =============================================================================

console.log('[1/3] Normalizing tags...');

// Get all existing tags
const existingTags = db.prepare('SELECT id, name FROM tags').all() as { id: number; name: string }[];
console.log(`  Found ${existingTags.length} tags`);

// Build merge map: oldName -> canonicalName
const tagMergeMap = new Map<string, { canonical: string; canonicalId: number | null }>();
const canonicalTagIds = new Map<string, number>(); // canonical name -> id

for (const tag of existingTags) {
    const canonical = normalization.normalizeTag(tag.name);

    if (canonical !== tag.name) {
        // This tag needs to be merged
        const existingCanonical = existingTags.find(t => t.name === canonical);
        tagMergeMap.set(tag.name, {
            canonical,
            canonicalId: existingCanonical?.id || null
        });
    } else {
        canonicalTagIds.set(canonical, tag.id);
    }
}

console.log(`  Found ${tagMergeMap.size} tags to normalize`);

// Process merges in a transaction
db.transaction(() => {
    for (const [oldName, { canonical, canonicalId }] of tagMergeMap) {
        const oldTag = existingTags.find(t => t.name === oldName);
        if (!oldTag) continue;

        // Check if canonical exists either in original list OR from a previous rename in this run
        const existingCanonicalId = canonicalId || canonicalTagIds.get(canonical);

        if (existingCanonicalId) {
            // Canonical already exists - merge entity_tags
            console.log(`  Merging "${oldName}" -> "${canonical}" (existing id: ${existingCanonicalId})`);

            // Update entity_tags to point to canonical tag
            // Handle potential duplicates with INSERT OR IGNORE
            db.prepare(`
                UPDATE OR IGNORE entity_tags 
                SET tag_id = ? 
                WHERE tag_id = ?
            `).run(existingCanonicalId, oldTag.id);

            // Delete any remaining (duplicates that couldn't be updated)
            db.prepare('DELETE FROM entity_tags WHERE tag_id = ?').run(oldTag.id);

            // Delete the old tag
            db.prepare('DELETE FROM tags WHERE id = ?').run(oldTag.id);
        } else {
            // Canonical doesn't exist - just rename
            console.log(`  Renaming "${oldName}" -> "${canonical}"`);
            db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(canonical, oldTag.id);
            // Track that this canonical now exists
            canonicalTagIds.set(canonical, oldTag.id);
        }
    }
})();

// Update tag counts
db.prepare(`
    UPDATE tags 
    SET count = (
        SELECT COUNT(*) FROM entity_tags WHERE entity_tags.tag_id = tags.id
    )
`).run();

console.log('  Tags normalized!\n');

// =============================================================================
// 2. Normalize Credit Roles
// =============================================================================

console.log('[2/3] Normalizing credit roles...');

// Get distinct roles
const roles = db.prepare('SELECT DISTINCT role FROM credits').all() as { role: string }[];
const uniqueRoles = roles.map(r => r.role);
console.log(`  Found ${uniqueRoles.length} unique roles`);

// Build role merge map
const roleMergeMap = normalization.getRoleMergeMap(uniqueRoles);
console.log(`  Found ${roleMergeMap.size} roles to normalize`);

// Update credits in a transaction
db.transaction(() => {
    for (const [oldRole, newRole] of roleMergeMap) {
        console.log(`  Updating "${oldRole}" -> "${newRole}"`);
        db.prepare('UPDATE credits SET role = ? WHERE role = ?').run(newRole, oldRole);
    }
})();

console.log('  Credit roles normalized!\n');

// =============================================================================
// 3. Normalize Artist Sort Names
// =============================================================================

console.log('[3/3] Normalizing artist names and sort names...');

// Get all artists
const artists = db.prepare('SELECT id, name, sort_name FROM artists').all() as {
    id: number;
    name: string;
    sort_name: string | null;
}[];
console.log(`  Found ${artists.length} artists`);

let artistsUpdated = 0;

db.transaction(() => {
    for (const artist of artists) {
        const normalizedName = normalization.normalizeArtistName(artist.name);
        const expectedSortName = normalization.generateSortName(normalizedName);

        // Check if update needed
        if (artist.name !== normalizedName || artist.sort_name !== expectedSortName) {
            db.prepare('UPDATE artists SET name = ?, sort_name = ? WHERE id = ?')
                .run(normalizedName, expectedSortName, artist.id);
            artistsUpdated++;
        }
    }
})();

console.log(`  Updated ${artistsUpdated} artists\n`);

// =============================================================================
// Summary
// =============================================================================

console.log('=== Migration Complete ===');
console.log(`  Tags normalized: ${tagMergeMap.size}`);
console.log(`  Roles normalized: ${roleMergeMap.size}`);
console.log(`  Artists updated: ${artistsUpdated}`);
console.log(`\nAll metadata is now in canonical form!`);
