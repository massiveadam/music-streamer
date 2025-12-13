#!/usr/bin/env python3
"""
Audio Feature Extraction Script for OpenStream
Extracts BPM, key, energy, danceability from audio files using librosa.

Usage:
    python3 analyze_audio.py "/path/to/audio.flac"
    
Output:
    JSON object with extracted features
"""

import json
import sys
import warnings
warnings.filterwarnings('ignore')

try:
    import librosa
    import numpy as np
except ImportError:
    print(json.dumps({"error": "librosa not installed. Run: pip install librosa numpy"}))
    sys.exit(1)

# Krumhansl-Schmuckler key profiles
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def detect_key(chroma):
    """
    Detect musical key using Krumhansl-Schmuckler algorithm.
    Returns key name like "C major" or "A minor".
    """
    # Get mean chroma vector
    chroma_mean = np.mean(chroma, axis=1)
    
    best_corr = -2
    best_key = "C major"
    
    for i in range(12):
        # Rotate profiles to each possible key
        major_rotated = np.roll(MAJOR_PROFILE, i)
        minor_rotated = np.roll(MINOR_PROFILE, i)
        
        # Calculate correlation
        major_corr = np.corrcoef(chroma_mean, major_rotated)[0, 1]
        minor_corr = np.corrcoef(chroma_mean, minor_rotated)[0, 1]
        
        if major_corr > best_corr:
            best_corr = major_corr
            best_key = f"{KEY_NAMES[i]} major"
        if minor_corr > best_corr:
            best_corr = minor_corr
            best_key = f"{KEY_NAMES[i]} minor"
    
    return best_key


def classify_mood(energy, valence, tempo):
    """
    Simple mood classification based on energy and valence.
    """
    if energy > 0.6 and tempo > 120:
        return "energetic"
    elif energy > 0.5 and valence > 0.5:
        return "happy"
    elif energy < 0.4 and valence < 0.4:
        return "melancholic"
    elif energy < 0.5 and tempo < 100:
        return "chill"
    elif energy > 0.7:
        return "intense"
    else:
        return "neutral"


def analyze(file_path):
    """
    Analyze an audio file and extract features.
    """
    try:
        # Load audio (mono, 22050 Hz sample rate)
        y, sr = librosa.load(file_path, sr=22050, mono=True, duration=180)  # Limit to 3 min for speed
        
        # === BPM Detection ===
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if isinstance(tempo, (int, float, np.floating)) else float(tempo[0])
        
        # === Key Detection ===
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        key = detect_key(chroma)
        
        # === Energy (RMS normalized to 0-1) ===
        rms = librosa.feature.rms(y=y)[0]
        energy = float(np.mean(rms)) / 0.15  # Normalize
        energy = min(1.0, max(0.0, energy))
        
        # === Danceability (beat consistency) ===
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
        danceability = float(np.mean(pulse))
        danceability = min(1.0, max(0.0, danceability))
        
        # === Valence (spectral brightness proxy) ===
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        valence = float(np.mean(spectral_centroid)) / 5000  # Normalize
        valence = min(1.0, max(0.0, valence))
        
        # === Mood Classification ===
        mood = classify_mood(energy, valence, bpm)
        
        return {
            "bpm": round(bpm, 1),
            "key": key,
            "energy": round(energy, 3),
            "danceability": round(danceability, 3),
            "valence": round(valence, 3),
            "mood": mood,
            "success": True
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "success": False
        }


def analyze_batch(file_paths):
    """
    Analyze multiple files and return results.
    """
    results = {}
    for path in file_paths:
        results[path] = analyze(path)
    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 analyze_audio.py <file_path>"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = analyze(file_path)
    print(json.dumps(result))
