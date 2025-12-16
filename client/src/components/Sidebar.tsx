import { Home, Library, ListMusic, Settings, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type MainTab = 'home' | 'library' | 'playlists' | 'settings';

interface SidebarProps {
    mainTab: MainTab;
    setMainTab: (tab: MainTab) => void;
    backgroundStatus: {
        enrichment?: { running: boolean; albumsProcessed: number; albumsTotal: number; currentTrack?: string };
        scanning?: { running: boolean; filesScanned: number };
    };
}

export default function Sidebar({ mainTab, setMainTab, backgroundStatus }: SidebarProps) {
    const { logout } = useAuth();

    return (
        <div className="hidden md:flex w-16 bg-app-bg border-r border-app-surface flex-col items-center py-6 gap-6 shrink-0">
            <button
                onClick={() => setMainTab('home')}
                className={`p-3 rounded-xl transition-all border ${mainTab === 'home' ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                title="Home"
            >
                <Home size={22} />
            </button>
            <button
                onClick={() => setMainTab('library')}
                className={`p-3 rounded-xl transition-all border ${mainTab === 'library' ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                title="Library"
            >
                <Library size={22} />
            </button>
            <button
                onClick={() => setMainTab('playlists')}
                className={`p-3 rounded-xl transition-all border ${mainTab === 'playlists' ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                title="Playlists"
            >
                <ListMusic size={22} />
            </button>

            {/* Status Indicator */}
            <div className="mt-auto mb-4 flex flex-col gap-4">
                {(backgroundStatus.enrichment?.running || backgroundStatus.scanning?.running) && (
                    <div className="w-10 h-10 rounded-full bg-app-surface border border-app-accent/50 flex items-center justify-center animate-pulse group relative cursor-help">
                        <RefreshCw size={20} className="text-app-accent animate-spin" />
                        <div className="absolute left-14 bg-black/90 text-xs px-2 py-1 rounded whitespace-nowrap hidden group-hover:block z-50 border border-white/10">
                            {backgroundStatus.enrichment?.running
                                ? `Enriching... (${Math.round((backgroundStatus.enrichment.albumsProcessed / backgroundStatus.enrichment.albumsTotal) * 100)}%)`
                                : "Scanning Library..."}
                        </div>
                    </div>
                )}
            </div>
            <button
                onClick={() => setMainTab('settings')}
                className={`p-3 rounded-xl transition-all border ${mainTab === 'settings' ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                title="Settings"
            >
                <Settings size={22} />
            </button>
            <button
                onClick={logout}
                className="p-3 rounded-xl transition-all border border-transparent text-app-text-muted hover:text-red-400 hover:bg-red-500/10"
                title="Logout"
            >
                <LogOut size={22} />
            </button>
        </div>
    );
}
