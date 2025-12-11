import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { parseFile, IAudioMetadata } from 'music-metadata';
import db, { getSetting, setSetting } from './db';
import type { Track, Artist, Credit } from '../types';
import * as musicbrainz from './musicbrainz';
import * as lastfm from './lastfm';
import * as wikipedia from './wikipedia';
import * as auth from './auth';
import type { AuthRequest } from './auth';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Type definitions
interface ScanStatus {
    isScanning: boolean;
    currentFile: string | null;
    totalFilesFound: number;
    processedCount: number;
    startTime: number | null;
}

interface TrackData {
    path: string;
    title: string;
    artist: string;
    album: string;
    duration: number | undefined;
    format: string | undefined;
    bpm: number | null;
    key: string | null;
    year: number | null;
    genre: string | null;
    hasArt: number;
    mood: string | null;
}

// Global Scan State
let scanStatus: ScanStatus = {
    isScanning: false,
    currentFile: null,
    totalFilesFound: 0,
    processedCount: 0,
    startTime: null
};

// Helper: Ensure directory exists
function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Artwork Storage Path
const ART_DIR = path.join(__dirname, 'storage', 'art');
ensureDir(ART_DIR);

// Process a single audio file
async function processFile(fullPath: string): Promise<boolean> {
    const ext = path.extname(fullPath).toLowerCase();
    if (['.mp3', '.flac', '.m4a', '.wav', '.ogg'].includes(ext)) {
        try {
            const metadata: IAudioMetadata = await parseFile(fullPath);
            let hasArt = 0;

            if (metadata.common.picture && metadata.common.picture.length > 0) {
                hasArt = 1;
            }

            // Transaction for all DB writes
            const writeTrackData = db.transaction((data: { track: TrackData; metadata: IAudioMetadata }) => {
                const insert = db.prepare(`
          INSERT OR IGNORE INTO tracks (path, title, artist, album, duration, format, bpm, key, year, genre, has_art, mood)
          VALUES (@path, @title, @artist, @album, @duration, @format, @bpm, @key, @year, @genre, @hasArt, @mood)
        `);

                const result = insert.run(data.track);
                const trackId = Number(result.lastInsertRowid);

                if (result.changes > 0) {
                    const insertCredit = db.prepare('INSERT INTO credits (track_id, name, role) VALUES (?, ?, ?)');
                    const addCredit = (name: string, role: string) => insertCredit.run(trackId, name, role);

                    if (data.metadata.common.artist) addCredit(data.metadata.common.artist, 'Artist');
                    if (data.metadata.common.albumartist && data.metadata.common.albumartist !== data.metadata.common.artist) {
                        addCredit(data.metadata.common.albumartist, 'Album Artist');
                    }
                    if (data.metadata.common.composer) data.metadata.common.composer.forEach(c => addCredit(c, 'Composer'));
                    if (data.metadata.common.artists) {
                        data.metadata.common.artists.forEach(a => {
                            if (a !== data.metadata.common.artist) addCredit(a, 'Performer');
                        });
                    }
                }

                return trackId;
            });

            // Populate Artists Table
            const artistName = metadata.common.artist || metadata.common.albumartist;
            if (artistName) {
                try {
                    db.prepare('INSERT OR IGNORE INTO artists (name) VALUES (?)').run(artistName);
                } catch (e) { /* ignore */ }
            }

            // Prepare Data Object
            const trackData: TrackData = {
                path: fullPath,
                title: metadata.common.title || path.basename(fullPath),
                artist: metadata.common.artist || 'Unknown Artist',
                album: metadata.common.album || 'Unknown Album',
                duration: metadata.format.duration,
                format: metadata.format.container,
                bpm: metadata.common.bpm || null,
                key: null, // music-metadata doesn't have key
                year: metadata.common.year || null,
                genre: (metadata.common.genre && metadata.common.genre[0]) || null,
                hasArt: hasArt,
                mood: null // music-metadata doesn't have mood
            };

            const trackId = writeTrackData({ track: trackData, metadata });

            // Handle Artwork File Write
            if (hasArt && trackId) {
                const pic = metadata.common.picture![0];
                const artPath = path.join(ART_DIR, `${trackId}.jpg`);
                await fs.promises.writeFile(artPath, pic.data);
            }

            return true;
        } catch (err) {
            console.error(`Failed to parse ${fullPath}:`, (err as Error).message);
            return false;
        }
    }
    return false;
}

// Recursive directory scan
async function scanRecursively(dir: string, limit: number = 0): Promise<void> {
    if (limit > 0 && scanStatus.processedCount >= limit) return;

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (limit > 0 && scanStatus.processedCount >= limit) return;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await scanRecursively(fullPath, limit);
        } else if (entry.isFile()) {
            scanStatus.currentFile = entry.name;
            const processed = await processFile(fullPath);
            if (processed) scanStatus.processedCount++;
        }
    }
}

// Background scan worker
async function startBackgroundScan(scanPath: string, limit: number = 0): Promise<void> {
    if (scanStatus.isScanning) return;

    scanStatus.isScanning = true;
    scanStatus.processedCount = 0;
    scanStatus.startTime = Date.now();
    scanStatus.totalFilesFound = 0;

    console.log(`Starting background scan: ${scanPath} (Limit: ${limit || 'Unlimited'})`);

    try {
        await scanRecursively(scanPath, limit);
        console.log("Scan complete.");
    } catch (err) {
        console.error("Scan error:", err);
    } finally {
        scanStatus.isScanning = false;
        scanStatus.currentFile = null;
    }
}

// ========== API ENDPOINTS ==========

// 1. Trigger Scan - Moved to specific section below
// 2. Scan Status
app.get('/api/status', (_req: Request, res: Response) => {
    res.json(scanStatus);
});

// 3. Clear Library - Moved to specific section below

// ==================== AUTH ENDPOINTS ====================

// Check if setup is required (no users exist)
app.get('/api/auth/setup', (req: Request, res: Response) => {
    const setupRequired = !auth.hasUsers();
    res.json({ setupRequired });
});

