/**
 * AcoustID Service Module
 * 
 * Provides audio fingerprinting using Chromaprint (fpcalc) and
 * matching against the AcoustID database for track identification.
 * 
 * Requires: fpcalc binary installed on the system
 * - macOS: brew install chromaprint
 * - Ubuntu: apt-get install libchromaprint-tools
 * - Docker: Add chromaprint to Dockerfile
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import db, { getSetting } from './db';

const execAsync = promisify(exec);

const ACOUSTID_API_URL = 'https://api.acoustid.org/v2/lookup';
const USER_AGENT = 'OpenStream/1.0';

// Rate limiting (AcoustID allows 3 requests/second)
let lastAcoustidRequest = 0;
const ACOUSTID_MIN_INTERVAL = 400; // ~2.5 req/sec to be safe

// =============================================================================
// TYPES
// =============================================================================

interface FingerprintResult {
    fingerprint: string;
    duration: number;
}

interface AcoustIDRecording {
    id: string;           // Recording MBID
    title?: string;
    artists?: { id: string; name: string }[];
    releasegroups?: { id: string; title: string; type?: string }[];
}

interface AcoustIDResult {
    id: string;           // AcoustID
    score: number;        // 0.0 to 1.0 confidence
    recordings?: AcoustIDRecording[];
}

interface AcoustIDResponse {
    status: string;
    results?: AcoustIDResult[];
    error?: { message: string; code: number };
}

// =============================================================================
// FINGERPRINT GENERATION
// =============================================================================

/**
 * Check if fpcalc is available on the system
 */
export async function checkFpcalcInstalled(): Promise<boolean> {
    try {
        await execAsync('fpcalc -version');
        return true;
    } catch {
        return false;
    }
}

/**
 * Generate an audio fingerprint for a file using fpcalc (Chromaprint)
 * 
 * @param filePath - Absolute path to the audio file
 * @returns Fingerprint string and duration, or null if generation fails
 */
export async function generateFingerprint(filePath: string): Promise<FingerprintResult | null> {
    try {
        // Use fpcalc with JSON output for easy parsing
        const { stdout } = await execAsync(`fpcalc -json "${filePath}"`, {
            timeout: 30000 // 30 second timeout
        });

        const result = JSON.parse(stdout);

        if (!result.fingerprint || !result.duration) {
            console.error('[AcoustID] Invalid fpcalc output');
            return null;
        }

        return {
            fingerprint: result.fingerprint,
            duration: Math.round(result.duration)
        };
    } catch (err) {
        console.error('[AcoustID] Fingerprint generation failed:', (err as Error).message);
        return null;
    }
}

// =============================================================================
// ACOUSTID LOOKUP
// =============================================================================

/**
 * Get AcoustID API key from system settings
 */
function getApiKey(): string | null {
    const key = getSetting('acoustid_api_key');
    return key || null;
}

/**
 * Rate-limited AcoustID request
 */
async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSince = now - lastAcoustidRequest;
    if (timeSince < ACOUSTID_MIN_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, ACOUSTID_MIN_INTERVAL - timeSince));
    }
    lastAcoustidRequest = Date.now();
    return fn();
}

/**
 * Look up a fingerprint in the AcoustID database
 * 
 * @param fingerprint - Audio fingerprint from fpcalc
 * @param duration - Audio duration in seconds
 * @returns Array of matching results with MusicBrainz recordings
 */
export async function lookupByFingerprint(
    fingerprint: string,
    duration: number
): Promise<AcoustIDResult[]> {
    const apiKey = getApiKey();

    if (!apiKey) {
        console.error('[AcoustID] No API key configured. Add acoustid_api_key in Settings.');
        return [];
    }

    try {
        const response = await rateLimitedRequest(() =>
            axios.get<AcoustIDResponse>(ACOUSTID_API_URL, {
                params: {
                    client: apiKey,
                    fingerprint: fingerprint,
                    duration: duration,
                    meta: 'recordings+releasegroups+compress'
                },
                headers: {
                    'User-Agent': USER_AGENT
                },
                timeout: 10000
            })
        );

        if (response.data.status !== 'ok') {
            console.error('[AcoustID] API error:', response.data.error?.message);
            return [];
        }

        return response.data.results || [];
    } catch (err) {
        console.error('[AcoustID] Lookup failed:', (err as Error).message);
        return [];
    }
}

