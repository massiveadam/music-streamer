/**
 * Loudness Analyzer using FFmpeg's EBU R128 filter
 * 
 * Analyzes audio files for integrated loudness (LUFS),
 * loudness range, and true peak for volume normalization.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface LoudnessInfo {
    integratedLoudness: number;  // LUFS (e.g., -14.0)
    loudnessRange: number;       // LU
    truePeak: number;           // dBTP
}

/**
 * Analyze a file's loudness using FFmpeg's ebur128 filter
 * 
 * @param filePath Path to the audio file
 * @returns LoudnessInfo or null if analysis fails
 */
export async function analyzeLoudness(filePath: string): Promise<LoudnessInfo | null> {
    try {
        // Use FFmpeg's ebur128 filter to analyze loudness
        // -nostats suppresses progress output
        // -vn ignores video streams
        // -f null discards the output (we only need the stats)
        const { stderr } = await execFileAsync('ffmpeg', [
            '-hide_banner',
            '-nostats',
            '-i', filePath,
            '-filter_complex', 'ebur128=peak=true',
            '-f', 'null',
            '-'
        ], {
            timeout: 60000, // 60 second timeout
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer for long output
        });

        // Parse the EBU R128 summary from stderr
        // Example output:
        // [Parsed_ebur128_0 @ ...] Summary:
        //   Integrated loudness:
        //     I:         -14.0 LUFS
        //     Threshold: -24.0 LUFS
        //   Loudness range:
        //     LRA:         7.2 LU
        //   True peak:
        //     Peak:        -1.5 dBTP

        const integratedMatch = stderr.match(/I:\s+([-\d.]+)\s+LUFS/);
        const rangeMatch = stderr.match(/LRA:\s+([-\d.]+)\s+LU/);
        const peakMatch = stderr.match(/Peak:\s+([-\d.]+)\s+dBTP/);

        if (!integratedMatch) {
            console.warn(`[Loudness] Could not parse loudness from: ${filePath}`);
            return null;
        }

        return {
            integratedLoudness: parseFloat(integratedMatch[1]),
            loudnessRange: rangeMatch ? parseFloat(rangeMatch[1]) : 0,
            truePeak: peakMatch ? parseFloat(peakMatch[1]) : 0
        };
    } catch (error: any) {
        // Don't log error for missing ffmpeg or normal failures
        if (error.code !== 'ENOENT') {
            console.warn(`[Loudness] Analysis failed for ${filePath}: ${error.message}`);
        }
        return null;
    }
}

/**
 * Calculate the gain adjustment needed to normalize to target loudness
 * 
 * @param currentLufs The track's integrated loudness in LUFS
 * @param targetLufs Target loudness (default: -14 LUFS, streaming standard)
 * @returns Gain adjustment in dB
 */
export function calculateNormalizationGain(currentLufs: number, targetLufs: number = -14): number {
    // Simple linear gain adjustment
    // If track is -20 LUFS and target is -14 LUFS, need +6 dB gain
    return targetLufs - currentLufs;
}

/**
 * Convert dB gain to linear gain multiplier
 * 
 * @param db Gain in decibels
 * @returns Linear gain multiplier
 */
export function dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
}
