/**
 * Audio Analyzer Module
 * Spawns Python subprocess to analyze audio files for BPM, key, energy, etc.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import db from './db';

const SCRIPTS_DIR = path.join(__dirname, 'scripts');
const PYTHON_SCRIPT = path.join(SCRIPTS_DIR, 'analyze_audio.py');
const PYTHON_BIN = path.join(SCRIPTS_DIR, '.venv', 'bin', 'python3');

interface AnalysisResult {
    bpm?: number;
    key?: string;
    energy?: number;
    danceability?: number;
    valence?: number;
    mood?: string;
    success: boolean;
    error?: string;
}

interface AnalysisProgress {
    total: number;
    completed: number;
    current: string | null;
    status: 'idle' | 'running' | 'completed' | 'error';
    startedAt: Date | null;
    errors: string[];
}

// Global progress state
let analysisProgress: AnalysisProgress = {
    total: 0,
    completed: 0,
    current: null,
    status: 'idle',
    startedAt: null,
    errors: []
};

/**
 * Analyze a single audio file using Python subprocess
 */
export async function analyzeTrack(filePath: string): Promise<AnalysisResult> {
    return new Promise((resolve) => {
        const python = spawn(PYTHON_BIN, [PYTHON_SCRIPT, filePath], {
            timeout: 120000 // 2 minute timeout per track
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                resolve({ success: false, error: stderr || `Process exited with code ${code}` });
                return;
            }

            try {
                const result = JSON.parse(stdout.trim());
                resolve(result);
            } catch (e) {
                resolve({ success: false, error: `Failed to parse output: ${stdout}` });
            }
        });

        python.on('error', (err) => {
            resolve({ success: false, error: `Failed to spawn Python: ${err.message}` });
        });
    });
}

/**
 * Update track in database with analysis results
 */
export function updateTrackAnalysis(trackId: number, result: AnalysisResult): void {
    if (!result.success) return;

    const updates: string[] = [];
    const params: any[] = [];

    if (result.bpm !== undefined) { updates.push('bpm = ?'); params.push(result.bpm); }
    if (result.key !== undefined) { updates.push('key = ?'); params.push(result.key); }
    if (result.energy !== undefined) { updates.push('energy = ?'); params.push(result.energy); }
    if (result.danceability !== undefined) { updates.push('danceability = ?'); params.push(result.danceability); }
    if (result.valence !== undefined) { updates.push('valence = ?'); params.push(result.valence); }
    if (result.mood !== undefined) { updates.push('mood = ?'); params.push(result.mood); }
    updates.push('analyzed_at = CURRENT_TIMESTAMP');

    if (updates.length > 0) {
        params.push(trackId);
        db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
}

/**
 * Get current analysis progress
 */
export function getProgress(): AnalysisProgress {
    return { ...analysisProgress };
}

/**
 * Analyze all unanalyzed tracks in the library
 * Uses batch processing for ~4x speedup
 */
export async function analyzeLibrary(onlyUnanalyzed: boolean = true): Promise<void> {
    if (analysisProgress.status === 'running') {
        throw new Error('Analysis already in progress');
    }

    // Get tracks to analyze
    const query = onlyUnanalyzed
        ? 'SELECT id, path, title, artist FROM tracks WHERE analyzed_at IS NULL'
        : 'SELECT id, path, title, artist FROM tracks';

    const tracks = db.prepare(query).all() as { id: number; path: string; title: string; artist: string }[];

    if (tracks.length === 0) {
        analysisProgress = { ...analysisProgress, status: 'completed', total: 0, completed: 0 };
        return;
    }

    // Initialize progress
    analysisProgress = {
        total: tracks.length,
        completed: 0,
        current: null,
        status: 'running',
        startedAt: new Date(),
        errors: []
    };

    // Process in batches for parallel speedup
    const BATCH_SIZE = 8; // Process 8 tracks concurrently

    for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
        if (analysisProgress.status !== 'running') break; // Allow cancellation

        const batch = tracks.slice(i, i + BATCH_SIZE);
        analysisProgress.current = `Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tracks.length / BATCH_SIZE)} (${batch.length} tracks)`;

        // Process batch concurrently
        const promises = batch.map(async (track) => {
            try {
                const result = await analyzeTrack(track.path);
                if (result.success) {
                    updateTrackAnalysis(track.id, result);
                } else {
                    analysisProgress.errors.push(`${track.artist} - ${track.title}: ${result.error}`);
                }
            } catch (err: any) {
                analysisProgress.errors.push(`${track.artist} - ${track.title}: ${err.message}`);
            }
        });

        await Promise.all(promises);
        analysisProgress.completed += batch.length;
    }

    analysisProgress.status = 'completed';
    analysisProgress.current = null;
}

/**
 * Stop ongoing analysis
 */
export function stopAnalysis(): void {
    if (analysisProgress.status === 'running') {
        analysisProgress.status = 'idle';
    }
}

/**
 * Reset analysis status
 */
export function resetAnalysisStatus(): void {
    analysisProgress = {
        total: 0,
        completed: 0,
        current: null,
        status: 'idle',
        startedAt: null,
        errors: []
    };
}
