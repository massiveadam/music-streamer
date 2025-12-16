import { SERVER_URL, getServerUrl } from '../config';
import { useState } from 'react';
import { ListMusic, Disc, Plus, Wand2 } from 'lucide-react';
import type { Playlist } from '../types';
import { GeneratePlaylistModal } from '../components/modals';


interface PlaylistsPageProps {
    playlistsViewMode: 'playlists' | 'collections';
    setPlaylistsViewMode: React.Dispatch<React.SetStateAction<'playlists' | 'collections'>>;
    allPlaylists: Playlist[];
    allCollections: any[];
    setSelectedPlaylist: (playlist: any) => void;
    setSelectedCollection: (collection: any) => void;
    setEditingPlaylist: (playlist: Playlist | null) => void;
    setShowPlaylistModal: (show: boolean) => void;
    setAddToCollectionAlbum: (album: { name: string; artist: string } | null) => void;
    onPlaylistsChange?: () => void;
}

export default function PlaylistsPage({
    playlistsViewMode,
    setPlaylistsViewMode,
    allPlaylists,
    allCollections,
    setSelectedPlaylist,
    setSelectedCollection,
    setEditingPlaylist,
    setShowPlaylistModal,
    setAddToCollectionAlbum,
    onPlaylistsChange,
}: PlaylistsPageProps) {
    const [showGenerateModal, setShowGenerateModal] = useState(false);

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 bg-app-bg safe-area-inset-top">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
                    <div className="flex items-center gap-2 md:gap-4">
                        <button
                            onClick={() => setPlaylistsViewMode('playlists')}
                            className={`text-lg md:text-2xl font-bold transition-colors ${playlistsViewMode === 'playlists' ? 'text-app-text' : 'text-app-text-muted hover:text-white'}`}
                        >
                            Playlists
                        </button>
                        <span className="text-app-text-muted">|</span>
                        <button
                            onClick={() => setPlaylistsViewMode('collections')}
                            className={`text-lg md:text-2xl font-bold transition-colors ${playlistsViewMode === 'collections' ? 'text-app-text' : 'text-app-text-muted hover:text-white'}`}
                        >
                            Collections
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {playlistsViewMode === 'playlists' && (
                            <button
                                onClick={() => setShowGenerateModal(true)}
                                className="px-4 py-2 bg-app-accent hover:bg-app-accent/80 rounded-lg text-white font-bold transition-all flex items-center gap-2"
                            >
                                <Wand2 size={18} />
                                Generate Smart Playlist
                            </button>
                        )}
                        <button
                            onClick={() => {
                                if (playlistsViewMode === 'playlists') {
                                    setEditingPlaylist({ id: 0, name: '', description: '' } as Playlist);
                                    setShowPlaylistModal(true);
                                } else {
                                    setAddToCollectionAlbum({ name: '', artist: '' });
                                }
                            }}
                            className="px-4 py-2 bg-app-accent hover:bg-app-accent/80 rounded-lg text-white font-bold transition-colors flex items-center gap-2"
                        >
                            <Plus size={20} />
                            {playlistsViewMode === 'playlists' ? 'New Playlist' : 'New Collection'}
                        </button>
                    </div>
                </div>

                {/* Generate Playlist Modal */}
                {showGenerateModal && (
                    <GeneratePlaylistModal
                        onClose={() => setShowGenerateModal(false)}
                        onSuccess={() => {
                            setShowGenerateModal(false);
                            onPlaylistsChange?.();
                        }}
                    />
                )}

                {/* Playlists Grid */}
                {playlistsViewMode === 'playlists' && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
                            {/* Create Playlist Card */}
                            <div
                                className="bg-app-surface/50 hover:bg-app-surface border-2 border-dashed border-app-surface hover:border-app-text-muted rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group min-h-[200px]"
                                onClick={() => {
                                    setEditingPlaylist({ id: 0, name: '', description: '' } as Playlist);
                                    setShowPlaylistModal(true);
                                }}
                            >
                                <div className="w-16 h-16 rounded-full bg-app-surface group-hover:bg-app-accent/20 flex items-center justify-center mb-4 transition-colors">
                                    <Plus size={32} className="text-app-text-muted group-hover:text-app-accent" />
                                </div>
                                <span className="font-bold text-app-text">Create Playlist</span>
                            </div>

                            {allPlaylists.map(playlist => (
                                <div
                                    key={playlist.id}
                                    className="bg-app-surface hover:bg-app-surface/80 rounded-xl p-4 cursor-pointer transition-colors group"
                                    onClick={() => setSelectedPlaylist(playlist)}
                                >
                                    <div className="aspect-square bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-lg mb-3 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all">
                                        <ListMusic size={48} className="text-white/50" />
                                    </div>
                                    <div className="text-lg font-bold text-app-text truncate">{playlist.name}</div>
                                    <div className="text-sm text-app-text-muted truncate">
                                        {playlist.description || 'No description'}
                                    </div>
                                    <div className="mt-2 text-xs text-app-text-muted">
                                        Playlist
                                    </div>
                                </div>
                            ))}
                        </div>

                        {allPlaylists.length === 0 && (
                            <div className="text-center py-16">
                                <ListMusic size={64} className="mx-auto mb-4 text-app-text-muted opacity-50" />
                                <h2 className="text-xl font-bold text-app-text mb-2">No playlists yet</h2>
                                <p className="text-app-text-muted">Create your first playlist to get started!</p>
                            </div>
                        )}
                    </>
                )}

                {/* Collections Grid */}
                {playlistsViewMode === 'collections' && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6">
                            {/* Create Collection Card */}
                            <div
                                className="bg-app-surface/50 hover:bg-app-surface border-2 border-dashed border-app-surface hover:border-app-text-muted rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all group min-h-[200px]"
                                onClick={() => setAddToCollectionAlbum({ name: '', artist: '' })}
                            >
                                <div className="w-16 h-16 rounded-full bg-app-surface group-hover:bg-app-accent/20 flex items-center justify-center mb-4 transition-colors">
                                    <Plus size={32} className="text-app-text-muted group-hover:text-app-accent" />
                                </div>
                                <span className="font-bold text-app-text">Create Collection</span>
                            </div>

                            {allCollections.map(col => (
                                <div
                                    key={col.id}
                                    className="bg-app-surface hover:bg-app-surface/80 rounded-xl p-4 cursor-pointer transition-colors group"
                                    onClick={() => setSelectedCollection(col)}
                                >
                                    <div className="aspect-square bg-gradient-to-br from-teal-500/30 to-blue-500/30 rounded-lg mb-3 overflow-hidden shadow-lg">
                                        <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-full p-0.5">
                                            {[0, 1, 2, 3].map(i => {
                                                const previewAlbum = col.preview_albums?.[i];
                                                return (
                                                    <div key={i} className="bg-app-bg/50 rounded-sm overflow-hidden aspect-square">
                                                        {previewAlbum?.sample_track_id ? (
                                                            <img
                                                                src={`${getServerUrl()}/api/art/${previewAlbum.sample_track_id}`}
                                                                alt=""
                                                                className="w-full h-full object-cover"
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
                                    <div className="text-base font-bold text-app-text truncate">{col.name}</div>
                                    <div className="text-sm text-app-text-muted truncate">{col.description || 'Collection'}</div>
                                    <div className="mt-1 text-xs text-app-text-muted">
                                        {col.album_count || 0} albums
                                    </div>
                                </div>
                            ))}
                        </div>

                        {allCollections.length === 0 && (
                            <div className="text-center py-16">
                                <Disc size={64} className="mx-auto mb-4 text-app-text-muted opacity-50" />
                                <h2 className="text-xl font-bold text-app-text mb-2">No collections yet</h2>
                                <p className="text-app-text-muted">Group albums into collections like "Jazz Classics" or "Gym Rotation"</p>
                                <button
                                    onClick={() => setAddToCollectionAlbum({ name: '', artist: '' })}
                                    className="mt-4 px-6 py-2 bg-app-accent hover:bg-app-accent/80 rounded-full text-white font-medium"
                                >
                                    Create Collection
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
