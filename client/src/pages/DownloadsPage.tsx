/**
 * DownloadsPage - Offline Music Library
 * 
 * Shows all downloaded tracks available for offline playback.
 * Only visible on mobile/PWA.
 */

import { useState, useEffect } from 'react';
import { Download, Trash2, HardDrive, Music } from 'lucide-react';
import { useOfflineStorage, getStorageInfo } from '../hooks/useOfflineStorage';
import { offlineDb } from '../db/offlineDb';
import type { Track } from '../types';

interface DownloadsPageProps {
    onPlayTrack: (index: number) => void;
    tracks: Track[];
}

export function DownloadsPage({ onPlayTrack, tracks }: DownloadsPageProps) {
    const { offlineTrackIds, storageInfo, remove } = useOfflineStorage();
    const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);

    // Filter tracks to only show offline ones
    useEffect(() => {
        const filtered = tracks.filter(t => offlineTrackIds.has(t.id));
        setOfflineTracks(filtered);
    }, [tracks, offlineTrackIds]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const handleRemoveAll = async () => {
        if (!confirm('Remove all downloaded tracks?')) return;
        for (const id of offlineTrackIds) {
            await remove(id);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto pb-32">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-b from-zinc-900 to-zinc-900/95 backdrop-blur-xl p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Download size={24} />
                            Downloads
                        </h1>
                        <p className="text-white/60 text-sm mt-1">
                            {storageInfo.totalTracks} tracks • {formatSize(storageInfo.totalSize)}
                        </p>
                    </div>

                    {storageInfo.totalTracks > 0 && (
                        <button
                            onClick={handleRemoveAll}
                            className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                            title="Remove all downloads"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                </div>
            </div>

            {/* Empty state */}
            {offlineTracks.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-white/40">
                    <HardDrive size={64} className="mb-4 opacity-50" />
                    <p className="text-lg">No downloads yet</p>
                    <p className="text-sm mt-2">Downloaded tracks will appear here for offline listening</p>
                </div>
            )}

            {/* Track list */}
            <div className="p-4 space-y-2">
                {offlineTracks.map((track, index) => (
                    <div
                        key={track.id}
                        onClick={() => {
                            const globalIndex = tracks.findIndex(t => t.id === track.id);
                            if (globalIndex >= 0) onPlayTrack(globalIndex);
                        }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group"
                    >
                        <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                            {track.has_art ? (
                                <img
                                    src={`/api/art/${track.id}`}
                                    alt=""
                                    className="w-full h-full object-cover rounded-lg"
                                />
                            ) : (
                                <Music size={20} className="text-white/40" />
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{track.title}</p>
                            <p className="text-white/60 text-sm truncate">{track.artist}</p>
                        </div>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                remove(track.id);
                            }}
                            className="p-2 rounded-full text-white/40 hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
                            title="Remove download"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default DownloadsPage;
