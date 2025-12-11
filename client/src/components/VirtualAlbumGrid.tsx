import { useRef, memo, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Disc, Play } from 'lucide-react';
import type { Track } from '../types';

const SERVER_URL = 'http://localhost:3001';

interface Album {
    name: string;
    artist: string;
    tracks: Track[];
    year: number | null;
}

interface VirtualAlbumGridProps {
    albums: Album[];
    setSelectedAlbum: (album: Album) => void;
    columnCount?: number;
}

// Memoized album card
const AlbumCard = memo(function AlbumCard({
    album,
    onSelect,
}: {
    album: Album;
    onSelect: () => void;
}) {
    return (
        <div
            className="group cursor-pointer p-2"
            onClick={onSelect}
        >
            <div className="aspect-square bg-app-surface rounded-lg mb-3 flex items-center justify-center group-hover:bg-app-accent/10 transition-colors relative overflow-hidden shadow-lg">
                {album.tracks[0]?.has_art ? (
                    <img
                        loading="lazy"
                        decoding="async"
                        src={`${SERVER_URL}/api/art/${album.tracks[0].id}`}
                        alt={album.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <Disc size={32} className="text-app-text-muted group-hover:text-app-accent transition-colors" />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
                    <Play size={32} className="fill-white drop-shadow-lg scale-95 group-hover:scale-100 transition-transform" />
                </div>
            </div>
            <h3 className="font-semibold truncate text-xs md:text-sm">{album.name}</h3>
            <p className="text-xs text-app-text-muted truncate">{album.artist}</p>
        </div>
    );
});

export default function VirtualAlbumGrid({
    albums,
    setSelectedAlbum,
    columnCount = 6,
}: VirtualAlbumGridProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    // Calculate rows from albums
    const rows = useMemo(() => {
        const result: Album[][] = [];
        for (let i = 0; i < albums.length; i += columnCount) {
            result.push(albums.slice(i, i + columnCount));
        }
        return result;
    }, [albums, columnCount]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 240, // Estimated height of each row
        overscan: 3, // Render 3 extra rows above/below viewport
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
                    const row = rows[virtualItem.index];
                    return (
                        <div
                            key={virtualItem.key}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <div
                                className="grid gap-4"
                                style={{
                                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`
                                }}
                            >
                                {row.map((album) => (
                                    <AlbumCard
                                        key={`${album.name}-${album.artist}`}
                                        album={album}
                                        onSelect={() => setSelectedAlbum(album)}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
