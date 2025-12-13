import { useState } from 'react';
import { X, Merge, Loader2, AlertTriangle } from 'lucide-react';
import axios from 'axios';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface MergeAlbumsModalProps {
    sourceAlbum: string;
    sourceArtist: string;
    onClose: () => void;
    onMerged: () => void;
}

export default function MergeAlbumsModal({
    sourceAlbum,
    sourceArtist,
    onClose,
    onMerged
}: MergeAlbumsModalProps) {
    const [targetAlbum, setTargetAlbum] = useState('');
    const [targetArtist, setTargetArtist] = useState('');
    const [merging, setMerging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleMerge = async () => {
        if (!targetAlbum.trim() || !targetArtist.trim()) {
            setError('Please enter target album and artist');
            return;
        }

        setMerging(true);
        setError(null);
        try {
            await axios.post(`${SERVER_URL}/api/album/merge`, {
                sourceAlbum,
                sourceArtist,
                targetAlbum: targetAlbum.trim(),
                targetArtist: targetArtist.trim()
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            onMerged();
            onClose();
        } catch (e) {
            setError('Failed to merge albums. Please try again.');
            setMerging(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-app-bg rounded-xl max-w-md w-full overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-app-border">
                    <h2 className="text-xl font-bold text-app-text flex items-center gap-2">
                        <Merge size={20} />
                        Merge Albums
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-app-surface rounded-lg">
                        <X size={20} className="text-app-text-muted" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Warning */}
                    <div className="flex items-start gap-2 text-amber-400 text-sm p-3 bg-amber-400/10 rounded-lg">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        <div>
                            <strong>Warning:</strong> This will move all tracks from
                            <span className="font-medium"> "{sourceAlbum}"</span> by
                            <span className="font-medium"> {sourceArtist}</span> into the target album.
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-400 text-sm p-2 bg-red-400/10 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="text-sm text-app-text-muted">
                            <span className="font-medium text-app-text">Source:</span> {sourceAlbum} - {sourceArtist}
                        </div>

                        <div>
                            <label className="text-xs text-app-text-muted mb-1 block">Target Album Name</label>
                            <input
                                type="text"
                                value={targetAlbum}
                                onChange={(e) => setTargetAlbum(e.target.value)}
                                className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text"
                                placeholder="Album to merge into..."
                            />
                        </div>
                        <div>
                            <label className="text-xs text-app-text-muted mb-1 block">Target Artist Name</label>
                            <input
                                type="text"
                                value={targetArtist}
                                onChange={(e) => setTargetArtist(e.target.value)}
                                className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text"
                                placeholder="Artist name..."
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-app-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-app-text-muted hover:text-app-text"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleMerge}
                        disabled={merging || !targetAlbum.trim() || !targetArtist.trim()}
                        className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                        {merging ? <Loader2 size={18} className="animate-spin" /> : <Merge size={18} />}
                        Merge Albums
                    </button>
                </div>
            </div>
        </div>
    );
}
