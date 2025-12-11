import { useState, useEffect } from 'react';
import { X, Disc, Play, Shuffle, Trash2 } from 'lucide-react';
import axios from 'axios';
import type { Track } from '../../types';

const SERVER_URL = 'http://localhost:3001';

interface CollectionAlbum {
    name: string;
    artist: string;
    sample_track_id?: number;
}

interface Collection {
    id: number;
    name: string;
    description?: string;
    album_count?: number;
}

interface CollectionDetailModalProps {
    collection: Collection;
    tracks: Track[];
    onClose: () => void;
    onPlayTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    onAlbumClick: (albumName: string, artistName: string) => void;
    onRefresh?: () => void;
}

export default function CollectionDetailModal({
    collection,
    tracks,
    onClose,
    onPlayTrack,
    onAlbumClick,
    onRefresh,
}: CollectionDetailModalProps) {
    const [albums, setAlbums] = useState<CollectionAlbum[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAlbums = async () => {
            setIsLoading(true);
            try {
                const res = await axios.get(`${SERVER_URL}/api/collections/${collection.id}/albums`);
                setAlbums(res.data || []);
            } catch (e) {
                console.error('Failed to fetch collection albums:', e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAlbums();
    }, [collection.id]);

    const handlePlayAll = () => {
        if (albums.length === 0) return;
        const firstAlbum = albums[0];
        const idx = tracks.findIndex(t => t.album === firstAlbum.name && t.artist === firstAlbum.artist);
        if (idx !== -1) onPlayTrack(idx, 'cut');
    };

    const handleShuffle = () => {
        if (albums.length === 0) return;
        const randomAlbum = albums[Math.floor(Math.random() * albums.length)];
        const albumTracks = tracks.filter(t => t.album === randomAlbum.name && t.artist === randomAlbum.artist);
        if (albumTracks.length > 0) {
            const randomTrack = albumTracks[Math.floor(Math.random() * albumTracks.length)];
            const idx = tracks.findIndex(t => t.id === randomTrack.id);
            if (idx !== -1) onPlayTrack(idx, 'cut');
        }
    };

    const handleRemoveAlbum = async (albumName: string, artistName: string) => {
        try {
            await axios.delete(`${SERVER_URL}/api/collections/${collection.id}/albums`, {
                data: { album: albumName, artist: artistName }
            });
            setAlbums(prev => prev.filter(a => !(a.name === albumName && a.artist === artistName)));
            onRefresh?.();
        } catch (e) {
            console.error('Failed to remove album:', e);
        }
    };

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
            </div>

            <div className="max-w-5xl mx-auto px-8 pt-12 pb-32">
                {/* Hero */}
                <div className="text-center mb-12">
                    <div className="w-32 h-32 mx-auto bg-gradient-to-br from-teal-500/30 to-blue-500/30 rounded-2xl mb-6 overflow-hidden">
                        <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-full p-1">
                            {[0, 1, 2, 3].map(i => {
                                const album = albums[i];
                                return (
                                    <div key={i} className="bg-app-bg/50 rounded-sm overflow-hidden">
                                        {album?.sample_track_id ? (
                                            <img loading="lazy" decoding="async" src={`${SERVER_URL}/api/art/${album.sample_track_id}`} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Disc size={16} className="text-app-text-muted/50" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-app-text mb-2">
                        {collection.name}
                    </h1>
                    {collection.description && (
                        <p className="text-app-text-muted mb-4">{collection.description}</p>
                    )}
                    <p className="text-sm text-app-text-muted">{albums.length} albums</p>

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

                {/* Albums Grid */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-app-accent"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {albums.map((album, i) => (
                            <div key={i} className="group relative">
                                <div
                                    className="cursor-pointer"
                                    onClick={() => onAlbumClick(album.name, album.artist)}
                                >
                                    <div className="aspect-square bg-app-surface rounded-lg mb-3 overflow-hidden shadow-lg group-hover:shadow-xl transition-all">
                                        {album.sample_track_id ? (
                                            <img
                                                src={`${SERVER_URL}/api/art/${album.sample_track_id}`}
                                                alt={album.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Disc size={32} className="text-app-text-muted" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="font-medium text-app-text truncate text-sm">{album.name}</div>
                                    <div className="text-xs text-app-text-muted truncate">{album.artist}</div>
                                </div>

                                {/* Remove Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveAlbum(album.name, album.artist);
                                    }}
                                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                    title="Remove from collection"
                                >
                                    <Trash2 size={14} className="text-white" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
