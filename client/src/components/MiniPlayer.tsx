import { SERVER_URL, getServerUrl } from '../config';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, Disc } from 'lucide-react';
import type { Track, Artist } from '../types';


interface MiniPlayerProps {
    currentTrack: Track;
    isPlaying: boolean;
    shuffleMode: boolean;
    repeatMode: 'off' | 'all' | 'one';
    volume: number;
    currentTrackIndex: number;
    artists: Artist[];
    activeDeck: 'A' | 'B';
    audioRefA: React.RefObject<HTMLAudioElement | null>;
    audioRefB: React.RefObject<HTMLAudioElement | null>;

    // Callbacks
    setShowNowPlaying: (show: boolean) => void;
    setSelectedArtist: (artist: Artist | null) => void;
    setShuffleMode: React.Dispatch<React.SetStateAction<boolean>>;
    setRepeatMode: React.Dispatch<React.SetStateAction<'off' | 'all' | 'one'>>;
    setVolume: React.Dispatch<React.SetStateAction<number>>;
    playTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    togglePlay: () => void;
}

export default function MiniPlayer({
    currentTrack,
    isPlaying,
    shuffleMode,
    repeatMode,
    volume,
    currentTrackIndex,
    artists,
    activeDeck,
    audioRefA,
    audioRefB,
    setShowNowPlaying,
    setSelectedArtist,
    setShuffleMode,
    setRepeatMode,
    setVolume,
    playTrack,
    togglePlay,
}: MiniPlayerProps) {
    return (
        <div className="fixed bottom-[4.5rem] md:bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-none w-[calc(100%-1rem)] md:w-auto max-w-md md:max-w-none">
            <div className="pointer-events-auto bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl px-4 md:px-6 py-3 md:py-4 flex items-center justify-between md:gap-8 gap-3">
                {/* Track Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none">
                    <div
                        onClick={() => setShowNowPlaying(true)}
                        className="h-10 w-10 md:h-12 md:w-12 bg-black/20 rounded-lg flex items-center justify-center text-app-text-muted cursor-pointer hover:scale-105 transition-transform overflow-hidden shrink-0"
                    >
                        {currentTrack.has_art ? (
                            <img loading="lazy" decoding="async" src={`${getServerUrl()}/api/art/${currentTrack.id}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <Disc size={20} />
                        )}
                    </div>
                    <div className="min-w-0 flex-1 md:w-[200px]">
                        <div className="font-medium text-white text-sm truncate">{currentTrack.title}</div>
                        <div
                            className="text-xs text-gray-400 truncate cursor-pointer hover:text-white transition-colors"
                            onClick={() => {
                                const artist = artists.find(a => a.name === currentTrack.artist);
                                if (artist) setSelectedArtist(artist);
                            }}
                        >
                            {currentTrack.artist}
                        </div>
                    </div>
                </div>

                {/* Controls (Center) */}
                <div className="flex items-center gap-2 md:gap-4 shrink-0">
                    <button
                        onClick={() => setShuffleMode(s => !s)}
                        className={`transition-colors hidden md:block ${shuffleMode ? 'text-app-accent' : 'text-gray-400 hover:text-white'}`}
                        title="Shuffle (S)"
                    >
                        <Shuffle size={18} />
                    </button>
                    <button onClick={() => playTrack(currentTrackIndex - 1, 'cut')} className="text-gray-400 hover:text-white transition-colors hidden md:block"><SkipBack size={22} /></button>
                    <button
                        onClick={togglePlay}
                        className="h-10 w-10 md:h-12 md:w-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                    >
                        {isPlaying ? <Pause size={20} md:size={22} fill="currentColor" /> : <Play size={20} md:size={22} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button onClick={() => playTrack(currentTrackIndex + 1, 'crossfade')} className="text-gray-400 hover:text-white transition-colors"><SkipForward size={22} /></button>
                    <button
                        onClick={() => setRepeatMode(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
                        className={`transition-colors hidden md:block ${repeatMode !== 'off' ? 'text-app-accent' : 'text-gray-400 hover:text-white'}`}
                        title="Repeat (R)"
                    >
                        {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                    </button>
                </div>

                {/* Volume Control - Desktop Only */}
                <div className="hidden md:flex items-center gap-2">
                    <Volume2 size={18} className="text-gray-400" />
                    <input
                        type="range" min="0" max="1" step="0.01"
                        value={volume}
                        onChange={(e) => {
                            const newVolume = parseFloat(e.target.value);
                            setVolume(newVolume);
                            if (activeDeck === 'A' && audioRefA.current) audioRefA.current.volume = newVolume;
                            if (activeDeck === 'B' && audioRefB.current) audioRefB.current.volume = newVolume;
                        }}
                        className="w-20 accent-app-accent h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
        </div>
    );
}
