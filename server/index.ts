import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { parseFile, IAudioMetadata } from 'music-metadata';
import db, { getSetting, setSetting } from './db';
import type { Track, Artist, Credit } from '../types';
import * as musicbrainz from './musicbrainz';
import * as sonicProfiles from './sonicProfiles';
import * as lastfm from './lastfm';
import * as wikipedia from './wikipedia';
import * as auth from './auth';
import type { AuthRequest } from './auth';
import * as audioAnalyzer from './audioAnalyzer';
import * as loudnessAnalyzer from './loudnessAnalyzer';
import { runAllMigrations } from './migrations';

// Run database migrations on startup
runAllMigrations();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors({
    origin: true, // Allow all origins for mobile app access
    credentials: true
}));
app.use(express.json());

// API health check endpoint
app.get('/api/health', (req, res) => {
    res.send('OpenStream Server is Running!');
});

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
    mbid: string | null;
    release_mbid: string | null;
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

// Artwork Storage Path (configurable for Docker)
const ART_DIR = process.env.ARTWORK_PATH || path.join(__dirname, 'storage', 'art');
ensureDir(ART_DIR);
console.log('[Server] Artwork directory:', ART_DIR);

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

            const trackData: TrackData = {
                path: fullPath,
                title: metadata.common.title || path.basename(fullPath, ext),
                artist: metadata.common.artist || 'Unknown Artist',
                album: metadata.common.album || 'Unknown Album',
                duration: metadata.format.duration,
                format: ext.substring(1),
                bpm: metadata.common.bpm || null,
                key: metadata.common.key || null,
                year: metadata.common.year || null,
                genre: metadata.common.genre ? metadata.common.genre[0] : null,
                hasArt,
                mood: null,
                mbid: metadata.common.musicbrainz_trackid || null,
                release_mbid: metadata.common.musicbrainz_albumid || null
            };

            // Transaction for all DB writes
            const writeTrackData = db.transaction((data: { track: TrackData; metadata: IAudioMetadata }) => {
                const insert = db.prepare(`
          INSERT OR IGNORE INTO tracks (path, title, artist, album, duration, format, bpm, key, year, genre, has_art, mood, mbid, release_mbid)
          VALUES (@path, @title, @artist, @album, @duration, @format, @bpm, @key, @year, @genre, @hasArt, @mood, @mbid, @release_mbid)
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

        // Auto-trigger metadata processing for new tracks after scan
        // 1. Run MusicBrainz/Last.fm enrichment first (for genre, tags, credits)
        console.log("Starting automatic metadata enrichment (MusicBrainz + Last.fm)...");
        try {
            await musicbrainz.startAlbumEnrichment(3); // Fast album-based enrichment with 3 workers
        } catch (err) {
            console.error('Auto enrichment error:', err);
        }

        // 2. Then run audio analysis (for BPM, key, mood, energy)
        console.log("Starting automatic audio analysis...");
        audioAnalyzer.analyzeLibrary(true).catch(err => {
            console.error('Auto audio analysis error:', err);
        });
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
        lastfm_api_secret: getSetting('lastfm_api_secret') || '',
        discogs_consumer_key: getSetting('discogs_consumer_key') || '',
        discogs_consumer_secret: getSetting('discogs_consumer_secret') || ''
    });
});

// Admin: Update System Settings
app.put('/api/settings/system', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    const { lastfm_api_key, lastfm_api_secret, discogs_consumer_key, discogs_consumer_secret } = req.body;

    if (lastfm_api_key !== undefined) setSetting('lastfm_api_key', lastfm_api_key);
    if (lastfm_api_secret !== undefined) setSetting('lastfm_api_secret', lastfm_api_secret);
    if (discogs_consumer_key !== undefined) setSetting('discogs_consumer_key', discogs_consumer_key);
    if (discogs_consumer_secret !== undefined) setSetting('discogs_consumer_secret', discogs_consumer_secret);

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

// 5. Serve Album Artwork with caching (Fallback to Release Art)
app.get('/api/art/:trackId', (req: Request, res: Response) => {
    // 1. Try embedded art (extracted)
    const artPath = path.join(ART_DIR, `${req.params.trackId}.jpg`);
    if (fs.existsSync(artPath)) {
        res.set('Cache-Control', 'public, max-age=86400, immutable');
        res.set('ETag', `art-${req.params.trackId}`);
        res.set('Access-Control-Allow-Origin', '*');
        res.sendFile(artPath);
        return;
    }

    // 2. Fallback to release-level art (CoverArtArchive/Discogs)
    const track = db.prepare('SELECT release_mbid FROM tracks WHERE id = ?').get(req.params.trackId) as { release_mbid: string } | undefined;

    if (track && track.release_mbid) {
        const artDir = path.join(__dirname, 'storage', 'art');
        if (fs.existsSync(artDir)) {
            // Look for front/medium cover for this MBID
            const files = fs.readdirSync(artDir).filter(f => f.startsWith(`${track.release_mbid}_front`) || f.startsWith(`${track.release_mbid}_medium`));

            if (files.length > 0) {
                res.set('Cache-Control', 'public, max-age=86400, immutable');
                res.set('ETag', `art-release-${track.release_mbid}`);
                res.set('Access-Control-Allow-Origin', '*');
                res.sendFile(path.join(artDir, files[0]));
                return;
            }
        }
    }

    res.status(404).send('No artwork');
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

    // Handle missing files gracefully
    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch (err) {
        console.error(`[Stream] File not found: ${filePath}`);
        return res.status(404).send('Audio file not found');
    }

    const fileSize = stat.size;
    const range = req.headers.range;

    // Determine correct MIME type from extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.flac': 'audio/flac',
        '.m4a': 'audio/mp4',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.aac': 'audio/aac',
        '.wma': 'audio/x-ms-wma'
    };
    const contentType = mimeTypes[ext] || 'audio/mpeg';

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
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

// 7. Search Endpoint (Fuzzy/Typo-tolerant)
app.get('/api/search', (req: Request, res: Response) => {
    try {
        const { q } = req.query;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = (page - 1) * limit;

        if (!q || (q as string).trim().length === 0) {
            return res.status(400).json({ error: 'Search query parameter is required' });
        }

        const searchTerm = (q as string).trim().toLowerCase();
        const likeQuery = `%${searchTerm}%`;

        // Check for sonic profile match
        const sonicProfileSql = sonicProfiles.getProfileSql(searchTerm);
        const matchedProfileName = sonicProfiles.SONIC_PROFILES.find(p => p.name.toLowerCase() === searchTerm)?.name;

        // Helper function for fuzzy matching score
        function fuzzyScore(str: string | null, query: string): number {
            if (!str) return 0;
            const s = str.toLowerCase();

            // Exact match
            if (s === query) return 100;

            // Starts with query
            if (s.startsWith(query)) return 90;

            // Contains query
            if (s.includes(query)) return 70;

            // Fuzzy: check if all chars exist in order
            let queryIdx = 0;
            let consecutive = 0;
            let maxConsecutive = 0;

            for (let i = 0; i < s.length && queryIdx < query.length; i++) {
                if (s[i] === query[queryIdx]) {
                    queryIdx++;
                    consecutive++;
                    maxConsecutive = Math.max(maxConsecutive, consecutive);
                } else {
                    consecutive = 0;
                }
            }

            if (queryIdx === query.length) {
                // All characters found in order
                return 30 + (maxConsecutive / query.length) * 30;
            }

            // Levenshtein-inspired: count matching characters
            const matches = query.split('').filter(c => s.includes(c)).length;
            const matchRatio = matches / query.length;

            if (matchRatio > 0.6) {
                return matchRatio * 25;
            }

            return 0;
        }

        // Get all potential matches with LIKE first (for performance)
        // Then score and re-rank with fuzzy algorithm
        let sql = `
            SELECT DISTINCT t.*
            FROM tracks t
            WHERE t.title LIKE ? OR t.artist LIKE ? OR t.album LIKE ? OR t.genre LIKE ? OR t.mood LIKE ?
            UNION
            SELECT DISTINCT t.*
            FROM tracks t
            JOIN credits c ON c.track_id = t.id
            WHERE c.name LIKE ?
        `;

        const params: any[] = [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery];

        // Add Sonic Profile query if matched
        if (sonicProfileSql) {
            sql += `
            UNION
            SELECT DISTINCT t.*
            FROM tracks t
            WHERE ${sonicProfileSql.sql}
            `;
            params.push(...sonicProfileSql.params);
        }

        let results = db.prepare(sql).all(...params) as (Track & { is_credit_match: number })[];

        // If no results with LIKE, try broader fuzzy search
        if (results.length === 0 && searchTerm.length >= 3) {
            // Get more tracks and fuzzy match
            const allTracks = db.prepare('SELECT * FROM tracks LIMIT 2000').all() as Track[];

            results = allTracks.filter(t => {
                const score = Math.max(
                    fuzzyScore(t.title, searchTerm),
                    fuzzyScore(t.artist, searchTerm),
                    fuzzyScore(t.album || null, searchTerm),
                    fuzzyScore(t.genre || null, searchTerm)
                );
                return score > 15;
            }).map(t => ({ ...t, is_credit_match: 0 })); // Add is_credit_match for consistency
        }

        // Score and rank all results
        const scoredResults = results.map(track => {
            let score = 0;
            const t = track;

            // Base score for finding it
            if (t.is_credit_match) {
                const creditScore = fuzzyScore(searchTerm, searchTerm); // Use 100 base score logic effectively? 
                // Wait, if it matched via LIKE, it matched.
                // We should give it a substantial bonus if it came from credits.
                score += 80;
            }

            const titleScore = fuzzyScore(t.title, searchTerm);
            const artistScore = fuzzyScore(t.artist, searchTerm);
            const albumScore = fuzzyScore(t.album || null, searchTerm);
            const genreScore = fuzzyScore(t.genre || null, searchTerm);

            let sonicBonus = 0;
            if (matchedProfileName && sonicProfiles.getTrackProfiles) {
                const trackProfiles = sonicProfiles.getTrackProfiles({
                    energy: t.energy || 0,
                    valence: t.valence || 0,
                    danceability: t.danceability || 0,
                    bpm: t.bpm || 0
                });
                if (trackProfiles.includes(matchedProfileName)) {
                    sonicBonus = 200; // Massive bonus for sonic match
                }
            }

            // Weight: title > artist > album > genre
            // If is_credit_match, that 80 points helps it float up if other scores are 0.
            const totalScore = Math.max(score, titleScore * 1.5 + artistScore * 1.3 + albumScore * 1.1 + genreScore + sonicBonus);

            return { ...t, _fuzzyScore: totalScore };
        });

        // Sort by fuzzy score
        scoredResults.sort((a, b) => b._fuzzyScore - a._fuzzyScore);

        // Paginate
        const total = scoredResults.length;
        const paginatedResults = scoredResults.slice(offset, offset + limit).map(r => {
            // Remove internal flags
            const { _fuzzyScore, is_credit_match, ...rest } = r as any;
            return rest;
        });

        res.json({
            results: paginatedResults,
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
app.post('/api/clear', auth.authenticateToken, auth.requireAdmin, (req: AuthRequest, res: Response) => {
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
app.post('/api/scan', auth.authenticateToken, auth.requireAdmin, (req: AuthRequest, res: Response) => {
    // Use body path, query path, or fall back to MUSIC_LIBRARY_PATH env var
    const scanPath = req.body?.path || req.query?.path || process.env.MUSIC_LIBRARY_PATH;
    const limit = req.body?.limit || req.query?.limit;

    if (!scanPath) return res.status(400).json({ error: 'Missing path - set MUSIC_LIBRARY_PATH env var or provide path parameter' });

    if (scanStatus.isScanning) return res.status(409).json({ error: 'Scan already in progress' });

    const limitNum = parseInt(limit as string) || 0;
    // Use the existing background scan function which handles state correctly
    startBackgroundScan(scanPath as string, limitNum);

    res.json({ message: 'Scan started', path: scanPath });
});

// 10. Start MusicBrainz Enrichment (Admin only)
// Unified endpoint - use mode param: 'tracks' (default), 'albums' (fast), 'artists' (bios)
app.post('/api/enrich', auth.authenticateToken, auth.requireAdmin, async (req: AuthRequest, res: Response) => {
    const mode = (req.body?.mode as string) || 'albums'; // Default to album-based (faster)
    const workers = parseInt(req.body?.workers as string) || 3;
    const force = req.body?.force === true; // Force re-enrichment of all tracks

    switch (mode) {
        case 'tracks':
            // Legacy track-by-track enrichment
            musicbrainz.startEnrichment();
            res.json({ message: 'Track-by-track enrichment started', mode });
            break;
        case 'albums':
            // Fast album-based enrichment (recommended)
            musicbrainz.startAlbumEnrichment(workers, force);
            res.json({ message: `Album-based enrichment started with ${workers} workers${force ? ' (FORCE ALL)' : ''}`, mode, force });
            break;
        case 'artists':
            // Artist bio enrichment - handled below
            res.json({ message: 'Use /api/enrich/artists for artist enrichment', mode });
            break;
        default:
            res.status(400).json({ error: `Invalid mode: ${mode}. Use 'tracks', 'albums', or 'artists'` });
    }
});

// 10a. Fast album-based enrichment (Admin only) - kept for backwards compatibility
app.post('/api/enrich/fast', auth.authenticateToken, auth.requireAdmin, async (req: AuthRequest, res: Response) => {
    const workerCount = parseInt(req.body?.workers as string) || 3;
    const force = req.body?.force === true;
    musicbrainz.startAlbumEnrichment(workerCount, force);
    res.json({ message: `Fast album-based enrichment started with ${workerCount} workers${force ? ' (FORCE ALL)' : ''}` });
});

// 10b. Force re-enrich all albums (Admin only) - re-processes ALL tracks regardless of enriched status
app.post('/api/enrich/all', auth.authenticateToken, auth.requireAdmin, async (req: AuthRequest, res: Response) => {
    const workerCount = parseInt(req.body?.workers as string) || 3;
    musicbrainz.startAlbumEnrichment(workerCount, true); // Force = true
    res.json({ message: `Force re-enriching ALL albums with ${workerCount} workers` });
});


// ========== ARTIST BIO ENRICHMENT STATUS ==========
let artistEnrichmentStatus = {
    running: false,
    total: 0,
    processed: 0,
    enriched: 0,
    errors: 0,
    currentArtist: ''
};

// 10b. Bulk enrich artist bios (Admin only) - Background process
app.post('/api/enrich/artists', auth.authenticateToken, auth.requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
        if (artistEnrichmentStatus.running) {
            return res.status(409).json({ error: 'Artist enrichment already in progress' });
        }

        // Get all artists without descriptions
        const artists = db.prepare(`SELECT * FROM artists WHERE description IS NULL OR description = ''`).all() as Artist[];

        if (artists.length === 0) {
            return res.json({ message: 'No artists need enrichment', total: 0 });
        }

        // Initialize status
        artistEnrichmentStatus = {
            running: true,
            total: artists.length,
            processed: 0,
            enriched: 0,
            errors: 0,
            currentArtist: ''
        };

        res.json({ message: 'Artist bio enrichment started', total: artists.length });

        // Run enrichment in background
        (async () => {
            console.log(`Starting bulk enrichment for ${artists.length} artists...`);

            const batchSize = 5;
            const delayBetweenBatches = 2000;

            for (let i = 0; i < artists.length; i += batchSize) {
                const batch = artists.slice(i, i + batchSize);

                const promises = batch.map(async (artist) => {
                    artistEnrichmentStatus.currentArtist = artist.name;
                    try {
                        // Try Last.fm first (uses getSetting for API key)
                        const info = await lastfm.getArtistInfo(artist.name);
                        if (info && (info.description || info.image)) {
                            db.prepare('UPDATE artists SET description = ?, image_path = ? WHERE id = ?')
                                .run(info.description, info.image, artist.id);
                            return { success: true, artist: artist.name };
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

                results.forEach(result => {
                    artistEnrichmentStatus.processed++;
                    if (result.status === 'fulfilled') {
                        if (result.value.success) {
                            artistEnrichmentStatus.enriched++;
                        } else {
                            artistEnrichmentStatus.errors++;
                        }
                    } else {
                        artistEnrichmentStatus.errors++;
                    }
                });

                if (i + batchSize < artists.length) {
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                }
            }

            artistEnrichmentStatus.running = false;
            artistEnrichmentStatus.currentArtist = '';
            console.log(`Artist enrichment complete. ${artistEnrichmentStatus.enriched}/${artistEnrichmentStatus.total} enriched.`);
        })();
    } catch (err) {
        console.error('Artist enrichment error:', err);
        artistEnrichmentStatus.running = false;
        res.status(500).json({ error: 'Failed to start artist enrichment: ' + (err as Error).message });
    }
});

// 10c. Get artist enrichment status
app.get('/api/enrich/artists/status', (_req: Request, res: Response) => {
    res.json(artistEnrichmentStatus);
});

// 11. Get Enrichment Status
app.get('/api/enrich/status', (_req: Request, res: Response) => {
    res.json(musicbrainz.getEnrichmentStatus());
});

// ========== LOUDNESS ANALYSIS ==========
let loudnessAnalysisStatus = {
    running: false,
    processed: 0,
    total: 0,
    current: ''
};

app.post('/api/analyze/loudness', auth.authenticateToken, auth.requireAdmin, async (_req: AuthRequest, res: Response) => {
    if (loudnessAnalysisStatus.running) {
        return res.status(409).json({ error: 'Loudness analysis already running' });
    }

    // Get tracks without loudness data
    const tracksToAnalyze = db.prepare(`
        SELECT id, path, title, artist FROM tracks 
        WHERE loudness_lufs IS NULL 
        ORDER BY id
    `).all() as { id: number; path: string; title: string; artist: string }[];

    if (tracksToAnalyze.length === 0) {
        return res.json({ message: 'All tracks already have loudness data' });
    }

    loudnessAnalysisStatus = {
        running: true,
        processed: 0,
        total: tracksToAnalyze.length,
        current: ''
    };

    res.json({
        message: 'Loudness analysis started',
        total: tracksToAnalyze.length
    });

    // Run analysis in background
    (async () => {
        const updateStmt = db.prepare(`
            UPDATE tracks 
            SET loudness_lufs = ?, loudness_range = ?, true_peak = ? 
            WHERE id = ?
        `);

        for (const track of tracksToAnalyze) {
            try {
                loudnessAnalysisStatus.current = `${track.artist} - ${track.title}`;

                const loudness = await loudnessAnalyzer.analyzeLoudness(track.path);

                if (loudness) {
                    updateStmt.run(
                        loudness.integratedLoudness,
                        loudness.loudnessRange,
                        loudness.truePeak,
                        track.id
                    );
                }

                loudnessAnalysisStatus.processed++;
            } catch (error) {
                console.error(`[Loudness] Error analyzing ${track.path}:`, error);
                loudnessAnalysisStatus.processed++;
            }
        }

        loudnessAnalysisStatus.running = false;
        loudnessAnalysisStatus.current = '';
        console.log(`[Loudness] Analysis complete: ${loudnessAnalysisStatus.processed} tracks`);
    })();
});

app.get('/api/analyze/loudness/status', (_req: Request, res: Response) => {
    res.json(loudnessAnalysisStatus);
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

// 13. Get All Artists (Paginated) - Only artists with MBIDs
app.get('/api/artists', (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10000; // Effectively unlimited
        const offset = (page - 1) * limit;
        const search = req.query.search as string || '';

        let artists: (Artist & { track_count: number })[];
        let total: number;

        if (search) {
            // Search mode - filter by name
            artists = db.prepare(`
                SELECT a.*, 
                    (SELECT COUNT(*) FROM tracks t WHERE t.artist LIKE '%' || a.name || '%') as track_count
                FROM artists a
                WHERE a.mbid IS NOT NULL AND a.name LIKE ?
                ORDER BY a.name
                LIMIT ? OFFSET ?
            `).all(`%${search}%`, limit, offset) as (Artist & { track_count: number })[];

            const totalResult = db.prepare(`
                SELECT COUNT(*) as total FROM artists WHERE mbid IS NOT NULL AND name LIKE ?
            `).get(`%${search}%`) as { total: number };
            total = totalResult.total;
        } else {
            // Normal mode - all artists with MBIDs, sorted alphabetically
            artists = db.prepare(`
                SELECT a.*, 
                    (SELECT COUNT(*) FROM tracks t WHERE t.artist LIKE '%' || a.name || '%') as track_count
                FROM artists a
                WHERE a.mbid IS NOT NULL
                ORDER BY a.name COLLATE NOCASE
                LIMIT ? OFFSET ?
            `).all(limit, offset) as (Artist & { track_count: number })[];

            const totalResult = db.prepare(`
                SELECT COUNT(*) as total FROM artists WHERE mbid IS NOT NULL
            `).get() as { total: number };
            total = totalResult.total;
        }

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

// 15a. Get Credits for Album AND Artist
app.get('/api/credits/album/:album/:artist', (req: Request, res: Response) => {
    const { album, artist } = req.params;

    const credits = db.prepare(`
    SELECT c.*, t.title as track_title
    FROM credits c
    JOIN tracks t ON c.track_id = t.id
    WHERE t.album = ? AND t.artist = ?
    ORDER BY c.role, c.name
  `).all(album, artist) as (Credit & { track_title: string })[];

    // Filter duplicates (ensure unique credits per album)
    const uniqueCredits: typeof credits = [];
    const seen = new Set<string>();

    for (const c of credits) {
        const key = `${c.role}|||${c.name}|||${c.artist_mbid}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueCredits.push(c);
        }
    }

    res.json(uniqueCredits);
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

// 16a. Search MusicBrainz for album matches
app.get('/api/musicbrainz/search', async (req: Request, res: Response) => {
    const { album, artist } = req.query;
    if (!album || !artist) {
        return res.status(400).json({ error: 'album and artist required' });
    }

    try {
        // Search MusicBrainz for releases matching album/artist
        const results = await musicbrainz.searchReleases(String(album), String(artist));
        res.json({ results });
    } catch (e) {
        console.error('MusicBrainz search error:', e);
        res.status(500).json({ error: (e as Error).message });
    }
});

// 16b. Apply MusicBrainz match to album
app.post('/api/album/match', auth.authenticateToken, async (req: AuthRequest, res: Response) => {
    const { album, artist, releaseMbid } = req.body;
    if (!album || !artist || !releaseMbid) {
        return res.status(400).json({ error: 'album, artist, and releaseMbid required' });
    }

    try {
        // Fetch full release details from MusicBrainz
        const release = await musicbrainz.getReleaseDetails(releaseMbid);
        if (!release) {
            return res.status(404).json({ error: 'Release not found in MusicBrainz' });
        }

        // Update all tracks with this album/artist to use this release
        const tracks = db.prepare('SELECT id FROM tracks WHERE album = ? AND artist = ?').all(album, artist) as { id: number }[];

        for (const track of tracks) {
            db.prepare('UPDATE tracks SET release_mbid = ?, enriched = 1 WHERE id = ?').run(releaseMbid, track.id);
        }

        // Store/update the release in our database
        await musicbrainz.enrichTrackWithRelease(tracks[0]?.id, release);

        res.json({ success: true, tracksUpdated: tracks.length });
    } catch (e) {
        console.error('Apply match error:', e);
        res.status(500).json({ error: (e as Error).message });
    }
});

// 16c. Update album metadata manually
app.put('/api/album/metadata', auth.authenticateToken, async (req: AuthRequest, res: Response) => {
    const { album, artist, description, label, year, tags } = req.body;
    if (!album || !artist) {
        return res.status(400).json({ error: 'album and artist required' });
    }

    try {
        // Find the release for this album
        const track = db.prepare('SELECT release_mbid FROM tracks WHERE album = ? AND artist = ? LIMIT 1')
            .get(album, artist) as { release_mbid: string } | undefined;

        if (track?.release_mbid) {
            const release = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(track.release_mbid) as { id: number } | undefined;

            if (release) {
                // Update release metadata
                if (description !== undefined) {
                    db.prepare('UPDATE releases SET description = ? WHERE id = ?').run(description, release.id);
                }
                if (year !== undefined) {
                    db.prepare('UPDATE releases SET year = ? WHERE id = ?').run(year, release.id);
                }
            }
        }

        // Update year on tracks if provided
        if (year !== undefined) {
            db.prepare('UPDATE tracks SET year = ? WHERE album = ? AND artist = ?').run(year, album, artist);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Update metadata error:', e);
        res.status(500).json({ error: (e as Error).message });
    }
});

// 16d. Re-enrich album (force re-fetch from MusicBrainz)
app.post('/api/album/re-enrich', auth.authenticateToken, async (req: AuthRequest, res: Response) => {
    const { album, artist } = req.body;
    if (!album || !artist) {
        return res.status(400).json({ error: 'album and artist required' });
    }

    try {
        // Mark all tracks in this album as unenriched
        const result = db.prepare('UPDATE tracks SET enriched = 0, release_mbid = NULL WHERE album = ? AND artist = ?')
            .run(album, artist);

        // Trigger enrichment for these tracks
        const tracks = db.prepare('SELECT * FROM tracks WHERE album = ? AND artist = ?').all(album, artist) as Track[];

        if (tracks.length > 0) {
            // Enrich the first track (which will enrich the whole album)
            const enrichResult = await musicbrainz.enrichTrack(tracks[0]);

            // Mark other tracks as enriched if first one succeeded
            if (enrichResult.success) {
                for (const track of tracks.slice(1)) {
                    db.prepare('UPDATE tracks SET enriched = 1, release_mbid = ? WHERE id = ?')
                        .run(tracks[0].release_mbid, track.id);
                }
            }

            res.json({
                success: enrichResult.success,
                tracksUpdated: result.changes,
                details: enrichResult
            });
        } else {
            res.json({ success: false, error: 'No tracks found for this album' });
        }
    } catch (e) {
        console.error('Re-enrich error:', e);
        res.status(500).json({ error: (e as Error).message });
    }
});

// 16e. Merge two albums into one
app.post('/api/album/merge', auth.authenticateToken, async (req: AuthRequest, res: Response) => {
    const { sourceAlbum, sourceArtist, targetAlbum, targetArtist } = req.body;
    if (!sourceAlbum || !sourceArtist || !targetAlbum || !targetArtist) {
        return res.status(400).json({ error: 'sourceAlbum, sourceArtist, targetAlbum, targetArtist required' });
    }

    try {
        // Get target album's release_mbid if it has one
        const targetTrack = db.prepare('SELECT release_mbid FROM tracks WHERE album = ? AND artist = ? LIMIT 1')
            .get(targetAlbum, targetArtist) as { release_mbid: string } | undefined;

        // Update all source tracks to match target album
        const result = db.prepare(`
            UPDATE tracks SET 
                album = ?, 
                artist = ?,
                release_mbid = COALESCE(?, release_mbid)
            WHERE album = ? AND artist = ?
        `).run(targetAlbum, targetArtist, targetTrack?.release_mbid || null, sourceAlbum, sourceArtist);

        res.json({ success: true, tracksMerged: result.changes });
    } catch (e) {
        console.error('Merge albums error:', e);
        res.status(500).json({ error: (e as Error).message });
    }
});

// 16f. Rename album/artist (update track metadata)
app.put('/api/album/rename', auth.authenticateToken, async (req: AuthRequest, res: Response) => {
    const { oldAlbum, oldArtist, newAlbum, newArtist } = req.body;
    if (!oldAlbum || !oldArtist) {
        return res.status(400).json({ error: 'oldAlbum and oldArtist required' });
    }

    try {
        // Build update query dynamically based on what's being changed
        const updates: string[] = [];
        const params: any[] = [];

        if (newAlbum && newAlbum !== oldAlbum) {
            updates.push('album = ?');
            params.push(newAlbum);
        }
        if (newArtist && newArtist !== oldArtist) {
            updates.push('artist = ?');
            params.push(newArtist);
        }

        if (updates.length === 0) {
            return res.json({ success: true, tracksUpdated: 0, message: 'Nothing to update' });
        }

        params.push(oldAlbum, oldArtist);
        const result = db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE album = ? AND artist = ?`).run(...params);

        res.json({ success: true, tracksUpdated: result.changes });
    } catch (e) {
        console.error('Rename album error:', e);
        res.status(500).json({ error: (e as Error).message });
    }
});

// 16g. Update album cover art (from URL or MusicBrainz)
app.post('/api/album/cover-art', auth.authenticateToken, async (req: AuthRequest, res: Response) => {
    const { album, artist, imageUrl, releaseMbid } = req.body;
    if (!album || !artist) {
        return res.status(400).json({ error: 'album and artist required' });
    }

    try {
        // Get tracks for this album
        const tracks = db.prepare('SELECT id, release_mbid FROM tracks WHERE album = ? AND artist = ?')
            .all(album, artist) as { id: number; release_mbid: string }[];

        if (tracks.length === 0) {
            return res.status(404).json({ error: 'Album not found' });
        }

        const axios = (await import('axios')).default;
        let imageBuffer: Buffer | null = null;

        if (imageUrl) {
            // Fetch from provided URL
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data);
        } else if (releaseMbid) {
            // Fetch from CoverArtArchive
            const coverUrl = `https://coverartarchive.org/release/${releaseMbid}/front-500`;
            const response = await axios.get(coverUrl, { responseType: 'arraybuffer' });
            imageBuffer = Buffer.from(response.data);
        }

        if (!imageBuffer) {
            return res.status(400).json({ error: 'imageUrl or releaseMbid required' });
        }

        // Save cover art for each track (simple file write, no resize)
        for (const track of tracks) {
            const artPath = path.join(ART_DIR, `${track.id}.jpg`);
            fs.writeFileSync(artPath, imageBuffer);
            db.prepare('UPDATE tracks SET has_art = 1 WHERE id = ?').run(track.id);
        }

        res.json({ success: true, tracksUpdated: tracks.length });
    } catch (e) {
        console.error('Cover art update error:', e);
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

// Get Last.fm connection status for current user
app.get('/api/user/lastfm-status', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const user = db.prepare('SELECT lastfm_username, lastfm_session_key FROM users WHERE id = ?')
        .get(req.user!.id) as { lastfm_username: string | null; lastfm_session_key: string | null } | undefined;

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
        connected: !!user.lastfm_session_key,
        username: user.lastfm_username
    });
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
    const { name, description, pinned_to_home, cover_art_path, type, rules } = req.body;

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
    if (type !== undefined) { updates.push('type = ?'); params.push(type); }
    if (rules !== undefined) { updates.push('rules = ?'); params.push(JSON.stringify(rules)); }

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
        SELECT 
            ca.album_name as name,
            ca.artist_name as artist,
            ca.position,
            ca.collection_id,
            (SELECT id FROM tracks t WHERE t.album = ca.album_name AND t.artist = ca.artist_name AND t.has_art = 1 LIMIT 1) as sample_track_id,
            (SELECT year FROM tracks t WHERE t.album = ca.album_name AND t.artist = ca.artist_name AND t.year IS NOT NULL LIMIT 1) as year,
            (SELECT COUNT(*) FROM tracks t WHERE t.album = ca.album_name AND t.artist = ca.artist_name) as track_count
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
        WITH RankedReleases AS (
            SELECT 
                r.label_mbid,
                r.title,
                r.artist_credit,
                MIN(t.id) as sample_track_id,
                MAX(t.added_at) as latest_add
            FROM releases r
            JOIN tracks t ON t.release_mbid = r.mbid AND t.has_art = 1
            GROUP BY r.id
        )
        SELECT 
            l.id, l.name, l.mbid, l.type, l.country, l.founded,
            COUNT(DISTINCT r.id) as album_count,
            (
                SELECT JSON_GROUP_ARRAY(
                    JSON_OBJECT(
                        'album_name', rr.title,
                        'artist_name', rr.artist_credit,
                        'sample_track_id', rr.sample_track_id
                    )
                )
                FROM (
                    SELECT * FROM RankedReleases 
                    WHERE label_mbid = l.mbid 
                    ORDER BY latest_add DESC 
                    LIMIT 4
                ) rr
            ) as preview_albums_json
        FROM labels l
        LEFT JOIN releases r ON r.label_mbid = l.mbid
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
                preview_albums = JSON.parse(label.preview_albums_json);
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

// ========== SMART MIXES (CURATION) ENDPOINTS ==========

interface FilterRules {
    bpm?: { min?: number; max?: number };
    mood?: string[];
    genre?: string[];
    key?: string[];
    rating?: { min?: number };
    recentlyAdded?: number; // days
    recentlyPlayed?: number; // days
}

// Get all smart mixes
app.get('/api/mixes', (req: Request, res: Response) => {
    const mixes = db.prepare(`
        SELECT id, name, description, icon, filter_rules, sort_order, is_system
        FROM smart_mixes
        ORDER BY sort_order ASC
    `).all();
    res.json(mixes);
});

// Get tracks for a specific smart mix
app.get('/api/mixes/:id/tracks', (req: Request, res: Response) => {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const mix = db.prepare('SELECT filter_rules FROM smart_mixes WHERE id = ?').get(id) as { filter_rules: string } | undefined;
    if (!mix) return res.status(404).json({ error: 'Mix not found' });

    let rules: FilterRules;
    try {
        rules = JSON.parse(mix.filter_rules);
    } catch (e) {
        return res.status(500).json({ error: 'Invalid filter rules' });
    }

    // Build dynamic WHERE clauses
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (rules.bpm) {
        if (rules.bpm.min) { conditions.push('bpm >= ?'); params.push(rules.bpm.min); }
        if (rules.bpm.max) { conditions.push('bpm <= ?'); params.push(rules.bpm.max); }
    }

    if (rules.mood && rules.mood.length > 0) {
        const moodConditions = rules.mood.map(() => 'LOWER(mood) LIKE ?').join(' OR ');
        conditions.push(`(${moodConditions})`);
        rules.mood.forEach(m => params.push(`%${m.toLowerCase()}%`));
    }

    if (rules.genre && rules.genre.length > 0) {
        const genreConditions = rules.genre.map(() => 'LOWER(genre) LIKE ?').join(' OR ');
        conditions.push(`(${genreConditions})`);
        rules.genre.forEach(g => params.push(`%${g.toLowerCase()}%`));
    }

    if (rules.key && rules.key.length > 0) {
        const keyPlaceholders = rules.key.map(() => '?').join(', ');
        conditions.push(`key IN (${keyPlaceholders})`);
        params.push(...rules.key);
    }

    if (rules.rating?.min) {
        conditions.push('rating >= ?');
        params.push(rules.rating.min);
    }

    if (rules.recentlyAdded) {
        conditions.push(`added_at >= datetime('now', '-' || ? || ' days')`);
        params.push(rules.recentlyAdded);
    }

    const query = `
        SELECT * FROM tracks
        WHERE ${conditions.join(' AND ')}
        ORDER BY RANDOM()
        LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const tracks = db.prepare(query).all(...params);
    res.json(tracks);
});

// ========== CONTENT SIMILARITY ("More Like This") ==========

// Helper: Check if two musical keys are compatible
function isCompatibleKey(key1: string, key2: string): boolean {
    // Circle of fifths compatibility (simplified)
    const compatibilityMap: Record<string, string[]> = {
        'C': ['G', 'F', 'Am'],
        'G': ['C', 'D', 'Em'],
        'D': ['G', 'A', 'Bm'],
        'A': ['D', 'E', 'F#m'],
        'E': ['A', 'B', 'C#m'],
        'B': ['E', 'F#', 'G#m'],
        'F#': ['B', 'C#', 'D#m'],
        'F': ['C', 'Bb', 'Dm'],
        'Bb': ['F', 'Eb', 'Gm'],
        'Eb': ['Bb', 'Ab', 'Cm'],
        'Ab': ['Eb', 'Db', 'Fm'],
        'Db': ['Ab', 'Gb', 'Bbm'],
        'Am': ['C', 'Em', 'Dm'],
        'Em': ['G', 'Am', 'Bm'],
        'Bm': ['D', 'Em', 'F#m'],
        'F#m': ['A', 'Bm', 'C#m'],
        'C#m': ['E', 'F#m', 'G#m'],
        'G#m': ['B', 'C#m', 'D#m'],
        'Dm': ['F', 'Am', 'Gm'],
        'Gm': ['Bb', 'Dm', 'Cm'],
        'Cm': ['Eb', 'Gm', 'Fm'],
        'Fm': ['Ab', 'Cm', 'Bbm'],
        'Bbm': ['Db', 'Fm', 'Ebm'],
    };
    return compatibilityMap[key1]?.includes(key2) || compatibilityMap[key2]?.includes(key1) || false;
}

// Get similar tracks
app.get('/api/similar/:trackId', (req: Request, res: Response) => {
    const { trackId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const sourceTrack = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as any;
    if (!sourceTrack) return res.status(404).json({ error: 'Track not found' });

    // Get candidate tracks (exclude source, same artist, similar BPM range)
    const candidates = db.prepare(`
        SELECT * FROM tracks
        WHERE id != ?
        AND (
            (bpm BETWEEN ? AND ?)
            OR genre = ?
            OR artist = ?
        )
        LIMIT 500
    `).all(
        trackId,
        (sourceTrack.bpm || 100) - 30,
        (sourceTrack.bpm || 100) + 30,
        sourceTrack.genre || '',
        sourceTrack.artist
    ) as any[];

    // Score each candidate
    const scored = candidates.map(candidate => {
        let score = 0;

        // BPM similarity (max 10 points)
        if (sourceTrack.bpm && candidate.bpm) {
            const bpmDiff = Math.abs(sourceTrack.bpm - candidate.bpm);
            score += Math.max(0, 10 - bpmDiff * 0.5);
        }

        // Key compatibility (5 points same, 3 points compatible)
        if (sourceTrack.key && candidate.key) {
            if (sourceTrack.key === candidate.key) score += 5;
            else if (isCompatibleKey(sourceTrack.key, candidate.key)) score += 3;
        }

        // Genre match (8 points)
        if (sourceTrack.genre && candidate.genre &&
            sourceTrack.genre.toLowerCase() === candidate.genre.toLowerCase()) {
            score += 8;
        }

        // Mood match (5 points)
        if (sourceTrack.mood && candidate.mood &&
            candidate.mood.toLowerCase().includes(sourceTrack.mood.toLowerCase())) {
            score += 5;
        }

        // Same artist bonus (3 points)
        if (sourceTrack.artist === candidate.artist) score += 3;

        // Same era bonus (2 points for within 5 years)
        if (sourceTrack.year && candidate.year && Math.abs(sourceTrack.year - candidate.year) <= 5) {
            score += 2;
        }

        return { ...candidate, similarity_score: score };
    });

    // Sort by score and diversify (max 3 per artist)
    scored.sort((a, b) => b.similarity_score - a.similarity_score);

    const artistCounts: Record<string, number> = {};
    const diversified = scored.filter(track => {
        const count = artistCounts[track.artist] || 0;
        if (count >= 3) return false;
        artistCounts[track.artist] = count + 1;
        return true;
    }).slice(0, limit);

    res.json(diversified);
});

// ========== PERSONALIZED RECOMMENDATIONS ==========

app.get('/api/personalized', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    // Get user's top genres based on listening history
    const topGenres = db.prepare(`
        SELECT t.genre, COUNT(*) as play_count
        FROM listening_history h
        JOIN tracks t ON h.track_id = t.id
        WHERE h.user_id = ? AND t.genre IS NOT NULL AND t.genre != ''
        GROUP BY t.genre
        ORDER BY play_count DESC
        LIMIT 5
    `).all(req.user!.id) as { genre: string; play_count: number }[];

    if (topGenres.length === 0) {
        // No history, return random popular tracks
        const randomTracks = db.prepare(`
            SELECT * FROM tracks
            WHERE has_art = 1
            ORDER BY RANDOM()
            LIMIT ?
        `).all(limit);
        return res.json(randomTracks);
    }

    // Find tracks in user's preferred genres that they haven't played recently
    const genreList = topGenres.map(g => g.genre);
    const genrePlaceholders = genreList.map(() => '?').join(', ');

    const recommendations = db.prepare(`
        SELECT t.*, 
               CASE WHEN t.genre IN (${genrePlaceholders}) THEN 1 ELSE 0 END as genre_match
        FROM tracks t
        WHERE t.id NOT IN (
            SELECT track_id FROM listening_history 
            WHERE user_id = ? AND played_at > datetime('now', '-7 days')
        )
        AND (t.genre IN (${genrePlaceholders}) OR t.mood IS NOT NULL)
        ORDER BY genre_match DESC, RANDOM()
        LIMIT ?
    `).all(...genreList, req.user!.id, ...genreList, limit);

    // Diversify by artist (max 3 per artist)
    const artistCounts: Record<string, number> = {};
    const diversified = (recommendations as any[]).filter(track => {
        const count = artistCounts[track.artist] || 0;
        if (count >= 3) return false;
        artistCounts[track.artist] = count + 1;
        return true;
    });

    res.json(diversified);
});

// ========== AUDIO ANALYSIS ADMIN ENDPOINTS ==========

// Start library audio analysis
app.post('/api/admin/analyze-library', auth.authenticateToken, auth.requireAdmin, async (req: AuthRequest, res: Response) => {
    const { reanalyze } = req.body || {};

    // Start analysis in background
    audioAnalyzer.analyzeLibrary(!reanalyze).catch(err => {
        console.error('Audio analysis error:', err);
    });

    const progress = audioAnalyzer.getProgress();
    res.json({ status: 'started', total: progress.total });
});

// Get analysis progress
app.get('/api/admin/analyze-status', auth.authenticateToken, auth.requireAdmin, (req: AuthRequest, res: Response) => {
    const progress = audioAnalyzer.getProgress();
    res.json({
        status: progress.status,
        total: progress.total,
        completed: progress.completed,
        current: progress.current,
        percentComplete: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
        startedAt: progress.startedAt,
        errorCount: progress.errors.length,
        recentErrors: progress.errors.slice(-5)
    });
});

// Stop analysis
app.post('/api/admin/analyze-stop', auth.authenticateToken, auth.requireAdmin, (req: AuthRequest, res: Response) => {
    audioAnalyzer.stopAnalysis();
    res.json({ status: 'stopped' });
});

// Analyze single track (for testing)
app.post('/api/admin/analyze-track/:id', auth.authenticateToken, auth.requireAdmin, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const track = db.prepare('SELECT id, path FROM tracks WHERE id = ?').get(id) as { id: number; path: string } | undefined;

    if (!track) return res.status(404).json({ error: 'Track not found' });

    const result = await audioAnalyzer.analyzeTrack(track.path);

    if (result.success) {
        audioAnalyzer.updateTrackAnalysis(track.id, result);
    }

    res.json(result);
});

// ========== SIMILAR ALBUMS ENDPOINT ==========

app.get('/api/similar-albums', (req: Request, res: Response) => {
    const { album, artist, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(limitParam as string) || 10, 20);

    if (!album || !artist) {
        return res.status(400).json({ error: 'album and artist parameters required' });
    }

    // Get the source album's metadata and average audio features
    const sourceData = db.prepare(`
        SELECT 
            t.year, 
            t.genre, 
            t.release_mbid,
            r.label_mbid,
            r.country,
            AVG(t.energy) as avg_energy,
            AVG(t.valence) as avg_valence,
            AVG(t.danceability) as avg_danceability
        FROM tracks t
        LEFT JOIN releases r ON t.release_mbid = r.mbid
        WHERE t.album = ? AND t.artist = ? 
        LIMIT 1
    `).get(album, artist) as {
        year: number | null;
        genre: string | null;
        release_mbid: string | null;
        label_mbid: string | null;
        country: string | null;
        avg_energy: number | null;
        avg_valence: number | null;
        avg_danceability: number | null;
    } | undefined;

    if (!sourceData) {
        return res.status(404).json({ error: 'Album not found' });
    }

    // Get tags for the source album
    interface TagRow { name: string; count: number }
    let sourceTags: TagRow[] = [];
    if (sourceData.release_mbid) {
        const releaseRow = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(sourceData.release_mbid) as { id: number } | undefined;
        if (releaseRow) {
            sourceTags = db.prepare(`
                SELECT t.name, et.count 
                FROM entity_tags et 
                JOIN tags t ON et.tag_id = t.id 
                WHERE et.entity_type = 'release' AND et.entity_id = ?
                ORDER BY et.count DESC
            `).all(releaseRow.id) as TagRow[];
        }
    }

    // Get candidate albums with metadata and audio stats
    interface AlbumRow {
        album: string;
        artist: string;
        year: number | null;
        genre: string | null;
        release_mbid: string | null;
        label_mbid: string | null;
        country: string | null;
        avg_energy: number | null;
        avg_valence: number | null;
        sample_track_id: number;
        has_art: number;
    }

    const candidateAlbums = db.prepare(`
        SELECT 
            t.album, 
            t.artist, 
            MIN(t.year) as year, 
            t.genre, 
            MIN(t.release_mbid) as release_mbid,
            MIN(r.label_mbid) as label_mbid,
            MIN(r.country) as country,
            AVG(t.energy) as avg_energy,
            AVG(t.valence) as avg_valence,
            MIN(t.id) as sample_track_id,
            MAX(t.has_art) as has_art
        FROM tracks t
        LEFT JOIN releases r ON t.release_mbid = r.mbid
        WHERE t.album IS NOT NULL 
            AND t.album != '' 
            AND t.album != ? -- Strictly exclude the source album name to prevent variants showing up
        GROUP BY t.album -- Group by album name only to merge 'feat.' variants
        LIMIT 500
    `).all(album) as AlbumRow[];

    // Score each album
    interface ScoredAlbum extends AlbumRow {
        similarity_score: number;
        matching_tags: string[];
    }

    const scored: ScoredAlbum[] = candidateAlbums.map(candidate => {
        let score = 0;
        let matchingTags: string[] = [];

        // 1. Metadata Factors

        // Same artist: +10
        if (candidate.artist.toLowerCase() === (artist as string).toLowerCase()) {
            score += 10;
        }

        // Same Label: +10 (Strong shared scene indicator)
        if (sourceData.label_mbid && candidate.label_mbid &&
            sourceData.label_mbid === candidate.label_mbid) {
            score += 10;
            matchingTags.push('Label');
        }

        // Same Country: +5 (Scene/Location)
        if (sourceData.country && candidate.country &&
            sourceData.country === candidate.country) {
            score += 5;
            matchingTags.push(candidate.country);
        }

        // Genre match: +8
        if (sourceData.genre && candidate.genre &&
            candidate.genre.toLowerCase() === sourceData.genre.toLowerCase()) {
            score += 8;
        }

        // Era match: +5 (Exponential decay based on year difference)
        if (sourceData.year && candidate.year) {
            const diff = Math.abs(sourceData.year - candidate.year);
            if (diff === 0) score += 5;
            else if (diff <= 2) score += 4;
            else if (diff <= 5) score += 2;
        }

        // 2. Audio Vibe Factors (Replacing pure BPM with Energy/Valence)

        if (sourceData.avg_energy !== null && candidate.avg_energy !== null) {
            const distEntry = Math.abs(sourceData.avg_energy - candidate.avg_energy);
            // If energy is within 10%, +8 points
            if (distEntry < 0.1) score += 8;
            else if (distEntry < 0.2) score += 4;
        }

        if (sourceData.avg_valence !== null && candidate.avg_valence !== null) {
            const distValence = Math.abs(sourceData.avg_valence - candidate.avg_valence);
            // If valence (mood) is within 15%, +7 points
            if (distValence < 0.15) score += 7;
            else if (distValence < 0.25) score += 3;
        }

        // 3. Detailed Tag Matching
        if (sourceTags.length > 0 && candidate.release_mbid) {
            const candidateRelease = db.prepare('SELECT id FROM releases WHERE mbid = ?').get(candidate.release_mbid) as { id: number } | undefined;
            if (candidateRelease) {
                const candidateTags = db.prepare(`
                    SELECT t.name FROM entity_tags et 
                    JOIN tags t ON et.tag_id = t.id 
                    WHERE et.entity_type = 'release' AND et.entity_id = ?
                `).all(candidateRelease.id) as { name: string }[];

                const candidateTagNames = new Set(candidateTags.map(t => t.name.toLowerCase()));
                for (const sourceTag of sourceTags) {
                    if (candidateTagNames.has(sourceTag.name.toLowerCase())) {
                        score += 3; // Cumulative boost for shared tags
                        matchingTags.push(sourceTag.name);
                    }
                }
            }
        }

        return { ...candidate, similarity_score: score, matching_tags: [...new Set(matchingTags)] };
    });

    // Sort by score
    scored.sort((a, b) => b.similarity_score - a.similarity_score);

    // Filter for diversity: Max 1 album per artist, and strict source exclusion
    const seenArtists = new Set<string>();
    const diverseResults: ScoredAlbum[] = [];
    const sourceName = (album as string).toLowerCase();

    for (const candidate of scored) {
        // Skip source album (duplicate check)
        if (candidate.album.toLowerCase() === sourceName) continue;

        if (candidate.similarity_score <= 5) continue; // Minimum score threshold

        // Normalize artist (remove feat/ft)
        const artistNormal = candidate.artist.toLowerCase()
            .split(' feat.')[0]
            .split(' ft.')[0]
            .split(' featuring')[0]
            .trim();

        // Allow max 1 album per artist
        if (!seenArtists.has(artistNormal)) {
            diverseResults.push(candidate);
            seenArtists.add(artistNormal);
        }

        if (diverseResults.length >= limit) break;
    }

    res.json(diverseResults);
});

// ========== SMART PLAYLIST GENERATION ==========

interface PlaylistTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    params?: { name: string; type: string; default?: any; options?: string[] }[];
}

const PLAYLIST_TEMPLATES: PlaylistTemplate[] = [
    {
        id: 'anniversary',
        name: 'Anniversary Albums',
        description: 'Albums released X years ago this month',
        icon: 'Calendar',
        params: [{ name: 'yearsAgo', type: 'number', default: 10 }]
    },
    {
        id: 'deep-catalog',
        name: 'Deep Catalog',
        description: 'Hidden gems with fewer than 3 plays',
        icon: 'Archive',
        params: []
    },
    {
        id: 'high-energy',
        name: 'High Energy',
        description: 'Fast beats for workouts (BPM > 120, high energy)',
        icon: 'Zap',
        params: [{ name: 'minBpm', type: 'number', default: 120 }]
    },
    {
        id: 'chill-mix',
        name: 'Chill Mix',
        description: 'Relaxed vibes for unwinding',
        icon: 'Coffee',
        params: []
    },
    {
        id: 'danceable',
        name: 'Danceability',
        description: 'Tracks that make you move',
        icon: 'Music',
        params: [{ name: 'minDanceability', type: 'number', default: 0.6 }]
    },
    {
        id: 'genre',
        name: 'Genre Focus',
        description: 'All tracks from a specific genre',
        icon: 'Tag',
        params: [{ name: 'genre', type: 'string', default: '' }]
    },
    {
        id: 'upbeat',
        name: 'Upbeat Mood',
        description: 'Positive, happy vibes (high valence)',
        icon: 'Sun',
        params: [{ name: 'minValence', type: 'number', default: 0.6 }]
    },
    {
        id: 'new-additions',
        name: 'Recently Added',
        description: 'Tracks added in the last X days',
        icon: 'Clock',
        params: [{ name: 'days', type: 'number', default: 30 }]
    }
];

// Get available playlist templates
app.get('/api/playlist-templates', (_req: Request, res: Response) => {
    res.json(PLAYLIST_TEMPLATES);
});

// Generate playlist from template
app.post('/api/playlists/generate', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    const { template, params = {}, name, save = true, limit: limitParam } = req.body;
    const limit = Math.min(parseInt(limitParam) || 50, 200);

    if (!template) {
        return res.status(400).json({ error: 'Template ID required' });
    }

    const templateDef = PLAYLIST_TEMPLATES.find(t => t.id === template);
    if (!templateDef) {
        return res.status(404).json({ error: 'Template not found' });
    }

    let tracks: Track[] = [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    switch (template) {
        case 'anniversary': {
            const yearsAgo = params.yearsAgo || 10;
            const targetYear = currentYear - yearsAgo;
            tracks = db.prepare(`
                SELECT * FROM tracks 
                WHERE year = ? 
                ORDER BY RANDOM() 
                LIMIT ?
            `).all(targetYear, limit) as Track[];
            break;
        }

        case 'deep-catalog': {
            tracks = db.prepare(`
                SELECT t.* FROM tracks t
                LEFT JOIN listening_history h ON t.id = h.track_id
                GROUP BY t.id
                HAVING COUNT(h.id) < 3
                ORDER BY RANDOM()
                LIMIT ?
            `).all(limit) as Track[];
            break;
        }

        case 'high-energy': {
            const minBpm = params.minBpm || 120;
            tracks = db.prepare(`
                SELECT * FROM tracks 
                WHERE bpm >= ? AND (energy > 0.6 OR energy IS NULL)
                ORDER BY bpm DESC, energy DESC
                LIMIT ?
            `).all(minBpm, limit) as Track[];
            break;
        }

        case 'chill-mix': {
            tracks = db.prepare(`
                SELECT * FROM tracks 
                WHERE (mood IN ('chill', 'mellow', 'calm', 'relaxed', 'neutral') 
                       OR energy < 0.4 
                       OR bpm < 100)
                ORDER BY energy ASC, bpm ASC
                LIMIT ?
            `).all(limit) as Track[];
            break;
        }

        case 'danceable': {
            const minDanceability = params.minDanceability || 0.6;
            tracks = db.prepare(`
                SELECT * FROM tracks 
                WHERE danceability >= ?
                ORDER BY danceability DESC
                LIMIT ?
            `).all(minDanceability, limit) as Track[];
            break;
        }

        case 'genre': {
            const genre = params.genre || '';
            if (!genre) {
                return res.status(400).json({ error: 'Genre parameter required' });
            }
            tracks = db.prepare(`
                SELECT * FROM tracks 
                WHERE genre LIKE ?
                ORDER BY RANDOM()
                LIMIT ?
            `).all(`%${genre}%`, limit) as Track[];
            break;
        }

        case 'upbeat': {
            const minValence = params.minValence || 0.6;
            tracks = db.prepare(`
                SELECT * FROM tracks 
                WHERE valence >= ?
                ORDER BY valence DESC
                LIMIT ?
            `).all(minValence, limit) as Track[];
            break;
        }

        case 'new-additions': {
            const days = params.days || 30;
            tracks = db.prepare(`
                SELECT * FROM tracks 
                WHERE created_at >= datetime('now', ?)
                ORDER BY created_at DESC
                LIMIT ?
            `).all(`-${days} days`, limit) as Track[];
            break;
        }

        default:
            return res.status(400).json({ error: 'Invalid template' });
    }

    if (tracks.length === 0) {
        return res.json({
            message: 'No tracks found matching criteria',
            tracks: [],
            saved: false
        });
    }

    // If save is true, create a playlist
    let playlistId: number | null = null;
    if (save) {
        const playlistName = name || `${templateDef.name} - ${new Date().toLocaleDateString()}`;

        const result = db.prepare(`
            INSERT INTO playlists (name, user_id, created_at, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(playlistName, req.user!.id);

        playlistId = Number(result.lastInsertRowid);

        // Add tracks to playlist
        const insertTrack = db.prepare(`
            INSERT INTO playlist_tracks (playlist_id, track_id, position)
            VALUES (?, ?, ?)
        `);

        tracks.forEach((track, idx) => {
            insertTrack.run(playlistId, track.id, idx + 1);
        });
    }

    res.json({
        template: templateDef.name,
        tracks,
        trackCount: tracks.length,
        saved: save,
        playlistId,
        playlistName: save ? (name || `${templateDef.name} - ${new Date().toLocaleDateString()}`) : null
    });
});

// Serve static client files (React app)
const clientPath = path.join(__dirname, 'public');
if (fs.existsSync(clientPath)) {
    app.use(express.static(clientPath));

    // SPA fallback - serve index.html for any non-API routes
    // Use middleware instead of wildcard route for compatibility
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api') && req.method === 'GET') {
            res.sendFile(path.join(clientPath, 'index.html'));
        } else {
            next();
        }
    });
    console.log('[Server] Serving React client from:', clientPath);
}

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
