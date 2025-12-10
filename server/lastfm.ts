import axios from 'axios';
import 'dotenv/config';

const API_KEY = process.env.LASTFM_API_KEY;
const BASE_URL = 'http://ws.audioscrobbler.com/2.0/';

export interface LastFmTag {
    name: string;
    count: number;
}

export interface ArtistInfo {
    description: string | null;
    image: string | null;
}

export async function getArtistTags(artist: string): Promise<LastFmTag[]> {
    if (!API_KEY) return [];
    try {
        const res = await axios.get(BASE_URL, {
            params: {
                method: 'artist.getTopTags',
                artist: artist,
                api_key: API_KEY,
                format: 'json'
            }
        });
        if (res.data?.toptags?.tag) {
            return res.data.toptags.tag.map((t: { name: string; count: number }) => ({
                name: t.name,
                count: t.count
            }));
        }
    } catch (e) {
        // Silently fail
    }
    return [];
}

export async function getAlbumTags(artist: string, album: string): Promise<LastFmTag[]> {
    if (!API_KEY) return [];
    try {
        const res = await axios.get(BASE_URL, {
            params: {
                method: 'album.getTopTags',
                artist: artist,
                album: album,
                api_key: API_KEY,
                format: 'json'
            }
        });
        if (res.data?.toptags?.tag) {
            return res.data.toptags.tag.map((t: { name: string; count: number }) => ({
                name: t.name,
                count: t.count
            }));
        }
    } catch (e) {
        // Silently fail
    }
    return [];
}

export async function getAlbumInfo(artist: string, album: string): Promise<string | null> {
    if (!API_KEY) return null;
    try {
        const res = await axios.get(BASE_URL, {
            params: {
                method: 'album.getInfo',
                artist: artist,
                album: album,
                api_key: API_KEY,
                format: 'json'
            }
        });
        if (res.data?.album?.wiki?.summary) {
            return res.data.album.wiki.summary;
        }
    } catch (e) {
        // Silently fail
    }
    return null;
}

export async function getArtistInfo(artistName: string): Promise<ArtistInfo | null> {
    if (!artistName || !API_KEY) return null;
    try {
        const response = await axios.get(BASE_URL, {
            params: {
                method: 'artist.getinfo',
                artist: artistName,
                api_key: API_KEY,
                format: 'json'
            }
        });

        if (response.data?.artist) {
            const a = response.data.artist;
            const img = a.image && a.image.length > 0
                ? a.image[a.image.length - 1]['#text']
                : null;
            return {
                description: a.bio ? a.bio.summary : null,
                image: img
            };
        }
        return null;
    } catch (error) {
        console.error(`Last.fm getArtistInfo error for ${artistName}:`, (error as Error).message);
        return null;
    }
}

export default { getArtistTags, getAlbumTags, getAlbumInfo, getArtistInfo };
