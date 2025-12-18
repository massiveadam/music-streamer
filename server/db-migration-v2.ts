import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as path from 'path';
import db from './db';

/**
 * Database Migration V2: Robust Album-Artist-Credit Relationships
 * 
 * This migration addresses the critical metadata linking issues:
 * 1. Proper foreign key relationships between tracks, releases, artists, labels
 * 2. Track-artist junction table with roles (primary, featured, remixer, etc.)
 * 3. Track-release junction table with positions
 * 4. Release-level credits system
 * 5. Data source tracking (MusicBrainz vs Discogs)
 * 6. Validation and constraint checking
 */

console.log('[DB Migration V2] Starting robust metadata schema migration...');

// Enable foreign keys for SQLite
const migrationDb = db as DatabaseType;
migrationDb.pragma('foreign_keys = ON');

// ===== MIGRATION FUNCTIONS =====

/**
 * Create new junction tables for proper relationships
 */
function createJunctionTables() {
    console.log('[DB Migration V2] Creating junction tables...');

    // Track-Artist junction table with roles
    migrationDb.exec(`
        CREATE TABLE IF NOT EXISTS track_artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL,
            artist_id INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'primary', -- 'primary', 'featured', 'remixer', 'composer', 'producer'
            join_phrase TEXT, -- 'feat.', '&', 'and', etc.
            position INTEGER DEFAULT 0, -- Order in artist credit
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
            FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE,
            UNIQUE(track_id, artist_id, role)
        )
    `);

    // Track-Release junction table with positions
    migrationDb.exec(`
        CREATE TABLE IF NOT EXISTS track_releases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL,
            release_id INTEGER NOT NULL,
            disc_number INTEGER DEFAULT 1,
            track_number INTEGER NOT NULL,
            track_position INTEGER NOT NULL, -- Overall position across all discs
            title TEXT, -- Track title on this specific release
            duration INTEGER, -- Duration on this specific release
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
            FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE,
            UNIQUE(track_id, release_id)
        )
    `);

    // Release-Artist junction table (album artists)
    migrationDb.exec(`
        CREATE TABLE IF NOT EXISTS release_artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            release_id INTEGER NOT NULL,
            artist_id INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'primary', -- 'primary', 'featured', 'remixer', 'compiler'
            join_phrase TEXT,
            position INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE,
            FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE,
            UNIQUE(release_id, artist_id, role)
        )
    `);

    // Release-Label junction table
    migrationDb.exec(`
        CREATE TABLE IF NOT EXISTS release_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            release_id INTEGER NOT NULL,
            label_id INTEGER NOT NULL,
            catalog_number TEXT,
            barcode TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE,
            FOREIGN KEY(label_id) REFERENCES labels(id) ON DELETE CASCADE,
            UNIQUE(release_id, label_id, catalog_number)
        )
    `);

    console.log('[DB Migration V2] Junction tables created successfully');
}

/**
 * Add data source tracking to existing tables
 */
function addDataSourceTracking() {
    console.log('[DB Migration V2] Adding data source tracking...');

    // Add data source columns to track enrichment origin
    const addColumn = (table: string, column: string, type: string) => {
        try {
            migrationDb.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
            console.log(`[DB Migration V2] Added ${column} to ${table}`);
        } catch (err) {
            // Column likely exists
        }
    };

    // Add data source tracking to main tables
    addColumn('tracks', 'data_source', 'TEXT CHECK (data_source IN ("musicbrainz", "discogs", "manual", "file")) DEFAULT "file"');
    addColumn('tracks', 'external_id', 'TEXT'); // Original ID from source
    addColumn('tracks', 'enrichment_confidence', 'REAL'); // 0.0 to 1.0
    addColumn('tracks', 'enriched_at', 'TEXT'); // When enrichment happened
    addColumn('tracks', 'enrichment_version', 'TEXT'); // Version of enrichment logic

    addColumn('releases', 'data_source', 'TEXT CHECK (data_source IN ("musicbrainz", "discogs", "manual")) DEFAULT "manual"');
    addColumn('releases', 'external_id', 'TEXT');
    addColumn('releases', 'enrichment_confidence', 'REAL');
    addColumn('releases', 'enriched_at', 'TEXT');
    addColumn('releases', 'enrichment_version', 'TEXT');

    addColumn('artists', 'data_source', 'TEXT CHECK (data_source IN ("musicbrainz", "discogs", "manual")) DEFAULT "manual"');
    addColumn('artists', 'external_id', 'TEXT');
    addColumn('artists', 'enrichment_confidence', 'REAL');
    addColumn('artists', 'enriched_at', 'TEXT');
    addColumn('artists', 'enrichment_version', 'TEXT');

    addColumn('labels', 'data_source', 'TEXT CHECK (data_source IN ("musicbrainz", "discogs", "manual")) DEFAULT "manual"');
    addColumn('labels', 'external_id', 'TEXT');
    addColumn('labels', 'enrichment_confidence', 'REAL');
    addColumn('labels', 'enriched_at', 'TEXT');
    addColumn('labels', 'enrichment_version', 'TEXT');

    // Add validation columns
    addColumn('tracks', 'mbid_validated', 'INTEGER DEFAULT 0'); // 1 = validated MBID
    addColumn('releases', 'mbid_validated', 'INTEGER DEFAULT 0');
    addColumn('artists', 'mbid_validated', 'INTEGER DEFAULT 0');
    addColumn('labels', 'mbid_validated', 'INTEGER DEFAULT 0');

    console.log('[DB Migration V2] Data source tracking added');
}

