import { SERVER_URL, getServerUrl } from '../config';
import { useState, useEffect, memo, useCallback } from 'react';
import { X, Play, Shuffle, Disc } from 'lucide-react';
import axios from 'axios';
import type { Track } from '../types';


interface SmartMix {
    id: number;
    name: string;
    description: string;
    icon: string;
}

interface SmartMixModalProps {
    mix: SmartMix;
    allTracks: Track[];
    onClose: () => void;
    onPlayTrack: (index: number, transition: 'cut' | 'crossfade') => void;
}

function SmartMixModal({ mix, allTracks, onClose, onPlayTrack }: SmartMixModalProps) {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTracks = async () => {
            setIsLoading(true);
            try {
                const res = await axios.get(`${getServerUrl()}/api/mixes/${mix.id}/tracks?limit=50`);
                setTracks(res.data || []);
            } catch (e) {
                console.error('Failed to fetch mix tracks:', e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTracks();
    }, [mix.id]);

    const handlePlayAll = useCallback(() => {
        if (tracks.length === 0) return;
        const firstTrack = tracks[0];
        const idx = allTracks.findIndex(t => t.id === firstTrack.id);
        if (idx !== -1) onPlayTrack(idx, 'cut');
    }, [tracks, allTracks, onPlayTrack]);

    const handleShuffle = useCallback(() => {
        if (tracks.length === 0) return;
        const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
        const idx = allTracks.findIndex(t => t.id === randomTrack.id);
        if (idx !== -1) onPlayTrack(idx, 'cut');
    }, [tracks, allTracks, onPlayTrack]);

    const formatDuration = (seconds: number) => {
        if (!seconds) return '--:--';
        return new Date(seconds * 1000).toISOString().substr(14, 5);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-app-bg text-app-text overflow-y-auto animate-in fade-in duration-200 custom-scrollbar">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-app-bg/95 backdrop-blur-md border-b border-app-surface px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-app-surface rounded-full transition-colors group"
                    >
                        <X size={24} className="text-app-text-muted group-hover:text-app-text transition-colors" />
                    </button>
                    <h2 className="text-lg font-bold truncate">{mix.name}</h2>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handlePlayAll}
                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
                        title="Play All"
                    >
                        <Play size={20} fill="currentColor" />
                    </button>
                    <button
                        onClick={handleShuffle}
                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
                        title="Shuffle"
                    >
                        <Shuffle size={20} />
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-8 pt-8 pb-32">
                {/* Hero */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-app-text mb-3">
                        {mix.name}
                    </h1>
                    <p className="text-xl text-app-text-muted mb-6">{mix.description}</p>
                    <p className="text-sm text-app-text-muted">{tracks.length} tracks</p>

                    <div className="flex justify-center gap-4 mt-6">
                        <button
                            onClick={handlePlayAll}
                            className="bg-app-accent hover:bg-app-accent/80 text-white px-8 py-3 rounded-full font-medium text-lg flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
                        >
                            <Play size={20} fill="currentColor" />
                            Play All
                        </button>
                        <button
                            onClick={handleShuffle}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-8 py-3 rounded-full font-medium text-lg flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
                        >
                            <Shuffle size={20} />
                            Shuffle
                        </button>
                    </div>
                </div>

                {/* Track List */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-app-accent"></div>
                    </div>
                ) : (
                    <div className="bg-app-surface/30 rounded-2xl overflow-hidden">
                        {tracks.map((track, i) => (
                            <div
                                key={track.id}
                                className="flex items-center gap-4 p-4 hover:bg-white/5 cursor-pointer group transition-colors border-b border-white/5 last:border-0"
                                onClick={() => {
                                    const idx = allTracks.findIndex(t => t.id === track.id);
                                    if (idx !== -1) onPlayTrack(idx, 'cut');
                                }}
                            >
                                <div className="w-8 text-center text-app-text-muted text-sm font-mono">
                                    {i + 1}
                                </div>
                                <div className="w-12 h-12 rounded-lg bg-app-surface overflow-hidden shrink-0">
                                    {track.has_art ? (
                                        <img
                                            src={`${getServerUrl()}/api/art/${track.id}`}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Disc size={20} className="text-app-text-muted" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-app-text truncate group-hover:text-app-accent transition-colors">
                                        {track.title}
                                    </div>
                                    <div className="text-sm text-app-text-muted truncate">
                                        {track.artist} • {track.album}
                                    </div>
                                </div>
                                <div className="text-xs text-app-text-muted font-mono px-4">
                                    {formatDuration(track.duration)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(SmartMixModal);
