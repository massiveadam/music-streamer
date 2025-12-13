import { useState, useEffect } from 'react';
import { X, Wand2, Play, Save, Check } from 'lucide-react';
import axios from 'axios';
import type { Track } from '../../types';
import { useAuth } from '../../context/AuthContext';

const SERVER_URL = 'http://localhost:3001';

interface PlaylistTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    params?: { name: string; type: string; default?: any }[];
}

interface GeneratePlaylistModalProps {
    onClose: () => void;
    onSuccess: (playlistName: string) => void;
}

export default function GeneratePlaylistModal({ onClose, onSuccess }: GeneratePlaylistModalProps) {
    const { token } = useAuth();
    const [templates, setTemplates] = useState<PlaylistTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [params, setParams] = useState<Record<string, any>>({});
    const [playlistName, setPlaylistName] = useState('');
    const [previewTracks, setPreviewTracks] = useState<Track[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        axios.get(`${SERVER_URL}/api/playlist-templates`)
            .then(res => {
                setTemplates(res.data);
                if (res.data.length > 0) {
                    setSelectedTemplate(res.data[0].id);
                    initParams(res.data[0]);
                }
            })
            .catch(console.error);
    }, []);

    const initParams = (template: PlaylistTemplate) => {
        const defaults: Record<string, any> = {};
        template.params?.forEach(p => {
            defaults[p.name] = p.default ?? '';
        });
        setParams(defaults);
        setPlaylistName(`${template.name} - ${new Date().toLocaleDateString()}`);
    };

    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplate(templateId);
        const template = templates.find(t => t.id === templateId);
        if (template) {
            initParams(template);
        }
        setPreviewTracks([]);
        setSaved(false);
    };

    const handlePreview = async () => {
        if (!selectedTemplate) return;
        setPreviewing(true);
        try {
            const res = await axios.post(`${SERVER_URL}/api/playlists/generate`, {
                template: selectedTemplate,
                params,
                save: false,
                limit: 20
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPreviewTracks(res.data.tracks);
        } catch (e: any) {
            console.error('Preview failed:', e);
        }
        setPreviewing(false);
    };

    const handleGenerate = async () => {
        if (!selectedTemplate) return;
        setLoading(true);
        try {
            const res = await axios.post(`${SERVER_URL}/api/playlists/generate`, {
                template: selectedTemplate,
                params,
                name: playlistName,
                save: true,
                limit: 50
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.saved) {
                setSaved(true);
                setTimeout(() => {
                    onSuccess(res.data.playlistName);
                    onClose();
                }, 1000);
            }
        } catch (e: any) {
            console.error('Generate failed:', e);
            alert('Failed to generate playlist');
        }
        setLoading(false);
    };

    const currentTemplate = templates.find(t => t.id === selectedTemplate);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-app-surface rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-app-bg">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-app-accent flex items-center justify-center">
                            <Wand2 size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-app-text">Generate Smart Playlist</h2>
                            <p className="text-xs text-app-text-muted">Create playlists from your metadata</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-app-text-muted hover:text-app-text transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Template Selection */}
                    <div>
                        <label className="block text-sm font-medium text-app-text mb-2">Template</label>
                        <div className="grid grid-cols-2 gap-2">
                            {templates.map(template => (
                                <button
                                    key={template.id}
                                    onClick={() => handleTemplateChange(template.id)}
                                    className={`p-3 rounded-lg text-left transition-all ${selectedTemplate === template.id
                                        ? 'bg-app-accent/20 border-2 border-app-accent'
                                        : 'bg-app-bg border-2 border-transparent hover:border-app-accent/30'
                                        }`}
                                >
                                    <div className="text-sm font-medium text-app-text">{template.name}</div>
                                    <div className="text-xs text-app-text-muted mt-0.5">{template.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Template Parameters */}
                    {currentTemplate?.params && currentTemplate.params.length > 0 && (
                        <div className="space-y-3">
                            {currentTemplate.params.map(param => (
                                <div key={param.name}>
                                    <label className="block text-sm font-medium text-app-text mb-1 capitalize">
                                        {param.name.replace(/([A-Z])/g, ' $1').trim()}
                                    </label>
                                    <input
                                        type={param.type === 'number' ? 'number' : 'text'}
                                        value={params[param.name] ?? ''}
                                        onChange={e => setParams({ ...params, [param.name]: e.target.value })}
                                        className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-2 text-app-text outline-none transition-colors"
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Playlist Name */}
                    <div>
                        <label className="block text-sm font-medium text-app-text mb-1">Playlist Name</label>
                        <input
                            type="text"
                            value={playlistName}
                            onChange={e => setPlaylistName(e.target.value)}
                            className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-2 text-app-text outline-none transition-colors"
                        />
                    </div>

                    {/* Preview Button */}
                    <button
                        onClick={handlePreview}
                        disabled={previewing}
                        className="w-full py-2 bg-app-bg hover:bg-app-accent/10 border border-app-accent/30 text-app-text-muted rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        <Play size={16} />
                        {previewing ? 'Loading Preview...' : 'Preview Tracks'}
                    </button>

                    {/* Preview Results */}
                    {previewTracks.length > 0 && (
                        <div className="bg-app-bg rounded-lg p-3 max-h-48 overflow-y-auto">
                            <div className="text-xs text-app-text-muted mb-2">Preview ({previewTracks.length} tracks)</div>
                            {previewTracks.slice(0, 10).map((track, i) => (
                                <div key={track.id} className="py-1.5 border-b border-app-surface last:border-0">
                                    <div className="text-sm text-app-text truncate">{track.title}</div>
                                    <div className="text-xs text-app-text-muted truncate">{track.artist}</div>
                                </div>
                            ))}
                            {previewTracks.length > 10 && (
                                <div className="text-xs text-app-text-muted text-center pt-2">
                                    ...and {previewTracks.length - 10} more
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-app-bg">
                    <button
                        onClick={handleGenerate}
                        disabled={loading || saved || !selectedTemplate}
                        className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${saved
                            ? 'bg-green-500 text-white'
                            : 'bg-app-accent hover:bg-app-accent/80 text-white'
                            }`}
                    >
                        {saved ? (
                            <>
                                <Check size={20} />
                                Playlist Created!
                            </>
                        ) : (
                            <>
                                <Save size={20} />
                                {loading ? 'Generating...' : 'Generate & Save Playlist'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
