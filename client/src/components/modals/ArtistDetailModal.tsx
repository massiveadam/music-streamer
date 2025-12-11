import { useState, useEffect } from 'react';
import { X, Play, Disc, ExternalLink } from 'lucide-react';
import axios from 'axios';
import type { Track, Artist, Credit } from '../../types';

const SERVER_URL = 'http://localhost:3001';

interface ArtistDetails {
    artist: Artist;
    credits: Record<string, Credit[]>;
    albums: any[];
    labels: string[];
    totalTracks: number;
}

interface ArtistDetailModalProps {
    artist: Artist;
    tracks: Track[];
    onClose: () => void;
    onPlayTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    onAlbumClick: (albumName: string, artistName: string) => void;
    onShowNowPlaying: () => void;
}

export default function ArtistDetailModal({
    artist,
    tracks,
    onClose,
    onPlayTrack,
    onAlbumClick,
    onShowNowPlaying,
}: ArtistDetailModalProps) {
    const [artistDetails, setArtistDetails] = useState<ArtistDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            setIsLoading(true);
            try {
                const res = await axios.get(`${SERVER_URL}/api/artists/${artist.id}`);
                setArtistDetails(res.data);
            } catch (e) {
                console.error('Failed to fetch artist details:', e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [artist.id]);

    const handlePlayArtist = () => {
        const idx = tracks.findIndex(t => t.artist === artist.name);
        if (idx !== -1) {
            onPlayTrack(idx, 'cut');
            onShowNowPlaying();
        }
    };

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-[100] bg-app-bg flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-app-accent"></div>
            </div>
        );
    }

    if (!artistDetails) return null;

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
                <div className="flex flex-col gap-6 mb-12">
                    <div className="flex flex-col justify-center text-center items-center">
                        <h1 className="text-5xl md:text-8xl font-serif font-bold text-app-text mb-6">
                            {artistDetails.artist.name}
                        </h1>

                        {/* Stats */}
                        <div className="flex gap-6 text-sm text-app-text-muted font-medium mb-6">
                            {artistDetails.artist.country && <span>{artistDetails.artist.country}</span>}
                            {artistDetails.artist.begin_date && <span>Est. {artistDetails.artist.begin_date}</span>}
                            <span>{artistDetails.totalTracks} Tracks in Library</span>
                        </div>

                        {/* Bio */}
                        {artistDetails.artist.description && (
                            <p className="text-app-text-muted text-center max-w-2xl mx-auto leading-relaxed mb-6 line-clamp-4">
                                {artistDetails.artist.description.replace(/<[^>]*>?/gm, '')}
                            </p>
                        )}

                        {/* External Links */}
                        <div className="flex gap-4">
                            {artistDetails.artist.wiki_url && (
                                <a
                                    href={artistDetails.artist.wiki_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm text-app-text-muted hover:text-app-accent transition-colors"
                                >
                                    <ExternalLink size={14} />
                                    Wikipedia
                                </a>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-4 mt-6">
                            <button
                                onClick={handlePlayArtist}
                                className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-2.5 rounded-full font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
                            >
                                <Play size={16} fill="currentColor" />
                                Play All
                            </button>
                        </div>
                    </div>
                </div>

                {/* Discography */}
                <div className="mb-12">
                    <h2 className="text-2xl font-bold text-app-text mb-6">Discography</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {artistDetails.albums.map((album, i) => (
                            <div
                                key={i}
                                className="group cursor-pointer"
                                onClick={() => onAlbumClick(album.album || album.title, artist.name)}
                            >
                                <div className="aspect-square bg-app-surface rounded-lg mb-3 overflow-hidden shadow-lg group-hover:shadow-xl transition-all relative">
                                    {album.sample_track_id ? (
                                        <img
                                            src={`${SERVER_URL}/api/art/${album.sample_track_id}`}
                                            alt={album.album || album.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Disc size={32} className="text-app-text-muted" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Play size={32} className="fill-white" />
                                    </div>
                                </div>
                                <div className="font-medium text-app-text truncate text-sm">{album.album || album.title}</div>
                                {album.track_year && <div className="text-xs text-app-text-muted">{album.track_year}</div>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Credits */}
                {Object.keys(artistDetails.credits).length > 0 && (
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold text-app-text mb-6">Credits</h2>
                        <div className="space-y-6">
                            {Object.entries(artistDetails.credits).map(([role, credits]) => (
                                <div key={role}>
                                    <h3 className="text-sm font-bold text-app-text-muted uppercase tracking-wider mb-3">{role}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {credits.slice(0, 10).map((credit, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between p-3 bg-app-surface/50 rounded-lg hover:bg-app-surface transition-colors"
                                            >
                                                <span className="text-app-text truncate">{credit.track_title}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Labels */}
                {artistDetails.labels.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-bold text-app-text mb-6">Labels</h2>
                        <div className="flex flex-wrap gap-3">
                            {artistDetails.labels.map((label, i) => (
                                <span
                                    key={i}
                                    className="px-4 py-2 bg-app-surface rounded-full text-app-text hover:bg-app-accent/20 transition-colors"
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
