import { Search, X, Disc, Play } from 'lucide-react';
import axios from 'axios';
import type { Track, Artist } from '../types';

const SERVER_URL = 'http://localhost:3001';

interface Album {
    name: string;
    artist: string;
    tracks: Track[];
    year: number | null;
}

type LibraryView = 'grid' | 'list' | 'artists' | 'labels';

interface LibraryPageProps {
    // Data
    tracks: Track[];
    albums: Album[];
    artists: Artist[];
    allLabels: any[];

    // View state
    view: LibraryView;
    setView: (view: LibraryView) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    albumSort: string;
    setAlbumSort: (sort: string) => void;

    // Selection callbacks
    setSelectedAlbum: (album: Album) => void;
    setSelectedArtist: (artist: Artist | null) => void;
    setSelectedLabel: (label: any) => void;

    // Playback
    playTrack: (index: number, transition: 'cut' | 'crossfade') => void;
}

export default function LibraryPage({
    tracks,
    albums,
    artists,
    allLabels,
    view,
    setView,
    searchQuery,
    setSearchQuery,
    albumSort,
    setAlbumSort,
    setSelectedAlbum,
    setSelectedArtist,
    setSelectedLabel,
    playTrack,
}: LibraryPageProps) {
    return (
        <>
            {/* Header */}
            <div className="h-16 border-b border-app-surface flex items-center px-6 gap-6 shrink-0 z-20 bg-app-bg/95 backdrop-blur">
                {/* Omnibox Search */}
                <div className="flex-1 max-w-xl relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                    <input
                        type="text"
                        placeholder="Search library, producers, moods..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-app-surface border-none rounded-full py-2 pl-10 pr-10 text-sm text-app-text focus:ring-2 focus:ring-app-accent outline-none transition-all placeholder:text-app-text-muted/50"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-app-text-muted hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Sort Controls - Right Justified */}
                <div className="ml-auto shrink-0">
                    <select
                        value={albumSort}
                        onChange={(e) => setAlbumSort(e.target.value)}
                        className="bg-app-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-app-text outline-none focus:border-app-accent cursor-pointer"
                    >
                        <option value="artist">Sort by Artist</option>
                        <option value="title">Sort by Title</option>
                        <option value="year">Sort by Year</option>
                        <option value="recent">Recently Added</option>
                    </select>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {/* Sub-toolbar with view toggles */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 bg-app-surface rounded-lg p-1">
                        <button
                            onClick={() => setView('grid')}
                            className={`p-2 rounded-md transition-colors ${view === 'grid' ? 'bg-white/10 text-white' : 'text-app-text-muted hover:text-white hover:bg-white/5'}`}
                            title="Grid View"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setView('list')}
                            className={`p-2 rounded-md transition-colors ${view === 'list' ? 'bg-white/10 text-white' : 'text-app-text-muted hover:text-white hover:bg-white/5'}`}
                            title="List View"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" />
                                <line x1="3" y1="12" x2="3.01" y2="12" />
                                <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                        </button>
                        <div className="w-px h-6 bg-white/10 mx-1"></div>
                        <button
                            onClick={() => setView('artists')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${view === 'artists' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                        >
                            Artists
                        </button>
                        <button
                            onClick={() => setView('labels')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${view === 'labels' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                        >
                            Labels
                        </button>
                    </div>
                    <div className="text-sm text-app-text-muted">
                        {view === 'grid' || view === 'list' ? `${albums.length} albums` : view === 'artists' ? `${artists.length} artists` : `${allLabels.length} labels`}
                    </div>
                </div>

                {/* Grid View */}
                {view === 'grid' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6 content-start pb-32">
                        {albums.map((album) => (
                            <div
                                key={album.name}
                                className="group cursor-pointer"
                                onClick={() => setSelectedAlbum(album)}
                            >
                                <div className="aspect-square bg-app-surface rounded-lg mb-3 flex items-center justify-center group-hover:bg-app-accent/10 transition-colors relative overflow-hidden shadow-lg">
                                    {album.tracks[0]?.has_art ? (
                                        <img
                                            src={`${SERVER_URL}/api/art/${album.tracks[0].id}`}
                                            alt={album.name}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <Disc size={32} className="text-app-text-muted group-hover:text-app-accent transition-colors" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
                                        <Play size={32} className="fill-white drop-shadow-lg scale-95 group-hover:scale-100 transition-transform" />
                                    </div>
                                </div>
                                <h3 className="font-semibold truncate text-xs md:text-sm">{album.name}</h3>
                                <p className="text-xs text-app-text-muted truncate">{album.artist}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* List View */}
                {view === 'list' && (
                    <div className="space-y-1 pb-32">
                        {Array.isArray(tracks) && tracks.map((track, index) => (
                            <div
                                key={track.id}
                                onClick={() => playTrack(index, 'cut')}
                                className="group flex items-center gap-4 px-4 py-3 bg-app-surface/50 hover:bg-app-surface rounded-lg cursor-pointer transition-colors border border-transparent hover:border-app-accent/20"
                            >
                                <div className="w-8 text-center text-sm text-app-text-muted group-hover:text-app-accent font-medium">
                                    <span className="group-hover:hidden">{index + 1}</span>
                                    <Play size={14} fill="currentColor" className="hidden group-hover:inline-block" />
                                </div>
                                <div className="w-12 h-12 bg-app-surface rounded-md overflow-hidden flex-shrink-0 border border-white/10">
                                    {track.has_art ? (
                                        <img loading="lazy" decoding="async" src={`${SERVER_URL}/api/art/${track.id}`} alt={track.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center"><Disc size={16} className="text-app-text-muted" /></div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-app-text truncate">{track.title}</div>
                                    <div className="text-sm text-app-text-muted truncate">
                                        <span
                                            className="hover:text-app-accent hover:underline cursor-pointer transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const artist = artists.find(a => a.name === track.artist);
                                                if (artist) setSelectedArtist(artist);
                                            }}
                                        >
                                            {track.artist}
                                        </span>
                                        • {track.album}
                                    </div>
                                </div>
                                <div className="text-sm text-app-text-muted font-mono tabular-nums">
                                    {Math.floor(track.duration / 60)}:{(Math.floor(track.duration % 60)).toString().padStart(2, '0')}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Artists View */}
                {view === 'artists' && (
                    <div className="flex flex-col pb-32 max-w-4xl mx-auto">
                        {Array.isArray(artists) && artists.map(artist => (
                            <div
                                key={artist.id}
                                className="group cursor-pointer flex items-center justify-between py-3 px-4 border-b border-app-surface/50 hover:bg-app-surface/50 transition-colors"
                                onClick={() => setSelectedArtist(artist)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-app-surface flex items-center justify-center text-app-text-muted font-bold text-sm">
                                        {artist.name.charAt(0)}
                                    </div>
                                    <h3 className="font-medium text-app-text text-lg">{artist.name}</h3>
                                </div>
                                <span className="text-sm text-app-text-muted font-mono">{artist.track_count} tracks</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Labels View */}
                {view === 'labels' && (
                    <div className="pb-32">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {allLabels.map(label => (
                                <div
                                    key={label.id}
                                    className="bg-app-surface hover:bg-app-surface/80 rounded-xl p-4 cursor-pointer transition-colors group"
                                    onClick={async () => {
                                        try {
                                            const res = await axios.get(`${SERVER_URL}/api/labels/${label.id}`);
                                            setSelectedLabel(res.data);
                                        } catch (e) { console.error(e); }
                                    }}
                                >
                                    <div className="aspect-square bg-gradient-to-br from-orange-600/30 to-red-600/30 rounded-lg mb-3 overflow-hidden shadow-lg">
                                        <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-full p-0.5">
                                            {[0, 1, 2, 3].map(i => {
                                                const previewAlbum = label.preview_albums?.[i];
                                                return (
                                                    <div key={i} className="bg-app-bg/50 rounded-sm overflow-hidden aspect-square">
                                                        {previewAlbum?.sample_track_id ? (
                                                            <img loading="lazy" decoding="async" src={`${SERVER_URL}/api/art/${previewAlbum.sample_track_id}`} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center"><Disc size={20} className="text-app-text-muted/50" /></div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="text-base font-bold text-app-text truncate">{label.name}</div>
                                    <div className="text-sm text-app-text-muted truncate">{label.album_count || 0} albums</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
