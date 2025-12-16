import { SERVER_URL, getServerUrl } from '../config';
import { useMemo, useCallback, memo, useState, useEffect } from 'react';
import { Disc, Clock, Sparkles, ListMusic, Hash, Plus, Wand2 } from 'lucide-react';
import axios from 'axios';
import type { Track, Artist } from '../types';
import SmartMixCard from '../components/SmartMixCard';
import SmartMixModal from '../components/SmartMixModal';


interface SmartMix {
    id: number;
    name: string;
    description: string;
    icon: string;
    filter_rules: string;
}

interface Album {
    name: string;
    artist: string;
    tracks: Track[];
    year: number | null;
}

interface HomePageProps {
    tracks: Track[];
    albums: Album[];
    artists: Artist[];
    recentlyPlayed: Track[];
    recentlyAdded: Track[];
    pinnedCollections: any[];
    playTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    setSelectedCollection: (collection: any) => void;
    setSelectedAlbum: (album: Album | null) => void;
    setMainTab: (tab: 'home' | 'library' | 'playlists' | 'settings') => void;
    setPlaylistsViewMode: (mode: 'playlists' | 'collections') => void;
    setAddToCollectionAlbum: (album: { name: string; artist: string } | null) => void;
}

// Memoized album card component to prevent unnecessary re-renders
const AlbumCard = memo(function AlbumCard({
    track,
    albums,
    setSelectedAlbum,
    size = 'large'
}: {
    track: Track;
    albums: Album[];
    setSelectedAlbum: (album: Album | null) => void;
    size?: 'large' | 'small';
}) {
    const handleClick = useCallback(() => {
        const album = albums.find(a => a.name === track.album && a.artist === track.artist);
        if (album) {
            setSelectedAlbum(album);
        } else {
            // Create synthetic album from track data
            setSelectedAlbum({
                name: track.album || 'Unknown Album',
                artist: track.artist || 'Unknown Artist',
                tracks: [track],
                year: track.year || null
            });
        }
    }, [track, albums, setSelectedAlbum]);

    const sizeClass = size === 'large' ? 'w-64' : 'w-44';
    const imgSize = size === 'large' ? 64 : 32;

    return (
        <div
            className={`shrink-0 ${sizeClass} cursor-pointer group`}
            onClick={handleClick}
        >
            <div className={`aspect-square bg-app-surface ${size === 'large' ? 'rounded-xl mb-4 shadow-2xl ring-1 ring-white/10 group-hover:ring-app-accent/50' : 'rounded-lg mb-3 shadow-lg group-hover:shadow-xl'} overflow-hidden group-hover:scale-[1.02] transition-transform duration-300`}>
                {track.has_art ? (
                    <img
                        src={`${getServerUrl()}/api/art/${track.id}`}
                        alt=""
                        className={`w-full h-full object-cover ${size === 'small' ? 'group-hover:scale-105 transition-transform duration-500' : ''}`}
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/5">
                        <Disc size={imgSize} className="text-app-text-muted/50" />
                    </div>
                )}
            </div>
            <div className={`${size === 'large' ? 'text-lg' : ''} font-bold text-app-text truncate`}>{track.album}</div>
            <div className={`${size === 'small' ? 'text-xs' : ''} text-app-text-muted truncate`}>{track.artist}</div>
        </div>
    );
});