// =============================================================================
// HIGH-LEVEL MATCHING
// =============================================================================

/**
 * Fingerprint and match a track by its ID
 * Updates the database with fingerprint and best match
 * 
 * @param trackId - Database track ID
 * @returns Object with match result information
 */
export async function matchTrackByFingerprint(trackId: number): Promise<{
    success: boolean;
    fingerprinted: boolean;
    matched: boolean;
    mbid?: string;
    score?: number;
    error?: string;
}> {
    // Get track info
    const track = db.prepare('SELECT id, path, mbid FROM tracks WHERE id = ?').get(trackId) as {
        id: number;
        path: string;
        mbid: string | null;
    } | undefined;

    if (!track) {
        return { success: false, fingerprinted: false, matched: false, error: 'Track not found' };
    }

    // Generate fingerprint
    const fpResult = await generateFingerprint(track.path);

    if (!fpResult) {
        return { success: false, fingerprinted: false, matched: false, error: 'Fingerprint generation failed' };
    }

    // Store fingerprint in database
    db.prepare(`
        UPDATE tracks 
        SET fingerprint = ?, fingerprint_duration = ? 
        WHERE id = ?
    `).run(fpResult.fingerprint, fpResult.duration, trackId);

    // If already has MBID, just store fingerprint
    if (track.mbid) {
        return { success: true, fingerprinted: true, matched: true, mbid: track.mbid, score: 1.0 };
    }

    // Look up in AcoustID
    const results = await lookupByFingerprint(fpResult.fingerprint, fpResult.duration);

    if (results.length === 0) {
        return { success: true, fingerprinted: true, matched: false };
    }

    // Find best match
    const bestResult = results[0];
    const bestRecording = bestResult.recordings?.[0];

    if (!bestRecording || bestResult.score < 0.5) {
        // Low confidence - flag for review
        db.prepare(`
            UPDATE tracks 
            SET needs_review = 1, review_reason = ? 
            WHERE id = ?
        `).run(`Low AcoustID confidence: ${(bestResult.score * 100).toFixed(1)}%`, trackId);

        return {
            success: true,
            fingerprinted: true,
            matched: false,
            score: bestResult.score
        };
    }

    // Good match - store MBID
    db.prepare(`
        UPDATE tracks 
        SET mbid = ?, enrichment_confidence = ? 
        WHERE id = ?
    `).run(bestRecording.id, bestResult.score, trackId);

    console.log(`[AcoustID] Matched track ${trackId} -> ${bestRecording.id} (${(bestResult.score * 100).toFixed(1)}%)`);

    return {
        success: true,
        fingerprinted: true,
        matched: true,
        mbid: bestRecording.id,
        score: bestResult.score
    };
}

/**
 * Bulk fingerprint and match tracks without MBIDs
 * 
 * @param limit - Maximum number of tracks to process
 * @param onProgress - Callback for progress updates
 */
export async function batchMatchUnmatchedTracks(
    limit: number = 100,
    onProgress?: (current: number, total: number, status: string) => void
): Promise<{ processed: number; matched: number; errors: number }> {
    // Find tracks without MBIDs and without fingerprints
    const unmatchedTracks = db.prepare(`
        SELECT id, path, title, artist 
        FROM tracks 
        WHERE mbid IS NULL 
          AND (fingerprint IS NULL OR fingerprint = '')
        LIMIT ?
    `).all(limit) as { id: number; path: string; title: string; artist: string }[];

    let processed = 0;
    let matched = 0;
    let errors = 0;

    for (const track of unmatchedTracks) {
        try {
            onProgress?.(processed + 1, unmatchedTracks.length, `Processing: ${track.artist} - ${track.title}`);

            const result = await matchTrackByFingerprint(track.id);

            if (result.matched) {
                matched++;
            }

            if (!result.success) {
                errors++;
            }

            processed++;
        } catch (err) {
            console.error(`[AcoustID] Error processing track ${track.id}:`, (err as Error).message);
            errors++;
            processed++;
        }
    }

    return { processed, matched, errors };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
    checkFpcalcInstalled,
    generateFingerprint,
    lookupByFingerprint,
    matchTrackByFingerprint,
    batchMatchUnmatchedTracks,
};
