import { useState, useEffect } from 'react';
import { RefreshCcw, Save, Trash2, Check, ExternalLink } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { audioEngine, BUILT_IN_PRESETS, EQPreset } from '../audio/AudioEngine';

const SERVER_URL = 'http://localhost:3001';

interface SettingsPageProps {
    theme: string;
    setTheme: React.Dispatch<React.SetStateAction<string>>;
    setShowScanOverlay: (show: boolean) => void;
}

export default function SettingsPage({ theme, setTheme, setShowScanOverlay }: SettingsPageProps) {
    const { user } = useAuth();
    const [lastFmConnected, setLastFmConnected] = useState(false);
    const [lastFmUsername, setLastFmUsername] = useState<string | null>(null);
    const [eqPresets, setEqPresets] = useState<EQPreset[]>([...BUILT_IN_PRESETS]);
    const [selectedPreset, setSelectedPreset] = useState<string>('Flat');
    const [usersList, setUsersList] = useState<any[]>([]);

    // System Settings (Admin)
    const [systemSettings, setSystemSettings] = useState({ lastfm_api_key: '', lastfm_api_secret: '' });
    const [publicLastFmKey, setPublicLastFmKey] = useState<string>('');

    useEffect(() => {
        // Fetch public config
        axios.get(`${SERVER_URL}/api/config/public`).then(res => {
            setPublicLastFmKey(res.data.lastfm_api_key);
        });

        // Fetch users and system settings if admin
        if (user?.is_admin === 1) {
            axios.get(`${SERVER_URL}/api/users`)
                .then(res => setUsersList(res.data))
                .catch(console.error);

            axios.get(`${SERVER_URL}/api/settings/system`)
                .then(res => setSystemSettings(res.data))
                .catch(console.error);
        }
    }, [user]);

    useEffect(() => {
        // combine built-in presets with user device profiles (if any stored locally or fetched)
        // For now, let's include the audio engine's current device profiles
        // We'll expose all available presets from AudioEngine
        const profiles = audioEngine.getAllDeviceProfiles();
        const profilePresets = Object.values(profiles);
        // Only add unique ones that aren't built-in names
        const unique = profilePresets.filter(p => !BUILT_IN_PRESETS.some(b => b.name === p.name));
        setEqPresets([...BUILT_IN_PRESETS, ...unique]);
    }, []);

    const handleConnectLastFm = () => {
        if (!publicLastFmKey) {
            alert("Last.fm API Key is not configured on the server.");
            return;
        }
        const callbackUrl = window.location.origin + '/settings?lastfm_callback=true';
        window.location.href = `http://www.last.fm/api/auth/?api_key=${publicLastFmKey}&cb=${encodeURIComponent(callbackUrl)}`;
    };

    useEffect(() => {
        // Handle Last.fm callback
        const params = new URLSearchParams(window.location.search);
        if (params.get('token')) {
            const token = params.get('token');
            // Clear URL
            window.history.replaceState({}, document.title, window.location.pathname);

            axios.post(`${SERVER_URL}/api/auth/lastfm/token`, { token })
                .then(res => {
                    setLastFmConnected(true);
                    setLastFmUsername(res.data.username);
                    alert(`Connected to Last.fm as ${res.data.username}`);
                })
                .catch(err => {
                    console.error(err);
                    alert('Failed to connect to Last.fm: ' + (err.response?.data?.error || err.message));
                });
        }
    }, []);

    const handleApplyPreset = (presetName: string) => {
        const preset = eqPresets.find(p => p.name === presetName) || audioEngine.getAllDeviceProfiles()[presetName];
        if (preset) {
            audioEngine.applyPreset(preset);
            // Save as current device profile if desired, but here we just apply it
            setSelectedPreset(presetName);

            // Save to user profile
            const bandsStr = preset.bands.map(b => b.gain).join(',');
            axios.put(`${SERVER_URL}/api/user/eq`, { preset: bandsStr }).catch(console.error);
        }
    };

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

    const saveSystemSettings = () => {
        axios.put(`${SERVER_URL}/api/settings/system`, systemSettings)
            .then(() => alert("System settings saved successfully."))
            .catch(err => alert("Failed to save settings: " + err.message));
    };

    return (
        <div className="flex-1 overflow-y-auto p-8 bg-app-bg">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-app-text mb-8">Settings</h1>

                {/* System Configuration (Admin Only) */}
                {user?.is_admin === 1 && (
                    <div className="bg-app-surface rounded-xl p-6 mb-6 border border-blue-500/20">
                        <h2 className="text-lg font-bold text-app-text mb-4 flex items-center gap-2">
                            System Configuration <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded uppercase tracking-wide">Admin</span>
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-app-text mb-2">Last.fm API Key</label>
                                <input
                                    type="text"
                                    value={systemSettings.lastfm_api_key}
                                    onChange={e => setSystemSettings({ ...systemSettings, lastfm_api_key: e.target.value })}
                                    className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-3 text-app-text outline-none transition-colors"
                                    placeholder="Enter your Last.fm API Key"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-app-text mb-2">Last.fm Shared Secret</label>
                                <input
                                    type="password"
                                    value={systemSettings.lastfm_api_secret}
                                    onChange={e => setSystemSettings({ ...systemSettings, lastfm_api_secret: e.target.value })}
                                    className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-3 text-app-text outline-none transition-colors"
                                    placeholder="Enter your Last.fm Shared Secret"
                                />
                            </div>
                            <button
                                onClick={saveSystemSettings}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-2 font-medium transition-colors text-sm"
                            >
                                <Save size={16} className="inline mr-2" />
                                Save System Settings
                            </button>
                        </div>
                    </div>
                )}

                {/* EQ Settings */}
                <div className="bg-app-surface rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold text-app-text mb-4">Audio Equalizer</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-app-text mb-2">Detailed EQ Preset</label>
                            <select
                                value={selectedPreset}
                                onChange={(e) => handleApplyPreset(e.target.value)}
                                className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-3 text-app-text outline-none transition-colors"
                            >
                                <optgroup label="Built-in Presets">
                                    {BUILT_IN_PRESETS.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                </optgroup>
                                {eqPresets.length > BUILT_IN_PRESETS.length && (
                                    <optgroup label="User Profiles">
                                        {eqPresets.filter(p => !BUILT_IN_PRESETS.find(b => b.name === p.name)).map(p => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        <p className="text-xs text-app-text-muted">
                            Changes saved to your account automatically. Use the EQ button in the player for real-time visual adjustments.
                        </p>
                    </div>
                </div>

                {/* Last.fm Integration */}
                <div className="bg-app-surface rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-bold text-app-text mb-4">Integrations</h2>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium text-app-text">Last.fm Scrobbling</div>
                            <div className="text-xs text-app-text-muted">
                                {publicLastFmKey
                                    ? (lastFmUsername ? `Connected as ${lastFmUsername}` : "Connect your account to track listening history")
                                    : <span className="text-red-400">System API Key not configured (Contact Admin)</span>
                                }
                            </div>
                        </div>
                        {lastFmUsername ? (
                            <div className="flex items-center gap-2 text-green-400">
                                <Check size={16} />
                                <span className="text-sm font-medium">Connected</span>
                            </div>
                        ) : (
                            <button
                                onClick={handleConnectLastFm}
                                disabled={!publicLastFmKey}
                                className={`rounded-lg px-4 py-2 font-medium transition-colors flex items-center gap-2 text-sm ${publicLastFmKey ? 'bg-[#BA0000] hover:bg-[#D51007] text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                            >
                                <ExternalLink size={14} />
                                Connect Last.fm
                            </button>
                        )}
                    </div>
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

                {/* Library Management (Admin Only) */}
                {user?.is_admin === 1 && (
                    <div className="bg-app-surface rounded-xl p-6 mb-6 border border-red-500/20">
                        <h2 className="text-lg font-bold text-app-text mb-4 flex items-center gap-2">
                            Library Management <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded uppercase tracking-wide">Admin</span>
                        </h2>
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

                        <div className="mt-8 pt-6 border-t border-white/5">
                            <h3 className="text-sm font-bold text-app-text mb-4">Metadata Enrichment</h3>
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
                    </div>
                )}

                {/* User Management (Admin Only) */}
                {user?.is_admin === 1 && (
                    <div className="bg-app-surface rounded-xl p-6 mb-6">
                        <h2 className="text-lg font-bold text-app-text mb-4">User Management</h2>
                        <div className="space-y-4">
                            {usersList.length === 0 ? (
                                <p className="text-sm text-app-text-muted">No users found or loading...</p>
                            ) : (
                                usersList.map(u => (
                                    <div key={u.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                                {u.username.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-app-text">
                                                    {u.display_name || u.username}
                                                </div>
                                                <div className="text-xs text-app-text-muted">
                                                    @{u.username} • {u.is_admin ? 'Admin' : 'User'}
                                                </div>
                                            </div>
                                        </div>
                                        {u.id !== user?.id && (
                                            <button
                                                onClick={() => {
                                                    if (confirm(`Delete user ${u.username}?`)) {
                                                        axios.delete(`${SERVER_URL}/api/users/${u.id}`)
                                                            .then(() => setUsersList(l => l.filter(x => x.id !== u.id)))
                                                            .catch(err => alert("Failed: " + err.response?.data?.error || err.message));
                                                    }
                                                }}
                                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}

                            {/* Add User Form */}
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
                                    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
                                    const display_name = (form.elements.namedItem('display_name') as HTMLInputElement).value;
                                    const isAdmin = (form.elements.namedItem('is_admin') as HTMLInputElement).checked;

                                    if (username && password) {
                                        axios.post(`${SERVER_URL}/api/users`, { username, password, display_name, isAdmin })
                                            .then(res => {
                                                setUsersList([...usersList, res.data]);
                                                form.reset();
                                            })
                                            .catch(err => alert("Failed: " + err.response?.data?.error || err.message));
                                    }
                                }}
                                className="mt-4 pt-4 border-t border-white/5 space-y-3"
                            >
                                <h3 className="text-sm font-bold text-app-text">Add User</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <input name="username" placeholder="Username" required className="bg-app-bg border border-app-surface rounded px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent" />
                                    <input name="password" type="password" placeholder="Password" required className="bg-app-bg border border-app-surface rounded px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input name="display_name" placeholder="Display Name (Optional)" className="bg-app-bg border border-app-surface rounded px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent" />
                                    <label className="flex items-center gap-2 text-sm text-app-text cursor-pointer select-none">
                                        <input name="is_admin" type="checkbox" className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-app-accent focus:ring-offset-gray-900" />
                                        Make Admin
                                    </label>
                                </div>
                                <button type="submit" className="w-full bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 font-medium transition-colors text-sm">
                                    Create User
                                </button>
                            </form>
                        </div>
                    </div>
                )}


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
