import { RefreshCcw } from 'lucide-react';
import axios from 'axios';

const SERVER_URL = 'http://localhost:3001';

interface SettingsPageProps {
    theme: string;
    setTheme: React.Dispatch<React.SetStateAction<string>>;
    setShowScanOverlay: (show: boolean) => void;
}

export default function SettingsPage({ theme, setTheme, setShowScanOverlay }: SettingsPageProps) {
    const handleRescan = async () => {
        const pathElement = document.getElementById('settingsScanPath') as HTMLInputElement;
        const limitElement = document.getElementById('settingsScanLimit') as HTMLInputElement;
        const path = pathElement?.value;
        const limit = parseInt(limitElement?.value) || 0;
        if (path) {
            try {
                await axios.post(`${SERVER_URL}/api/clear`);
                await axios.post(`${SERVER_URL}/api/scan`, { path, limit });
                setShowScanOverlay(true);
            } catch (e) {
                alert("Scan failed: " + (e as Error).message);
            }
        }
    };

    const handleEnrichment = async () => {
        try {
            await axios.post(`${SERVER_URL}/api/enrich`);
            alert("Enrichment started in background!");
        } catch (e: any) {
            alert("Failed: " + e.message);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-8 bg-app-bg">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-app-text mb-8">Settings</h1>

                {/* Library Management */}
                <div className="bg-app-surface rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold text-app-text mb-4">Library Management</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-app-text mb-2">Music Directory</label>
                            <input
                                type="text"
                                defaultValue="/home/adam/Music"
                                id="settingsScanPath"
                                className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-3 text-app-text outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-app-text mb-2">Scan Limit (0 = unlimited)</label>
                            <input
                                type="number"
                                defaultValue="500"
                                id="settingsScanLimit"
                                min="0"
                                className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-3 text-app-text outline-none transition-colors"
                            />
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={handleRescan}
                                className="flex-1 bg-transparent border border-white/20 hover:bg-white/10 text-white rounded-lg py-3 font-medium transition-colors"
                            >
                                <RefreshCcw size={16} className="inline mr-2" />
                                Rescan Library
                            </button>
                        </div>
                    </div>
                </div>

                {/* Enrichment */}
                <div className="bg-app-surface rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold text-app-text mb-4">Metadata Enrichment</h2>
                    <p className="text-sm text-app-text-muted mb-4">
                        Fetch additional metadata from MusicBrainz, Last.fm, and Wikipedia.
                    </p>
                    <button
                        onClick={handleEnrichment}
                        className="bg-transparent border border-white/20 hover:bg-white/10 text-white rounded-lg px-6 py-3 font-medium transition-colors"
                    >
                        Start Enrichment
                    </button>
                </div>

                {/* Theme */}
                <div className="bg-app-surface rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold text-app-text mb-4">Appearance</h2>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium text-app-text">Theme</div>
                            <div className="text-xs text-app-text-muted">Switch between dark and light mode</div>
                        </div>
                        <button
                            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                            className={`relative w-14 h-7 rounded-full transition-colors border ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-gray-300 border-transparent'}`}
                        >
                            <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${theme === 'light' ? 'translate-x-7' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* About */}
                <div className="bg-app-surface rounded-xl p-6">
                    <h2 className="text-lg font-bold text-app-text mb-2">About OpenStream</h2>
                    <p className="text-sm text-app-text-muted">
                        A modern, open-source music streaming application for your local library.
                    </p>
                </div>
            </div>
        </div>
    );
}
