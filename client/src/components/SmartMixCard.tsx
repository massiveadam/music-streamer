import { memo } from 'react';
import { Coffee, Zap, Heart, Sparkles, Radio, Music, LucideIcon } from 'lucide-react';

interface SmartMix {
    id: number;
    name: string;
    description: string;
    icon: string;
    filter_rules: string;
}

interface SmartMixCardProps {
    mix: SmartMix;
    onClick: () => void;
}

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
    Coffee,
    Zap,
    Heart,
    Sparkles,
    Radio,
    Music,
};

function SmartMixCard({ mix, onClick }: SmartMixCardProps) {
    const IconComponent = iconMap[mix.icon] || Music;

    return (
        <div
            className="bg-gradient-to-br from-app-surface to-app-surface/50 hover:from-app-accent/20 hover:to-app-surface/80 rounded-2xl p-5 cursor-pointer transition-all duration-300 group border border-white/5 hover:border-app-accent/30 hover:scale-[1.02] active:scale-[0.98]"
            onClick={onClick}
        >
            <div className="w-12 h-12 rounded-xl bg-app-accent/20 group-hover:bg-app-accent/30 flex items-center justify-center mb-4 transition-colors">
                <IconComponent size={24} className="text-app-accent" />
            </div>
            <div className="font-bold text-app-text text-lg mb-1">{mix.name}</div>
            <div className="text-sm text-app-text-muted line-clamp-2">{mix.description}</div>
        </div>
    );
}

export default memo(SmartMixCard);
