# OpenStream - Project Status

## Overview
OpenStream is a modern, open-source music streaming application for local libraries, inspired by Plexamp and Roon.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS 4
- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Audio**: Web Audio API with dual-deck crossfading

---

## Feature Status

### ✅ Completed

#### Core Playback
- [x] Dual-deck audio engine with crossfading
- [x] 10-band EQ
- [x] Gapless playback (same-album cuts)
- [x] Shuffle mode
- [x] Repeat modes (off/all/one)
- [x] Keyboard shortcuts (Space, arrows, M, S, R)

#### Library Management
- [x] Music file scanning (FLAC/MP3/WAV/AIFF/AAC)
- [x] Metadata extraction (music-metadata)
- [x] Album grid view with artwork
- [x] List view with track details
- [x] Artist list view
- [x] Album sorting (artist, title, year, recent)
- [x] Debounced search

#### Metadata Enrichment
- [x] MusicBrainz integration (release data, types)
- [x] Last.fm integration (tags, bios, images)
- [x] Wikipedia fallback for artist bios
- [x] CoverArtArchive for album artwork
- [x] Deep credits extraction (producers, engineers)

#### UI/UX
- [x] Dark/Light theme toggle
- [x] Sidebar navigation (Home, Library, Settings)
- [x] Album detail overlay with flip-card art
- [x] Artist detail overlay with discography
- [x] Clickable tags/labels for search
- [x] Recently Added carousel (Home)
- [x] Recently Played carousel (Home)

#### Data & History
- [x] Listening history logging
- [x] Playlists table (API ready)
- [x] Featured playlists support

---

### 🔄 Partial / API Ready

| Feature | Backend | Frontend |
|---------|---------|----------|
| Queue Management | ✅ Ready | ⏳ Pending |
| Playlist UI | ✅ API | ⏳ Pending |
| Fuzzy Search | ⏳ Basic | ⏳ Could use fuse.js |

---

### ⏳ Planned / Not Started

- [ ] Mobile responsive layout
- [ ] Loading skeletons/spinners
- [ ] Playlist create/edit UI
- [ ] Queue panel UI
- [ ] Waveform display
- [ ] Lyrics integration
- [ ] Discogs integration
- [ ] Remote/multi-room playback

---

## Database Schema

### Core Tables
- `tracks` - Audio files with metadata
- `artists` - Artist info with bios
- `releases` - Album/release data
- `labels` - Record labels
- `credits` - Track credits (producer, etc.)
- `tags` / `entity_tags` - Genre/mood tags

### Feature Tables
- `playlists` - User playlists
- `playlist_tracks` - Playlist contents
- `listening_history` - Play log
- `album_images` - Cached artwork

---

## API Endpoints

### Tracks
- `GET /api/tracks` - All tracks
- `GET /api/tracks/recent` - Recently added
- `GET /api/stream/:id` - Audio stream
- `GET /api/art/:id` - Track artwork
- `GET /api/search?q=` - Search

### Artists
- `GET /api/artists` - Album artists
- `GET /api/artist/:mbid` - Artist details
- `GET /api/artist-by-name/:name` - Fallback lookup

### Playlists
- `GET /api/playlists` - All playlists
- `GET /api/playlists/featured` - Featured only
- `GET /api/playlists/:id` - With tracks
- `POST /api/playlists` - Create
- `POST /api/playlists/:id/tracks` - Add track
- `DELETE /api/playlists/:id` - Delete

### History
- `POST /api/history/log` - Log play
- `GET /api/history/recent` - Recent plays

### Admin
- `POST /api/scan` - Scan directory
- `POST /api/enrich` - Run enrichment
- `POST /api/clear` - Clear library
- `GET /api/status` - Scan status
