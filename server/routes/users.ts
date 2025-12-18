/**
 * Users Routes (Admin)
 * Handles admin-only user management operations
 */

import { Router, Request, Response } from 'express';
import * as auth from '../auth';
import type { AuthRequest } from '../auth';

const router = Router();

// Get all users
router.get('/', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    const users = auth.getAllUsers();
    res.json(users);
});

// Create user
router.post('/', auth.authenticateToken, auth.requireAdmin, async (req: Request, res: Response) => {
    try {
        const { username, password, displayName, isAdmin } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        try {
            const user = await auth.createUser(username, password, displayName, isAdmin);
            res.json(user);
        } catch (e: any) {
            if (e.message && e.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            throw e;
        }
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Delete user
router.delete('/:id', auth.authenticateToken, auth.requireAdmin, (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

        const authReq = req as AuthRequest;

        if (authReq.user && authReq.user.id === id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        const success = auth.deleteUser(id);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
