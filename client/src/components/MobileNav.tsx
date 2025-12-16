import { Home, Library, ListMusic, Settings } from 'lucide-react';

type MainTab = 'home' | 'library' | 'playlists' | 'settings';

interface MobileNavProps {
    mainTab: MainTab;
    setMainTab: (tab: MainTab) => void;
}

export default function MobileNav({ mainTab, setMainTab }: MobileNavProps) {
    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-app-bg/95 backdrop-blur-xl border-t border-app-surface z-50 safe-area-inset-bottom">
            <div className="flex justify-around items-center py-2 px-4">
                <button
                    onClick={() => setMainTab('home')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${mainTab === 'home' ? 'text-app-accent' : 'text-app-text-muted'}`}
                >
                    <Home size={22} />
                    <span className="text-xs">Home</span>
                </button>
                <button
                    onClick={() => setMainTab('library')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${mainTab === 'library' ? 'text-app-accent' : 'text-app-text-muted'}`}
                >
                    <Library size={22} />
                    <span className="text-xs">Library</span>
                </button>
                <button
                    onClick={() => setMainTab('playlists')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${mainTab === 'playlists' ? 'text-app-accent' : 'text-app-text-muted'}`}
                >
                    <ListMusic size={22} />
                    <span className="text-xs">Playlists</span>
                </button>
                <button
                    onClick={() => setMainTab('settings')}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${mainTab === 'settings' ? 'text-app-accent' : 'text-app-text-muted'}`}
                >
                    <Settings size={22} />
                    <span className="text-xs">Settings</span>
                </button>
            </div>
        </div>
    );
}
