import { useState, useEffect } from 'react';
import { X, Play, Disc, PlusCircle, RefreshCcw } from 'lucide-react';
import axios from 'axios';
import type { Track, Artist } from '../../types';

const SERVER_URL = 'http://localhost:3001';

interface Album {
    name: string;
    artist: string;
    tracks: Track[];
    year: number | null;
    genre?: string;
}

interface AlbumMetadata {
    found: boolean;
    release?: any;
    label?: any;
    tags?: { name: string; count?: number }[];
    images?: { type: string; source: string }[];
}

interface AlbumDetailModalProps {
    album: Album;
    tracks: Track[];
    artists: Artist[];
    onClose: () => void;
    onPlayTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    onArtistClick: (artist: Artist) => void;
    onShowNowPlaying: () => void;
    onTagClick?: (tag: string) => void;
}

export default function AlbumDetailModal({
    album,
    tracks,
    artists,
    onClose,
    onPlayTrack,
    onArtistClick,
    onShowNowPlaying,
    onTagClick,
}: AlbumDetailModalProps) {
    const [activeTab, setActiveTab] = useState<'tracks' | 'credits'>('tracks');
    const [albumMetadata, setAlbumMetadata] = useState<AlbumMetadata | null>(null);
    const [albumCredits, setAlbumCredits] = useState<any[]>([]);
    const [isFlipped, setIsFlipped] = useState(false);

    // Fetch album metadata
    useEffect(() => {
        const fetchMetadata = async () => {
            if (!album.tracks[0]?.release_mbid) return;
            try {
                const res = await axios.get(`${SERVER_URL}/api/album/${album.tracks[0].release_mbid}/metadata`);
                setAlbumMetadata(res.data);
            } catch (e) {
                console.error('Failed to fetch album metadata:', e);
            }
        };
        fetchMetadata();
    }, [album]);

    // Fetch credits when credits tab is active
    useEffect(() => {
        if (activeTab !== 'credits') return;
        const fetchCredits = async () => {
            try {
                const res = await axios.get(`${SERVER_URL}/api/credits/album/${encodeURIComponent(album.name)}/${encodeURIComponent(album.artist)}`);
                setAlbumCredits(res.data || []);
            } catch (e) {
                console.error('Failed to fetch credits:', e);
            }
        };
        fetchCredits();
    }, [activeTab, album.name, album.artist]);

    const handlePlayAlbum = () => {
        const idx = tracks.findIndex(t => t.album === album.name && t.artist === album.artist);
        if (idx !== -1) {
            onPlayTrack(idx, 'cut');
            onShowNowPlaying();
        }
    };

    const totalDuration = album.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

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

            {/* Main Content */}
            <div className="max-w-5xl mx-auto px-8 py-12">
                {/* Hero Section */}
                <div className="flex flex-col md:flex-row gap-8 mb-8">
                    {/* Album Artwork with Flip */}
                    <div className="shrink-0 perspective-[1000px]">
                        <div
                            className={`w-64 h-64 relative transition-transform duration-700 [transform-style:preserve-3d] ${albumMetadata?.images?.find(i => i.type === 'back') ? 'cursor-pointer' : ''} ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
                            onClick={() => albumMetadata?.images?.find(i => i.type === 'back') && setIsFlipped(!isFlipped)}
                        >
                            {/* Front Face */}
                            <div className="absolute inset-0 [backface-visibility:hidden] rounded-sm overflow-hidden shadow-lg bg-app-surface">
                                {album.tracks[0]?.has_art ? (
                                    <img
                                        src={`${SERVER_URL}/api/art/${album.tracks[0].id}`}
                                        alt={album.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Disc size={64} className="text-app-text-muted" />
                                    </div>
                                )}
                                {albumMetadata?.images?.find(i => i.type === 'back') && (
                                    <div className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors" title="View Back Cover">
                                        <RefreshCcw size={14} />
                                    </div>
                                )}
                            </div>

                            {/* Back Face */}
                            <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-sm overflow-hidden shadow-lg bg-app-surface border border-app-surface">
                                {albumMetadata?.images?.find(i => i.type === 'back') ? (
                                    <img
                                        src={`${SERVER_URL}/api/art/release/${albumMetadata.release?.mbid}/back`}
                                        alt="Back Cover"
                                        className="w-full h-full object-contain bg-black"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-app-text-muted text-xs">
                                        No Back Cover
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Album Info */}
                    <div className="flex-1 flex flex-col justify-end min-w-0">
                        <h1 className="text-5xl md:text-6xl font-serif font-normal leading-tight mb-3 text-app-text">
                            {album.name}
                        </h1>

                        <button
                            onClick={() => {
                                const artist = artists.find(a => a.name === album.artist);
                                if (artist) {
                                    onClose();
                                    onArtistClick(artist);
                                }
                            }}
                            className="text-lg text-app-text-muted hover:text-app-text hover:underline self-start mb-4"
                        >
                            {album.artist}
                        </button>

                        {/* Metadata Line */}
                        <div className="flex flex-wrap gap-4 text-sm text-app-text-muted font-medium mb-4">
                            <span>{album.genre || album.tracks[0]?.genre || 'Unknown Genre'}</span>
                            {album.year && (
                                <>
                                    <span>•</span>
                                    <span>{album.year}</span>
                                </>
                            )}
                            {album.tracks.length > 0 && (
                                <>
                                    <span>•</span>
                                    <span>{album.tracks.length} Songs</span>
                                    <span>•</span>
                                    <span>{Math.floor(totalDuration / 60)} min</span>
                                </>
                            )}
                            {albumMetadata?.label && (
                                <>
                                    <span>•</span>
                                    <span
                                        className="text-app-text hover:text-app-accent cursor-pointer"
                                        onClick={() => onTagClick?.(albumMetadata.label.name)}
                                    >
                                        {albumMetadata.label.name}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Genre Tags */}
                        {albumMetadata?.tags && albumMetadata.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {albumMetadata.tags.slice(0, 8).map((tag, i) => (
                                    <span
                                        key={i}
                                        className="px-2 py-0.5 rounded-full bg-app-surface/50 border border-app-surface text-xs text-app-text-muted hover:text-white hover:border-app-accent transition-colors cursor-pointer"
                                        onClick={() => onTagClick?.(tag.name)}
                                    >
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-4 mt-6">
                            <button
                                onClick={handlePlayAlbum}
                                className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-2.5 rounded-full font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
                            >
                                <Play size={16} fill="currentColor" />
                                Play now
                            </button>
                            <button className="p-2.5 hover:bg-app-surface rounded-full transition-colors">
                                <PlusCircle size={20} className="text-app-text-muted" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Stats Row */}
                <div className="grid md:grid-cols-3 gap-8 mb-8 pb-8 border-b border-app-surface">
                    <div className="md:col-span-2">
                        <p className="text-sm text-app-text-muted leading-relaxed line-clamp-6">
                            {albumMetadata?.release?.description
                                ? albumMetadata.release.description.replace(/<[^>]*>?/gm, '')
                                : album.tracks[0]?.genre
                                    ? `A ${album.tracks[0].genre} album by ${album.artist}.`
                                    : "No description available."}
                        </p>
                    </div>
                    <div className="space-y-3 text-sm">
                        <div>
                            <div className="text-app-text-muted mb-1">Length</div>
                            <div className="text-app-text font-medium">{Math.floor(totalDuration / 60)} minutes</div>
                        </div>
                        <div>
                            <div className="text-app-text-muted mb-1">Format</div>
                            <div className="text-app-text font-medium">{album.tracks[0]?.format || 'FLAC'}</div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center justify-center gap-8 mb-8 border-b border-app-surface sticky top-0 bg-app-bg z-10">
                    <button
                        onClick={() => setActiveTab('tracks')}
                        className={`pb-3 border-b-2 font-medium text-sm uppercase tracking-wider transition-colors ${activeTab === 'tracks' ? 'border-app-accent text-app-text' : 'border-transparent text-app-text-muted hover:text-app-text'}`}
                    >
                        Tracks
                    </button>
                    <button
                        onClick={() => setActiveTab('credits')}
                        className={`pb-3 border-b-2 font-medium text-sm uppercase tracking-wider transition-colors ${activeTab === 'credits' ? 'border-app-accent text-app-text' : 'border-transparent text-app-text-muted hover:text-app-text'}`}
                    >
                        Credits
                    </button>
                </div>

                {/* Content */}
                <div className="space-y-1 pb-32">
                    {activeTab === 'tracks' ? (
                        album.tracks.map((track, i) => (
                            <div
                                key={track.id}
                                onClick={() => {
                                    const idx = tracks.findIndex(t => t.id === track.id);
                                    if (idx !== -1) {
                                        onPlayTrack(idx, 'cut');
                                        onShowNowPlaying();
                                    }
                                }}
                                className="group flex items-center gap-4 px-4 py-3 hover:bg-app-surface rounded-md cursor-pointer transition-colors"
                            >
                                <div className="w-8 text-center text-sm text-app-text-muted group-hover:text-app-accent font-medium">
                                    <span className="group-hover:hidden">{i + 1}</span>
                                    <Play size={14} fill="currentColor" className="hidden group-hover:inline-block" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-app-text truncate">{track.title}</div>
                                    {track.artist !== album.artist && (
                                        <div className="text-sm text-app-text-muted truncate">{track.artist}</div>
                                    )}
                                </div>
                                <div className="text-sm text-app-text-muted font-mono tabular-nums">
                                    {Math.floor(track.duration / 60)}:{(Math.floor(track.duration % 60)).toString().padStart(2, '0')}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="space-y-4">
                            {albumCredits.length > 0 ? (
                                Object.entries(
                                    albumCredits.reduce((acc: Record<string, any[]>, c) => {
                                        const role = c.role || 'Unknown';
                                        if (!acc[role]) acc[role] = [];
                                        acc[role].push(c);
                                        return acc;
                                    }, {})
                                ).map(([role, credits]) => (
                                    <div key={role} className="border-b border-app-surface pb-4">
                                        <h3 className="text-sm font-bold text-app-text-muted uppercase tracking-wider mb-2">{role}</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {(credits as any[]).map((c, i) => (
                                                <span
                                                    key={i}
                                                    className="px-3 py-1 bg-app-surface rounded-full text-sm text-app-text hover:bg-app-accent/20 cursor-pointer transition-colors"
                                                    onClick={() => onTagClick?.(c.name)}
                                                >
                                                    {c.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-app-text-muted text-center py-8">No credits available for this album.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
