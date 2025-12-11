import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as path from 'path';
import type { Track, Artist, Release, Credit, Label, Tag, Playlist, PlaylistTrack, ListeningHistoryEntry, AlbumImage } from '../types';

const dbPath = path.join(__dirname, 'library.db');
const db: DatabaseType = new Database(dbPath);

// Optimize for performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// ===== USERS TABLE (must be created first for foreign keys) =====
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    is_admin INTEGER DEFAULT 0,
    eq_preset TEXT,
    theme TEXT DEFAULT 'dark',
    lastfm_session_key TEXT,
    lastfm_username TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration for existing tables
addColumn('users', 'lastfm_session_key', 'TEXT');
addColumn('users', 'lastfm_username', 'TEXT');

// Initialize DB safely
db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    title TEXT,
    artist TEXT,
    album TEXT,
    duration REAL,
    format TEXT
  )
`);

// Create Indexes for Performance
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
    CREATE INDEX IF NOT EXISTS idx_tracks_release_mbid ON tracks(release_mbid);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist_album ON tracks(artist, album);
    CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
    CREATE INDEX IF NOT EXISTS idx_tracks_mood ON tracks(mood);
    CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(rating);
    CREATE INDEX IF NOT EXISTS idx_tracks_added_at ON tracks(added_at);
    CREATE INDEX IF NOT EXISTS idx_releases_label_mbid ON releases(label_mbid);
    CREATE INDEX IF NOT EXISTS idx_credits_artist_mbid ON credits(artist_mbid);
    CREATE INDEX IF NOT EXISTS idx_credits_track_id ON credits(track_id);
    CREATE INDEX IF NOT EXISTS idx_credits_track_role ON credits(track_id, role);
    CREATE INDEX IF NOT EXISTS idx_credits_name ON credits(name);
    CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
    CREATE INDEX IF NOT EXISTS idx_artists_mbid ON artists(mbid);
    CREATE INDEX IF NOT EXISTS idx_tracks_mbid ON tracks(mbid);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_position ON playlist_tracks(playlist_id, position);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
    CREATE INDEX IF NOT EXISTS idx_collection_albums_collection_position ON collection_albums(collection_id, position);
    CREATE INDEX IF NOT EXISTS idx_listening_history_track_id ON listening_history(track_id);
    CREATE INDEX IF NOT EXISTS idx_entity_tags_entity_lookup ON entity_tags(entity_type, entity_id, tag_id);
`);

// Performance optimization pragmas
db.pragma('cache_size = -64000'); // 64MB cache
db.pragma('temp_store = memory'); // Store temp tables in memory
db.pragma('mmap_size = 268435456'); // 256MB memory mapping

// Migration helper
function addColumn(table: string, column: string, type: string): void {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    console.log(`Added column ${column} to ${table}`);
  } catch (err) {
    // Column likely exists
  }
}

// Add Sonic Metadata columns
addColumn('tracks', 'bpm', 'REAL');
addColumn('tracks', 'key', 'TEXT');
addColumn('tracks', 'year', 'INTEGER');
addColumn('tracks', 'genre', 'TEXT');
addColumn('tracks', 'rating', 'INTEGER');
addColumn('tracks', 'has_art', 'INTEGER');
addColumn('tracks', 'mood', 'TEXT');

// MusicBrainz columns for tracks
addColumn('tracks', 'mbid', 'TEXT');
addColumn('tracks', 'release_mbid', 'TEXT');
addColumn('tracks', 'enriched', 'INTEGER');

// Create Credits Table
db.exec(`
  CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
  )
`);

// Add MusicBrainz columns to credits
addColumn('credits', 'artist_mbid', 'TEXT');
addColumn('credits', 'instrument', 'TEXT');
addColumn('credits', 'attributes', 'TEXT');

// Artists Table
db.exec(`
  CREATE TABLE IF NOT EXISTS artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    name TEXT NOT NULL,
    sort_name TEXT,
    disambiguation TEXT,
    type TEXT,
    country TEXT,
    begin_date TEXT,
    end_date TEXT
  )
`);

// Create index for faster lookups
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_credits_artist_mbid ON credits(artist_mbid)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tracks_mbid ON tracks(mbid)`);
} catch (e) { /* indexes may exist */ }

// Labels Table
db.exec(`
  CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    name TEXT NOT NULL,
    type TEXT,
    country TEXT,
    founded TEXT
  )
