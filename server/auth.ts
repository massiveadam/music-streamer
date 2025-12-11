import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import db from './db';

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'music-streamer-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 12;

// User type
export interface User {
    id: number;
    username: string;
    display_name: string | null;
    is_admin: number;
    eq_preset: string | null;
    created_at: string;
}

// Extended Request with user
export interface AuthRequest extends Request {
    user?: User;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// Generate JWT token
export function generateToken(user: User): string {
    return jwt.sign(
        { id: user.id, username: user.username, is_admin: user.is_admin },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// Verify JWT token
export function verifyToken(token: string): { id: number; username: string; is_admin: number } | null {
    try {
        return jwt.verify(token, JWT_SECRET) as { id: number; username: string; is_admin: number };
    } catch {
        return null;
    }
}

// Middleware: Authenticate token (required)
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        res.status(403).json({ error: 'Invalid or expired token' });
        return;
    }

    // Get full user from database
    const user = db.prepare('SELECT id, username, display_name, is_admin, eq_preset, created_at FROM users WHERE id = ?')
        .get(decoded.id) as User | undefined;

    if (!user) {
        res.status(403).json({ error: 'User not found' });
        return;
    }

    req.user = user;
    next();
}

// Middleware: Optional authentication (doesn't require, but attaches user if present)
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            const user = db.prepare('SELECT id, username, display_name, is_admin, eq_preset, created_at FROM users WHERE id = ?')
                .get(decoded.id) as User | undefined;
            if (user) {
                req.user = user;
            }
        }
    }

    next();
}

// Middleware: Require admin
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user || !req.user.is_admin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}

// Check if any users exist (for first-user setup)
export function hasUsers(): boolean {
    const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return result.count > 0;
}

// Create user
export async function createUser(
    username: string,
    password: string,
    displayName?: string,
    isAdmin: boolean = false
): Promise<User> {
    const passwordHash = await hashPassword(password);

    const result = db.prepare(`
        INSERT INTO users (username, password_hash, display_name, is_admin)
        VALUES (?, ?, ?, ?)
    `).run(username, passwordHash, displayName || username, isAdmin ? 1 : 0);

    return {
        id: result.lastInsertRowid as number,
        username,
        display_name: displayName || username,
        is_admin: isAdmin ? 1 : 0,
        eq_preset: null,
        created_at: new Date().toISOString()
    };
}

// Get user by username
export function getUserByUsername(username: string): (User & { password_hash: string }) | undefined {
    return db.prepare(`
        SELECT id, username, password_hash, display_name, is_admin, eq_preset, created_at
        FROM users WHERE username = ?
    `).get(username) as (User & { password_hash: string }) | undefined;
}

// Get user by ID
export function getUserById(id: number): User | undefined {
    return db.prepare(`
        SELECT id, username, display_name, is_admin, eq_preset, created_at
        FROM users WHERE id = ?
    `).get(id) as User | undefined;
}

// Get all users (admin only)
export function getAllUsers(): User[] {
    return db.prepare(`
        SELECT id, username, display_name, is_admin, eq_preset, created_at
        FROM users ORDER BY created_at
    `).all() as User[];
}

// Delete user
export function deleteUser(id: number): boolean {
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
}

// Update user EQ preset
export function updateUserEqPreset(userId: number, preset: string): void {
    db.prepare('UPDATE users SET eq_preset = ? WHERE id = ?').run(preset, userId);
}
