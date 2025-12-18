/**
 * Settings Routes
 * Handles public config and admin system settings
 */

import { Router, Request, Response } from 'express';
import * as auth from '../auth';
import { getSetting, setSetting } from '../db';

const router = Router();

// Public: Get Client Config (e.g. Last.fm API Key for redirect)
router.get('/public', (req: Request, res: Response) => {
    res.json({
        lastfm_api_key: getSetting('lastfm_api_key') || process.env.LASTFM_API_KEY
    });
});

// Admin: Get System Settings
router.get('/system', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    res.json({
        lastfm_api_key: getSetting('lastfm_api_key') || '',
        lastfm_api_secret: getSetting('lastfm_api_secret') || '',
        discogs_consumer_key: getSetting('discogs_consumer_key') || '',
        discogs_consumer_secret: getSetting('discogs_consumer_secret') || ''
    });
});

// Admin: Update System Settings
router.put('/system', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    const { lastfm_api_key, lastfm_api_secret, discogs_consumer_key, discogs_consumer_secret } = req.body;

    if (lastfm_api_key !== undefined) setSetting('lastfm_api_key', lastfm_api_key);
    if (lastfm_api_secret !== undefined) setSetting('lastfm_api_secret', lastfm_api_secret);
    if (discogs_consumer_key !== undefined) setSetting('discogs_consumer_key', discogs_consumer_key);
    if (discogs_consumer_secret !== undefined) setSetting('discogs_consumer_secret', discogs_consumer_secret);

    res.json({ success: true });
});

export default router;