`);

// Releases Table (Album-level metadata)
db.exec(`
  CREATE TABLE IF NOT EXISTS releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    title TEXT NOT NULL,
    artist_credit TEXT,
    label_mbid TEXT,
    release_date TEXT,
    country TEXT,
    barcode TEXT,
    catalog_number TEXT,
    status TEXT,
    packaging TEXT,
    description TEXT
  )
`);

// Tags Table
db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    count INTEGER DEFAULT 0
  )
`);

// Entity Tags (Polymorphic)
db.exec(`
  CREATE TABLE IF NOT EXISTS entity_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    count INTEGER DEFAULT 1,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )
`);

// Album Images
db.exec(`
  CREATE TABLE IF NOT EXISTS album_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_mbid TEXT,
    entity_type TEXT DEFAULT 'release', 
    type TEXT,
    path TEXT,
    source TEXT
  )
`);

// Column additions for existing DBs
addColumn('releases', 'description', 'TEXT');
addColumn('releases', 'primary_type', 'TEXT');
addColumn('artists', 'description', 'TEXT');
addColumn('artists', 'image_path', 'TEXT');
addColumn('artists', 'wiki_url', 'TEXT');

// Create index for tags
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_tags_lookup ON entity_tags(entity_type, entity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_album_images_mbid ON album_images(release_mbid)`);

  // Deduplicate entity_tags
  db.exec(`
    DELETE FROM entity_tags
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM entity_tags
      GROUP BY entity_type, entity_id, tag_id
    )
  `);

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_tags_unique ON entity_tags(entity_type, entity_id, tag_id)`);
} catch (e) { /* Index or dedup might fail on empty table */ }

// Playlists table
db.exec(`
  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_featured INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Playlist tracks junction table
db.exec(`
  CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
  )
`);

// Listening history table
db.exec(`
  CREATE TABLE IF NOT EXISTS listening_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    played_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_history_played_at ON listening_history(played_at DESC)`);

// Add added_at column to tracks
addColumn('tracks', 'added_at', 'TEXT');

// Enhanced playlist columns for smart playlists
addColumn('playlists', 'type', 'TEXT'); // 'manual', 'smart', 'auto'
addColumn('playlists', 'rules', 'TEXT'); // JSON rules for smart playlists
addColumn('playlists', 'pinned_to_home', 'INTEGER'); // Show on homepage
addColumn('playlists', 'cover_art_path', 'TEXT'); // Custom cover image

// Index for homepage playlists
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_playlists_pinned ON playlists(pinned_to_home)`);
} catch (e) { /* Index exists */ }

// Album Collections table
db.exec(`
  CREATE TABLE IF NOT EXISTS album_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    pinned_to_home INTEGER DEFAULT 0,
    cover_art_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Junction table for albums in collections
db.exec(`
  CREATE TABLE IF NOT EXISTS collection_albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    album_name TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (collection_id) REFERENCES album_collections(id) ON DELETE CASCADE,
    UNIQUE(collection_id, album_name, artist_name)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_collection_albums_collection ON collection_albums(collection_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_collections_pinned ON album_collections(pinned_to_home)`);

// ===== MULTI-USER SUPPORT =====
// Add user_id to per-user tables
addColumn('playlists', 'user_id', 'INTEGER');
addColumn('listening_history', 'user_id', 'INTEGER');
addColumn('album_collections', 'user_id', 'INTEGER');
addColumn('album_collections', 'is_shared', 'INTEGER DEFAULT 0');

// Indexes for user queries
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listening_history_user ON listening_history(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_collections_user ON album_collections(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
} catch (e) { /* Indexes may exist */ }

// ===== SYSTEM SETTINGS =====
db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Helper to get/set settings
export const getSetting = (key: string): string | undefined => {
  const res = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return res?.value;
};

export const setSetting = (key: string, value: string): void => {
  db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(key, value);
};

// Export typed database instance
export default db;

// Re-export types for convenience
export type { Track, Artist, Release, Credit, Label, Tag, Playlist, PlaylistTrack, ListeningHistoryEntry, AlbumImage };
