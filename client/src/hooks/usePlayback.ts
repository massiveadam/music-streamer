/**
 * usePlayback - Custom hook for audio playback control
 * 
 * Encapsulates all playback state and actions for smooth, snappy performance.
 * Uses the global AudioEngine singleton for Web Audio API management.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { audioEngine, DeckId } from '../audio/AudioEngine';
import { getServerUrl } from '../config';
import axios from 'axios';
import type { Track } from '../types';

interface UsePlaybackOptions {
    tracks: Track[];
    audioRefA: React.RefObject<HTMLAudioElement>;
    audioRefB: React.RefObject<HTMLAudioElement>;
}

interface PlaybackState {
    currentTrackIndex: number;
    isPlaying: boolean;
    isBuffering: boolean;
    isTransitioning: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    shuffleMode: boolean;
    repeatMode: 'off' | 'all' | 'one';
    activeDeck: DeckId;
    currentTrack: Track | null;
}

interface PlaybackActions {
    playTrack: (index: number, transition?: 'cut' | 'crossfade') => Promise<void>;
    togglePlay: () => void;
    playNext: () => void;
    playPrevious: () => void;
    seek: (time: number) => void;
    setVolume: (volume: number) => void;
    toggleShuffle: () => void;
    setRepeatMode: (mode: 'off' | 'all' | 'one') => void;
    handleTrackEnd: () => void;
}

export function usePlayback({ tracks, audioRefA, audioRefB }: UsePlaybackOptions): [PlaybackState, PlaybackActions] {
    // Playback state
    const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isBuffering, setIsBuffering] = useState<boolean>(false);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [volume, setVolumeState] = useState<number>(1);
    const [shuffleMode, setShuffleMode] = useState<boolean>(false);
    const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
    const [activeDeck, setActiveDeck] = useState<DeckId>('A');

    // Debounced seek ref
    const seekTimeoutRef = useRef<number | null>(null);

    // Current track derived state
    const currentTrack = currentTrackIndex >= 0 && currentTrackIndex < tracks.length
        ? tracks[currentTrackIndex]
        : null;

    // Play a specific track
    const playTrack = useCallback(async (index: number, transition: 'cut' | 'crossfade' = 'cut') => {
        if (isTransitioning || !Array.isArray(tracks) || index < 0 || index >= tracks.length) return;

        audioEngine.resumeContext();
        setIsTransitioning(true);

        const nextTrack = tracks[index];
        const nextDeck = activeDeck === 'A' ? 'B' : 'A';

        try {
            setIsBuffering(true);

            // Wait for audio element to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            const nextAudio = nextDeck === 'A' ? audioRefA.current : audioRefB.current;
            if (!nextAudio) throw new Error('Audio element not ready');

            // Wait for buffering if needed
            if (nextAudio.readyState < 3) {
                await new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => {
                        nextAudio.removeEventListener('canplaythrough', onReady);
                        resolve();
                    }, 2000);
                    const onReady = () => {
                        clearTimeout(timeout);
                        resolve();
                    };
                    nextAudio.addEventListener('canplaythrough', onReady, { once: true });
                });
            }

            if (transition === 'crossfade') {
                await nextAudio.play();
                audioEngine.crossfadeTo(nextDeck);
            } else {
                // Hard cut
                audioEngine.decks[activeDeck].gain.gain.setValueAtTime(0, audioEngine.audioCtx!.currentTime);
                audioEngine.decks[nextDeck].gain.gain.setValueAtTime(1, audioEngine.audioCtx!.currentTime);

                const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
                await nextAudio.play();
                audioEngine.activeDeck = nextDeck;
            }

            setIsBuffering(false);
            setActiveDeck(nextDeck);
            setCurrentTrackIndex(index);
            setIsPlaying(true);

            // Log to history
            axios.post(`${getServerUrl()}/api/history/log`, { trackId: nextTrack.id }).catch(() => { });
        } catch (error) {
            console.error('Playback error:', error);
            setIsBuffering(false);
        } finally {
            setIsTransitioning(false);
        }
    }, [tracks, activeDeck, isTransitioning, audioRefA, audioRefB]);

    // Toggle play/pause
    const togglePlay = useCallback(() => {
        audioEngine.resumeContext();

        if (currentTrackIndex === -1 && tracks.length > 0) {
            playTrack(0, 'cut');
            return;
        }

        const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
        if (currentAudio) {
            if (isPlaying) {
                currentAudio.pause();
            } else {
                currentAudio.play();
            }
            setIsPlaying(!isPlaying);
        }
    }, [currentTrackIndex, tracks.length, activeDeck, isPlaying, playTrack, audioRefA, audioRefB]);

    // Play next track
    const playNext = useCallback(() => {
        if (currentTrackIndex < tracks.length - 1) {
            playTrack(currentTrackIndex + 1, 'crossfade');
        } else if (repeatMode === 'all') {
            playTrack(0, 'crossfade');
        }
    }, [currentTrackIndex, tracks.length, repeatMode, playTrack]);

    // Play previous track
    const playPrevious = useCallback(() => {
        if (currentTrackIndex > 0) {
            playTrack(currentTrackIndex - 1, 'cut');
        }
    }, [currentTrackIndex, playTrack]);

    // Debounced seek
    const seek = useCallback((time: number) => {
        if (seekTimeoutRef.current) {
            clearTimeout(seekTimeoutRef.current);
        }
        seekTimeoutRef.current = window.setTimeout(() => {
            const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
            if (currentAudio && !isNaN(time) && isFinite(time) && time >= 0) {
                try {
                    currentAudio.currentTime = Math.min(time, currentAudio.duration || time);
                } catch (e) {
                    console.error('Seek error:', e);
                }
            }
            seekTimeoutRef.current = null;
        }, 50);
    }, [activeDeck, audioRefA, audioRefB]);

    // Set volume
    const setVolume = useCallback((newVolume: number) => {
        setVolumeState(newVolume);
        audioEngine.setMasterVolume(newVolume);
    }, []);

    // Toggle shuffle
    const toggleShuffle = useCallback(() => {
        setShuffleMode(prev => !prev);
    }, []);

    // Handle track end
    const handleTrackEnd = useCallback(() => {
        if (repeatMode === 'one') {
            const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
            if (currentAudio) {
                currentAudio.currentTime = 0;
                currentAudio.play();
            }
            return;
        }

        let nextIndex: number;

        if (shuffleMode) {
            const availableTracks = tracks.filter((_, i) => i !== currentTrackIndex);
            if (availableTracks.length === 0) return;
            const randomTrack = availableTracks[Math.floor(Math.random() * availableTracks.length)];
            nextIndex = tracks.findIndex(t => t.id === randomTrack.id);
        } else {
            nextIndex = currentTrackIndex + 1;
        }

        if (nextIndex >= tracks.length) {
            if (repeatMode === 'all') {
                nextIndex = 0;
            } else {
                return;
            }
        }

        const nextTrack = tracks[nextIndex];
        const currentTrackData = tracks[currentTrackIndex];

        // Smart gapless: cut for same album, crossfade otherwise
        let transition: 'cut' | 'crossfade' = 'crossfade';
        if (!shuffleMode && currentTrackData && nextTrack && currentTrackData.album === nextTrack.album) {
            transition = 'cut';
        }

        // Scrobble current track
        if (currentTrackData) {
            axios.post(`${getServerUrl()}/api/user/scrobble`, {
                artist: currentTrackData.artist,
                track: currentTrackData.title,
                album: currentTrackData.album,
                timestamp: Math.floor(Date.now() / 1000)
            }).catch(() => { });
        }

        playTrack(nextIndex, transition);
    }, [repeatMode, shuffleMode, tracks, currentTrackIndex, activeDeck, playTrack, audioRefA, audioRefB]);

    // State object
    const state: PlaybackState = {
        currentTrackIndex,
        isPlaying,
        isBuffering,
        isTransitioning,
        currentTime,
        duration,
        volume,
        shuffleMode,
        repeatMode,
        activeDeck,
        currentTrack,
    };

    // Actions object
    const actions: PlaybackActions = {
        playTrack,
        togglePlay,
        playNext,
        playPrevious,
        seek,
        setVolume,
        toggleShuffle,
        setRepeatMode,
        handleTrackEnd,
    };

    // Expose setters for time updates from audio element
    (state as any).setCurrentTime = setCurrentTime;
    (state as any).setDuration = setDuration;
    (state as any).setIsPlaying = setIsPlaying;

    return [state, actions];
}

export default usePlayback;