/**
 * Create enhanced credits system with release-level credits
 */
function createEnhancedCreditsSystem() {
    console.log('[DB Migration V2] Creating enhanced credits system...');

    // Create release_credits table for album-level personnel
    migrationDb.exec(`
        CREATE TABLE IF NOT EXISTS release_credits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            release_id INTEGER,
            track_id INTEGER, -- NULL for release-level credits
            artist_id INTEGER,
            name TEXT NOT NULL, -- Name as credited
            role TEXT NOT NULL,
            instrument TEXT,
            attributes TEXT, -- JSON array of attributes
            position INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE,
            FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
            FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE SET NULL,
            CHECK ((release_id IS NOT NULL AND track_id IS NULL) OR (release_id IS NULL AND track_id IS NOT NULL))
        )
    `);

    // Add indexes for efficient querying
    migrationDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_release_credits_release ON release_credits(release_id);
        CREATE INDEX IF NOT EXISTS idx_release_credits_track ON release_credits(track_id);
        CREATE INDEX IF NOT EXISTS idx_release_credits_artist ON release_credits(artist_id);
        CREATE INDEX IF NOT EXISTS idx_release_credits_role ON release_credits(role);
        CREATE INDEX IF NOT EXISTS idx_release_credits_name ON release_credits(name);
    `);

    console.log('[DB Migration V2] Enhanced credits system created');
}

/**
 * Fix album_images table to use proper foreign keys
 */
function fixAlbumImages() {
    console.log('[DB Migration V2] Fixing album_images table...');

    // Create new album_images table with proper foreign key
    migrationDb.exec(`
        CREATE TABLE IF NOT EXISTS album_images_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            release_id INTEGER NOT NULL,
            entity_type TEXT DEFAULT 'release', 
            type TEXT,
            path TEXT,
            source TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE,
            UNIQUE(release_id, entity_type, type)
        )
    `);

    // Migrate existing data
    try {
        migrationDb.exec(`
            INSERT INTO album_images_new (release_id, entity_type, type, path, source)
            SELECT r.id, ai.entity_type, ai.type, ai.path, ai.source
            FROM album_images ai
            JOIN releases r ON r.mbid = ai.release_mbid
            WHERE ai.release_mbid IS NOT NULL
        `);
        console.log('[DB Migration V2] Migrated album_images data');
    } catch (err) {
        console.warn('[DB Migration V2] Album images migration may have issues:', err);
    }

    // Create indexes
    migrationDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_album_images_release ON album_images_new(release_id);
        CREATE INDEX IF NOT EXISTS idx_album_images_type ON album_images_new(entity_type, type);
    `);

    console.log('[DB Migration V2] Album images table fixed');
}

/**
 * Fix collection_albums to use proper foreign keys
 */
function fixCollectionAlbums() {
    console.log('[DB Migration V2] Fixing collection_albums table...');

    // Add release_id column to collection_albums
    try {
        migrationDb.exec(`ALTER TABLE collection_albums ADD COLUMN release_id INTEGER REFERENCES releases(id)`);

        // Try to migrate existing data
        migrationDb.exec(`
            UPDATE collection_albums 
            SET release_id = (
                SELECT r.id 
                FROM releases r 
                WHERE r.title = collection_albums.album_name 
                AND r.artist_credit LIKE '%' || collection_albums.artist_name || '%'
                LIMIT 1
            )
            WHERE release_id IS NULL
        `);

        console.log('[DB Migration V2] Added release_id to collection_albums');
    } catch (err) {
        console.warn('[DB Migration V2] collection_albums migration issue:', err);
    }
}