// Memoized collection card
const CollectionCard = memo(function CollectionCard({
    collection,
    onClick
}: {
    collection: any;
    onClick: () => void;
}) {
    return (
        <div
            className="bg-app-surface hover:bg-app-surface/80 rounded-xl p-4 cursor-pointer transition-colors group"
            onClick={onClick}
        >
            <div className="aspect-square bg-gradient-to-br from-teal-500/30 to-blue-500/30 rounded-lg mb-3 overflow-hidden shadow-lg group-hover:scale-[1.02] transition-transform duration-300">
                <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-full p-0.5">
                    {[0, 1, 2, 3].map(i => {
                        const previewAlbum = collection.preview_albums?.[i];
                        return (
                            <div key={i} className="bg-app-bg/50 rounded-sm overflow-hidden aspect-square">
                                {previewAlbum?.sample_track_id ? (
                                    <img
                                        src={`${getServerUrl()}/api/art/${previewAlbum.sample_track_id}`}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Disc size={20} className="text-app-text-muted/50" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="text-base font-bold text-app-text truncate">{collection.name}</div>
            <div className="text-sm text-app-text-muted truncate">{collection.description || 'Collection'}</div>
        </div>
    );
});

// Memoized history track row
const HistoryTrackRow = memo(function HistoryTrackRow({
    track,
    index,
    tracks,
    playTrack
}: {
    track: Track;
    index: number;
    tracks: Track[];
    playTrack: (index: number, transition: 'cut' | 'crossfade') => void;
}) {
    const handleClick = useCallback(() => {
        const idx = tracks.findIndex(t => t.id === track.id);
        if (idx !== -1) playTrack(idx, 'cut');
    }, [track.id, tracks, playTrack]);

    const formattedDuration = useMemo(() => {
        if (!track.duration) return '--:--';
        return new Date(track.duration * 1000).toISOString().substr(14, 5);
    }, [track.duration]);

    return (
        <div
            className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl cursor-pointer group transition-colors border-b border-white/5 last:border-0"
            onClick={handleClick}
        >
            <div className="w-10 h-10 rounded-lg bg-app-surface overflow-hidden shrink-0">
                {track.has_art ? (
                    <img
                        src={`${getServerUrl()}/api/art/${track.id}`}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Disc size={16} className="text-app-text-muted" />
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-app-text truncate group-hover:text-app-accent transition-colors">{track.title}</div>
                <div className="text-sm text-app-text-muted truncate">{track.artist} • {track.album}</div>
            </div>
            <div className="text-xs text-app-text-muted font-mono px-4">
                {formattedDuration}
            </div>
        </div>
    );
});

function HomePage({
    tracks,
    albums,
    artists,
    recentlyPlayed,
    recentlyAdded,
    pinnedCollections,
    playTrack,
    setSelectedCollection,
    setSelectedAlbum,
    setMainTab,
    setPlaylistsViewMode,
    setAddToCollectionAlbum,
}: HomePageProps) {
    // Smart Mixes state
    const [smartMixes, setSmartMixes] = useState<SmartMix[]>([]);
    const [selectedMix, setSelectedMix] = useState<SmartMix | null>(null);

    // Fetch smart mixes on mount
    useEffect(() => {
        axios.get(`${getServerUrl()}/api/mixes`)
            .then(res => setSmartMixes(res.data || []))
            .catch(err => console.error('Failed to fetch smart mixes:', err));
    }, []);

    // Memoize expensive filtering operations
    const uniqueRecentlyPlayed = useMemo(() => {
        return recentlyPlayed
            .filter((t, index, self) =>
                t.album && index === self.findIndex(t2 => t2.album === t.album && t2.artist === t.artist)
            )
            .slice(0, 10);
    }, [recentlyPlayed]);

    const uniqueRecentlyAdded = useMemo(() => {
        return recentlyAdded
            .filter((t, index, self) =>
                t.album && index === self.findIndex(t2 => t2.album === t.album && t2.artist === t.artist)
            )
            .slice(0, 20);
    }, [recentlyAdded]);

    const historyTracks = useMemo(() => recentlyPlayed.slice(0, 10), [recentlyPlayed]);

    // Memoize stats calculations
    const stats = useMemo(() => ({
        trackCount: tracks.length,
        albumCount: albums.length,
        artistCount: artists.length,
        hoursOfMusic: Math.floor(tracks.reduce((acc, t) => acc + (t.duration || 0), 0) / 3600)
    }), [tracks, albums, artists]);

    // Memoized callbacks
    const handleNewCollection = useCallback(() => {
        setMainTab('playlists');
        setPlaylistsViewMode('collections');
        setAddToCollectionAlbum(null);
    }, [setMainTab, setPlaylistsViewMode, setAddToCollectionAlbum]);

    return (
        <>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 bg-app-bg safe-area-inset-top">
                <div className="max-w-7xl mx-auto">
                    <header className="mb-6 md:mb-12">
                        <h1 className="text-2xl md:text-4xl font-serif font-bold text-app-text">
                            Welcome Back
                        </h1>
                    </header>

                    {/* Smart Mixes - Curated For You */}
                    {smartMixes.length > 0 && (
                        <div className="mb-8 md:mb-16">
                            <h2 className="text-lg md:text-2xl font-bold text-app-text mb-4 md:mb-6 flex items-center gap-2">
                                <Wand2 size={24} className="text-app-accent" />
                                Curated For You
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {smartMixes.map(mix => (
                                    <SmartMixCard
                                        key={mix.id}
                                        mix={mix}
                                        onClick={() => setSelectedMix(mix)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 1. Recently Played Albums (Largest) */}
                    {uniqueRecentlyPlayed.length > 0 && (
                        <div className="mb-8 md:mb-16">
                            <h2 className="text-lg md:text-2xl font-bold text-app-text mb-4 md:mb-6 flex items-center gap-2">
                                <Disc size={24} className="text-app-accent" />
                                Jump Back In
                            </h2>
                            <div className="flex gap-4 md:gap-6 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
                                {uniqueRecentlyPlayed.map((track, i) => (
                                    <AlbumCard
                                        key={`${track.album}-${i}`}
                                        track={track}
                                        albums={albums}
                                        setSelectedAlbum={setSelectedAlbum}
                                        size="large"
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 2. Recently Added Albums */}
                    {uniqueRecentlyAdded.length > 0 && (
                        <div className="mb-8 md:mb-16">
                            <h2 className="text-lg md:text-xl font-bold text-app-text mb-4 md:mb-6 flex items-center gap-2">
                                <Clock size={20} className="text-app-accent" />
                                Fresh Arrivals
                            </h2>
                            <div className="flex gap-3 md:gap-5 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
                                {uniqueRecentlyAdded.map((track) => (
                                    <AlbumCard
                                        key={track.id}
                                        track={track}
                                        albums={albums}
                                        setSelectedAlbum={setSelectedAlbum}
                                        size="small"
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 3. Pinned Collections */}
                    <div className="mb-16">
                        <h2 className="text-xl font-bold text-app-text mb-6 flex items-center gap-2">
                            <Sparkles size={20} className="text-app-accent" />
                            Collections
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {pinnedCollections.map(col => (
                                <CollectionCard
                                    key={col.id}
                                    collection={col}
                                    onClick={() => setSelectedCollection(col)}
                                />
                            ))}

                            {/* Add Collection Button */}
                            <div
                                className="bg-app-surface/30 hover:bg-app-surface border-2 border-dashed border-app-surface hover:border-app-text-muted rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all group min-h-[200px]"
                                onClick={handleNewCollection}
                            >
                                <div className="w-12 h-12 rounded-full bg-app-surface group-hover:bg-app-accent/20 flex items-center justify-center mb-3 transition-colors">
                                    <Plus size={24} className="text-app-text-muted group-hover:text-app-accent" />
                                </div>
                                <span className="font-bold text-app-text">New Collection</span>
                            </div>
                        </div>
                    </div>

                    {/* 4. Listening History */}
                    {historyTracks.length > 0 && (
                        <div className="mb-16">
                            <h2 className="text-xl font-bold text-app-text mb-6 flex items-center gap-2">
                                <ListMusic size={20} className="text-app-accent" />
                                Listening History
                            </h2>
                            <div className="bg-app-surface/50 rounded-2xl p-4">
                                {historyTracks.map((track, i) => (
                                    <HistoryTrackRow
                                        key={`${track.id}-${i}`}
                                        track={track}
                                        index={i}
                                        tracks={tracks}
                                        playTrack={playTrack}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 5. Database Stats */}
                    <div className="mb-12 border-t border-white/10 pt-8">
                        <h2 className="text-xl font-bold text-app-text mb-6 flex items-center gap-2">
                            <Hash size={20} className="text-app-accent" />
                            Database Stats
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="bg-app-surface/40 rounded-xl p-6">
                                <div className="text-3xl font-bold text-white mb-1">{stats.trackCount.toLocaleString()}</div>
                                <div className="text-sm text-app-text-muted uppercase tracking-wider">Tracks</div>
                            </div>
                            <div className="bg-app-surface/40 rounded-xl p-6">
                                <div className="text-3xl font-bold text-white mb-1">{stats.albumCount.toLocaleString()}</div>
                                <div className="text-sm text-app-text-muted uppercase tracking-wider">Albums</div>
                            </div>
                            <div className="bg-app-surface/40 rounded-xl p-6">
                                <div className="text-3xl font-bold text-white mb-1">{stats.artistCount.toLocaleString()}</div>
                                <div className="text-sm text-app-text-muted uppercase tracking-wider">Artists</div>
                            </div>
                            <div className="bg-app-surface/40 rounded-xl p-6">
                                <div className="text-3xl font-bold text-white mb-1">{stats.hoursOfMusic.toLocaleString()}</div>
                                <div className="text-sm text-app-text-muted uppercase tracking-wider">Hours of Music</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Smart Mix Modal */}
            {selectedMix && (
                <SmartMixModal
                    mix={selectedMix}
                    allTracks={tracks}
                    onClose={() => setSelectedMix(null)}
                    onPlayTrack={playTrack}
                />
            )}
        </>
    );
}

export default memo(HomePage);