// Register new user
app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
        const { username, password, displayName } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Check if this is the first user (becomes admin)
        const isFirstUser = !auth.hasUsers();

        // If not first user, require admin token (unless we want open registration)
        // For now, let's allow open registration but only first user is admin
        // const isProtected = !isFirstUser; 

        // if (isProtected) {
        //     // Check for admin token if we want to restrict registration
        // }

        try {
            const user = await auth.createUser(username, password, displayName, isFirstUser);
            const token = auth.generateToken(user);
            res.json({ user, token });
        } catch (e: any) {
            if (e.message && e.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            throw e;
        }
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        const userWithPassword = auth.getUserByUsername(username);

        if (!userWithPassword || !(await auth.verifyPassword(password, userWithPassword.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const { password_hash, ...user } = userWithPassword;
        const token = auth.generateToken(user);

        res.json({ user, token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
app.get('/api/auth/me', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    res.json(req.user);
});

// Update user settings (EQ preset)
app.put('/api/auth/settings', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const { eqPreset } = req.body;
        if (req.user) {
            auth.updateUserEqPreset(req.user.id, JSON.stringify(eqPreset));
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Admin: Get all users
app.get('/api/users', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    const users = auth.getAllUsers();
    res.json(users);
});

// Admin: Create user
app.post('/api/users', auth.authenticateToken, auth.requireAdmin, async (req: Request, res: Response) => {
    try {
        const { username, password, displayName, isAdmin } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        try {
            const user = await auth.createUser(username, password, displayName, isAdmin);
            res.json(user);
        } catch (e: any) {
            if (e.message && e.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            throw e;
        }
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Admin: Delete user
app.delete('/api/users/:id', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

        // Prevent deleting self
        // Note: req.user is guaranteed by authenticateToken
        // We need to cast req to AuthRequest inside the handler or use it in definition, 
        // strictly speaking app.delete definition matches Requesthandler, 
        // but we can access req.user if we know middleware ran.
        // Let's use AuthRequest type assertion for safely accessing user.
        const authReq = req as AuthRequest;

        if (authReq.user && authReq.user.id === id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        const success = auth.deleteUser(id);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Public: Get Client Config (e.g. Last.fm API Key for redirect)
app.get('/api/config/public', (req: Request, res: Response) => {
    res.json({
        lastfm_api_key: getSetting('lastfm_api_key') || process.env.LASTFM_API_KEY
    });
});

// Admin: Get System Settings
app.get('/api/settings/system', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    res.json({
        lastfm_api_key: getSetting('lastfm_api_key') || '',
        lastfm_api_secret: getSetting('lastfm_api_secret') || ''
    });
});

// Admin: Update System Settings
app.put('/api/settings/system', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    const { lastfm_api_key, lastfm_api_secret } = req.body;
    if (lastfm_api_key !== undefined) setSetting('lastfm_api_key', lastfm_api_key);
    if (lastfm_api_secret !== undefined) setSetting('lastfm_api_secret', lastfm_api_secret);
    res.json({ success: true });
});

// ==================== API ROUTES ====================

// 4. Get All Tracks (Paginated)
app.get('/api/tracks', (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        // Default to 100000 (effectively unlimited) if no limit specified
        const limit = parseInt(req.query.limit as string) || 100000;
        const offset = (page - 1) * limit;

        const tracks = db.prepare(`
      SELECT * FROM tracks
      ORDER BY artist, album, title
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Track[];

        const totalResult = db.prepare('SELECT COUNT(*) as total FROM tracks').get() as { total: number };
        const total = totalResult.total;

        res.json({
            tracks,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Get tracks error:', err);
        res.status(500).json({ error: 'Database error fetching tracks' });
    }
});

// 5. Serve Album Artwork with caching
app.get('/api/art/:trackId', (req: Request, res: Response) => {
    const artPath = path.join(ART_DIR, `${req.params.trackId}.jpg`);
    if (fs.existsSync(artPath)) {
        // Cache for 1 day - album art rarely changes
        res.set('Cache-Control', 'public, max-age=86400, immutable');
        res.set('ETag', `art-${req.params.trackId}`);
        res.sendFile(artPath);
    } else {
        res.status(404).send('No artwork');
    }
});

// 5b. Serve Album Images (Back covers, etc)
app.get('/api/art/release/:mbid/:type', (req: Request, res: Response) => {
    const { mbid, type } = req.params;
    const artDir = path.join(__dirname, 'storage', 'art');

    try {
        if (!fs.existsSync(artDir)) {
            return res.sendStatus(404);
        }

        let files = fs.readdirSync(artDir).filter(f => f.startsWith(`${mbid}_${type}`));
        if (files.length === 0 && type === 'front') {
            files = fs.readdirSync(artDir).filter(f => f.startsWith(`${mbid}_medium`));
        }

        if (files.length > 0) {
            res.sendFile(path.join(artDir, files[0]));
        } else {
            res.sendStatus(404);
        }
    } catch (e) {
        res.sendStatus(404);
    }
});

// 6. Stream Audio
app.get('/api/stream/:id', (req: Request, res: Response) => {
    const track = db.prepare('SELECT path FROM tracks WHERE id = ?').get(req.params.id) as { path: string } | undefined;
    if (!track) return res.status(404).send('Track not found');

    const filePath = track.path;
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/mpeg',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'audio/mpeg',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

// 7. Search Endpoint (Optimized)
app.get('/api/search', (req: Request, res: Response) => {
    try {
        const { q } = req.query;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Cap at 100
        const offset = (page - 1) * limit;

        if (!q || (q as string).trim().length === 0) {
            return res.status(400).json({ error: 'Search query parameter is required' });
        }

        const query = `%${(q as string).trim()}%`;

        // Optimized search with UNION to avoid LEFT JOIN performance issues
        const sql = `
            SELECT DISTINCT t.*
            FROM tracks t
            WHERE t.title LIKE ? OR t.artist LIKE ? OR t.album LIKE ? OR t.genre LIKE ? OR t.mood LIKE ?
            UNION
            SELECT DISTINCT t.*
            FROM tracks t
            JOIN credits c ON c.track_id = t.id
            WHERE c.name LIKE ?
            ORDER BY artist, album, title
            LIMIT ? OFFSET ?
        `;

        const results = db.prepare(sql).all(query, query, query, query, query, query, limit, offset) as Track[];

        // Get total count for pagination
        const countSql = `
            SELECT COUNT(*) as total FROM (
                SELECT DISTINCT t.id
                FROM tracks t
                WHERE t.title LIKE ? OR t.artist LIKE ? OR t.album LIKE ? OR t.genre LIKE ? OR t.mood LIKE ?
                UNION
                SELECT DISTINCT t.id
                FROM tracks t
                JOIN credits c ON c.track_id = t.id
                WHERE c.name LIKE ?
            )
        `;

        const totalResult = db.prepare(countSql).get(query, query, query, query, query, query) as { total: number };
        const total = totalResult.total;

        res.json({
            results,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Search endpoint error:', err);
        res.status(500).json({ error: 'Database error during search' });
    }
});

// 8. Get Credits for Album
app.get('/api/credits', (req: Request, res: Response) => {
    try {
        const { album } = req.query;
        if (!album || (album as string).trim().length === 0) {
            return res.status(400).json({ error: 'Album parameter is required' });
        }

        const sql = `
      SELECT c.*, t.title as track_title
      FROM credits c
      JOIN tracks t ON c.track_id = t.id
      WHERE t.album = ?
      ORDER BY c.role, c.name
    `;

        const credits = db.prepare(sql).all((album as string).trim()) as Credit[];
        res.json(credits);
    } catch (err) {
        console.error("Error fetching credits:", err);
        res.status(500).json({ error: 'Database error fetching credits' });
    }
});

// 9. Toggle Favorite
app.post('/api/favorite', (req: Request, res: Response) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing ID' });

    try {
        const track = db.prepare('SELECT rating FROM tracks WHERE id = ?').get(id) as { rating: number } | undefined;
        if (!track) return res.status(404).json({ error: 'Track not found' });

        const newRating = track.rating === 1 ? 0 : 1;
        db.prepare('UPDATE tracks SET rating = ? WHERE id = ?').run(newRating, id);
        res.json({ id, rating: newRating });
    } catch (err) {
        console.error("Error toggling favorite:", err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 4. Clear Library (Admin only)
app.post('/api/clear', auth.requireAdmin, (req: AuthRequest, res: Response) => {
    const tables = [
        'tracks', 'artists', 'releases', 'labels', 'credits',
        'playlists', 'playlist_tracks', 'listening_history',
        'tags', 'entity_tags', 'album_images'
    ];

    try {
        db.transaction(() => {
            for (const table of tables) {
                db.prepare(`DELETE FROM ${table}`).run();
                db.prepare('DELETE FROM sqlite_sequence WHERE name=?').run(table);
            }
        })();

        // Clean up art dir
        try {
            const files = fs.readdirSync(ART_DIR);
            for (const file of files) {
                fs.unlinkSync(path.join(ART_DIR, file));
            }
        } catch (e) { /* ignore */ }

        scanStatus = {
            isScanning: false,
            processedCount: 0,
            currentFile: '',
            totalFilesFound: 0,
            startTime: null
        };

        console.log('Library fully cleared');
        res.json({ message: 'Library cleared' });
    } catch (err) {
        console.error('Error clearing library:', err);
        res.status(500).json({ error: 'Failed to clear library' });
    }
});

// 5. Scan Library (Admin only)
app.post('/api/scan', auth.requireAdmin, (req: AuthRequest, res: Response) => {
    const { path: scanPath, limit } = req.body;
    if (!scanPath) return res.status(400).json({ error: 'Missing path' });

    if (scanStatus.isScanning) return res.status(409).json({ error: 'Scan already in progress' });

    const limitNum = parseInt(limit) || 0;
    // Use the existing background scan function which handles state correctly
    startBackgroundScan(scanPath, limitNum);

    res.json({ message: 'Scan started' });
});


// 10. Start MusicBrainz Enrichment (Admin only)
app.post('/api/enrich', auth.requireAdmin, async (_req: AuthRequest, res: Response) => {
    musicbrainz.startEnrichment();
    res.json({ message: 'Enrichment started' });
});

// 10a. Fast album-based enrichment (Admin only)
app.post('/api/enrich/fast', auth.requireAdmin, async (req: AuthRequest, res: Response) => {
    const workerCount = parseInt(req.body?.workers as string) || 3;
    musicbrainz.startAlbumEnrichment(workerCount);
    res.json({ message: `Fast album-based enrichment started with ${workerCount} workers` });
});

// 10b. Bulk enrich artist bios (Admin only)
app.post('/api/enrich/artists', auth.requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
        // Get all artists without descriptions
        const artists = db.prepare('SELECT * FROM artists WHERE description IS NULL OR description = ""').all() as Artist[];

        if (artists.length === 0) {
            return res.json({ message: 'No artists need enrichment' });
        }

        console.log(`Starting bulk enrichment for ${artists.length} artists...`);

        let enriched = 0;
        let errors = 0;
        const batchSize = 5; // Process 5 artists at a time
        const delayBetweenBatches = 2000; // 2 seconds between batches

        // Process artists in batches to avoid overwhelming APIs
        for (let i = 0; i < artists.length; i += batchSize) {
            const batch = artists.slice(i, i + batchSize);

            const promises = batch.map(async (artist) => {
                try {
                    // Try Last.fm first
                    if (process.env.LASTFM_API_KEY) {
                        const info = await lastfm.getArtistInfo(artist.name);
                        if (info && (info.description || info.image)) {
                            db.prepare('UPDATE artists SET description = ?, image_path = ? WHERE id = ?')
                                .run(info.description, info.image, artist.id);
                            return { success: true, artist: artist.name };
                        }
                    }

                    // Fallback to Wikipedia
                    const wikiResult = await wikipedia.getArtistBio(artist.name);
                    if (wikiResult && wikiResult.bio) {
                        db.prepare('UPDATE artists SET description = ?, wiki_url = ? WHERE id = ?')
                            .run(wikiResult.bio, wikiResult.url, artist.id);
                        return { success: true, artist: artist.name };
                    }

                    return { success: false, artist: artist.name, reason: 'No data found' };
                } catch (e) {
                    console.error(`Failed to enrich ${artist.name}:`, (e as Error).message);
                    return { success: false, artist: artist.name, error: (e as Error).message };
                }
            });

            const results = await Promise.allSettled(promises);

            // Process results
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    if (result.value.success) {
                        enriched++;
                    } else {
                        errors++;
                    }
                } else {
                    errors++;
                }
            });

            // Rate limiting - wait between batches
            if (i + batchSize < artists.length) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }

        res.json({
            message: 'Bulk enrichment complete',
            total: artists.length,
            enriched,
            errors
        });
    } catch (err) {
        console.error('Bulk enrichment error:', err);
        res.status(500).json({ error: 'Bulk enrichment failed' });
    }
});

// 11. Get Enrichment Status
app.get('/api/enrich/status', (_req: Request, res: Response) => {
    res.json(musicbrainz.getEnrichmentStatus());
});

// 12. Get Artist Details (supports both MBID and name)
app.get('/api/artist/:identifier', async (req: Request, res: Response) => {
    try {
        const { identifier } = req.params;
        if (!identifier || identifier.trim().length === 0) {
            return res.status(400).json({ error: 'Artist identifier is required' });
        }

        // Try MBID first, then fallback to name
        let localArtist = db.prepare('SELECT * FROM artists WHERE mbid = ?').get(identifier) as Artist | undefined;

        if (!localArtist) {
            localArtist = db.prepare('SELECT * FROM artists WHERE name = ? COLLATE NOCASE').get(identifier) as Artist | undefined;
        }

        if (!localArtist) return res.status(404).json({ error: 'Artist not found' });

        // Enrich if missing description
        if (!localArtist.description) {
            console.log(`Enriching artist: ${localArtist.name}`);

            // Try Last.fm first if API key is available
            if (process.env.LASTFM_API_KEY) {
                try {
                    const info = await lastfm.getArtistInfo(localArtist.name);
                    if (info && (info.description || info.image)) {
                        db.prepare(`
                            UPDATE artists
                            SET description = COALESCE(?, description),
                                image_path = COALESCE(?, image_path)
                            WHERE id = ?
                        `).run(info.description, info.image, localArtist.id);
                        localArtist = db.prepare('SELECT * FROM artists WHERE id = ?').get(localArtist.id) as Artist;
                        console.log(`Last.fm enrichment successful for ${localArtist.name}`);
                    }
                } catch (e) {
                    console.error("Last.fm enrichment failed:", (e as Error).message);
                }
            }

            // Fallback to Wikipedia if still missing description
            if (!localArtist.description) {
                try {
                    console.log(`Fetching Wikipedia bio for ${localArtist.name}...`);
                    const wikiResult = await wikipedia.getArtistBio(localArtist.name);
                    if (wikiResult && wikiResult.bio) {
                        db.prepare('UPDATE artists SET description = ?, wiki_url = ? WHERE id = ?')
                            .run(wikiResult.bio, wikiResult.url, localArtist.id);
                        localArtist.description = wikiResult.bio;
                        localArtist.wiki_url = wikiResult.url;
                        console.log(`Wikipedia bio saved for ${localArtist.name}`);
                    }
                } catch (e) {
                    console.error('Wikipedia enrichment failed:', (e as Error).message);
                }
            }
        }

        // Get credits - try both MBID and name-based lookup
        const credits = db.prepare(`
            SELECT c.*, t.title, t.album, t.artist as track_artist
            FROM credits c
            JOIN tracks t ON c.track_id = t.id
            WHERE c.artist_mbid = ? OR c.name = ?
            ORDER BY c.role, t.album, t.title
        `).all(identifier, localArtist.name) as (Credit & { title: string; album: string; track_artist: string })[];

        const groupedCredits: Record<string, typeof credits> = {};
        for (const credit of credits) {
            if (!groupedCredits[credit.role]) {
                groupedCredits[credit.role] = [];
            }
            groupedCredits[credit.role].push(credit);
        }

        // Get albums for this artist
        const albums = db.prepare(`
            SELECT t.album,
                   MAX(t.release_mbid) as release_mbid,
                   MAX(r.title) as title,
                   MAX(r.release_date) as release_date,
                   MAX(t.year) as track_year,
                   MAX(r.primary_type) as primary_type,
                   MAX(l.name) as label_name,
                   MAX(ai.path) as art_path,
                   MAX(t.id) as sample_track_id
            FROM tracks t
            LEFT JOIN releases r ON t.release_mbid = r.mbid
            LEFT JOIN labels l ON r.label_mbid = l.mbid
            LEFT JOIN album_images ai ON r.mbid = ai.release_mbid AND (ai.type = 'front' OR ai.type = 'medium')
            WHERE t.artist = ?
            GROUP BY t.album
            ORDER BY
                CASE
                    WHEN MAX(r.primary_type) = 'Album' THEN 1
                    WHEN MAX(r.primary_type) = 'EP' THEN 2
                    WHEN MAX(r.primary_type) = 'Single' THEN 3
                    ELSE 5
                END,
                COALESCE(MAX(r.release_date), MAX(t.year), '0000') DESC
        `).all(localArtist.name) as any[];

        const uniqueAlbums: typeof albums = [];
        const seen = new Set<string>();
        const associatedLabels = new Set<string>();

        for (const a of albums) {
            const key = a.release_mbid || a.album;
            if (!seen.has(key)) {
                uniqueAlbums.push(a);
                seen.add(key);
            }
            if (a.label_name) {
                associatedLabels.add(a.label_name);
            }
        }

        res.json({
            artist: localArtist,
            credits: groupedCredits,
            albums: uniqueAlbums,
            labels: Array.from(associatedLabels).sort(),
            totalTracks: credits.length
        });
    } catch (err) {
        console.error('Get artist details error:', err);
        res.status(500).json({ error: 'Database error fetching artist details' });
    }
});

// 13. Get All Artists (Paginated)
app.get('/api/artists', (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;

        const artists = db.prepare(`
      SELECT a.*, COUNT(DISTINCT t.id) as track_count
      FROM artists a
      JOIN tracks t ON t.artist = a.name
      GROUP BY a.id
      ORDER BY a.name
      LIMIT ? OFFSET ?
    `).all(limit, offset) as (Artist & { track_count: number })[];

        const totalResult = db.prepare(`
      SELECT COUNT(DISTINCT a.id) as total
      FROM artists a
      JOIN tracks t ON t.artist = a.name
    `).get() as { total: number };
        const total = totalResult.total;

        res.json({
            artists,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Get artists error:', err);
        res.status(500).json({ error: 'Database error fetching artists' });
    }
});

// 14. Artist lookup by name (fallback)
app.get('/api/artist-by-name/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    const artist = db.prepare('SELECT * FROM artists WHERE name = ? COLLATE NOCASE').get(name) as Artist | undefined;
    if (artist) {
        res.json(artist);
    } else {
        res.status(404).json({ error: 'Artist not found' });
    }
});

// 15. Get Credits Grouped by Role for Album
app.get('/api/credits/album/:album', (req: Request, res: Response) => {
    const { album } = req.params;

    const credits = db.prepare(`
    SELECT c.*, t.title as track_title
    FROM credits c
    JOIN tracks t ON c.track_id = t.id
    WHERE t.album = ?
    ORDER BY c.role, c.name
  `).all(album) as (Credit & { track_title: string })[];

    const grouped: Record<string, typeof credits> = {};
    for (const credit of credits) {
        if (!grouped[credit.role]) {
            grouped[credit.role] = [];
        }
        const exists = grouped[credit.role].find(c => c.name === credit.name && c.artist_mbid === credit.artist_mbid);
        if (!exists) {
            grouped[credit.role].push(credit);
        }
    }

    res.json(grouped);
});

// 16. Get Extended Album Metadata
app.get('/api/album-metadata', (req: Request, res: Response) => {
    const { album, artist } = req.query;

    try {
        const track = db.prepare('SELECT release_mbid FROM tracks WHERE album = ? AND artist = ? LIMIT 1').get(album, artist) as { release_mbid: string } | undefined;

        if (!track || !track.release_mbid) {
            return res.json({ found: false });
        }

        const release = db.prepare('SELECT * FROM releases WHERE mbid = ?').get(track.release_mbid) as any;

        let label = null;
        if (release && release.label_mbid) {
            label = db.prepare('SELECT * FROM labels WHERE mbid = ?').get(release.label_mbid);
        }

        let tags: any[] = [];
        if (release) {
            tags = db.prepare(`
        SELECT t.name, et.count, 'release' as source
        FROM entity_tags et
        JOIN tags t ON et.tag_id = t.id
        WHERE et.entity_type = 'release' AND et.entity_id = ?
        ORDER BY et.count DESC
        LIMIT 5
      `).all(release.id);
        }

        if (tags.length < 5 && track) {
            const artistTags = db.prepare(`
        SELECT t.name, et.count, 'artist' as source
        FROM entity_tags et
        JOIN tags t ON et.tag_id = t.id
        JOIN artists a ON et.entity_id = a.id
        WHERE et.entity_type = 'artist' AND a.name = ?
        ORDER BY et.count DESC
        LIMIT 5
      `).all(artist);

            for (const tag of artistTags as any[]) {
                if (!tags.find((t: any) => t.name === tag.name)) {
                    tags.push(tag);
                }
            }
        }

        let images: any[] = [];
        if (release) {
            images = db.prepare('SELECT type, source FROM album_images WHERE release_mbid = ?').all(release.mbid);
        }

        res.json({
            found: true,
            release,
            label,
            tags: tags.slice(0, 8),
            images
        });
    } catch (e) {
        console.error("Error fetching album metadata:", e);
        res.status(500).json({ error: (e as Error).message });
    }
});

// ========== PHASE 2 ENDPOINTS ==========

// Log a play to listening history
app.post('/api/history/log', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { trackId } = req.body;
    if (!trackId) return res.status(400).json({ error: 'trackId required' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
    db.prepare('INSERT INTO listening_history (track_id, user_id) VALUES (?, ?)').run(trackId, req.user!.id);

    // Update Last.fm Now Playing
    if (user && user.lastfm_session_key) {
        const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as Track;
        if (track) {
            lastfm.updateNowPlaying(user.lastfm_session_key, track.artist, track.title, track.album)
                .catch(err => console.error('Last.fm Now Playing Error:', err));
        }
    }

    res.json({ success: true });
});

// Get recently played tracks
app.get('/api/history/recent', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;
    const history = db.prepare(`
    SELECT t.*, h.played_at
    FROM listening_history h
    JOIN tracks t ON h.track_id = t.id
    WHERE h.user_id = ?
    ORDER BY h.played_at DESC
    LIMIT ?
  `).all(req.user!.id, limit);
    res.json(history);
});

// Get recently added tracks
app.get('/api/tracks/recent', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;
    const tracks = db.prepare(`
    SELECT * FROM tracks
    ORDER BY COALESCE(added_at, id) DESC
    LIMIT ?
  `).all(limit);
    res.json(tracks);
});

// ========== USER SETTINGS & INTEGRATIONS ==========

// Updated EQ Preset
app.put('/api/user/eq', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { preset } = req.body;
    // Preset format: "0,0,0,0,0,0,0,0,0,0" (10 bands)
    db.prepare('UPDATE users SET eq_preset = ? WHERE id = ?').run(preset, req.user!.id);
    res.json({ success: true, preset });
});

// Last.fm Auth - Exchange Token
app.post('/api/auth/lastfm/token', auth.authenticateToken, async (req: AuthRequest, res: Response) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const session = await lastfm.getSession(token);
    if (!session) return res.status(401).json({ error: 'Failed to get Last.fm session' });

    db.prepare('UPDATE users SET lastfm_session_key = ?, lastfm_username = ? WHERE id = ?')
        .run(session.sessionKey, session.username, req.user!.id);

    res.json({ success: true, username: session.username });
});

// Last.fm Scrobble
app.post('/api/user/scrobble', auth.authenticateToken, async (req: AuthRequest, res: Response) => {
    // Get user's session key
    const user = db.prepare('SELECT lastfm_session_key FROM users WHERE id = ?').get(req.user!.id) as { lastfm_session_key: string } | undefined;

    if (!user || !user.lastfm_session_key) {
        return res.status(400).json({ error: 'User not connected to Last.fm' });
    }

    const { artist, track, album, timestamp } = req.body;
    if (!artist || !track) return res.status(400).json({ error: 'Missing track data' });

    // Fire and forget scrobble to not block response
    lastfm.scrobble(user.lastfm_session_key, artist, track, timestamp || Math.floor(Date.now() / 1000), album);

    // Also update "Now Playing" status
    lastfm.updateNowPlaying(user.lastfm_session_key, artist, track, album);

    res.json({ success: true });
});

// ========== PHASE 3: PLAYLISTS ==========

// ========== PLAYLIST ENDPOINTS ==========

// Get all playlists (User's own + Shared/Featured)
app.get('/api/playlists', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    // Return user's playlists
    const playlists = db.prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id);
    res.json(playlists);
});

// Get featured playlists
app.get('/api/playlists/featured', (_req: Request, res: Response) => {
    const playlists = db.prepare('SELECT * FROM playlists WHERE is_featured = 1 ORDER BY updated_at DESC').all();
    res.json(playlists);
});

// Get playlists pinned to homepage (MUST be before :id route!)
app.get('/api/playlists/home', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const playlists = db.prepare(`
        SELECT p.*, 
               (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = p.id) as track_count,
               (SELECT t.id FROM playlist_tracks pt JOIN tracks t ON pt.track_id = t.id WHERE pt.playlist_id = p.id AND t.has_art = 1 LIMIT 1) as cover_track_id
        FROM playlists p 
        WHERE p.pinned_to_home = 1 AND p.user_id = ?
        ORDER BY p.updated_at DESC
    `).all(req.user!.id);
    res.json(playlists);
});

// Get playlist with tracks
app.get('/api/playlists/:id', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    // Allow if user matches OR if playlist is featured/public (future proofing)
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as Playlist | undefined;

    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    // Check access
    if (playlist.user_id !== null && playlist.user_id !== req.user!.id && !playlist.is_featured) {
        // If we want to allow viewing other people's playlists later, we'd check for "is_public" here
        // For now, only owner or featured
        return res.status(403).json({ error: 'Access denied' });
    }

    const tracks = db.prepare(`
    SELECT t.*, pt.position
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position
  `).all(id);

    res.json({ ...playlist, tracks });
});

// Create playlist
app.post('/api/playlists', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { name, description, is_featured } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const result = db.prepare('INSERT INTO playlists (name, description, is_featured, user_id) VALUES (?, ?, ?, ?)').run(name, description || '', is_featured ? 1 : 0, req.user!.id);
    res.json({ id: result.lastInsertRowid, name, description, is_featured, user_id: req.user!.id });
});

// Add track to playlist
app.post('/api/playlists/:id/tracks', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { trackId } = req.body;
    if (!trackId) return res.status(400).json({ error: 'trackId required' });

    // Verify ownership
    const playlist = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (playlist.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    // Check if track already in playlist
    const existing = db.prepare('SELECT id FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').get(id, trackId);
    if (existing) return res.json({ success: true, message: 'Track already in playlist' });

    const maxPos = db.prepare('SELECT MAX(position) as max FROM playlist_tracks WHERE playlist_id = ?').get(id) as { max: number | null };
    const position = (maxPos?.max || 0) + 1;

    db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)').run(id, trackId, position);
    db.prepare('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    res.json({ success: true, position });
});

// Add multiple tracks to playlist at once
app.post('/api/playlists/:id/tracks/batch', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { trackIds } = req.body;
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
        return res.status(400).json({ error: 'trackIds array required' });
    }

    // Verify ownership
    const playlist = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (playlist.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    const maxPos = db.prepare('SELECT MAX(position) as max FROM playlist_tracks WHERE playlist_id = ?').get(id) as { max: number | null };
    let position = (maxPos?.max || 0);

    const insertStmt = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
    const txn = db.transaction(() => {
        for (const trackId of trackIds) {
            position++;
            insertStmt.run(id, trackId, position);
        }
        db.prepare('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    });
    txn();

    res.json({ success: true, added: trackIds.length });
});

// Remove track from playlist
app.delete('/api/playlists/:id/tracks/:trackId', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id, trackId } = req.params;

    // Verify ownership
    const playlist = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (playlist.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(id, trackId);
    db.prepare('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    res.json({ success: true });
});

// Reorder track in playlist - Optimized
app.put('/api/playlists/:id/tracks/reorder', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { trackId, newPosition } = req.body;
    if (!trackId || newPosition === undefined) {
        return res.status(400).json({ error: 'trackId and newPosition required' });
    }

    // Verify ownership
    const playlist = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (playlist.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    // Get current position
    const current = db.prepare('SELECT position FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').get(id, trackId) as { position: number } | undefined;
    if (!current) return res.status(404).json({ error: 'Track not found in playlist' });

    const oldPosition = current.position;

    // Optimized single-transaction approach
    const txn = db.transaction(() => {
        if (newPosition === oldPosition) {
            return; // No change needed
        }

        if (newPosition > oldPosition) {
            // Moving down: Shift items between old and new positions UP (decrement)
            db.prepare(`
                UPDATE playlist_tracks 
                SET position = position - 1 
                WHERE playlist_id = @id 
                AND position > @oldPos 
                AND position <= @newPos
            `).run({ id, oldPos: oldPosition, newPos: newPosition });
        } else {
            // Moving up: Shift items between new and old positions DOWN (increment)
            db.prepare(`
                UPDATE playlist_tracks 
                SET position = position + 1 
                WHERE playlist_id = @id 
                AND position >= @newPos 
                AND position < @oldPos
            `).run({ id, oldPos: oldPosition, newPos: newPosition });
        }

        // Set the new position for the target track
        db.prepare(`
            UPDATE playlist_tracks 
            SET position = @newPos 
            WHERE playlist_id = @id 
            AND track_id = @trackId
        `).run({ id, newPos: newPosition, trackId });

        db.prepare('UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    });

    try {
        txn();
        res.json({ success: true });
    } catch (err) {
        console.error('Reorder error:', err);
        res.status(500).json({ error: 'Failed to reorder' });
    }
});

import { Playlist } from '../types';

// ... other imports ...

// Update playlist details
app.put('/api/playlists/:id', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, description, pinned_to_home, cover_art_path } = req.body;

    // Verify ownership
    const playlist = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (playlist.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (pinned_to_home !== undefined) { updates.push('pinned_to_home = ?'); params.push(pinned_to_home ? 1 : 0); }
    if (cover_art_path !== undefined) { updates.push('cover_art_path = ?'); params.push(cover_art_path); }

    if (updates.length === 0) return res.json({ success: true }); // Nothing to update

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
});


// Delete playlist
app.delete('/api/playlists/:id', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Verify ownership
    const playlist = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (playlist.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    res.json({ success: true });
});

// Update playlist (including pinning to home)
app.put('/api/playlists/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, description, pinned_to_home, type, rules, cover_art_path } = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (pinned_to_home !== undefined) { updates.push('pinned_to_home = ?'); values.push(pinned_to_home ? 1 : 0); }
    if (type !== undefined) { updates.push('type = ?'); values.push(type); }
    if (rules !== undefined) { updates.push('rules = ?'); values.push(JSON.stringify(rules)); }
    if (cover_art_path !== undefined) { updates.push('cover_art_path = ?'); values.push(cover_art_path); }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE playlists SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
});

// ========== PLAY HISTORY ENDPOINTS ==========

// Record a play
app.post('/api/history', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { trackId } = req.body;
    if (!trackId) return res.status(400).json({ error: 'trackId required' });

    db.prepare('INSERT INTO listening_history (track_id, user_id) VALUES (?, ?)').run(trackId, req.user!.id);
    res.json({ success: true });
});

// Get play history (paginated)
app.get('/api/history', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = db.prepare(`
        SELECT h.id, h.played_at, t.*
        FROM listening_history h
        JOIN tracks t ON h.track_id = t.id
        WHERE h.user_id = ?
        ORDER BY h.played_at DESC
        LIMIT ? OFFSET ?
    `).all(req.user!.id, limit, offset);

    res.json(history);
});

// ========== HOMEPAGE DATA ENDPOINTS ==========

// Get recently added albums (grouped by album) - With Pagination
app.get('/api/home/albums/recent', (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const albums = db.prepare(`
        SELECT
            album,
            artist,
            MIN(id) as sample_track_id,
            MAX(has_art) as has_art,
            COUNT(*) as track_count,
            MAX(added_at) as added_at,
            year
        FROM tracks
        WHERE album IS NOT NULL AND album != ''
        GROUP BY artist, album
        ORDER BY MAX(added_at) DESC, MAX(id) DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);

    // Get total count for pagination
    const totalResult = db.prepare(`
        SELECT COUNT(DISTINCT artist, album) as total
        FROM tracks
        WHERE album IS NOT NULL AND album != ''
    `).get() as { total: number };

    res.json({
        albums,
        pagination: {
            page,
            limit,
            total: totalResult.total,
            totalPages: Math.ceil(totalResult.total / limit)
        }
    });
});

// Get recently played albums (grouped by album) - With Pagination
app.get('/api/home/albums/played', (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const albums = db.prepare(`
        SELECT
            t.album,
            t.artist,
            MIN(t.id) as sample_track_id,
            MAX(t.has_art) as has_art,
            COUNT(DISTINCT t.id) as track_count,
            MAX(h.played_at) as last_played,
            t.year
        FROM listening_history h
        JOIN tracks t ON h.track_id = t.id
        WHERE t.album IS NOT NULL AND t.album != ''
        GROUP BY t.artist, t.album
        ORDER BY MAX(h.played_at) DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);

    // Get total count for pagination
    const totalResult = db.prepare(`
        SELECT COUNT(DISTINCT t.artist, t.album) as total
        FROM listening_history h
        JOIN tracks t ON h.track_id = t.id
        WHERE t.album IS NOT NULL AND t.album != ''
    `).get() as { total: number };

    res.json({
        albums,
        pagination: {
            page,
            limit,
            total: totalResult.total,
            totalPages: Math.ceil(totalResult.total / limit)
        }
    });
});

// ========== ALBUM COLLECTIONS ENDPOINTS ==========

// Get all collections - Optimized (User's own + Shared)
app.get('/api/collections', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    // Single query with JOIN to get collections and preview albums
    const collections = db.prepare(`
        SELECT
            c.id,
            c.name,
            c.description,
            c.pinned_to_home,
            c.cover_art_path,
            c.user_id,
            c.is_shared,
            c.created_at,
            c.updated_at,
            COUNT(DISTINCT ca.id) as album_count,
            GROUP_CONCAT(
                JSON_OBJECT(
                    'album_name', ca.album_name,
                    'artist_name', ca.artist_name,
                    'sample_track_id', t.id
                )
            ) as preview_albums_json
        FROM album_collections c
        LEFT JOIN collection_albums ca ON c.id = ca.collection_id
        LEFT JOIN tracks t ON t.album = ca.album_name AND t.artist = ca.artist_name AND t.has_art = 1
        WHERE (c.user_id = ? OR c.is_shared = 1) AND (ca.position IS NULL OR ca.position <= 4)
        GROUP BY c.id
        ORDER BY c.updated_at DESC
    `).all(req.user!.id) as any[];

    // Parse the JSON preview albums
    const collectionsWithPreviews = collections.map(col => {
        let preview_albums = [];
        if (col.preview_albums_json) {
            try {
                preview_albums = JSON.parse(`[${col.preview_albums_json}]`);
            } catch (e) {
                preview_albums = [];
            }
        }

        return {
            id: col.id,
            name: col.name,
            description: col.description,
            pinned_to_home: col.pinned_to_home,
            cover_art_path: col.cover_art_path,
            user_id: col.user_id,
            is_shared: col.is_shared,
            created_at: col.created_at,
            updated_at: col.updated_at,
            album_count: col.album_count,
            preview_albums
        };
    });

    res.json(collectionsWithPreviews);
});

// Get collections pinned to homepage
app.get('/api/collections/home', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const collections = db.prepare(`
        SELECT c.*,
               (SELECT COUNT(*) FROM collection_albums WHERE collection_id = c.id) as album_count
        FROM album_collections c 
        WHERE c.pinned_to_home = 1 AND c.user_id = ?
        ORDER BY c.updated_at DESC
    `).all(req.user!.id) as any[];

    // Add preview albums (first 4) for each collection
    const collectionsWithPreviews = collections.map(col => {
        const previewAlbums = db.prepare(`
            SELECT ca.album_name, ca.artist_name,
                   (SELECT id FROM tracks t WHERE t.album = ca.album_name AND t.artist = ca.artist_name AND t.has_art = 1 LIMIT 1) as sample_track_id
            FROM collection_albums ca
            WHERE ca.collection_id = ?
            ORDER BY ca.position
            LIMIT 4
        `).all(col.id);
        return { ...col, preview_albums: previewAlbums };
    });

    res.json(collectionsWithPreviews);
});

// Get collection with albums
app.get('/api/collections/:id', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const collection = db.prepare('SELECT * FROM album_collections WHERE id = ?').get(id) as any;

    if (!collection) return res.status(404).json({ error: 'Collection not found' });

    // Check access
    if (collection.user_id !== req.user!.id && !collection.is_shared) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const albums = db.prepare(`
        SELECT ca.*,
               (SELECT id FROM tracks t WHERE t.album = ca.album_name AND t.artist = ca.artist_name AND t.has_art = 1 LIMIT 1) as sample_track_id
        FROM collection_albums ca
        WHERE ca.collection_id = ?
        ORDER BY ca.position
    `).all(id);

    res.json({ ...collection, albums });
});

// Create collection
app.post('/api/collections', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { name, description, pinned_to_home, is_shared } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = db.prepare('INSERT INTO album_collections (name, description, pinned_to_home, user_id, is_shared) VALUES (?, ?, ?, ?, ?)')
        .run(name, description || '', pinned_to_home ? 1 : 0, req.user!.id, is_shared ? 1 : 0);
    res.json({ id: result.lastInsertRowid, name, description, user_id: req.user!.id, is_shared: is_shared ? 1 : 0 });
});

// Update collection
app.put('/api/collections/:id', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, description, pinned_to_home, cover_art_path, is_shared } = req.body;

    // Verify ownership
    const collection = db.prepare('SELECT user_id FROM album_collections WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (pinned_to_home !== undefined) { updates.push('pinned_to_home = ?'); values.push(pinned_to_home ? 1 : 0); }
    if (cover_art_path !== undefined) { updates.push('cover_art_path = ?'); values.push(cover_art_path); }
    if (is_shared !== undefined) { updates.push('is_shared = ?'); values.push(is_shared ? 1 : 0); }

    if (updates.length === 0) return res.json({ success: true });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE album_collections SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
});

// Delete collection
app.delete('/api/collections/:id', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Verify ownership
    const collection = db.prepare('SELECT user_id FROM album_collections WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare('DELETE FROM album_collections WHERE id = ?').run(id);
    res.json({ success: true });
});

// Add album to collection
app.post('/api/collections/:id/albums', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { albumName, artistName } = req.body;
    if (!albumName || !artistName) return res.status(400).json({ error: 'albumName and artistName required' });

    // Verify ownership
    const collection = db.prepare('SELECT user_id FROM album_collections WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    // Get next position
    const maxPos = db.prepare('SELECT MAX(position) as max FROM collection_albums WHERE collection_id = ?').get(id) as { max: number | null };
    const position = (maxPos?.max || 0) + 1;

    try {
        db.prepare('INSERT INTO collection_albums (collection_id, album_name, artist_name, position) VALUES (?, ?, ?, ?)')
            .run(id, albumName, artistName, position);
        db.prepare('UPDATE album_collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
        res.json({ success: true, position });
    } catch (e: any) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.json({ success: true, message: 'Album already in collection' });
        } else {
            throw e;
        }
    }
});

// Remove album from collection
app.delete('/api/collections/:id/albums/:albumId', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { id, albumId } = req.params;

    // Verify ownership
    const collection = db.prepare('SELECT user_id FROM album_collections WHERE id = ?').get(id) as { user_id: number } | undefined;
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

    db.prepare('DELETE FROM collection_albums WHERE collection_id = ? AND id = ?').run(id, albumId);
    db.prepare('UPDATE album_collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    res.json({ success: true });
});

// ==================== LABELS API ====================

// Get all labels with album count and preview albums - With Pagination
app.get('/api/labels', (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const labels = db.prepare(`
        SELECT l.id, l.name, l.mbid, l.type, l.country, l.founded,
               COUNT(DISTINCT r.id) as album_count,
               GROUP_CONCAT(
                   JSON_OBJECT(
                       'album_name', r.title,
                       'artist_name', r.artist_credit,
                       'sample_track_id', t.id
                   )
               ) as preview_albums_json
        FROM labels l
        LEFT JOIN releases r ON r.label_mbid = l.mbid
        LEFT JOIN tracks t ON t.release_mbid = r.mbid AND t.has_art = 1
        WHERE l.name IS NOT NULL AND l.name != '' AND l.name != '[no label]'
        GROUP BY l.id
        HAVING album_count > 0
        ORDER BY album_count DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    // Parse the JSON preview albums
    const labelsWithPreviews = labels.map(label => {
        let preview_albums = [];
        if (label.preview_albums_json) {
            try {
                preview_albums = JSON.parse(`[${label.preview_albums_json}]`);
            } catch (e) {
                preview_albums = [];
            }
        }

        return {
            id: label.id,
            name: label.name,
            mbid: label.mbid,
            type: label.type,
            country: label.country,
            founded: label.founded,
            album_count: label.album_count,
            preview_albums
        };
    });

    // Get total count for pagination
    const totalResult = db.prepare(`
        SELECT COUNT(DISTINCT l.id) as total
        FROM labels l
        LEFT JOIN releases r ON r.label_mbid = l.mbid
        WHERE l.name IS NOT NULL AND l.name != '' AND l.name != '[no label]'
        GROUP BY l.id
        HAVING COUNT(DISTINCT r.id) > 0
    `).get() as { total: number };

    res.json({
        labels: labelsWithPreviews,
        pagination: {
            page,
            limit,
            total: totalResult.total,
            totalPages: Math.ceil(totalResult.total / limit)
        }
    });
});

// Get single label with all albums
app.get('/api/labels/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const label = db.prepare('SELECT * FROM labels WHERE id = ?').get(id) as any;
    if (!label) return res.status(404).json({ error: 'Label not found' });

    // Get all albums from this label
    const albums = db.prepare(`
        SELECT DISTINCT r.id, r.title as album_name, r.artist_credit as artist_name, r.release_date,
               (SELECT id FROM tracks t WHERE t.release_mbid = r.mbid AND t.has_art = 1 LIMIT 1) as sample_track_id
        FROM releases r
        WHERE r.label_mbid = ?
        ORDER BY r.release_date DESC
    `).all(label.mbid);

    res.json({ ...label, albums });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
