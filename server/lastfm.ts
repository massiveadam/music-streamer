import axios from 'axios';
import 'dotenv/config';

import crypto from 'crypto';
import db, { getSetting } from './db';

const BASE_URL = 'http://ws.audioscrobbler.com/2.0/';

function getCredentials() {
    return {
        key: getSetting('lastfm_api_key') || process.env.LASTFM_API_KEY,
        secret: getSetting('lastfm_api_secret') || process.env.LASTFM_API_SECRET
    };
}

function generateSignature(params: Record<string, string>, secret: string): string {
    const sortedKeys = Object.keys(params).sort();
    let signatureString = '';

    for (const key of sortedKeys) {
        if (key === 'format') continue;
        signatureString += key + params[key];
    }

    signatureString += secret;
    return crypto.createHash('md5').update(signatureString).digest('hex');
}

export async function getSession(token: string): Promise<{ sessionKey: string; username: string } | null> {
    const creds = getCredentials();
    if (!creds.key || !creds.secret) return null;

    try {
        const params: Record<string, string> = {
            method: 'auth.getSession',
            api_key: creds.key,
            token: token
        };

        params.api_sig = generateSignature(params, creds.secret);
        params.format = 'json';

        const res = await axios.get(BASE_URL, { params });

        if (res.data?.session) {
            return {
                sessionKey: res.data.session.key,
                username: res.data.session.name
            };
        }
    } catch (e: any) {
        console.error('Last.fm getSession error:', e.response?.data || e.message);
    }
    return null;
}

export async function updateNowPlaying(sessionKey: string, artist: string, track: string, album?: string) {
    const creds = getCredentials();
    if (!creds.key || !creds.secret) return;

    try {
        const params: Record<string, string> = {
            method: 'track.updateNowPlaying',
            artist,
            track,
            api_key: creds.key,
            sk: sessionKey
        };

        if (album) params.album = album;

        params.api_sig = generateSignature(params, creds.secret);
        params.format = 'json';

        await axios.post(BASE_URL, null, { params });
    } catch (e: any) {
        console.error('Last.fm updateNowPlaying error:', e.response?.data || e.message);
    }
}

export async function scrobble(sessionKey: string, artist: string, track: string, timestamp: number, album?: string) {
    const creds = getCredentials();
    if (!creds.key || !creds.secret) return;

    try {
        const params: Record<string, string> = {
            method: 'track.scrobble',
            artist,
            track,
            timestamp: timestamp.toString(),
            api_key: creds.key,
            sk: sessionKey
        };

        if (album) params.album = album;

        params.api_sig = generateSignature(params, creds.secret);
        params.format = 'json';

        await axios.post(BASE_URL, null, { params });
    } catch (e: any) {
        console.error('Last.fm scrobble error:', e.response?.data || e.message);
    }
}

export interface LastFmTag {
    name: string;
    count: number;
}

export interface ArtistInfo {
    description: string | null;
    image: string | null;
}

export async function getArtistTags(artist: string): Promise<LastFmTag[]> {
    const creds = getCredentials();
    if (!creds.key) return [];
    try {
        const res = await axios.get(BASE_URL, {
            params: {
                method: 'artist.getTopTags',
                artist: artist,
                api_key: creds.key,
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
    const creds = getCredentials();
    if (!creds.key) return [];
    try {
        const res = await axios.get(BASE_URL, {
            params: {
                method: 'album.getTopTags',
                artist: artist,
                album: album,
                api_key: creds.key,
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
    const creds = getCredentials();
    if (!creds.key) return null;
    try {
        const res = await axios.get(BASE_URL, {
            params: {
                method: 'album.getInfo',
                artist: artist,
                album: album,
                api_key: creds.key,
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
    const creds = getCredentials();
    if (!artistName || !creds.key) return null;
    try {
        const response = await axios.get(BASE_URL, {
            params: {
                method: 'artist.getinfo',
                artist: artistName,
                api_key: creds.key,
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
