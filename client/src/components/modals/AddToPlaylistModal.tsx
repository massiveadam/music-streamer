import { useState, useEffect } from 'react';
import { X, Plus, Music, Check, Loader2 } from 'lucide-react';
import axios from 'axios';
import type { Track, Playlist } from '../../types';

const SERVER_URL = 'http://localhost:3001';

interface AddToPlaylistModalProps {
    // Either a single track or multiple tracks (for album)
    trackIds: number[];
    albumName?: string;
    onClose: () => void;
    onSuccess?: (playlistName: string) => void;
}

export default function AddToPlaylistModal({
    trackIds,
    albumName,
    onClose,
    onSuccess,
}: AddToPlaylistModalProps) {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [addedTo, setAddedTo] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch playlists on mount
    useEffect(() => {
        const fetchPlaylists = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${SERVER_URL}/api/playlists`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setPlaylists(res.data || []);
            } catch (e) {
                console.error('Failed to fetch playlists:', e);
                setError('Failed to load playlists');
            } finally {
                setIsLoading(false);
            }
        };
        fetchPlaylists();
    }, []);

    const handleAddToPlaylist = async (playlist: Playlist) => {
        if (isAdding !== null) return;
        setIsAdding(playlist.id);
        setError(null);

        try {
            const token = localStorage.getItem('token');

            if (trackIds.length === 1) {
                // Single track
                await axios.post(
                    `${SERVER_URL}/api/playlists/${playlist.id}/tracks`,
                    { trackId: trackIds[0] },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            } else {
                // Multiple tracks (album)
                await axios.post(
                    `${SERVER_URL}/api/playlists/${playlist.id}/tracks/batch`,
                    { trackIds },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            }

            setAddedTo(playlist.id);
            onSuccess?.(playlist.name);

            // Close after brief success state
            setTimeout(() => {
                onClose();
            }, 800);
        } catch (e: any) {
            console.error('Failed to add to playlist:', e);
            setError(e.response?.data?.error || 'Failed to add to playlist');
            setIsAdding(null);
        }
    };

    const handleCreatePlaylist = async () => {
        if (!newPlaylistName.trim() || isCreating) return;
        setIsCreating(true);
        setError(null);

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(
                `${SERVER_URL}/api/playlists`,
                { name: newPlaylistName.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const newPlaylist = res.data;
            setPlaylists(prev => [newPlaylist, ...prev]);
            setShowCreate(false);
            setNewPlaylistName('');

            // Automatically add tracks to the new playlist
            handleAddToPlaylist(newPlaylist);
        } catch (e: any) {
            console.error('Failed to create playlist:', e);
            setError(e.response?.data?.error || 'Failed to create playlist');
            setIsCreating(false);
        }
    };

    const trackCount = trackIds.length;
    const title = albumName
        ? `Add "${albumName}" to playlist`
        : trackCount === 1
            ? 'Add to playlist'
            : `Add ${trackCount} tracks to playlist`;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-app-bg border border-app-surface rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-app-surface">
                    <h2 className="text-lg font-semibold text-app-text">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-app-surface rounded-full transition-colors"
                    >
                        <X size={18} className="text-app-text-muted" />
                    </button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="px-5 py-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Content */}
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* Create New Playlist */}
                    <div className="p-3 border-b border-app-surface">
                        {showCreate ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newPlaylistName}
                                    onChange={(e) => setNewPlaylistName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                                    placeholder="Playlist name..."
                                    className="flex-1 bg-app-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent"
                                    autoFocus
                                />
                                <button
                                    onClick={handleCreatePlaylist}
                                    disabled={!newPlaylistName.trim() || isCreating}
                                    className="px-4 py-2 bg-app-accent hover:bg-app-accent/80 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    {isCreating ? <Loader2 size={16} className="animate-spin" /> : 'Create'}
                                </button>
                                <button
                                    onClick={() => { setShowCreate(false); setNewPlaylistName(''); }}
                                    className="p-2 hover:bg-app-surface rounded-lg transition-colors"
                                >
                                    <X size={16} className="text-app-text-muted" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-app-surface rounded-lg transition-colors group"
                            >
                                <div className="w-12 h-12 bg-app-surface group-hover:bg-app-accent/20 rounded-lg flex items-center justify-center transition-colors">
                                    <Plus size={20} className="text-app-accent" />
                                </div>
                                <span className="font-medium text-app-text">Create New Playlist</span>
                            </button>
                        )}
                    </div>

                    {/* Playlist List */}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={24} className="animate-spin text-app-accent" />
                        </div>
                    ) : playlists.length === 0 ? (
                        <div className="text-center py-12 text-app-text-muted">
                            <Music size={32} className="mx-auto mb-3 opacity-50" />
                            <p>No playlists yet</p>
                            <p className="text-sm mt-1">Create your first playlist above</p>
                        </div>
                    ) : (
                        <div className="p-2">
                            {playlists.map((playlist) => (
                                <button
                                    key={playlist.id}
                                    onClick={() => handleAddToPlaylist(playlist)}
                                    disabled={isAdding !== null}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-app-surface rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500/30 to-blue-500/30 rounded-lg flex items-center justify-center">
                                        <Music size={20} className="text-app-text-muted" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="font-medium text-app-text truncate">{playlist.name}</div>
                                        {playlist.description && (
                                            <div className="text-sm text-app-text-muted truncate">{playlist.description}</div>
                                        )}
                                    </div>
                                    {isAdding === playlist.id ? (
                                        <Loader2 size={18} className="animate-spin text-app-accent" />
                                    ) : addedTo === playlist.id ? (
                                        <Check size={18} className="text-green-400" />
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
