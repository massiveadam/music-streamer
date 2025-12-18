/**
 * Auth Routes
 * Handles user authentication, registration, and user management
 */

import { Router, Request, Response } from 'express';
import * as auth from '../auth';
import type { AuthRequest } from '../auth';
import { getSetting, setSetting } from '../db';

const router = Router();

// Check if setup is required (no users exist)
router.get('/setup', (req: Request, res: Response) => {
    const setupRequired = !auth.hasUsers();
    res.json({ setupRequired });
});

// Register new user
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { username, password, displayName } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Check if this is the first user (becomes admin)
        const isFirstUser = !auth.hasUsers();

        try {
            const user = await auth.createUser(username, password, displayName, isFirstUser);
            const token = auth.generateToken(user);
            res.json({ user, token });
        } catch (e: any) {
            if (e.message && e.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            throw e;
        }
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        const userWithPassword = auth.getUserByUsername(username);

        if (!userWithPassword || !(await auth.verifyPassword(password, userWithPassword.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const { password_hash, ...user } = userWithPassword;
        const token = auth.generateToken(user);

        res.json({ user, token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
router.get('/me', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    res.json(req.user);
});

// Update user settings (EQ preset)
router.put('/settings', auth.authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const { eqPreset } = req.body;
        if (req.user) {
            auth.updateUserEqPreset(req.user.id, JSON.stringify(eqPreset));
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
