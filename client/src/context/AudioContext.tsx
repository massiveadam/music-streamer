import { SERVER_URL, getServerUrl } from '../config';
import React, { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { audioEngine } from '../audio/AudioEngine';
import type { Track } from '../types';


type DeckId = 'A' | 'B';

interface AudioContextType {
    // State
    tracks: Track[];
    setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
    currentTrackIndex: number;
    isPlaying: boolean;
    volume: number;
    setVolume: React.Dispatch<React.SetStateAction<number>>;
    shuffleMode: boolean;
    setShuffleMode: React.Dispatch<React.SetStateAction<boolean>>;
    repeatMode: 'off' | 'all' | 'one';
    setRepeatMode: React.Dispatch<React.SetStateAction<'off' | 'all' | 'one'>>;
    activeDeck: DeckId;
    currentTime: number;
    setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
    duration: number;
    setDuration: React.Dispatch<React.SetStateAction<number>>;
    showNowPlaying: boolean;
    setShowNowPlaying: React.Dispatch<React.SetStateAction<boolean>>;

    // Refs
    audioRefA: React.RefObject<HTMLAudioElement>;
    audioRefB: React.RefObject<HTMLAudioElement>;

    // Current track computed
    currentTrack: Track | null;

    // Functions
    playTrack: (index: number, transition?: 'cut' | 'crossfade') => void;
    togglePlay: () => void;
    playNext: () => void;
    playPrevious: () => void;

    // EQ
    showEq: boolean;
    setShowEq: React.Dispatch<React.SetStateAction<boolean>>;
    eqGains: number[];
    handleEqChange: (index: number, val: string) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function useAudio() {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error('useAudio must be used within AudioProvider');
    }
    return context;
}

interface AudioProviderProps {
    children: ReactNode;
}

export function AudioProvider({ children }: AudioProviderProps) {
    // Tracks
    const [tracks, setTracks] = useState<Track[]>([]);
    const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);

    // Volume & Modes
    const [volume, setVolume] = useState<number>(1);
    const [shuffleMode, setShuffleMode] = useState<boolean>(false);
    const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');

    // Deck state
    const [activeDeck, setActiveDeck] = useState<DeckId>('A');
    const [deckATrack, setDeckATrack] = useState<Track | null>(null);
    const [deckBTrack, setDeckBTrack] = useState<Track | null>(null);

    // Playback position
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);

    // EQ
    const [showEq, setShowEq] = useState<boolean>(false);
    const [eqGains, setEqGains] = useState<number[]>(new Array(10).fill(0));

    // Now Playing view
    const [showNowPlaying, setShowNowPlaying] = useState<boolean>(false);

    // Audio refs
    const audioRefA = useRef<HTMLAudioElement>(null);
    const audioRefB = useRef<HTMLAudioElement>(null);

    // Computed
    const currentTrack = currentTrackIndex >= 0 && currentTrackIndex < tracks.length
        ? tracks[currentTrackIndex]
        : null;

    // Play track
    const playTrack = useCallback(async (index: number, transition: 'cut' | 'crossfade' = 'cut') => {
        if (!Array.isArray(tracks) || index < 0 || index >= tracks.length) return;

        const nextTrack = tracks[index];
        const nextDeck = activeDeck === 'A' ? 'B' : 'A';

        // Prepare Next Deck
        if (nextDeck === 'A') setDeckATrack(nextTrack);
        else setDeckBTrack(nextTrack);

        setTimeout(async () => {
            const nextAudio = nextDeck === 'A' ? audioRefA.current : audioRefB.current;
            if (!nextAudio) return;

            if (transition === 'crossfade') {
                await nextAudio.play();
                audioEngine.crossfadeTo(nextDeck);
            } else {
                // Hard Cut
                const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
                audioEngine.decks[activeDeck].gain.gain.value = 0;
                audioEngine.decks[nextDeck].gain.gain.value = 1;
                await nextAudio.play();
                audioEngine.activeDeck = nextDeck;
            }

            setActiveDeck(nextDeck);
            setCurrentTrackIndex(index);
            setIsPlaying(true);
            setShowNowPlaying(true);

            // Log to listening history
            axios.post(`${getServerUrl()}/api/history/log`, { trackId: nextTrack.id }).catch(() => { });
        }, 100);
    }, [tracks, activeDeck]);

    // Toggle play/pause
    const togglePlay = useCallback(() => {
        if (currentTrackIndex === -1 && tracks.length > 0) {
            playTrack(0, 'cut');
            return;
        }

        const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
        if (!currentAudio) return;

        if (isPlaying) {
            currentAudio.pause();
        } else {
            currentAudio.play();
        }
        setIsPlaying(!isPlaying);
    }, [currentTrackIndex, tracks.length, activeDeck, isPlaying, playTrack]);

    // Play next track
    const playNext = useCallback(() => {
        if (tracks.length === 0) return;

        let nextIndex: number;
        if (shuffleMode) {
            nextIndex = Math.floor(Math.random() * tracks.length);
        } else if (repeatMode === 'one') {
            nextIndex = currentTrackIndex;
        } else {
            nextIndex = currentTrackIndex + 1;
            if (nextIndex >= tracks.length) {
                nextIndex = repeatMode === 'all' ? 0 : -1;
            }
        }

        if (nextIndex >= 0) {
            playTrack(nextIndex, 'cut');
        }
    }, [tracks.length, shuffleMode, repeatMode, currentTrackIndex, playTrack]);

    // Play previous track
    const playPrevious = useCallback(() => {
        if (tracks.length === 0 || currentTrackIndex <= 0) return;
        playTrack(currentTrackIndex - 1, 'cut');
    }, [tracks.length, currentTrackIndex, playTrack]);

    // EQ change
    const handleEqChange = useCallback((index: number, val: string) => {
        const newGains = [...eqGains];
        newGains[index] = parseFloat(val);
        setEqGains(newGains);
        audioEngine.setBandGain(index, newGains[index]);
    }, [eqGains]);

    const value: AudioContextType = {
        tracks,
        setTracks,
        currentTrackIndex,
        isPlaying,
        volume,
        setVolume,
        shuffleMode,
        setShuffleMode,
        repeatMode,
        setRepeatMode,
        activeDeck,
        currentTime,
        setCurrentTime,
        duration,
        setDuration,
        showNowPlaying,
        setShowNowPlaying,
        audioRefA,
        audioRefB,
        currentTrack,
        playTrack,
        togglePlay,
        playNext,
        playPrevious,
        showEq,
        setShowEq,
        eqGains,
        handleEqChange,
    };

    return (
        <AudioContext.Provider value={value}>
            {/* Hidden audio elements */}
            <audio
                ref={audioRefA}
                src={deckATrack ? `${getServerUrl()}/api/stream/${deckATrack.id}` : undefined}
                preload="auto"
            />
            <audio
                ref={audioRefB}
                src={deckBTrack ? `${getServerUrl()}/api/stream/${deckBTrack.id}` : undefined}
                preload="auto"
            />
            {children}
        </AudioContext.Provider>
    );
}

export default AudioContext;
