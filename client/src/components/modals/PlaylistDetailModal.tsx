import { SERVER_URL, getServerUrl } from '../../config';
import { useState, useEffect } from 'react';
import { X, Play, Shuffle, Trash2, ListMusic, GripVertical } from 'lucide-react';
import axios from 'axios';
import type { Track, Playlist } from '../../types';


interface PlaylistDetailModalProps {
    playlist: Playlist;
    allTracks: Track[];
    onClose: () => void;
    onPlayTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    onShowNowPlaying: () => void;
    onRefresh?: () => void;
}

export default function PlaylistDetailModal({
    playlist,
    allTracks,
    onClose,
    onPlayTrack,
    onShowNowPlaying,
    onRefresh,
}: PlaylistDetailModalProps) {
    const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTracks = async () => {
            setIsLoading(true);
            try {
                const res = await axios.get(`${getServerUrl()}/api/playlists/${playlist.id}`);
                // API returns full track objects with position, not just IDs
                const tracks = res.data.tracks || [];
                setPlaylistTracks(tracks);
            } catch (e) {
                console.error('Failed to fetch playlist tracks:', e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTracks();
    }, [playlist.id]);

    const handlePlayAll = () => {
        if (playlistTracks.length === 0) return;
        const firstTrack = playlistTracks[0];
        const idx = allTracks.findIndex(t => t.id === firstTrack.id);
        if (idx !== -1) {
            onPlayTrack(idx, 'cut');
            onShowNowPlaying();
        }
    };

    const handleShuffle = () => {
        if (playlistTracks.length === 0) return;
        const randomTrack = playlistTracks[Math.floor(Math.random() * playlistTracks.length)];
        const idx = allTracks.findIndex(t => t.id === randomTrack.id);
        if (idx !== -1) {
            onPlayTrack(idx, 'cut');
            onShowNowPlaying();
        }
    };

    const handleRemoveTrack = async (trackId: number) => {
        try {
            await axios.delete(`${getServerUrl()}/api/playlists/${playlist.id}/tracks/${trackId}`);
            setPlaylistTracks(prev => prev.filter(t => t.id !== trackId));
            onRefresh?.();
        } catch (e) {
            console.error('Failed to remove track:', e);
        }
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const totalDuration = playlistTracks.reduce((acc, t) => acc + (t.duration || 0), 0);

    return (
        <div className="fixed inset-0 z-[100] bg-app-bg text-app-text overflow-y-auto animate-in fade-in duration-200 custom-scrollbar">
            {/* Header Bar */}
            <div className="sticky top-0 z-50 bg-app-bg border-b border-app-surface px-6 py-4 flex items-center justify-between">
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-app-surface rounded-full transition-colors"
                >
                    <X size={20} className="text-app-text-muted" />
                </button>
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

            <div className="max-w-4xl mx-auto px-8 pt-12 pb-32">
                {/* Hero */}
                <div className="text-center mb-12">
                    <div className="w-32 h-32 mx-auto bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-2xl mb-6 flex items-center justify-center">
                        <ListMusic size={48} className="text-white/50" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-app-text mb-2">
                        {playlist.name}
                    </h1>
                    {playlist.description && (
                        <p className="text-app-text-muted mb-4">{playlist.description}</p>
                    )}
                    <p className="text-sm text-app-text-muted">
                        {playlistTracks.length} tracks • {formatDuration(totalDuration)}
                    </p>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-4 mt-6">
                        <button
                            onClick={handlePlayAll}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-2.5 rounded-full font-medium text-sm flex items-center gap-2 transition-all"
                        >
                            <Play size={16} fill="currentColor" />
                            Play All
                        </button>
                        <button
                            onClick={handleShuffle}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-2.5 rounded-full font-medium text-sm flex items-center gap-2 transition-all"
                        >
                            <Shuffle size={16} />
                            Shuffle
                        </button>
                    </div>
                </div>

                {/* Tracks List */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-app-accent"></div>
                    </div>
                ) : playlistTracks.length === 0 ? (
                    <div className="text-center py-16">
                        <ListMusic size={48} className="mx-auto mb-4 text-app-text-muted opacity-50" />
                        <p className="text-app-text-muted">This playlist is empty</p>
                        <p className="text-sm text-app-text-muted mt-2">Add tracks from albums or the library</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {playlistTracks.map((track, i) => (
                            <div
                                key={track.id}
                                className="group flex items-center gap-4 px-4 py-3 hover:bg-app-surface rounded-lg cursor-pointer transition-colors"
                                onClick={() => {
                                    const idx = allTracks.findIndex(t => t.id === track.id);
                                    if (idx !== -1) {
                                        onPlayTrack(idx, 'cut');
                                        onShowNowPlaying();
                                    }
                                }}
                            >
                                {/* Track Number */}
                                <div className="w-8 text-center text-sm text-app-text-muted group-hover:text-app-accent font-medium">
                                    <span className="group-hover:hidden">{i + 1}</span>
                                    <Play size={14} fill="currentColor" className="hidden group-hover:inline-block" />
                                </div>

                                {/* Album Art */}
                                {track.has_art ? (
                                    <img
                                        src={`${getServerUrl()}/api/art/${track.id}`}
                                        alt={track.album || ''}
                                        className="w-10 h-10 rounded object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded bg-app-surface flex items-center justify-center">
                                        <ListMusic size={16} className="text-app-text-muted" />
                                    </div>
                                )}

                                {/* Track Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-app-text truncate">{track.title}</div>
                                    <div className="text-sm text-app-text-muted truncate">
                                        {track.artist} • {track.album}
                                    </div>
                                </div>

                                {/* Duration */}
                                <div className="text-sm text-app-text-muted font-mono tabular-nums">
                                    {formatDuration(track.duration || 0)}
                                </div>

                                {/* Remove Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveTrack(track.id);
                                    }}
                                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-full transition-all"
                                    title="Remove from playlist"
                                >
                                    <Trash2 size={16} className="text-app-text-muted hover:text-red-500" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
