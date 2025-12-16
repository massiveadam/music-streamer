import { SERVER_URL, getServerUrl } from '../../config';
import { useState, useEffect } from 'react';
import { X, Disc, Play, Shuffle, Trash2 } from 'lucide-react';
import axios from 'axios';
import type { Track } from '../../types';


interface CollectionAlbum {
    name: string;
    artist: string;
    sample_track_id?: number;
    year?: number;
    track_count?: number;
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
    onDelete?: () => void;
}

export default function CollectionDetailModal({
    collection,
    tracks,
    onClose,
    onPlayTrack,
    onAlbumClick,
    onRefresh,
    onDelete,
}: CollectionDetailModalProps) {
    const [albums, setAlbums] = useState<CollectionAlbum[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAlbums = async () => {
            setIsLoading(true);
            try {
                // If the collection prop has albums already (and we want to use them), we could.
                // But fetching ensures freshness and full details if the prop was partial.
                const res = await axios.get(`${getServerUrl()}/api/collections/${collection.id}`);
                setAlbums(res.data.albums || []);
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
            await axios.delete(`${getServerUrl()}/api/collections/${collection.id}/albums`, {
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
            <div className="sticky top-0 z-50 bg-app-bg/95 backdrop-blur-md border-b border-app-surface px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-app-surface rounded-full transition-colors group"
                    >
                        <X size={24} className="text-app-text-muted group-hover:text-app-text transition-colors" />
                    </button>
                    <h2 className="text-lg font-bold truncate">{collection.name}</h2>
                </div>
                <div className="flex gap-2">
                    {onDelete && (
                        <button
                            onClick={onDelete}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-2 rounded-full transition-colors mr-2"
                            title="Delete Collection"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
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

            <div className="max-w-7xl mx-auto px-8 pt-8 pb-32">
                {/* Hero */}
                <div className="flex flex-col md:flex-row items-center md:items-end gap-8 mb-12 pb-8 border-b border-white/5">
                    <div className="w-48 h-48 bg-app-surface rounded-2xl overflow-hidden shadow-2xl border border-white/5 shrink-0">
                        <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-full p-1 bg-white/5">
                            {[0, 1, 2, 3].map(i => {
                                const album = albums[i];
                                return (
                                    <div key={i} className="bg-app-bg/50 rounded-sm overflow-hidden relative">
                                        {album?.sample_track_id ? (
                                            <img
                                                loading="lazy"
                                                decoding="async"
                                                src={`${getServerUrl()}/api/art/${album.sample_track_id}`}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
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

                    <div className="text-center md:text-left flex-1 min-w-0">
                        <h1 className="text-4xl md:text-6xl font-serif font-bold text-app-text mb-4 truncate">
                            {collection.name}
                        </h1>
                        <p className="text-xl text-app-text-muted mb-6 flex items-center justify-center md:justify-start gap-3">
                            <span>{albums.length} albums</span>
                            {collection.description && (
                                <>
                                    <span className="text-white/20">•</span>
                                    <span className="truncate max-w-md">{collection.description}</span>
                                </>
                            )}
                        </p>

                        {/* Action Buttons */}
                        <div className="flex justify-center md:justify-start gap-4">
                            <button
                                onClick={handlePlayAll}
                                className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-8 py-3 rounded-full font-medium text-lg flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
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
                </div>

                {/* Albums Grid */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-app-accent"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                        {albums.map((album, i) => (
                            <div key={i} className="group relative">
                                <div
                                    className="cursor-pointer p-3 rounded-xl hover:bg-white/5 transition-all"
                                    onClick={() => onAlbumClick(album.name, album.artist)}
                                >
                                    <div className="aspect-square bg-app-surface rounded-lg mb-3 overflow-hidden shadow-lg group-hover:shadow-xl transition-all border border-white/5 group-hover:border-white/10">
                                        {album.sample_track_id ? (
                                            <img
                                                src={`${getServerUrl()}/api/art/${album.sample_track_id}`}
                                                alt={album.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Disc size={32} className="text-app-text-muted" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="font-bold text-app-text truncate text-sm mb-0.5">{album.name}</div>
                                    <div className="text-xs text-app-text-muted truncate">
                                        {album.artist}
                                        {album.year ? ` • ${album.year}` : ''}
                                        {album.track_count ? ` • ${album.track_count} tracks` : ''}
                                    </div>
                                </div>

                                {/* Remove Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveAlbum(album.name, album.artist);
                                    }}
                                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10 hover:scale-110"
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
