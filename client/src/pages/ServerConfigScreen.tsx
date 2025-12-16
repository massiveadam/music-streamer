import React, { useState } from 'react';
import { Server, Wifi, Check, AlertCircle, Loader, ChevronRight } from 'lucide-react';
import { saveServerUrl, getServerUrl } from '../config';

interface ServerConfigScreenProps {
    onConfigured: () => void;
    initialError?: string;
}

export default function ServerConfigScreen({ onConfigured, initialError }: ServerConfigScreenProps) {
    const [serverUrl, setServerUrl] = useState(getServerUrl() || '');
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState(initialError || '');

    const normalizeUrl = (url: string): string => {
        let normalized = url.trim();
        // Remove trailing slash
        if (normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }
        // Add protocol if missing
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'http://' + normalized;
        }
        return normalized;
    };

    const testConnection = async () => {
        const url = normalizeUrl(serverUrl);
        setIsTestingConnection(true);
        setConnectionStatus('idle');
        setErrorMessage('');

        console.log('[ServerConfig] Testing connection to:', url);

        try {
            // Use AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`${url}/api/auth/setup`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                signal: controller.signal,
                mode: 'cors',
            });

            clearTimeout(timeoutId);
            console.log('[ServerConfig] Response status:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('[ServerConfig] Response data:', data);
                setConnectionStatus('success');
                // Save and force page reload to ensure all components use new URL
                setTimeout(() => {
                    saveServerUrl(url);
                    // Force reload to ensure all modules re-read the URL
                    window.location.reload();
                }, 1000);
            } else {
                throw new Error(`Server responded with status ${response.status}`);
            }
        } catch (error: any) {
            console.error('[ServerConfig] Connection error:', error);
            setConnectionStatus('error');

            if (error.name === 'AbortError') {
                setErrorMessage('Connection timed out. Server may be unreachable.');
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Network request failed')) {
                setErrorMessage(`Could not reach server at ${url}. Check the URL and network connection.`);
            } else if (error.message.includes('CORS')) {
                setErrorMessage('CORS error. Server may need configuration.');
            } else {
                setErrorMessage(`Error: ${error.message || 'Connection failed'}`);
            }
        } finally {
            setIsTestingConnection(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (serverUrl.trim()) {
            testConnection();
        }
    };

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20 pointer-events-none" />
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.03),transparent_50%)] animate-pulse pointer-events-none" />

            <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl relative z-10">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-4">
                        <Server className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                        Connect to Server
                    </h1>
                    <p className="text-white/40 text-sm mt-2 text-center">
                        Enter your OpenStream server URL
                    </p>
                </div>

                {(errorMessage || initialError) && (
                    <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{errorMessage || initialError}</span>
                    </div>
                )}

                {connectionStatus === 'success' && (
                    <div className="mb-6 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        <span>Connected successfully!</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-white/50 uppercase tracking-wider pl-1">
                            Server URL
                        </label>
                        <div className="relative">
                            <Wifi className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                            <input
                                type="text"
                                value={serverUrl}
                                onChange={(e) => {
                                    setServerUrl(e.target.value);
                                    setConnectionStatus('idle');
                                    setErrorMessage('');
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                placeholder="http://192.168.0.93:3001"
                                required
                                autoCapitalize="none"
                                autoCorrect="off"
                            />
                        </div>
                        <p className="text-xs text-white/30 pl-1">
                            Examples: http://192.168.1.100:3001, https://music.yourdomain.com
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={isTestingConnection || !serverUrl.trim()}
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                    >
                        {isTestingConnection ? (
                            <>
                                <Loader className="w-5 h-5 animate-spin" />
                                Testing Connection...
                            </>
                        ) : connectionStatus === 'success' ? (
                            <>
                                <Check className="w-5 h-5" />
                                Connected!
                            </>
                        ) : (
                            <>
                                Connect
                                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/10">
                    <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">
                        Quick Tips
                    </h3>
                    <ul className="text-xs text-white/40 space-y-2">
                        <li className="flex items-start gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>For local network: Use your computer's IP address</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>For remote access: Use a Cloudflare tunnel or VPN</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan-400">•</span>
                            <span>Make sure your server is running before connecting</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
