import { useState, useEffect, memo } from 'react';
import { Disc, Sparkles } from 'lucide-react';
import axios from 'axios';

const SERVER_URL = 'http://localhost:3001';

interface SimilarAlbum {
    album: string;
    artist: string;
    year: number | null;
    genre: string | null;
    sample_track_id: number;
    has_art: number;
    track_count: number;
    similarity_score: number;
    matching_tags: string[];
}

interface SimilarAlbumsSectionProps {
    currentAlbum: string;
    currentArtist: string;
    onAlbumClick: (album: { name: string; artist: string }) => void;
}

function SimilarAlbumsSection({ currentAlbum, currentArtist, onAlbumClick }: SimilarAlbumsSectionProps) {
    const [similarAlbums, setSimilarAlbums] = useState<SimilarAlbum[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSimilarAlbums = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`${SERVER_URL}/api/similar-albums`, {
                    params: { album: currentAlbum, artist: currentArtist, limit: 5 }
                });
                setSimilarAlbums(res.data);
            } catch (e) {
                console.error('Failed to fetch similar albums:', e);
                setSimilarAlbums([]);
            }
            setLoading(false);
        };

        if (currentAlbum && currentArtist) {
            fetchSimilarAlbums();
        }
    }, [currentAlbum, currentArtist]);

    if (loading) {
        return (
            <div className="mt-8 pt-6 border-t border-white/10">
                <h3 className="text-lg font-bold text-app-text mb-4 flex items-center gap-2">
                    <Sparkles size={18} className="text-app-accent" />
                    Similar Albums
                </h3>
                <div className="flex gap-4 overflow-x-auto pb-2">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="w-32 shrink-0 animate-pulse">
                            <div className="w-32 h-32 bg-app-surface rounded-lg" />
                            <div className="h-4 bg-app-surface rounded mt-2 w-24" />
                            <div className="h-3 bg-app-surface rounded mt-1 w-20" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (similarAlbums.length === 0) {
        return null; // Don't show section if no similar albums found
    }

    return (
        <div className="mt-8 pt-6 border-t border-white/10">
            <h3 className="text-lg font-bold text-app-text mb-4 flex items-center gap-2">
                <Sparkles size={18} className="text-app-accent" />
                Similar Albums
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                {similarAlbums.map((album, i) => (
                    <div
                        key={`${album.album}-${album.artist}-${i}`}
                        className="w-32 shrink-0 cursor-pointer group"
                        onClick={() => onAlbumClick({ name: album.album, artist: album.artist })}
                    >
                        {/* Album Art */}
                        <div className="w-32 h-32 bg-app-surface rounded-lg overflow-hidden shadow-lg group-hover:shadow-xl transition-shadow relative">
                            {album.has_art && album.sample_track_id ? (
                                <img
                                    src={`${SERVER_URL}/api/art/${album.sample_track_id}`}
                                    alt={album.album}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-app-surface to-app-bg">
                                    <Disc size={40} className="text-app-text-muted" />
                                </div>
                            )}
                            {/* Score badge */}
                            <div className="absolute bottom-1 right-1 bg-black/70 text-xs text-app-text px-1.5 py-0.5 rounded">
                                {album.similarity_score}
                            </div>
                        </div>
                        {/* Album Info */}
                        <div className="mt-2">
                            <div className="text-sm font-medium text-app-text truncate group-hover:text-app-accent transition-colors">
                                {album.album}
                            </div>
                            <div className="text-xs text-app-text-muted truncate">
                                {album.artist}
                            </div>
                            {album.year && (
                                <div className="text-xs text-app-text-muted/60">
                                    {album.year}
                                </div>
                            )}
                            {/* Matching tags */}
                            {album.matching_tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {album.matching_tags.slice(0, 2).map(tag => (
                                        <span key={tag} className="text-[10px] bg-app-accent/20 text-app-accent px-1.5 py-0.5 rounded">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default memo(SimilarAlbumsSection);
