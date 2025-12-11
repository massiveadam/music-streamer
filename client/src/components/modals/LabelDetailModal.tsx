import { X, Disc } from 'lucide-react';
import type { Track } from '../../types';

const SERVER_URL = 'http://localhost:3001';

interface Album {
    name: string;
    artist: string;
    sample_track_id?: number;
}

interface LabelDetail {
    id: number;
    name: string;
    album_count: number;
    albums: Album[];
}

interface LabelDetailModalProps {
    label: LabelDetail;
    onClose: () => void;
    onAlbumClick: (albumName: string, artistName: string) => void;
}

export default function LabelDetailModal({
    label,
    onClose,
    onAlbumClick,
}: LabelDetailModalProps) {
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
                <div className="text-center mb-12">
                    <div className="w-24 h-24 mx-auto bg-gradient-to-br from-orange-600/30 to-red-600/30 rounded-2xl flex items-center justify-center mb-6">
                        <Disc size={48} className="text-white/50" />
                    </div>
                    <h1 className="text-4xl md:text-6xl font-serif font-bold text-app-text mb-4">
                        {label.name}
                    </h1>
                    <p className="text-app-text-muted">{label.album_count} albums</p>
                </div>

                {/* Albums Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {label.albums.map((album, i) => (
                        <div
                            key={i}
                            className="group cursor-pointer"
                            onClick={() => onAlbumClick(album.name, album.artist)}
                        >
                            <div className="aspect-square bg-app-surface rounded-lg mb-3 overflow-hidden shadow-lg group-hover:shadow-xl transition-all">
                                {album.sample_track_id ? (
                                    <img
                                        src={`${SERVER_URL}/api/art/${album.sample_track_id}`}
                                        alt={album.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Disc size={32} className="text-app-text-muted" />
                                    </div>
                                )}
                            </div>
                            <div className="font-medium text-app-text truncate text-sm">{album.name}</div>
                            <div className="text-xs text-app-text-muted truncate">{album.artist}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
