import { useState } from 'react';
import { X, Search, Check, Loader2 } from 'lucide-react';
import axios from 'axios';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Release {
    id: string;
    title: string;
    artist: string;
    date?: string;
    country?: string;
    label?: string;
    trackCount?: number;
    status?: string;
}

interface SearchMatchModalProps {
    album: string;
    artist: string;
    onClose: () => void;
    onMatchApplied: () => void;
}

export default function SearchMatchModal({ album, artist, onClose, onMatchApplied }: SearchMatchModalProps) {
    const [searchQuery, setSearchQuery] = useState(album);
    const [artistQuery, setArtistQuery] = useState(artist);
    const [results, setResults] = useState<Release[]>([]);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(`${SERVER_URL}/api/musicbrainz/search`, {
                params: { album: searchQuery, artist: artistQuery }
            });
            setResults(res.data.results || []);
            if (res.data.results?.length === 0) {
                setError('No matches found. Try adjusting your search.');
            }
        } catch (e) {
            setError('Search failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleApplyMatch = async (release: Release) => {
        setApplying(release.id);
        try {
            await axios.post(`${SERVER_URL}/api/album/match`, {
                album,
                artist,
                releaseMbid: release.id
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            onMatchApplied();
            onClose();
        } catch (e) {
            setError('Failed to apply match. Please try again.');
            setApplying(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-app-bg rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-app-border">
                    <h2 className="text-xl font-bold text-app-text">Search & Match Album</h2>
                    <button onClick={onClose} className="p-2 hover:bg-app-surface rounded-lg">
                        <X size={20} className="text-app-text-muted" />
                    </button>
                </div>

                {/* Search Form */}
                <div className="p-4 space-y-3">
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-xs text-app-text-muted mb-1 block">Album</label>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text"
                                placeholder="Album name..."
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-app-text-muted mb-1 block">Artist</label>
                            <input
                                type="text"
                                value={artistQuery}
                                onChange={(e) => setArtistQuery(e.target.value)}
                                className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text"
                                placeholder="Artist name..."
                            />
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={handleSearch}
                                disabled={loading}
                                className="bg-app-accent hover:bg-app-accent/80 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                                Search
                            </button>
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto p-4 pt-0">
                    {error && (
                        <div className="text-amber-400 text-sm mb-3 p-2 bg-amber-400/10 rounded-lg">
                            {error}
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="space-y-2">
                            {results.map((release) => (
                                <div
                                    key={release.id}
                                    className="flex items-center justify-between p-3 bg-app-surface rounded-lg hover:bg-app-surface/80"
                                >
                                    <div className="flex-1">
                                        <div className="font-medium text-app-text">{release.title}</div>
                                        <div className="text-sm text-app-text-muted">
                                            {release.artist}
                                            {release.date && ` • ${release.date.substring(0, 4)}`}
                                            {release.label && ` • ${release.label}`}
                                            {release.country && ` • ${release.country}`}
                                            {release.trackCount && ` • ${release.trackCount} tracks`}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleApplyMatch(release)}
                                        disabled={applying !== null}
                                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm disabled:opacity-50"
                                    >
                                        {applying === release.id ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <Check size={14} />
                                        )}
                                        Apply
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && results.length === 0 && !error && (
                        <div className="text-center text-app-text-muted py-8">
                            Search MusicBrainz for album matches
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
