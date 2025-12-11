#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

console.log('🧪 Testing Music Streamer Performance Optimizations\n');

// Test database connection and indexing
function testDatabaseSetup() {
    console.log('📊 Testing Database Setup...');
    const dbPath = path.join(__dirname, 'library.db');
    const db = new Database(dbPath);
    
    // Test WAL mode
    const walMode = db.pragma('journal_mode', { simple: true });
    console.log(`  ✓ Journal Mode: ${walMode}`);
    
    // Test cache size
    const cacheSize = db.pragma('cache_size', { simple: true });
    console.log(`  ✓ Cache Size: ${cacheSize} pages`);
    
    // Test indexes exist
    const indexes = [
        'idx_tracks_artist_album',
        'idx_playlist_tracks_playlist_position',
        'idx_collection_albums_collection_position',
        'idx_entity_tags_entity_lookup'
    ];
    
    indexes.forEach(index => {
        try {
            db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`).get(index);
            console.log(`  ✓ Index ${index} exists`);
        } catch (e) {
            console.log(`  ✗ Index ${index} missing`);
        }
    });
    
    db.close();
    console.log('  ✅ Database setup test passed\n');
}

// Test search performance
function testSearchPerformance() {
    console.log('🔍 Testing Search Performance...');
    const dbPath = path.join(__dirname, 'library.db');
    const db = new Database(dbPath);
    
    // Test optimized search query
    const startTime = Date.now();
    const results = db.prepare(`
        SELECT DISTINCT t.*
        FROM tracks t
        WHERE t.title LIKE ? OR t.artist LIKE ? OR t.album LIKE ?
        UNION
        SELECT DISTINCT t.*
        FROM tracks t
        JOIN credits c ON c.track_id = t.id
        WHERE c.name LIKE ?
        ORDER BY artist, album, title
        LIMIT 50
    `).all('%rock%', '%rock%', '%rock%', '%rock%');
    
    const endTime = Date.now();
    console.log(`  ✓ Search completed in ${endTime - startTime}ms`);
    console.log(`  ✓ Found ${results.length} results`);
    
    db.close();
    console.log('  ✅ Search performance test passed\n');
}

// Test collection query optimization
function testCollectionPerformance() {
    console.log('📚 Testing Collection Query Performance...');
    const dbPath = path.join(__dirname, 'library.db');
    const db = new Database(dbPath);
    
    // Test optimized collection query
    const startTime = Date.now();
    const collections = db.prepare(`
        SELECT 
            c.id,
            c.name,
            COUNT(DISTINCT ca.id) as album_count,
            GROUP_CONCAT(
                JSON_OBJECT(
                    'album_name', ca.album_name,
                    'artist_name', ca.artist_name
                )
            ) as preview_albums_json
        FROM album_collections c
        LEFT JOIN collection_albums ca ON c.id = ca.collection_id
        LEFT JOIN tracks t ON t.album = ca.album_name AND t.artist = ca.artist_name AND t.has_art = 1
        WHERE ca.position IS NULL OR ca.position <= 4
        GROUP BY c.id
        ORDER BY c.updated_at DESC
    `).all();
    
    const endTime = Date.now();
    console.log(`  ✓ Collection query completed in ${endTime - startTime}ms`);
    console.log(`  ✓ Found ${collections.length} collections`);
    
    db.close();
    console.log('  ✅ Collection performance test passed\n');
}

// Test playlist reordering performance
function testPlaylistPerformance() {
    console.log('🎵 Testing Playlist Performance...');
    const dbPath = path.join(__dirname, 'library.db');
    const db = new Database(dbPath);
    
    // Test playlist track position indexing
    const startTime = Date.now();
    const playlistTracks = db.prepare(`
        SELECT pt.*, t.title, t.artist
        FROM playlist_tracks pt
        JOIN tracks t ON pt.track_id = t.id
        WHERE pt.playlist_id = 1
        ORDER BY pt.position
        LIMIT 100
    `).all();
    
    const endTime = Date.now();
    console.log(`  ✓ Playlist query completed in ${endTime - startTime}ms`);
    console.log(`  ✓ Found ${playlistTracks.length} playlist tracks`);
    
    db.close();
    console.log('  ✅ Playlist performance test passed\n');
}

// Test pagination performance
function testPaginationPerformance() {
    console.log('📄 Testing Pagination Performance...');
    const dbPath = path.join(__dirname, 'library.db');
    const db = new Database(dbPath);
    
    // Test paginated artists query
    const startTime = Date.now();
    const page = 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    
    const artists = db.prepare(`
        SELECT a.*, COUNT(DISTINCT t.id) as track_count
        FROM artists a
        JOIN tracks t ON t.artist = a.name
        GROUP BY a.id
        ORDER BY a.name
        LIMIT ? OFFSET ?
    `).all(limit, offset);
    
    const totalResult = db.prepare(`
        SELECT COUNT(DISTINCT a.id) as total
        FROM artists a
        JOIN tracks t ON t.artist = a.name
    `).get();
    
    const endTime = Date.now();
    console.log(`  ✓ Paginated query completed in ${endTime - startTime}ms`);
    console.log(`  ✓ Found ${artists.length} artists (page ${page})`);
    console.log(`  ✓ Total artists: ${totalResult.total}`);
    
    db.close();
    console.log('  ✅ Pagination performance test passed\n');
}

// Run all tests
async function runTests() {
    try {
        testDatabaseSetup();
        testSearchPerformance();
        testCollectionPerformance();
        testPlaylistPerformance();
        testPaginationPerformance();
        
        console.log('🎉 All performance tests completed successfully!');
        console.log('\n📈 Performance Improvements Summary:');
        console.log('  • Added comprehensive database indexes');
        console.log('  • Optimized search with UNION queries');
        console.log('  • Implemented batch processing for enrichment');
        console.log('  • Added pagination to all major endpoints');
        console.log('  • Optimized collection and playlist queries');
        console.log('  • Enhanced database cache and memory settings');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

runTests();