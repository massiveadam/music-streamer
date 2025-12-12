import { useState, useEffect } from 'react';
import { X, Plus, FolderHeart, Check, Loader2, Disc } from 'lucide-react';
import axios from 'axios';

const SERVER_URL = 'http://localhost:3001';

interface Collection {
    id: number;
    name: string;
    description?: string;
    album_count?: number;
    preview_albums?: { album_name: string; artist_name: string; sample_track_id?: number }[];
}

interface AddToCollectionModalProps {
    albumName: string;
    artistName: string;
    sampleTrackId?: number;
    onClose: () => void;
    onSuccess?: (collectionName: string) => void;
}

export default function AddToCollectionModal({
    albumName,
    artistName,
    sampleTrackId,
    onClose,
    onSuccess,
}: AddToCollectionModalProps) {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [addedTo, setAddedTo] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch collections on mount
    useEffect(() => {
        const fetchCollections = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${SERVER_URL}/api/collections`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setCollections(res.data || []);
            } catch (e) {
                console.error('Failed to fetch collections:', e);
                setError('Failed to load collections');
            } finally {
                setIsLoading(false);
            }
        };
        fetchCollections();
    }, []);

    const handleAddToCollection = async (collection: Collection) => {
        if (isAdding !== null) return;
        setIsAdding(collection.id);
        setError(null);

        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${SERVER_URL}/api/collections/${collection.id}/albums`,
                { albumName, artistName },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setAddedTo(collection.id);
            onSuccess?.(collection.name);

            // Close after brief success state
            setTimeout(() => {
                onClose();
            }, 800);
        } catch (e: any) {
            console.error('Failed to add to collection:', e);
            if (e.response?.data?.message === 'Album already in collection') {
                setError('Album is already in this collection');
            } else {
                setError(e.response?.data?.error || 'Failed to add to collection');
            }
            setIsAdding(null);
        }
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim() || isCreating) return;
        setIsCreating(true);
        setError(null);

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(
                `${SERVER_URL}/api/collections`,
                { name: newCollectionName.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const newCollection = res.data;
            setCollections(prev => [newCollection, ...prev]);
            setShowCreate(false);
            setNewCollectionName('');

            // Automatically add album to the new collection
            handleAddToCollection(newCollection);
        } catch (e: any) {
            console.error('Failed to create collection:', e);
            setError(e.response?.data?.error || 'Failed to create collection');
            setIsCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-app-bg border border-app-surface rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-app-surface">
                    <div className="flex items-center gap-3">
                        {sampleTrackId && (
                            <img
                                src={`${SERVER_URL}/api/art/${sampleTrackId}`}
                                alt={albumName}
                                className="w-10 h-10 rounded-lg object-cover"
                            />
                        )}
                        <div>
                            <h2 className="text-lg font-semibold text-app-text">Add to Collection</h2>
                            <p className="text-sm text-app-text-muted truncate max-w-[200px]">{albumName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-app-surface rounded-full transition-colors"
                    >
                        <X size={18} className="text-app-text-muted" />
                    </button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="px-5 py-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Content */}
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* Create New Collection */}
                    <div className="p-3 border-b border-app-surface">
                        {showCreate ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newCollectionName}
                                    onChange={(e) => setNewCollectionName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                                    placeholder="Collection name..."
                                    className="flex-1 bg-app-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent"
                                    autoFocus
                                />
                                <button
                                    onClick={handleCreateCollection}
                                    disabled={!newCollectionName.trim() || isCreating}
                                    className="px-4 py-2 bg-app-accent hover:bg-app-accent/80 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    {isCreating ? <Loader2 size={16} className="animate-spin" /> : 'Create'}
                                </button>
                                <button
                                    onClick={() => { setShowCreate(false); setNewCollectionName(''); }}
                                    className="p-2 hover:bg-app-surface rounded-lg transition-colors"
                                >
                                    <X size={16} className="text-app-text-muted" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-app-surface rounded-lg transition-colors group"
                            >
                                <div className="w-12 h-12 bg-app-surface group-hover:bg-app-accent/20 rounded-lg flex items-center justify-center transition-colors">
                                    <Plus size={20} className="text-app-accent" />
                                </div>
                                <span className="font-medium text-app-text">Create New Collection</span>
                            </button>
                        )}
                    </div>

                    {/* Collection List */}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={24} className="animate-spin text-app-accent" />
                        </div>
                    ) : collections.length === 0 ? (
                        <div className="text-center py-12 text-app-text-muted">
                            <FolderHeart size={32} className="mx-auto mb-3 opacity-50" />
                            <p>No collections yet</p>
                            <p className="text-sm mt-1">Create your first collection above</p>
                        </div>
                    ) : (
                        <div className="p-2">
                            {collections.map((collection) => (
                                <button
                                    key={collection.id}
                                    onClick={() => handleAddToCollection(collection)}
                                    disabled={isAdding !== null}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-app-surface rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {/* Collection Preview Grid */}
                                    <div className="w-12 h-12 bg-gradient-to-br from-teal-500/30 to-blue-500/30 rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2 gap-px p-0.5">
                                        {[0, 1, 2, 3].map(i => {
                                            const preview = collection.preview_albums?.[i];
                                            return (
                                                <div key={i} className="bg-app-bg/50 rounded-sm overflow-hidden">
                                                    {preview?.sample_track_id ? (
                                                        <img
                                                            src={`${SERVER_URL}/api/art/${preview.sample_track_id}`}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Disc size={8} className="text-app-text-muted/30" />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="font-medium text-app-text truncate">{collection.name}</div>
                                        <div className="text-sm text-app-text-muted">
                                            {collection.album_count || 0} albums
                                        </div>
                                    </div>
                                    {isAdding === collection.id ? (
                                        <Loader2 size={18} className="animate-spin text-app-accent" />
                                    ) : addedTo === collection.id ? (
                                        <Check size={18} className="text-green-400" />
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
