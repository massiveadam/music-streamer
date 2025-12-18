/// <reference lib="webworker" />
/**
 * Service Worker for OpenStream PWA
 * 
 * Handles offline audio playback by intercepting stream requests
 * and serving from IndexedDB cache. Supports Range requests for seeking.
 */

import Dexie from 'dexie';

// Simplified IndexedDB access for service worker
class OfflineDB extends Dexie {
    tracks!: Dexie.Table<{ id: number; blob: Blob; size: number }, number>;

    constructor() {
        super('openstream_offline');
        this.version(1).stores({
            tracks: 'id'
        });
    }
}

const db = new OfflineDB();

// Cache name for static assets
const CACHE_NAME = 'openstream-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Declare self as ServiceWorkerGlobalScope
declare const self: ServiceWorkerGlobalScope;
export { };

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
});

// Fetch event - intercept audio stream requests
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Check if this is an audio stream request
    const streamMatch = url.pathname.match(/\/api\/stream\/(\d+)/);

    if (streamMatch) {
        const trackId = parseInt(streamMatch[1], 10);
        event.respondWith(handleAudioRequest(event.request, trackId));
    } else {
        // For other requests, try cache first, then network
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request);
            })
        );
    }
});

/**
 * Handle audio stream requests with Range support
 */
async function handleAudioRequest(request: Request, trackId: number): Promise<Response> {
    try {
        // Check if track is available offline
        const track = await db.tracks.get(trackId);

        if (!track || !track.blob) {
            // Not cached - fetch from network
            return fetch(request);
        }

        const blob = track.blob;
        const rangeHeader = request.headers.get('range');

        if (rangeHeader) {
            // Handle Range request (for seeking)
            return handleRangeRequest(blob, rangeHeader);
        } else {
            // Return full file
            return new Response(blob, {
                status: 200,
                headers: {
                    'Content-Type': blob.type || 'audio/mpeg',
                    'Content-Length': blob.size.toString(),
                    'Accept-Ranges': 'bytes'
                }
            });
        }
    } catch (error) {
        console.error('[SW] Error handling audio request:', error);
        return fetch(request);
    }
}

/**
 * Handle HTTP Range request for audio seeking
 */
function handleRangeRequest(blob: Blob, rangeHeader: string): Response {
    const total = blob.size;

    // Parse range header: "bytes=start-end" or "bytes=start-"
    const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!rangeMatch) {
        return new Response(blob, {
            status: 200,
            headers: { 'Content-Type': blob.type || 'audio/mpeg' }
        });
    }

    const start = parseInt(rangeMatch[1], 10);
    const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : total - 1;

    // Slice the blob for the requested range
    const chunk = blob.slice(start, end + 1);

    return new Response(chunk, {
        status: 206, // Partial Content
        headers: {
            'Content-Type': blob.type || 'audio/mpeg',
            'Content-Length': chunk.size.toString(),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes'
        }
    });
}
