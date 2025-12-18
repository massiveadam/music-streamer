/**
 * DownloadButton - Button to download a track for offline playback
 */

import { Download, Check, Loader2, Trash2 } from 'lucide-react';
import { useOfflineStorage } from '../hooks/useOfflineStorage';
import type { Track } from '../types';

interface DownloadButtonProps {
    track: Track;
    size?: number;
    className?: string;
}

export function DownloadButton({ track, size = 20, className = '' }: DownloadButtonProps) {
    const { isOffline, download, remove, downloadProgress } = useOfflineStorage();

    const isDownloaded = isOffline(track.id);
    const progress = downloadProgress.get(track.id);
    const isDownloading = progress?.status === 'downloading';
    const progressPercent = progress?.progress || 0;

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Don't trigger parent click handlers

        if (isDownloading) return; // Already downloading

        if (isDownloaded) {
            // Already downloaded - remove
            await remove(track.id);
        } else {
            // Download
            await download(track);
        }
    };

    return (
        <button
            onClick={handleClick}
            className={`relative flex items-center justify-center p-2 rounded-full transition-colors ${isDownloaded
                    ? 'text-green-400 bg-green-500/20 hover:bg-red-500/20 hover:text-red-400'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                } ${className}`}
            title={isDownloaded ? 'Remove download' : 'Download for offline'}
            disabled={isDownloading}
        >
            {isDownloading ? (
                <>
                    <Loader2 size={size} className="animate-spin" />
                    <span className="absolute text-[8px] font-bold">{progressPercent}%</span>
                </>
            ) : isDownloaded ? (
                <Check size={size} />
            ) : (
                <Download size={size} />
            )}
        </button>
    );
}

export default DownloadButton;
