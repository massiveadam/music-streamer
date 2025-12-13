import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Play, Disc, Plus, RefreshCcw, ListMusic, FolderHeart } from 'lucide-react';
import axios from 'axios';
import type { Track, Artist } from '../../types';
import AddToPlaylistModal from './AddToPlaylistModal';
import AddToCollectionModal from './AddToCollectionModal';
import SimilarAlbumsSection from '../SimilarAlbumsSection';
import { getTrackProfiles } from '../../utils/sonicProfiles';

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
    matchedTrackIds?: number[]; // Track IDs that matched a search query (for highlighting)
    onClose: () => void;
    onPlayTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    onArtistClick: (artist: Artist) => void;
    onShowNowPlaying: () => void;

    onTagClick?: (tag: string) => void;
    onToggleFavorite?: (e: React.MouseEvent, trackId: number) => void;
    onAlbumClick?: (album: { name: string; artist: string }) => void;
}

export default function AlbumDetailModal({
    album,
    tracks,
    artists,
    matchedTrackIds = [],
    onClose,
    onPlayTrack,
    onArtistClick,
    onShowNowPlaying,
    onTagClick,
    onToggleFavorite,
    onAlbumClick,
}: AlbumDetailModalProps) {
    const [activeTab, setActiveTab] = useState<'tracks' | 'credits'>('tracks');
    const [albumMetadata, setAlbumMetadata] = useState<AlbumMetadata | null>(null);
    const [albumCredits, setAlbumCredits] = useState<any[]>([]);
    const [isFlipped, setIsFlipped] = useState(false);

    // Add modal states
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [showCollectionModal, setShowCollectionModal] = useState(false);
    const [trackToAdd, setTrackToAdd] = useState<number | null>(null);
    const addMenuRef = useRef<HTMLDivElement>(null);

    // Calculate Sonic Tags
    const sonicTags = useMemo(() => {
        if (!album.tracks.length) return [];

        const tagCounts: Record<string, number> = {};
        let validTracks = 0;

        album.tracks.forEach(t => {
            if (t.energy !== undefined && t.valence !== undefined) {
                validTracks++;
                const profiles = getTrackProfiles({
                    energy: t.energy,
                    valence: t.valence,
                    danceability: t.danceability || 0,
                    bpm: t.bpm || 0
                });
                profiles.forEach(p => tagCounts[p] = (tagCounts[p] || 0) + 1);
            }
        });

        if (validTracks === 0) return [];

        const threshold = Math.max(1, validTracks * 0.4);

        return Object.entries(tagCounts)
            .filter(([_, count]) => count >= threshold)
            .map(([tag]) => tag)
            .sort();
    }, [album.tracks]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
                setShowAddMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch album metadata
    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const res = await axios.get(`${SERVER_URL}/api/album-metadata`, {
                    params: { album: album.name, artist: album.artist }
                });
                setAlbumMetadata(res.data);
            } catch (e) {
                console.error('Failed to fetch album metadata:', e);
            }
        };
        fetchMetadata();
    }, [album]);

    // Fetch credits on mount (needed for inline credits section below tracks)
    useEffect(() => {
        const fetchCredits = async () => {
            try {
                const res = await axios.get(`${SERVER_URL}/api/credits/album/${encodeURIComponent(album.name)}/${encodeURIComponent(album.artist)}`);
                setAlbumCredits(res.data || []);
            } catch (e) {
                console.error('Failed to fetch credits:', e);
            }
        };
        fetchCredits();
    }, [album.name, album.artist]);

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
                <div className="flex gap-2 text-sm text-app-text-muted">
                    {/* Breadcrumb or additional controls could go here */}
                </div>
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
                                onClose();
                                if (artist) {
                                    onArtistClick(artist);
                                } else {
                                    // Fallback: create minimal artist object if not in database
                                    onArtistClick({ id: 0, name: album.artist, mbid: null } as any);
                                }
                            }}
                            className="text-lg text-app-text-muted hover:text-app-text hover:underline self-start mb-4"
                        >
                            {album.artist}
                        </button>

                        {/* Metadata Line */}
                        <div className="flex flex-wrap gap-4 text-sm text-app-text-muted font-medium mb-4 items-center">
                            <div className="flex flex-wrap gap-2">
                                {/* Genre Tags - Primary */}
                                {(album.genre || album.tracks[0]?.genre || 'Unknown Genre').split(/[,/]/)[0] && (
                                    <span
                                        onClick={() => onTagClick?.((album.genre || album.tracks[0]?.genre || 'Unknown Genre').split(/[,/]/)[0].trim())}
                                        className={`font-semibold ${onTagClick ? "hover:text-app-accent hover:underline cursor-pointer transition-colors" : ""}`}
                                    >
                                        {(album.genre || album.tracks[0]?.genre || 'Unknown Genre').split(/[,/]/)[0].trim()}
                                    </span>
                                )}
                            </div>
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

                        {/* Sub-genre Pills */}
                        {(() => {
                            const genreStr = album.genre || album.tracks[0]?.genre || '';
                            const allGenres = genreStr.split(/[,/]/).map(g => g.trim()).filter(Boolean);
                            const subGenres = allGenres.slice(1); // All genres after the primary
                            const mbTags = albumMetadata?.tags?.map(t => t.name) || [];
                            // Combine sub-genres from file tags and MusicBrainz tags, deduplicated
                            const allSubGenres = [...new Set([...subGenres, ...mbTags])];

                            if (allSubGenres.length === 0) return null;

                            return (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {allSubGenres.slice(0, 10).map((tag, i) => (
                                        <span
                                            key={i}
                                            className="px-2 py-0.5 rounded-full bg-app-surface/50 border border-app-surface text-xs text-app-text-muted hover:text-white hover:border-app-accent transition-colors cursor-pointer"
                                            onClick={() => onTagClick?.(tag)}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* Action Buttons */}
                        <div className="flex gap-4 mt-6">
                            <button
                                onClick={handlePlayAlbum}
                                className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-2.5 rounded-full font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
                            >
                                <Play size={16} fill="currentColor" />
                                Play now
                            </button>
                            {onToggleFavorite && album.tracks[0] && (
                                <button
                                    onClick={(e) => onToggleFavorite(e, album.tracks[0].id)}
                                    className="p-2.5 hover:bg-app-surface rounded-full transition-colors"
                                >
                                    <svg className={`w-5 h-5 transition-colors ${album.tracks[0].rating === 1 ? 'text-app-accent fill-app-accent' : 'text-app-text-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                </button>
                            )}

                            {/* Add to Playlist/Collection Dropdown */}
                            <div className="relative" ref={addMenuRef}>
                                <button
                                    onClick={() => setShowAddMenu(!showAddMenu)}
                                    className="p-2.5 hover:bg-app-surface rounded-full transition-colors border border-white/10 hover:border-white/20"
                                    title="Add to..."
                                >
                                    <Plus size={20} className="text-app-text-muted" />
                                </button>

                                {showAddMenu && (
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-app-bg border border-app-surface rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                                        <button
                                            onClick={() => {
                                                setShowAddMenu(false);
                                                setShowPlaylistModal(true);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-app-surface transition-colors text-left"
                                        >
                                            <ListMusic size={18} className="text-app-accent" />
                                            <div>
                                                <div className="font-medium text-app-text">Add to Playlist</div>
                                                <div className="text-xs text-app-text-muted">Add all {album.tracks.length} tracks</div>
                                            </div>
                                        </button>
                                        <div className="border-t border-app-surface" />
                                        <button
                                            onClick={() => {
                                                setShowAddMenu(false);
                                                setShowCollectionModal(true);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-app-surface transition-colors text-left"
                                        >
                                            <FolderHeart size={18} className="text-teal-400" />
                                            <div>
                                                <div className="font-medium text-app-text">Add to Collection</div>
                                                <div className="text-xs text-app-text-muted">Save album to a collection</div>
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Row */}
                <div className="grid md:grid-cols-3 gap-8 mb-8 pb-8 border-b border-app-surface">
                    <div className="md:col-span-2">
                        <p className="text-sm text-app-text-muted leading-relaxed">
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
                <div className="flex items-center justify-center gap-8 mb-8 border-b border-app-surface sticky top-[69px] bg-app-bg z-40">
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
                        <>
                            {album.tracks.map((track, i) => {
                                const isMatched = matchedTrackIds.length > 0 && matchedTrackIds.includes(track.id);
                                return (
                                    <div
                                        key={track.id}
                                        className={`group flex items-center gap-4 px-4 py-3 hover:bg-app-surface rounded-md cursor-pointer transition-colors ${isMatched ? 'bg-app-accent/10 border-l-2 border-app-accent' : ''}`}
                                    >
                                        <div className="w-8 text-center text-sm text-app-text-muted group-hover:text-app-accent font-medium">
                                            <span className="group-hover:hidden">{i + 1}</span>
                                            <Play size={14} fill="currentColor" className="hidden group-hover:inline-block" onClick={(e) => {
                                                e.stopPropagation();
                                                const idx = tracks.findIndex(t => t.id === track.id);
                                                if (idx !== -1) {
                                                    onPlayTrack(idx, 'cut');
                                                    onShowNowPlaying();
                                                }
                                            }} />
                                        </div>
                                        <div className="flex-1 min-w-0" onClick={() => {
                                            const idx = tracks.findIndex(t => t.id === track.id);
                                            if (idx !== -1) {
                                                onPlayTrack(idx, 'cut');
                                                onShowNowPlaying();
                                            }
                                        }}>
                                            <div className="font-medium text-app-text truncate">{track.title}</div>
                                            {track.artist !== album.artist && (
                                                <div className="text-sm text-app-text-muted truncate">{track.artist}</div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {onToggleFavorite && (
                                                <button
                                                    onClick={(e) => onToggleFavorite(e, track.id)}
                                                    className={`p-1.5 hover:bg-white/10 rounded-full transition-all ${track.rating === 1 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                                >
                                                    <svg className={`w-4 h-4 transition-colors ${track.rating === 1 ? 'text-app-accent fill-app-accent' : 'text-app-text-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                    </svg>
                                                </button>
                                            )}
                                            {/* Add to Playlist button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTrackToAdd(track.id);
                                                    setShowPlaylistModal(true);
                                                }}
                                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded-full transition-all"
                                                title="Add to playlist"
                                            >
                                                <Plus size={16} className="text-app-text-muted hover:text-app-accent" />
                                            </button>
                                            <div className="text-sm text-app-text-muted font-medium">
                                                {Math.floor(track.duration / 60)}:{(Math.floor(track.duration % 60)).toString().padStart(2, '0')}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Credits Section - Below Tracks */}
                            {(() => {
                                // Filter out empty credits
                                const validCredits = albumCredits.filter(c => c.name && c.name.trim() !== '');
                                if (validCredits.length === 0 && !albumMetadata?.label) return null;

                                const grouped = validCredits.reduce((acc: Record<string, any[]>, c) => {
                                    const role = c.role || 'Unknown';
                                    if (!acc[role]) acc[role] = [];
                                    acc[role].push(c);
                                    return acc;
                                }, {});

                                return (
                                    <div className="mt-8 pt-6 border-t border-app-surface">
                                        <h3 className="text-lg font-bold text-app-text mb-4">Credits</h3>

                                        <div className="space-y-4">
                                            {Object.entries(grouped).slice(0, 6).map(([role, credits]) => (
                                                <div key={role} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                    <span className="text-sm font-medium text-app-text-muted uppercase tracking-wider min-w-[120px]">{role}</span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(credits as any[]).slice(0, 5).map((c, i) => (
                                                            <span
                                                                key={i}
                                                                className="text-sm text-app-text hover:text-app-accent cursor-pointer transition-colors"
                                                                onClick={() => onTagClick?.(c.name)}
                                                            >
                                                                {c.name}{i < Math.min((credits as any[]).length, 5) - 1 ? ',' : ''}
                                                            </span>
                                                        ))}
                                                        {(credits as any[]).length > 5 && (
                                                            <span className="text-sm text-app-text-muted">+{(credits as any[]).length - 5} more</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {Object.keys(grouped).length > 6 && (
                                                <button
                                                    onClick={() => setActiveTab('credits')}
                                                    className="text-sm text-app-accent hover:underline"
                                                >
                                                    View all credits →
                                                </button>
                                            )}
                                        </div>

                                        {/* Copyright Info - at bottom */}
                                        {(album.year || albumMetadata?.label) && (
                                            <div className="mt-6 pt-4 border-t border-app-surface/50 text-sm text-app-text-muted">
                                                © {album.year || ''} {albumMetadata?.label?.name || album.artist}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </>
                    ) : (
                        <div className="space-y-4">
                            {(() => {
                                const validCredits = albumCredits.filter(c => c.name && c.name.trim() !== '');
                                if (validCredits.length === 0) {
                                    return <p className="text-app-text-muted text-center py-8">No credits available for this album.</p>;
                                }
                                return Object.entries(
                                    validCredits.reduce((acc: Record<string, any[]>, c) => {
                                        const role = c.role || 'Unknown';
                                        if (!acc[role]) acc[role] = [];
                                        acc[role].push(c);
                                        return acc;
                                    }, {})
                                ).map(([role, credits]) => (
                                    <div key={role} className="border-b border-app-surface pb-4">
                                        <h3 className="text-sm font-bold text-app-text-muted uppercase tracking-wider mb-2">{role}</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {(credits as any[]).filter(c => c.name && c.name.trim() !== '').map((c, i) => (
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
                                ));
                            })()}
                        </div>
                    )}
                </div>

                {/* Similar Albums Section */}
                {onAlbumClick && (
                    <SimilarAlbumsSection
                        currentAlbum={album.name}
                        currentArtist={album.artist}
                        onAlbumClick={onAlbumClick}
                    />
                )}
            </div>

            {/* Add to Playlist Modal */}
            {
                showPlaylistModal && (
                    <AddToPlaylistModal
                        trackIds={trackToAdd ? [trackToAdd] : album.tracks.map(t => t.id)}
                        albumName={trackToAdd ? undefined : album.name}
                        onClose={() => {
                            setShowPlaylistModal(false);
                            setTrackToAdd(null);
                        }}
                        onSuccess={(name) => {
                            console.log(`Added to playlist: ${name}`);
                        }}
                    />
                )
            }

            {/* Add to Collection Modal */}
            {
                showCollectionModal && (
                    <AddToCollectionModal
                        albumName={album.name}
                        artistName={album.artist}
                        sampleTrackId={album.tracks[0]?.id}
                        onClose={() => setShowCollectionModal(false)}
                        onSuccess={(name) => {
                            console.log(`Added to collection: ${name}`);
                        }}
                    />
                )
            }
        </div >
    );
}
