# AGENTS.md - OpenStream Music Streamer

This file provides context for AI coding assistants working on this codebase.

## Project Overview

OpenStream is a self-hosted music streaming application with a React frontend and Node.js/Express backend. It features:
- Local music library management with rich metadata enrichment
- Dual-deck audio playback with crossfading and gapless transitions
- 10-band parametric EQ with device profiles
- MusicBrainz/Discogs/Last.fm metadata integration

## Architecture

```
music-streamer/
├── client/              # React + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx      # Main application component (large - being refactored)
│   │   ├── audio/       # AudioEngine singleton for Web Audio API
│   │   ├── components/  # React components including modals
│   │   ├── context/     # React contexts (Auth, Audio)
│   │   ├── hooks/       # Custom hooks (usePlayback, useLibrary)
│   │   ├── pages/       # Page-level components
│   │   └── utils/       # Utility functions
│   └── android/         # Capacitor Android wrapper
│
├── server/              # Node.js + Express backend
│   ├── index.ts         # Main server (3000+ lines - needs modularization)
│   ├── db.ts            # SQLite database schema and helpers
│   ├── auth.ts          # JWT authentication
│   ├── musicbrainz.ts   # MusicBrainz/Discogs enrichment
│   ├── lastfm.ts        # Last.fm scrobbling and data
│   └── routes/          # (planned) Modular API routes
│
└── types/               # Shared TypeScript interfaces
    └── index.ts         # Track, Artist, Album, etc.
```

## Key Files

| File | Purpose | Notes |
|------|---------|-------|
| `server/index.ts` | All API endpoints | ~3000 lines, needs splitting |
| `client/src/App.tsx` | Main React component | ~1600 lines, refactoring to hooks |
| `client/src/audio/AudioEngine.ts` | Web Audio API management | Singleton, well-structured |
| `server/musicbrainz.ts` | Metadata enrichment | Handles MB, Discogs, Wikipedia |
| `server/db.ts` | SQLite schema | 15+ tables, good indexes |

## Database

SQLite database (`library.db`) with tables:
- `tracks` - Audio files with metadata
- `artists` - Artist records with MBIDs
- `releases` - Album metadata
- `labels` - Record labels
- `credits` - Per-track credits (producer, engineer, etc.)
- `playlists`, `playlist_tracks` - User playlists
- `listening_history` - Play history for recommendations
- `tags`, `entity_tags` - Flexible tagging system

## API Patterns

All endpoints under `/api/`:
- Auth: `/api/auth/*` (login, register, setup)
- Tracks: `/api/tracks`, `/api/stream/:id`, `/api/art/:id`
- Library: `/api/albums`, `/api/artists`, `/api/labels`
- Playlists: `/api/playlists/*`
- Enrichment: `/api/enrich/*`

## Development Commands

```bash
# Server
cd server && npx tsx index.ts

# Client
cd client && npm run dev

# TypeScript check
npx tsc --noEmit
```

## Known Issues / Tech Debt

1. **Monolithic files**: `index.ts` and `App.tsx` need modularization
2. **CORS**: Currently allows all origins - fine for dev, review for prod
3. **JWT secret**: Falls back to default if env var not set

## Performance Optimizations Done

- SQLite WAL mode with 64MB cache
- Pagination on all major endpoints
- Track caching in localStorage
- Debounced seek operations
- Memoized album derivation from tracks

## Coding Standards

- TypeScript strict mode
- Shared types in `types/index.ts`
- No console.log in production client code
- Prepared statements for all SQL queries
