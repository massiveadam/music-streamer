import { useState } from 'react';
import { X, Save, Loader2, Image as ImageIcon } from 'lucide-react';
import axios from 'axios';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface EditMetadataModalProps {
    album: string;
    artist: string;
    currentDescription?: string;
    currentYear?: number;
    onClose: () => void;
    onSaved: () => void;
}

export default function EditMetadataModal({
    album,
    artist,
    currentDescription = '',
    currentYear,
    onClose,
    onSaved
}: EditMetadataModalProps) {
    const [description, setDescription] = useState(currentDescription);
    const [year, setYear] = useState(currentYear?.toString() || '');
    const [newAlbum, setNewAlbum] = useState(album);
    const [newArtist, setNewArtist] = useState(artist);
    const [coverArtUrl, setCoverArtUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const updates: string[] = [];

            // 1. Rename if album/artist changed
            if (newAlbum !== album || newArtist !== artist) {
                await axios.put(`${getServerUrl()}/api/album/rename`, {
                    oldAlbum: album,
                    oldArtist: artist,
                    newAlbum: newAlbum !== album ? newAlbum : undefined,
                    newArtist: newArtist !== artist ? newArtist : undefined
                }, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                updates.push('Renamed');
            }

            // 2. Update metadata (description, year)
            if (description !== currentDescription || (year && parseInt(year) !== currentYear)) {
                await axios.put(`${getServerUrl()}/api/album/metadata`, {
                    album: newAlbum,
                    artist: newArtist,
                    description: description || undefined,
                    year: year ? parseInt(year) : undefined
                }, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                updates.push('Metadata updated');
            }

            // 3. Update cover art if URL provided
            if (coverArtUrl.trim()) {
                await axios.post(`${getServerUrl()}/api/album/cover-art`, {
                    album: newAlbum,
                    artist: newArtist,
                    imageUrl: coverArtUrl.trim()
                }, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                updates.push('Cover art updated');
            }

            setSuccessMessage(updates.length > 0 ? updates.join(', ') : 'No changes');
            setTimeout(() => {
                onSaved();
                onClose();
            }, 500);
        } catch (e) {
            setError('Failed to save. Please try again.');
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-app-bg rounded-xl max-w-xl w-full overflow-hidden max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-app-border sticky top-0 bg-app-bg">
                    <h2 className="text-xl font-bold text-app-text">Edit Album Metadata</h2>
                    <button onClick={onClose} className="p-2 hover:bg-app-surface rounded-lg">
                        <X size={20} className="text-app-text-muted" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4">
                    {error && (
                        <div className="text-red-400 text-sm p-2 bg-red-400/10 rounded-lg">
                            {error}
                        </div>
                    )}
                    {successMessage && (
                        <div className="text-green-400 text-sm p-2 bg-green-400/10 rounded-lg">
                            ✓ {successMessage}
                        </div>
                    )}

                    {/* Album & Artist Name (for fixing mismatches) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-app-text-muted mb-1 block">Album Name</label>
                            <input
                                type="text"
                                value={newAlbum}
                                onChange={(e) => setNewAlbum(e.target.value)}
                                className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text"
                                placeholder="Album name..."
                            />
                        </div>
                        <div>
                            <label className="text-xs text-app-text-muted mb-1 block">Artist Name</label>
                            <input
                                type="text"
                                value={newArtist}
                                onChange={(e) => setNewArtist(e.target.value)}
                                className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text"
                                placeholder="Artist name..."
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-app-text-muted mb-1 block">Year</label>
                        <input
                            type="number"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            className="w-32 bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text"
                            placeholder="1999"
                            min="1900"
                            max="2100"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-app-text-muted mb-1 block">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text min-h-[100px] resize-y"
                            placeholder="Album description..."
                        />
                    </div>

                    {/* Cover Art */}
                    <div>
                        <label className="text-xs text-app-text-muted mb-1 flex items-center gap-1">
                            <ImageIcon size={12} />
                            Cover Art URL (optional)
                        </label>
                        <input
                            type="text"
                            value={coverArtUrl}
                            onChange={(e) => setCoverArtUrl(e.target.value)}
                            className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-app-text text-sm"
                            placeholder="https://example.com/album-cover.jpg"
                        />
                        <p className="text-xs text-app-text-muted mt-1">
                            Paste an image URL to update the cover art
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-app-border sticky bottom-0 bg-app-bg">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-app-text-muted hover:text-app-text"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-app-accent hover:bg-app-accent/80 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
