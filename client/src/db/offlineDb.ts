/**
 * Offline Storage Database Schema
 * 
 * Uses Dexie.js for IndexedDB access to store downloaded audio files
 * for offline playback in PWA and mobile apps.
 */

import Dexie, { Table } from 'dexie';

export interface OfflineTrack {
    id: number;          // Track ID from server
    blob: Blob;          // Audio file data
    size: number;        // File size in bytes
    downloadedAt: Date;  // When downloaded
}

export interface OfflineMetadata {
    id: number;          // Track ID
    title: string;
    artist: string;
    album: string;
    duration: number;
    hasArt: boolean;
    artworkBlob?: Blob;  // Album art for offline
}

export class OfflineDatabase extends Dexie {
    tracks!: Table<OfflineTrack>;
    metadata!: Table<OfflineMetadata>;

    constructor() {
        super('openstream_offline');

        this.version(1).stores({
            tracks: 'id, downloadedAt',      // id is primary key
            metadata: 'id, album, artist'    // indexes for filtering
        });
    }
}

export const offlineDb = new OfflineDatabase();
