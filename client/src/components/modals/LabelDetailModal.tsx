import { SERVER_URL, getServerUrl } from '../../config';
import { X, Disc, Play, Shuffle } from 'lucide-react';
import type { Track } from '../../types';


interface Album {
    album_name: string;
    artist?: string;
    release_date?: string;
    sample_track_id?: number;
}

interface LabelDetail {
    id: number;
    name: string;
    album_count: number;
    albums: Album[];
    type?: string;
    country?: string;
    founded?: string;
}

interface LabelDetailModalProps {
    label: LabelDetail;
    onClose: () => void;
    onAlbumClick: (albumName: string, artistName: string) => void;
    onPlayAll: () => void;
    onShuffle: () => void;
}

export default function LabelDetailModal({
    label,
    onClose,
    onAlbumClick,
    onPlayAll,
    onShuffle,
}: LabelDetailModalProps) {

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
                    <h2 className="text-lg font-bold truncate">{label.name}</h2>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onPlayAll}
                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
                        title="Play All"
                    >
                        <Play size={20} fill="currentColor" />
                    </button>
                    <button
                        onClick={onShuffle}
                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
                        title="Shuffle"
                    >
                        <Shuffle size={20} />
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 pt-8 pb-32">
                {/* Hero */}
                <div className="flex flex-col items-center text-center mb-12 pb-8 border-b border-white/5">
                    <div className="w-48 h-48 bg-app-surface rounded-2xl flex items-center justify-center shadow-2xl border border-white/5 mb-6">
                        {label.albums[0]?.sample_track_id ? (
                            <img
                                src={`${getServerUrl()}/api/art/${label.albums[0].sample_track_id}`}
                                className="w-full h-full object-cover rounded-2xl"
                                alt=""
                            />
                        ) : (
                            <Disc size={64} className="text-white/10" />
                        )}
                    </div>

                    <h1 className="text-4xl md:text-6xl font-serif font-bold text-app-text mb-4">
                        {label.name}
                    </h1>
                    <p className="text-xl text-app-text-muted mb-8 flex items-center justify-center gap-3">
                        <span>{label.type || 'Record Label'}</span>
                        {label.country && <span>• {label.country}</span>}
                        {label.founded && <span>• Est. {label.founded}</span>}
                        <span>• {label.album_count} releases</span>
                    </p>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={onPlayAll}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-8 py-3 rounded-full font-medium text-lg flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
                        >
                            <Play size={20} fill="currentColor" />
                            Play All
                        </button>
                        <button
                            onClick={onShuffle}
                            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-8 py-3 rounded-full font-medium text-lg flex items-center gap-3 transition-all hover:scale-105 active:scale-95"
                        >
                            <Shuffle size={20} />
                            Shuffle
                        </button>
                    </div>
                </div>

                {/* Albums Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {label.albums.map((album, i) => (
                        <div
                            key={i}
                            className="group cursor-pointer p-3 rounded-xl hover:bg-white/5 transition-all"
                            onClick={() => onAlbumClick(album.album_name, album.artist || 'Unknown Artist')}
                        >
                            <div className="aspect-square bg-app-surface rounded-lg mb-3 overflow-hidden shadow-lg group-hover:shadow-xl transition-all border border-white/5 group-hover:border-white/10">
                                {album.sample_track_id ? (
                                    <img
                                        src={`${getServerUrl()}/api/art/${album.sample_track_id}`}
                                        alt={album.album_name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Disc size={32} className="text-app-text-muted" />
                                    </div>
                                )}
                            </div>
                            <div className="font-bold text-app-text truncate text-sm mb-0.5">{album.album_name}</div>
                            <div className="flex items-center justify-between text-xs text-app-text-muted">
                                <span className="truncate flex-1">{album.artist || 'Unknown Artist'}</span>
                                {album.release_date && (
                                    <span className="ml-2 font-mono opacity-60">
                                        {album.release_date.split('-')[0]}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
