/**
 * Database Migrations Runner
 * 
 * Runs all pending migrations on server startup.
 * Tracks which migrations have been run to avoid re-running.
 */

import db from './db';
import { runMigrationV2 } from './db-migration-v2';
import { runPhase2Migration } from './db-migration-phase2';
import { runSyncTagCountsMigration } from './db-migration-tags';
import { runConsolidateIndexesMigration } from './db-migration-indexes';

// Ensure migrations table exists
db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`);

/**
 * Check if a migration has already been run
 */
function isMigrationRun(name: string): boolean {
    const result = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(name);
    return !!result;
}

/**
 * Mark a migration as completed
 */
function markMigrationRun(name: string): void {
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
}

/**
 * Run all pending migrations
 */
export function runAllMigrations(): void {
    console.log('[Migrations] Checking for pending migrations...');

    // Migration V2: Schema changes (junction tables, data source tracking)
    if (!isMigrationRun('v2-schema')) {
        console.log('[Migrations] Running V2 schema migration...');
        const success = runMigrationV2();
        if (success) {
            markMigrationRun('v2-schema');
            console.log('[Migrations] V2 schema migration completed');
        } else {
            console.error('[Migrations] V2 schema migration FAILED');
        }
    } else {
        console.log('[Migrations] V2 schema already applied');
    }

    // Phase 2: Data migration (populate junction tables, deduplicate)
    if (!isMigrationRun('v2-data')) {
        console.log('[Migrations] Running Phase 2 data migration...');
        const success = runPhase2Migration();
        if (success) {
            markMigrationRun('v2-data');
            console.log('[Migrations] Phase 2 data migration completed');
        } else {
            console.error('[Migrations] Phase 2 data migration FAILED');
        }
    } else {
        console.log('[Migrations] Phase 2 data already applied');
    }

    // Cleanup: Convert pseudo-MBIDs, create releases for orphans, deduplicate
    if (!isMigrationRun('v2-cleanup')) {
        console.log('[Migrations] Running cleanup migration...');
        try {
            const { runCleanup } = require('./db-cleanup');
            const success = runCleanup();
            if (success) {
                markMigrationRun('v2-cleanup');
                console.log('[Migrations] Cleanup migration completed');
            } else {
                console.error('[Migrations] Cleanup migration FAILED');
            }
        } catch (e) {
            console.error('[Migrations] Cleanup migration error:', e);
        }
    } else {
        console.log('[Migrations] Cleanup already applied');
    }

    // Sync Tag Counts: Fixes tags.count and adds triggers
    if (!isMigrationRun('tags-sync-v1')) {
        console.log('[Migrations] Running tag sync migration...');
        const success = runSyncTagCountsMigration();
        if (success) {
            markMigrationRun('tags-sync-v1');
            console.log('[Migrations] Tag sync migration completed');
        } else {
            console.error('[Migrations] Tag sync migration FAILED');
        }
    } else {
        console.log('[Migrations] Tag sync already applied');
    }

    // Consolidate Indexes: Removes redundant indexes
    if (!isMigrationRun('index-consolidation-v3')) {
        console.log('[Migrations] Running index consolidation migration v3...');
        const success = runConsolidateIndexesMigration();
        if (success) {
            markMigrationRun('index-consolidation-v3');
            console.log('[Migrations] Index consolidation migration completed');
        } else {
            console.error('[Migrations] Index consolidation migration FAILED');
        }
    } else {
        console.log('[Migrations] Index consolidation already applied');
    }

    console.log('[Migrations] All migrations checked');
}

// Export for use in index.ts
export default { runAllMigrations };
