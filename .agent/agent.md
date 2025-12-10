# OpenStream - Agent Context

## Project Purpose
A local music streaming app inspired by Plexamp/Roon. Desktop-first, metadata-rich, designed for music collectors.

## Architecture

```
music-streamer/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx         # Main component (1800+ lines)
│   │   ├── audio/
│   │   │   └── AudioEngine.js  # Web Audio dual-deck
│   │   └── index.css       # Tailwind + custom styles
│   └── package.json
├── server/                 # Express backend
│   ├── index.js            # API routes (700+ lines)
│   ├── db.js               # SQLite schema
│   ├── musicbrainz.js      # MB/CAA enrichment
│   ├── lastfm.js           # Last.fm API
│   ├── wikipedia.js        # Wikipedia bios
│   └── library.db          # SQLite database
└── STATUS.md               # Feature tracking
```

## Key Design Decisions

1. **Dual-Deck Audio**: Two HTMLAudioElement refs for seamless crossfading
2. **SQLite**: Simple file-based DB, no external services needed
3. **Enrichment Pipeline**: MusicBrainz → Last.fm → Wikipedia fallback
4. **Tailwind 4**: Using `@theme` directive for custom colors
5. **Single Component**: App.jsx is monolithic (consider splitting)

## Important State Variables (App.jsx)

```javascript
tracks          // All loaded tracks
currentTrackIndex
isPlaying
shuffleMode     // boolean
repeatMode      // 'off' | 'all' | 'one'
mainTab         // 'home' | 'library' | 'settings'
view            // 'grid' | 'list' | 'artists'
albumSort       // 'artist' | 'title' | 'year' | 'recent'
theme           // 'dark' | 'light'
selectedAlbum   // Album overlay state
selectedArtist  // Artist overlay state
```

## Common Tasks

### Adding a New API Endpoint
1. Add route in `server/index.js`
2. Add any needed DB schema in `server/db.js`
3. Call from frontend via axios

### Adding UI Component
1. Currently all in `App.jsx` (large file)
2. Consider extracting to `components/` folder
3. Use Tailwind classes: `bg-app-surface`, `text-app-text`, etc.

### Database Changes
- Schema in `server/db.js`
- Use `addColumn()` helper for migrations
- Tables auto-create on startup

## Environment Variables

```env
LASTFM_API_KEY=xxx    # Required for Last.fm enrichment
```

## Running Locally

```bash
# Terminal 1: Backend
cd server
npm install
node index.js         # Runs on http://localhost:3001

# Terminal 2: Frontend
cd client
npm install
npm run dev           # Runs on http://localhost:5173
```

## Known Issues / Tech Debt

1. `App.jsx` is too large - should extract components
2. Some hardcoded paths (e.g., default scan path)
3. No error boundaries in React
4. No TypeScript (vanilla JS)
5. Light theme CSS may need more work

## Testing Notes

- No automated tests currently
- Manual testing via browser
- Check console for enrichment logs

## Useful grep patterns

```bash
# Find all API endpoints
grep -n "app\.\(get\|post\|delete\)" server/index.js

# Find all useState hooks
grep -n "useState" client/src/App.jsx

# Find database tables
grep -n "CREATE TABLE" server/db.js
```
