import { useRef, memo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Disc, Play } from 'lucide-react';
import type { Track, Artist } from '../types';

const SERVER_URL = 'http://localhost:3001';

interface VirtualTrackListProps {
    tracks: Track[];
    artists: Artist[];
    playTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    setSelectedArtist: (artist: Artist | null) => void;
}

// Memoized single track row
const TrackRow = memo(function TrackRow({
    track,
    index,
    artists,
    playTrack,
    setSelectedArtist,
}: {
    track: Track;
    index: number;
    artists: Artist[];
    playTrack: (index: number, transition: 'cut' | 'crossfade') => void;
    setSelectedArtist: (artist: Artist | null) => void;
}) {
    const handlePlay = useCallback(() => {
        playTrack(index, 'cut');
    }, [index, playTrack]);

    const handleArtistClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const artist = artists.find(a => a.name === track.artist);
        if (artist) setSelectedArtist(artist);
    }, [track.artist, artists, setSelectedArtist]);

    const duration = `${Math.floor(track.duration / 60)}:${(Math.floor(track.duration % 60)).toString().padStart(2, '0')}`;

    return (
        <div
            onClick={handlePlay}
            className="group flex items-center gap-4 px-4 py-3 bg-app-surface/50 hover:bg-app-surface rounded-lg cursor-pointer transition-colors border border-transparent hover:border-app-accent/20"
        >
            <div className="w-8 text-center text-sm text-app-text-muted group-hover:text-app-accent font-medium">
                <span className="group-hover:hidden">{index + 1}</span>
                <Play size={14} fill="currentColor" className="hidden group-hover:inline-block" />
            </div>
            <div className="w-12 h-12 bg-app-surface rounded-md overflow-hidden flex-shrink-0 border border-white/10">
                {track.has_art ? (
                    <img
                        loading="lazy"
                        decoding="async"
                        src={`${SERVER_URL}/api/art/${track.id}`}
                        alt={track.title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Disc size={16} className="text-app-text-muted" />
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-app-text truncate">{track.title}</div>
                <div className="text-sm text-app-text-muted truncate">
                    <span
                        className="hover:text-app-accent hover:underline cursor-pointer transition-colors"
                        onClick={handleArtistClick}
                    >
                        {track.artist}
                    </span>
                    • {track.album}
                </div>
            </div>
            <div className="text-sm text-app-text-muted font-mono tabular-nums">
                {duration}
            </div>
        </div>
    );
});

export default function VirtualTrackList({
    tracks,
    artists,
    playTrack,
    setSelectedArtist,
}: VirtualTrackListProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: tracks.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 68, // Estimated height of each row (py-3 + content)
        overscan: 10, // Render 10 extra items above/below viewport
    });

    const items = virtualizer.getVirtualItems();

    return (
        <div
            ref={parentRef}
            className="h-full overflow-auto pb-32"
            style={{ contain: 'strict' }}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {items.map((virtualItem) => {
                    const track = tracks[virtualItem.index];
                    return (
                        <div
                            key={virtualItem.key}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualItem.size}px`,
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <TrackRow
                                track={track}
                                index={virtualItem.index}
                                artists={artists}
                                playTrack={playTrack}
                                setSelectedArtist={setSelectedArtist}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