/**
 * Add validation constraints and indexes
 */
function addValidationConstraints() {
    console.log('[DB Migration V2] Adding validation constraints...');

    // Add unique constraints for MBIDs (skip tracks - album enrichment shares MBIDs)
    // Only add to releases, artists, labels where uniqueness is expected
    try {
        migrationDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_releases_mbid_unique ON releases(mbid) WHERE mbid IS NOT NULL;`);
    } catch (err) {
        console.warn('[DB Migration V2] Releases MBID index may have duplicates:', (err as Error).message);
    }

    try {
        migrationDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_mbid_unique ON artists(mbid) WHERE mbid IS NOT NULL;`);
    } catch (err) {
        console.warn('[DB Migration V2] Artists MBID index may have duplicates:', (err as Error).message);
    }

    try {
        migrationDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_mbid_unique ON labels(mbid) WHERE mbid IS NOT NULL;`);
    } catch (err) {
        console.warn('[DB Migration V2] Labels MBID index may have duplicates:', (err as Error).message);
    }

    // Add case-insensitive unique constraints for names (may fail if duplicates exist)
    try {
        migrationDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_name_unique ON artists(name COLLATE NOCASE);`);
    } catch (err) {
        console.warn('[DB Migration V2] Artists have duplicate names - will need deduplication');
    }

    try {
        migrationDb.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_name_unique ON labels(name COLLATE NOCASE);`);
    } catch (err) {
        console.warn('[DB Migration V2] Labels have duplicate names - will need deduplication');
    }

    // Add indexes for junction tables
    migrationDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_track_artists_track ON track_artists(track_id);
        CREATE INDEX IF NOT EXISTS idx_track_artists_artist ON track_artists(artist_id);
        CREATE INDEX IF NOT EXISTS idx_track_artists_role ON track_artists(role);
        
        CREATE INDEX IF NOT EXISTS idx_track_releases_track ON track_releases(track_id);
        CREATE INDEX IF NOT EXISTS idx_track_releases_release ON track_releases(release_id);
        CREATE INDEX IF NOT EXISTS idx_track_releases_position ON track_releases(track_position);
        
        CREATE INDEX IF NOT EXISTS idx_release_artists_release ON release_artists(release_id);
        CREATE INDEX IF NOT EXISTS idx_release_artists_artist ON release_artists(artist_id);
        
        CREATE INDEX IF NOT EXISTS idx_release_labels_release ON release_labels(release_id);
        CREATE INDEX IF NOT EXISTS idx_release_labels_label ON release_labels(label_id);
    `);

    console.log('[DB Migration V2] Validation constraints added');
}

/**
 * Create metadata quality tracking
 */
function createMetadataQualityTracking() {
    console.log('[DB Migration V2] Creating metadata quality tracking...');

    // Create metadata quality log table
    migrationDb.exec(`
        CREATE TABLE IF NOT EXISTS metadata_quality_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL, -- 'track', 'release', 'artist', 'label'
            entity_id INTEGER NOT NULL,
            quality_issue TEXT NOT NULL, -- 'missing_mbid', 'duplicate_artist', 'inconsistent_data', etc.
            severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
            details TEXT, -- JSON with additional context
            resolved INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            resolved_at TEXT
        )
    `);

    // Create indexes for quality tracking
    migrationDb.exec(`
        CREATE INDEX IF NOT EXISTS idx_metadata_quality_entity ON metadata_quality_log(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_metadata_quality_unresolved ON metadata_quality_log(resolved) WHERE resolved = 0;
        CREATE INDEX IF NOT EXISTS idx_metadata_quality_severity ON metadata_quality_log(severity);
    `);

    console.log('[DB Migration V2] Metadata quality tracking created');
}

/**
 * Run the complete migration
 */
export function runMigrationV2() {
    try {
        console.log('[DB Migration V2] Starting migration...');

        migrationDb.exec('BEGIN TRANSACTION');

        // Run all migration steps
        createJunctionTables();
        addDataSourceTracking();
        createEnhancedCreditsSystem();
        fixAlbumImages();
        fixCollectionAlbums();
        addValidationConstraints();
        createMetadataQualityTracking();

        migrationDb.exec('COMMIT');

        console.log('[DB Migration V2] Migration completed successfully!');
        return true;
    } catch (error) {
        migrationDb.exec('ROLLBACK');
        console.error('[DB Migration V2] Migration failed:', error);
        return false;
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    const success = runMigrationV2();
    process.exit(success ? 0 : 1);
}

export default migrationDb;