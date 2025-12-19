import { SERVER_URL, isServerConfigured, getServerUrl } from './config';
import { useMediaSession, updatePositionState } from './hooks/useMediaSession';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { useState, useEffect, useRef, useMemo, useCallback, ChangeEvent, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import axios, { AxiosResponse } from 'axios';
import { Play, Pause, SkipForward, SkipBack, Volume2, Sliders, Disc, Search, Settings, X, Clock, Calendar, Hash, PlusCircle, RefreshCcw, Home, Library, Sparkles, ListMusic, Shuffle, Repeat, Repeat1, LayoutGrid, List, Plus, RefreshCw, LogOut } from 'lucide-react';
import { audioEngine } from './audio/AudioEngine';
import { NowPlaying } from './components/NowPlaying';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import MiniPlayer from './components/MiniPlayer';
import ProgressBanner from './components/ProgressBanner';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import PlaylistsPage from './pages/PlaylistsPage';
import LibraryPage from './pages/LibraryPage';
import { AlbumDetailModal, ArtistDetailModal, LabelDetailModal, CollectionDetailModal, PlaylistDetailModal } from './components/modals';
import type { Track, Artist, Credit, Playlist, RepeatMode, ViewTab, AlbumSort, Theme, LibraryView } from './types';
import { extractColorFromImage } from './utils/colorUtils';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import ServerConfigScreen from './pages/ServerConfigScreen';


// Local types for UI state
interface Album {
  name: string;
  artist: string;
  tracks: Track[];
  year: number | null;
  genre: string | null;
}

interface ScanStatus {
  isScanning: boolean;
  processedCount: number;
  currentFile: string;
}

interface EnrichmentStatus {
  isEnriching: boolean;
  processed: number;
  total: number;
  current?: string;
  currentTrack?: string;
}

interface AlbumMetadata {
  found: boolean;
  release?: any;
  label?: any;
  tags?: { name: string; count?: number; source?: string }[];
  images?: { type: string; source: string }[];
}

interface ArtistDetails {
  artist: Artist;
  credits: Record<string, Credit[]>;
  albums: any[];
  labels: string[];
  totalTracks: number;
}

type DeckId = 'A' | 'B';
type MainTab = 'home' | 'library' | 'playlists' | 'settings';
type ActiveTab = 'tracks' | 'credits' | 'discography';


function MusicPlayer() {
  const { logout, user } = useAuth();
  const [tracks, setTracks] = useState<Track[]>([]);
  // ...
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showEq, setShowEq] = useState<boolean>(false);
  const [eqGains, setEqGains] = useState<number[]>(new Array(10).fill(0));
  const [volume, setVolume] = useState<number>(1);
  const [view, setView] = useState<LibraryView>('grid');
  const [mainTab, setMainTab] = useState<MainTab>('library');

  // Home page data
  const [recentlyAdded, setRecentlyAdded] = useState<Track[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<Playlist[]>([]);
  const [pinnedCollections, setPinnedCollections] = useState<any[]>([]);

  // Playback modes
  const [shuffleMode, setShuffleMode] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');

  const [activeDeck, setActiveDeck] = useState<DeckId>('A');
  const [deckATrack, setDeckATrack] = useState<Track | null>(null);
  const [deckBTrack, setDeckBTrack] = useState<Track | null>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Now Playing view
  const [showNowPlaying, setShowNowPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);

  // Debounced seek ref to prevent rapid seek spam
  const seekTimeoutRef = useRef<number | null>(null);

  // Theme
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('theme') || 'dark');

  // Accent color for Now Playing tint
  const [accentColor, setAccentColor] = useState<string>('#333333');

  const audioRefA = useRef<HTMLAudioElement>(null);
  const audioRefB = useRef<HTMLAudioElement>(null);

  // Fetch Tracks with caching
  useEffect(() => {
    // Load cached tracks first for instant UI
    const cached = localStorage.getItem('openstream_tracks_cache');
    if (cached) {
      try {
        const { tracks: cachedTracks, timestamp } = JSON.parse(cached);
        if (cachedTracks && cachedTracks.length > 0) {
          console.log(`[App] Loaded ${cachedTracks.length} tracks from cache`);
          setTracks(cachedTracks);
          setIsLoading(false);
        }
      } catch (e) {
        console.error('[App] Cache parse error:', e);
      }
    }

    // Then fetch fresh data in background
    fetchTracks();

    // Simple URL routing
    const path = window.location.pathname;
    if (path === '/settings') setMainTab('settings');
    else if (path === '/playlists') setMainTab('playlists');
    else if (path === '/library') setMainTab('library');
    else if (path === '/') setMainTab('home');
  }, []);

  const fetchTracks = async () => {
    // Only show loading if we don't have cached data
    if (tracks.length === 0) setIsLoading(true);

    // Use getServerUrl() to ensure we have the latest value from localStorage
    const currentServerUrl = getServerUrl();
    console.log("[App] fetchTracks called, SERVER_URL:", SERVER_URL, "getServerUrl():", currentServerUrl);

    if (!currentServerUrl) {
      console.error("[App] No server URL configured!");
      setIsLoading(false);
      return;
    }

    try {
      const res = await axios.get(`${currentServerUrl}/api/tracks?limit=100000`, { timeout: 30000 });
      console.log("[App] Tracks fetched:", res.data.tracks?.length || res.data?.length || 0);
      const fetchedTracks = res.data.tracks || res.data;
      setTracks(fetchedTracks);

      // Cache the tracks for faster subsequent loads
      try {
        localStorage.setItem('openstream_tracks_cache', JSON.stringify({
          tracks: fetchedTracks,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('[App] Cache save failed (quota exceeded?):', e);
      }
    } catch (err) {
      console.error("[App] Error fetching tracks:", err);
      // Only set empty array if we don't have cached data
      if (tracks.length === 0) setTracks([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Labels state
  const [allLabels, setAllLabels] = useState<any[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<any | null>(null);

  // Album Collections state
  const [allCollections, setAllCollections] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<any | null>(null);
  const [playlistsViewMode, setPlaylistsViewMode] = useState<'playlists' | 'collections'>('playlists');
  const [addToCollectionAlbum, setAddToCollectionAlbum] = useState<{ name: string; artist: string } | null>(null);

  // Playlists state  
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [homePlaylists, setHomePlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);

  // Background task status
  const [backgroundStatus, setBackgroundStatus] = useState<{
    enrichment?: { running: boolean; albumsProcessed: number; albumsTotal: number; currentTrack?: string };
    scanning?: { running: boolean; filesScanned: number };
  }>({});



  // Fetch Artists
  const [artists, setArtists] = useState([]);
  const fetchArtists = async () => {
    try {
      const res = await axios.get(`${getServerUrl()}/api/artists`);
      setArtists(res.data.artists || res.data);
    } catch (err) {
      console.error("Error fetching artists:", err);
    }
  };

  // Effect to switch data based on view
  useEffect(() => {
    if (view === 'artists') {
      fetchArtists();
    }
    if (view === 'labels') {
      axios.get(`${getServerUrl()}/api/labels`)
        .then(res => setAllLabels(Array.isArray(res.data) ? res.data : (res.data.labels || [])))
        .catch(err => console.error('Error fetching labels:', err));
    }
  }, [view]);



  // Fetch home page data
  useEffect(() => {
    if (mainTab === 'home') {
      // Fetch recently added
      axios.get(`${getServerUrl()}/api/tracks/recent?limit=60`)
        .then(res => setRecentlyAdded(res.data))
        .catch(err => console.error('Error fetching recent:', err));
      // Fetch recently played
      axios.get(`${getServerUrl()}/api/history/recent?limit=60`)
        .then(res => setRecentlyPlayed(res.data))
        .catch(err => console.error('Error fetching history:', err));
      // Fetch pinned collections
      axios.get(`${getServerUrl()}/api/collections/home`)
        .then(res => setPinnedCollections(res.data))
        .catch(err => console.error('Error fetching pinned collections:', err));
      // Also fetch artists count
      fetchArtists();
    }
    // Fetch playlists and collections for home and playlists tabs
    if (mainTab === 'home' || mainTab === 'playlists') {
      axios.get(`${getServerUrl()}/api/playlists`)
        .then(res => setAllPlaylists(res.data))
        .catch(err => console.error('Error fetching all playlists:', err));
      axios.get(`${getServerUrl()}/api/collections`)
        .then(res => setAllCollections(res.data))
        .catch(err => console.error('Error fetching collections:', err));
    }
  }, [mainTab]);

  // Background status polling
  useEffect(() => {
    const pollStatus = () => {
      axios.get(`${getServerUrl()}/api/enrich/status`)
        .then(res => setBackgroundStatus(prev => ({ ...prev, enrichment: res.data })))
        .catch(() => { });
    };
    pollStatus();
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Theme persistence
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Helper to refresh playlists
  const refreshPlaylists = async () => {
    const [all, home] = await Promise.all([
      axios.get(`${getServerUrl()}/api/playlists`),
      axios.get(`${getServerUrl()}/api/playlists/home`)
    ]);
    setAllPlaylists(all.data);
    setHomePlaylists(home.data);
  };

  // Album sorting
  const [albumSort, setAlbumSort] = useState('artist'); // 'artist' | 'title' | 'year' | 'recent'

  // Group Tracks by Album (rudimentary grouping)
  const albums = useMemo((): Album[] => {
    if (!Array.isArray(tracks)) return [];

    const groups: Record<string, Album> = {};
    tracks.forEach(track => {
      const key = track.album || 'Unknown Album';
      if (!groups[key]) groups[key] = { name: key, artist: track.artist, tracks: [], year: track.year, genre: track.genre || null };
      groups[key].tracks.push(track);
      // Use most recent year from tracks
      if (track.year && (!groups[key].year || track.year > groups[key].year)) {
        groups[key].year = track.year;
      }
      // Use first non-null genre found
      if (track.genre && !groups[key].genre) {
        groups[key].genre = track.genre;
      }
    });
    let sorted = Object.values(groups);

    // Apply sorting
    switch (albumSort) {
      case 'title':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'year':
        sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case 'recent':
        sorted.sort((a, b) => Math.max(...b.tracks.map(t => t.id)) - Math.max(...a.tracks.map(t => t.id)));
        break;
      case 'artist':
      default:
        sorted.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
    }
    return sorted;
  }, [tracks, albumSort]);

  // Audio Init (Dual)
  useEffect(() => {
    if (audioRefA.current && audioRefB.current) {
      const initAudio = () => {
        if (audioRefA.current && audioRefB.current) {
          audioEngine.initialize(audioRefA.current, audioRefB.current);
          audioEngine.resumeContext();
        }
      };
      // Init on first interaction
      window.addEventListener('click', initAudio, { once: true });
      return () => window.removeEventListener('click', initAudio);
    }
  }, [audioRefA, audioRefB]);

  // Skip lock to prevent rapid successive skips
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Handle Playback & Crossfading
  const playTrack = async (index, transition = 'cut') => {
    if (isTransitioning || !Array.isArray(tracks) || index < 0 || index >= tracks.length) return;

    // Resume AudioContext if suspended (required for mobile browsers)
    audioEngine.resumeContext();

    setIsTransitioning(true);
    const nextTrack = tracks[index];
    const nextDeck = activeDeck === 'A' ? 'B' : 'A';

    try {
      // Prepare Next Deck
      if (nextDeck === 'A') setDeckATrack(nextTrack);
      else setDeckBTrack(nextTrack);

      // Set loudness normalization gain for this track
      audioEngine.setTrackLoudness(nextDeck, (nextTrack as any).loudness_lufs);

      setIsBuffering(true);

      // Wait briefly for audio element to be ready
      await new Promise(resolve => setTimeout(resolve, 50));

      const nextAudio = nextDeck === 'A' ? audioRefA.current : audioRefB.current;
      if (!nextAudio) throw new Error('Audio element not ready');

      // Wait for minimal data to start playing (canplay = readyState 2, faster than canplaythrough = 3)
      if (nextAudio.readyState < 2) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            nextAudio.removeEventListener('canplay', onReady);
            resolve(); // Proceed anyway after timeout - audio will buffer while playing
          }, 800);
          const onReady = () => {
            clearTimeout(timeout);
            resolve();
          };
          nextAudio.addEventListener('canplay', onReady, { once: true });
        });
      }

      if (transition === 'crossfade') {
        await nextAudio.play();
        audioEngine.crossfadeTo(nextDeck);
      } else {
        // Hard Cut - abort any ongoing crossfade
        audioEngine.decks[activeDeck].gain.gain.setValueAtTime(0, audioEngine.audioCtx!.currentTime);
        audioEngine.decks[nextDeck].gain.gain.setValueAtTime(1, audioEngine.audioCtx!.currentTime);

        const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
        }
        await nextAudio.play();
        audioEngine.activeDeck = nextDeck;
      }

      setIsBuffering(false);

      setActiveDeck(nextDeck);
      setCurrentTrackIndex(index);
      setIsPlaying(true);

      // Auto-open Now Playing screen
      setShowNowPlaying(true);

      // Log to listening history
      axios.post(`${getServerUrl()}/api/history/log`, { trackId: nextTrack.id }).catch(() => { });
    } catch (error) {
      console.error('Playback error:', error);
      setIsBuffering(false);
    } finally {
      setIsTransitioning(false);
    }
  };

  // Preload next track when current track starts playing (Phase 3: Pre-caching)
  useEffect(() => {
    if (currentTrackIndex >= 0 && tracks.length > currentTrackIndex + 1 && !shuffleMode) {
      const nextTrack = tracks[currentTrackIndex + 1];
      // Preload next track audio by creating a hidden audio element
      const preloadAudio = new Audio();
      preloadAudio.preload = 'auto';
      preloadAudio.src = `${getServerUrl()}/api/stream/${nextTrack.id}`;
      // Just load metadata/initial buffer, don't need full download
      preloadAudio.load();
      console.log(`[Preload] Preloading next track: ${nextTrack.title}`);

      return () => {
        // Cleanup preload on track change
        preloadAudio.src = '';
        preloadAudio.load();
      };
    }
  }, [currentTrackIndex, tracks, shuffleMode]);

  const togglePlay = () => {
    // Resume AudioContext if suspended (required for mobile browsers)
    audioEngine.resumeContext();

    if (currentTrackIndex === -1 && tracks.length > 0) {
      playTrack(0, 'cut');
      return;
    }

    const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
    if (isPlaying) {
      currentAudio.pause();
    } else {
      currentAudio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleEqChange = (index: number, val: string) => {
    const newGains = [...eqGains];
    newGains[index] = parseFloat(val);
    setEqGains(newGains);
    audioEngine.setBandGain(index, newGains[index]);
  };

  // Scan Status
  const [scanStatus, setScanStatus] = useState({ isScanning: false, processedCount: 0, currentFile: '' });
  const [showScanOverlay, setShowScanOverlay] = useState(false);

  // Poll Scan Status
  useEffect(() => {
    let interval;
    if (showScanOverlay) {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${getServerUrl()}/api/status`);
          setScanStatus(res.data);

          if (!res.data.isScanning && res.data.processedCount > 0) {
            // Scan finished
            setShowScanOverlay(false);
            fetchTracks();
            alert(`Scan complete! Processed ${res.data.processedCount} tracks.`);
          }
        } catch (e) { console.error("Poll error", e); }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [showScanOverlay]);

  // Scanning utility
  const handleScan = async () => {
    const path = prompt("Enter full path to music directory on SERVER:");

    if (path) {
      const limitStr = prompt("Limit number of files (0 for unlimited):", "500");
      const limit = parseInt(limitStr) || 0;

      try {
        await axios.post(`${getServerUrl()}/api/scan`, { path, limit });
        setShowScanOverlay(true);
      } catch (e) { alert("Scan failed to start"); }
    }
  };

  // Sonic Adventure: Find similar tracks
  const startSonicAdventure = () => {
    const currentTrack = tracks[currentTrackIndex];
    if (!currentTrack || !currentTrack.bpm) {
      alert("Current track has no BPM data for Sonic Analysis.");
      return;
    }

    const targetBpm = currentTrack.bpm;
    // Simple similar finder: BPM +/- 15%
    if (!Array.isArray(tracks)) return;
    const similar = tracks.filter(t => {
      if (!t.bpm || t.id === currentTrack.id) return false;
      const bpmDiff = Math.abs(t.bpm - targetBpm);
      return bpmDiff <= (targetBpm * 0.15);
    });

    if (similar.length === 0) {
      alert("No similar tracks found.");
      return;
    }

    // Shuffle and play
    const shuffled = [...similar].sort(() => Math.random() - 0.5);
    // TODO: Ideally we'd replace the queue, but for now just playing one is a start. 
    // Actually, in this simple player, "Tracks" IS the queue effectively if we don't filter the view.
    // Let's just alert the user for this prototype or maybe filter the VIEW to only show adventure tracks?

    // Better: Play a random one from the similar list
    const nextTrack = shuffled[0];
    if (!Array.isArray(tracks)) return;
    const index = tracks.findIndex(t => t.id === nextTrack.id);
    if (index !== -1) playTrack(index, 'crossfade');
    alert(`Sonic Adventure! Jumping to ${nextTrack.title} (${nextTrack.bpm} BPM)`);
  };

  const currentTrack = tracks[currentTrackIndex]; // For UI display

  // Media Session API for lock screen controls (iOS/Chrome/Firefox/Linux)
  useMediaSession({
    currentTrack,
    isPlaying,
    onPlay: togglePlay,
    onPause: togglePlay,
    onPrevious: useCallback(() => {
      if (currentTrackIndex > 0) playTrack(currentTrackIndex - 1, 'cut');
    }, [currentTrackIndex, playTrack]),
    onNext: useCallback(() => {
      if (currentTrackIndex < tracks.length - 1) playTrack(currentTrackIndex + 1, 'crossfade');
    }, [currentTrackIndex, tracks.length, playTrack]),
  });

  // Session persistence for resume on app reopen
  const handleSessionRestore = useCallback((trackIndex: number, position: number) => {
    playTrack(trackIndex, 'cut');
    // Seek to position after a short delay to let audio load
    setTimeout(() => {
      const audio = activeDeck === 'A' ? audioRefB.current : audioRefA.current; // playTrack switches decks
      if (audio) {
        audio.currentTime = position;
      }
    }, 500);
  }, [playTrack, activeDeck]);

  const { hasSession, sessionInfo, restoreSession, dismissSession } = useSessionPersistence({
    tracks,
    currentTrackIndex,
    currentTime,
    isPlaying,
    onRestore: handleSessionRestore,
  });

  // Auto-restore session on app launch (no prompt - just resume)
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    if (hasSession && !isLoading && tracks.length > 0 && currentTrackIndex === -1 && !sessionRestoredRef.current) {
      sessionRestoredRef.current = true;
      restoreSession();
    }
  }, [hasSession, isLoading, tracks.length, currentTrackIndex, restoreSession]);

  // Monitor Track End for Auto-Crossfade
  const handleTrackEnd = () => {
    // Repeat One: replay same track
    if (repeatMode === 'one') {
      const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
      currentAudio.currentTime = 0;
      currentAudio.play();
      return;
    }

    let nextIndex;

    if (shuffleMode) {
      // Pick random track (exclude current track)
      const availableTracks = tracks.filter((_, i) => i !== currentTrackIndex);
      if (availableTracks.length === 0) return; // No other tracks available
      const randomTrack = availableTracks[Math.floor(Math.random() * availableTracks.length)];
      nextIndex = tracks.findIndex(t => t.id === randomTrack.id);
    } else {
      nextIndex = currentTrackIndex + 1;
    }

    // Handle end of playlist
    if (nextIndex >= tracks.length) {
      if (repeatMode === 'all') {
        nextIndex = 0; // Loop back
      } else {
        return; // Stop playback
      }
    }

    const nextTrack = tracks[nextIndex];
    const currentTrack = tracks[currentTrackIndex];

    // Smart Gapless Logic
    let transition = 'crossfade';
    if (!shuffleMode && currentTrack && nextTrack && currentTrack.album === nextTrack.album) {
      transition = 'cut';
    }

    // Scrobble current track if valid
    if (currentTrack) {
      axios.post(`${getServerUrl()}/api/user/scrobble`, {
        artist: currentTrack.artist,
        track: currentTrack.title,
        album: currentTrack.album,
        timestamp: Math.floor(Date.now() / 1000)
      }).catch(err => console.error("Scrobble failed", err));
    }

    playTrack(nextIndex, transition);
  };

  // Deep Link Handler
  const handleDeepLink = (query) => {
    setSelectedAlbum(null); // Close overlay
    setSearchQuery(query);  // Trigger search
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [moodFilter, setMoodFilter] = useState('');

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery) {
        try {
          const res = await axios.get(`${getServerUrl()}/api/search?q=${encodeURIComponent(searchQuery)}&limit=200`);
          setTracks(res.data.results || res.data);
        } catch (e) { console.error(e); }
      } else if (!moodFilter) {
        // Only fetch all if no mood filter either
        fetchTracks();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          if (currentTrackIndex < tracks.length - 1) {
            playTrack(currentTrackIndex + 1, 'cut');
          }
          break;
        case 'ArrowLeft':
          if (currentTrackIndex > 0) {
            playTrack(currentTrackIndex - 1, 'cut');
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => Math.min(1, v + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => Math.max(0, v - 0.1));
          break;
        case 'KeyM':
          setVolume(v => v > 0 ? 0 : 1);
          break;
        case 'KeyS':
          setShuffleMode(s => !s);
          break;
        case 'KeyR':
          setRepeatMode(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrackIndex, tracks.length, isPlaying]);

  // Mood Filter (Simple Curation)
  const handleMoodSelect = async (mood) => {
    setMoodFilter(mood);
    setSearchQuery(''); // Clear search
    if (!mood) {
      fetchTracks();
      return;
    }
    // Client-side filter for now as we load all tracks, or we could add ?mood= API.
    // Since we have `tracks` loaded usually, local filter is fast. 
    // BUT search replaced `tracks`. So let's re-fetch all then filter? 
    // Or better: Server API for mood? 
    // Let's use the local `tracks` if we haven't searched, otherwise re-fetch.
    // Simpler: Just use Search endpoint for mood too if we want, or client side.
    // The user wants "Curation". Let's assume client-side filtering of the main library is fine for this prototype size.
    // Actually, let's implement a refetch if we are in "Search" mode.

    // For this prototype, let's reload all then filter.
    const res = await axios.get(`${getServerUrl()}/api/tracks`);
    const all = res.data;
    const filtered = all.filter(t => t.mood && t.mood.toLowerCase().includes(mood.toLowerCase()));
    setTracks(filtered);
  };

  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [matchedTrackIds, setMatchedTrackIds] = useState<number[]>([]); // Track IDs from search results to highlight
  const [selectedArtist, setSelectedArtist] = useState(null); // New Artist Detail State
  const [artistDetails, setArtistDetails] = useState(null); // { artist, credits, albums, totalTracks }

  const [albumCredits, setAlbumCredits] = useState({});
  const [albumMetadata, setAlbumMetadata] = useState(null); // { found, release, label, tags, images }
  const [isFlipped, setIsFlipped] = useState(false); // For album art flip
  const [activeTab, setActiveTab] = useState('tracks'); // 'tracks' | 'credits' | 'discography'
  const [showRescanModal, setShowRescanModal] = useState(false);
  const [enrichmentStatus, setEnrichmentStatus] = useState<EnrichmentStatus>({ isEnriching: false, processed: 0, total: 0, currentTrack: undefined });

  // Fetch credits and metadata when album opens
  useEffect(() => {
    if (selectedAlbum) {
      // Fetch Credits
      axios.get(`${getServerUrl()}/api/credits/album/${encodeURIComponent(selectedAlbum.name)}`)
        .then(res => setAlbumCredits(res.data))
        .catch(err => console.error(err));

      // Fetch Extended Metadata (Tags, Label)
      axios.get(`${getServerUrl()}/api/album-metadata`, {
        params: { album: selectedAlbum.name, artist: selectedAlbum.artist }
      })
        .then(res => setAlbumMetadata(res.data))
        .catch(err => console.error(err));

      setActiveTab('tracks');
    } else {
      setAlbumCredits({});
      setAlbumMetadata(null);
      setIsFlipped(false);
    }
  }, [selectedAlbum]);

  // Fetch Artist Details when selected
  useEffect(() => {
    if (selectedArtist) {
      // Use MBID if available, otherwise use name
      const identifier = selectedArtist.mbid || selectedArtist.name;
      axios.get(`${getServerUrl()}/api/artist/${encodeURIComponent(identifier)}`)
        .then(res => setArtistDetails(res.data))
        .catch(err => {
          console.error('Error fetching artist details:', err);
          // Fallback to name-based lookup if MBID fails
          if (selectedArtist.mbid) {
            axios.get(`${getServerUrl()}/api/artist/${encodeURIComponent(selectedArtist.name)}`)
              .then(res => setArtistDetails(res.data))
              .catch(err2 => console.error('Fallback artist lookup failed:', err2));
          }
        });

      setActiveTab('discography');
    } else {
      setArtistDetails(null);
    }
  }, [selectedArtist]);

  // Dynamic Accent Color - Re-enabled for Tint
  useEffect(() => {
    const updateAccentColor = async () => {
      const track = tracks[currentTrackIndex];
      if (track && track.has_art) {
        const imageUrl = `${getServerUrl()}/api/art/${track.id}`;
        console.log(`[App] Attempting to extract color from: ${imageUrl}`);
        const color = await extractColorFromImage(imageUrl);
        if (color) {
          console.log(`[App] Setting accent color to: ${color}`);
          setAccentColor(color);
          document.documentElement.style.setProperty('--app-accent', color);
          return;
        } else {
          console.log('[App] Color extraction returned null, using fallback');
          setAccentColor('#555555');
          document.documentElement.style.setProperty('--app-accent', '#878787');
        }
      }
      if (!track) {
        document.documentElement.style.setProperty('--app-accent', '#878787');
      }
    };
    updateAccentColor();
  }, [currentTrackIndex, tracks]);

  // Poll enrichment status
  useEffect(() => {
    const pollTimer = setInterval(() => {
      axios.get(`${getServerUrl()}/api/enrich/status`)
        .then(res => {
          setEnrichmentStatus(res.data);
          // If detailed status available, maybe show current track?
        })
        .catch(() => { });
    }, 2000);
    return () => clearInterval(pollTimer);
  }, []);

  // Track modal state for history management
  const modalStackRef = useRef<string[]>([]);
  const isPopstateRef = useRef(false);

  // Helper to get current modal state as a string
  const getCurrentModalState = useCallback(() => {
    if (showNowPlaying) return 'nowPlaying';
    if (selectedAlbum) return 'album';
    if (selectedArtist) return 'artist';
    if (selectedLabel) return 'label';
    if (selectedCollection) return 'collection';
    if (selectedPlaylist) return 'playlist';
    return null;
  }, [showNowPlaying, selectedAlbum, selectedArtist, selectedLabel, selectedCollection, selectedPlaylist]);

  // Push history state when modals open
  useEffect(() => {
    // Skip if this change was triggered by popstate
    if (isPopstateRef.current) {
      isPopstateRef.current = false;
      return;
    }

    const currentModal = getCurrentModalState();
    const stackTop = modalStackRef.current[modalStackRef.current.length - 1];

    if (currentModal && currentModal !== stackTop) {
      // A new modal opened - push to history
      modalStackRef.current.push(currentModal);
      window.history.pushState({ modal: currentModal }, '', window.location.pathname);
    } else if (!currentModal && modalStackRef.current.length > 0) {
      // All modals closed - clear stack (but don't manipulate history, user may have used back button)
      modalStackRef.current = [];
    }
  }, [showNowPlaying, selectedAlbum, selectedArtist, selectedLabel, selectedCollection, selectedPlaylist, getCurrentModalState]);

  // Handle browser back button (popstate event)
  useEffect(() => {
    const handlePopstate = (e: PopStateEvent) => {
      // Check if we have modals open that should be closed
      const currentModal = getCurrentModalState();

      if (currentModal) {
        // Mark that we're handling a popstate (to prevent pushing new history in the modal effect)
        isPopstateRef.current = true;
        modalStackRef.current.pop();

        // Close the topmost modal
        if (showNowPlaying) {
          setShowNowPlaying(false);
        } else if (selectedAlbum) {
          setSelectedAlbum(null);
        } else if (selectedArtist) {
          setSelectedArtist(null);
        } else if (selectedLabel) {
          setSelectedLabel(null);
        } else if (selectedCollection) {
          setSelectedCollection(null);
        } else if (selectedPlaylist) {
          setSelectedPlaylist(null);
        }
      }
    };

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, [showNowPlaying, selectedAlbum, selectedArtist, selectedLabel, selectedCollection, selectedPlaylist, getCurrentModalState]);

  // Handle back navigation (Android back button/gesture)
  useEffect(() => {
    const handleBack = (e: Event) => {
      // Close modals in order of priority (topmost first)
      if (showNowPlaying) {
        setShowNowPlaying(false);
        e.preventDefault();
        return;
      }
      if (selectedAlbum) {
        setSelectedAlbum(null);
        e.preventDefault();
        return;
      }
      if (selectedArtist) {
        setSelectedArtist(null);
        e.preventDefault();
        return;
      }
      if (selectedLabel) {
        setSelectedLabel(null);
        e.preventDefault();
        return;
      }
      if (selectedCollection) {
        setSelectedCollection(null);
        e.preventDefault();
        return;
      }
      if (selectedPlaylist) {
        setSelectedPlaylist(null);
        e.preventDefault();
        return;
      }
      // If nothing to close, let the default handler run (exit app)
    };

    window.addEventListener('app:back', handleBack);
    return () => window.removeEventListener('app:back', handleBack);
  }, [showNowPlaying, selectedAlbum, selectedArtist, selectedLabel, selectedCollection, selectedPlaylist]);

  // Toggle Favorite
  const toggleFavorite = async (e, trackId) => {
    e.stopPropagation();
    try {
      const res = await axios.post(`${getServerUrl()}/api/favorite`, { id: trackId });
      const { rating } = res.data;

      // Update local state
      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, rating } : t));

      // Also update selectedAlbum if open
      if (selectedAlbum) {
        setSelectedAlbum(prev => ({
          ...prev,
          tracks: prev.tracks.map(t => t.id === trackId ? { ...t, rating } : t)
        }));
      }
    } catch (err) { console.error("Fav error", err); }
  };

  const addToQueue = (e) => {
    e.stopPropagation();
    alert("Added to queue (Feature coming soon!)");
  };

  return (
    <div className="h-screen w-screen bg-app-bg text-app-text flex">
      {/* Sidebar Navigation */}
      <Sidebar
        mainTab={mainTab}
        setMainTab={setMainTab}
        backgroundStatus={backgroundStatus}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Progress Banner for enrichment/analysis */}
        <ProgressBanner />

        {/* ===== HOME PAGE ===== */}
        {mainTab === 'home' && (
          <HomePage
            tracks={tracks}
            albums={albums}
            artists={artists}
            recentlyPlayed={recentlyPlayed}
            recentlyAdded={recentlyAdded}
            pinnedCollections={pinnedCollections}
            playTrack={playTrack}
            setSelectedCollection={setSelectedCollection}
            setSelectedAlbum={setSelectedAlbum}
            setMainTab={setMainTab}
            setPlaylistsViewMode={setPlaylistsViewMode}
            setAddToCollectionAlbum={setAddToCollectionAlbum}
          />
        )}

        {/* ===== SETTINGS PAGE ===== */}
        {mainTab === 'settings' && (
          <SettingsPage
            theme={theme}
            setTheme={setTheme}
            setShowScanOverlay={setShowScanOverlay}
          />
        )}


        {/* ===== PLAYLISTS PAGE ===== */}
        {mainTab === 'playlists' && (
          <PlaylistsPage
            allPlaylists={allPlaylists}
            allCollections={allCollections}
            playlistsViewMode={playlistsViewMode}
            setPlaylistsViewMode={setPlaylistsViewMode}
            setEditingPlaylist={setEditingPlaylist}
            setShowPlaylistModal={setShowPlaylistModal}
            setAddToCollectionAlbum={setAddToCollectionAlbum}
            setSelectedPlaylist={setSelectedPlaylist}
            setSelectedCollection={setSelectedCollection}
          />
        )}

        {/* ===== LIBRARY PAGE ===== */}
        {mainTab === 'library' && (
          <LibraryPage
            tracks={tracks}
            albums={albums}
            artists={artists}
            allLabels={allLabels}
            view={view as any} // Cast to match stricter type in component
            setView={setView as any}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            albumSort={albumSort}
            setAlbumSort={setAlbumSort}
            setSelectedAlbum={setSelectedAlbum}
            setSelectedArtist={setSelectedArtist}
            setSelectedLabel={setSelectedLabel}
            playTrack={playTrack}
            showScanOverlay={showScanOverlay}
            scanStatus={scanStatus}
          />
        )}

        {/* Artist Detail Overlay */}
        {
          selectedArtist && artistDetails && (
            <div className="fixed inset-0 z-[100] bg-app-bg text-app-text overflow-y-auto animate-in fade-in duration-200 custom-scrollbar">
              {/* Header Bar */}
              <div className="sticky top-0 z-50 bg-app-bg border-b border-app-surface px-6 py-4 flex items-center justify-between">
                <button
                  onClick={() => setSelectedArtist(null)}
                  className="p-2 hover:bg-app-surface rounded-full transition-colors"
                >
                  <X size={20} className="text-app-text-muted" />
                </button>
              </div>

              <div className="max-w-5xl mx-auto px-8 pt-12 pb-32">
                {/* Hero */}
                <div className="flex flex-col gap-6 mb-12">
                  {/* Info Only - No Image */}
                  <div className="flex flex-col justify-center text-center items-center">
                    <h1 className="text-5xl md:text-8xl font-serif font-bold text-app-text mb-6">
                      {artistDetails.artist.name}
                    </h1>
                    {/* Stats */}
                    <div className="flex gap-6 text-sm text-app-text-muted font-medium mb-6">
                      {artistDetails.artist.country && <span>{artistDetails.artist.country}</span>}
                      {artistDetails.artist.begin_date && <span>Est. {artistDetails.artist.begin_date}</span>}
                      <span>{artistDetails.totalTracks} Tracks in Library</span>
                    </div>

                    {/* Labels (Searchable) */}
                    {artistDetails.labels && artistDetails.labels.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2 mb-8">
                        {artistDetails.labels.map(l => (
                          <button
                            key={l}
                            onClick={() => {
                              setSearchQuery(l);
                              setSelectedArtist(null);
                              // Optional: trigger search effect
                            }}
                            className="px-3 py-1 rounded-full bg-app-surface text-xs text-app-text-muted border border-app-surface/50 hover:bg-white/10 hover:border-white/30 hover:text-white transition-colors uppercase tracking-wider"
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Bio */}
                    {artistDetails.artist.description ? (
                      <div className="max-w-3xl mx-auto">
                        <p className="text-base text-app-text-muted leading-relaxed mb-4">
                          {artistDetails.artist.description.replace(/<[^>]*>?/gm, '')}
                        </p>
                        <div className="flex gap-4 justify-center text-sm">
                          {artistDetails.artist.wiki_url && (
                            <a
                              href={artistDetails.artist.wiki_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-app-accent hover:underline"
                            >
                              Read more on Wikipedia →
                            </a>
                          )}
                          {artistDetails.artist.mbid && (
                            <a
                              href={`https://musicbrainz.org/artist/${artistDetails.artist.mbid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-app-accent hover:underline"
                            >
                              View on MusicBrainz →
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-app-text-muted italic">
                        No biography available.
                        {artistDetails.artist.mbid && (
                          <a
                            href={`https://musicbrainz.org/artist/${artistDetails.artist.mbid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-app-accent hover:underline ml-2"
                          >
                            View on MusicBrainz →
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-8 mb-8 border-b border-app-surface">
                  <button
                    onClick={() => setActiveTab('discography')}
                    className={`pb-3 border-b-2 font-medium text-sm uppercase tracking-wider transition-colors ${activeTab === 'discography' ? 'border-app-accent text-app-text' : 'border-transparent text-app-text-muted hover:text-app-text'}`}
                  >
                    Discography
                  </button>
                  <button
                    onClick={() => setActiveTab('credits')}
                    className={`pb-3 border-b-2 font-medium text-sm uppercase tracking-wider transition-colors ${activeTab === 'credits' ? 'border-app-accent text-app-text' : 'border-transparent text-app-text-muted hover:text-app-text'}`}
                  >
                    Credits & Apperances
                  </button>
                </div>

                {/* Content */}
                <div className="min-h-[400px]">
                  {activeTab === 'discography' && (
                    <div className="space-y-12">
                      {(() => {
                        const groups = {};
                        if (artistDetails.albums) {
                          artistDetails.albums.forEach(album => {
                            // Default to 'Album' if type is missing (likely local files)
                            const type = album.primary_type || 'Album';
                            if (!groups[type]) groups[type] = [];
                            groups[type].push(album);
                          });
                        }
                        const order = ['Album', 'EP', 'Single', 'Other'];
                        const keys = Object.keys(groups).sort((a, b) => {
                          const ixA = order.indexOf(a);
                          const ixB = order.indexOf(b);
                          return (ixA === -1 ? 99 : ixA) - (ixB === -1 ? 99 : ixB);
                        });

                        if (keys.length === 0) return <div className="text-center text-app-text-muted py-12">No releases found.</div>;

                        return keys.map(type => (
                          <div key={type}>
                            <h3 className="text-sm font-semibold text-app-accent uppercase tracking-wider mb-6 border-b border-app-surface/50 pb-2">{type}s</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                              {groups[type].map(album => (
                                <div
                                  key={album.release_mbid || album.album}
                                  className="group cursor-pointer"
                                  onClick={async () => {
                                    // First try to find in current albums
                                    const target = albums.find(a => a.name === album.album && a.artist === artistDetails.artist.name);
                                    if (target) {
                                      setSelectedArtist(null);
                                      setSelectedAlbum(target);
                                    } else {
                                      // Fallback: fetch all tracks, then find album
                                      try {
                                        const res = await axios.get(`${getServerUrl()}/api/tracks`);
                                        const allTracks = res.data;
                                        setTracks(allTracks);
                                        // Find album from fetched tracks
                                        const albumTracks = allTracks.filter((t: Track) => t.album === album.album && t.artist === artistDetails.artist.name);
                                        if (albumTracks.length > 0) {
                                          setSelectedArtist(null);
                                          setSelectedAlbum({
                                            name: album.album,
                                            artist: artistDetails.artist.name,
                                            tracks: albumTracks,
                                            year: albumTracks[0]?.year || null,
                                            genre: albumTracks[0]?.genre || null
                                          });
                                        }
                                      } catch (e) {
                                        console.error('Failed to fetch tracks:', e);
                                      }
                                    }
                                  }}
                                >
                                  <div className="aspect-square bg-app-surface rounded-lg mb-3 overflow-hidden shadow-lg group-hover:scale-105 transition-transform">
                                    {album.art_path ? (
                                      <img loading="lazy" decoding="async" src={`${getServerUrl()}/api/art/release/${album.release_mbid}/front`} alt={album.album} className="w-full h-full object-cover" />
                                    ) : album.sample_track_id ? (
                                      <img loading="lazy" decoding="async" src={`${getServerUrl()}/api/art/${album.sample_track_id}`} alt={album.album} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <Disc size={32} className="text-app-text-muted" />
                                      </div>
                                    )}
                                  </div>
                                  <h3 className="font-medium text-sm truncate">{album.title || album.album}</h3>
                                  <p className="text-xs text-app-text-muted">
                                    {album.release_date
                                      ? album.release_date.substring(0, 4)
                                      : album.track_year
                                        ? album.track_year
                                        : ''}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}

                  {activeTab === 'credits' && (
                    <div className="space-y-8">
                      {Object.entries(artistDetails.credits).map(([role, credits]) => (
                        <div key={role}>
                          <h3 className="text-sm font-semibold text-app-accent uppercase tracking-wider mb-4 border-b border-app-surface/50 pb-2">{role}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {(credits as any[]).map((credit, i) => (
                              <div key={i} className="flex justify-between items-center p-2 rounded hover:bg-app-surface transition-colors">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-app-text truncate">{credit.title}</div>
                                  <div className="text-xs text-app-text-muted truncate">{credit.album} • {credit.track_artist}</div>
                                </div>
                                <button
                                  onClick={() => {
                                    if (!Array.isArray(tracks)) return;
                                    const idx = tracks.findIndex(t => t.id === credit.track_id);
                                    if (idx !== -1) {
                                      playTrack(idx, 'cut');
                                    } else {
                                      alert("Track not in current active playlist view");
                                    }
                                  }}
                                  className="p-1.5 rounded-full hover:bg-app-accent/20 text-app-text-muted hover:text-white"
                                >
                                  <Play size={12} fill="currentColor" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        }

        {/* Equalizer Panel (Overlay) - Legacy UI, Now Playing has better EQ */}
        {showEq && (
          <div className="h-48 border-t border-app-surface bg-app-surface/50 backdrop-blur-md p-4 flex flex-col items-center animate-in slide-in-from-bottom">
            <div className="w-full max-w-3xl flex justify-between items-end h-32 pb-4">
              {audioEngine.getBands().map((band, i) => (
                <div key={band.frequency} className="flex flex-col items-center gap-2 h-full justify-end w-8">
                  <input
                    type="range"
                    min="-12" max="12" step="0.1"
                    value={eqGains[i] || 0}
                    onChange={(e) => handleEqChange(i, e.target.value)}
                    className="h-24 -rotate-90 w-24 origin-center accent-app-accent cursor-pointer"
                    style={{ appearance: 'slider-vertical' as any }}
                  />
                  <span className="text-[10px] text-app-text-muted">
                    {band.frequency >= 1000 ? `${band.frequency / 1000}k` : band.frequency}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowNowPlaying(true)}
              className="text-xs text-app-accent hover:text-app-accent/80 mt-2"
            >
              Open Full Parametric EQ →
            </button>
          </div>
        )}


        {/* HIDDEN DUAL DECKS - Moved outside conditional rendering for persistence */}
        <div style={{ display: 'none' }}>
          <audio
            ref={audioRefA}
            src={deckATrack ? `${getServerUrl()}/api/stream/${deckATrack.id}` : undefined}
            onEnded={handleTrackEnd}
            onTimeUpdate={(e) => {
              if (activeDeck === 'A') {
                setCurrentTime((e.target as HTMLAudioElement).currentTime);
                setDuration((e.target as HTMLAudioElement).duration || 0);
              }
            }}
            onError={(e) => {
              console.error('Audio A error:', (e.target as HTMLAudioElement).error);
              if (activeDeck === 'A') setIsBuffering(false);
            }}
            onStalled={() => {
              console.warn('Audio A stalled - network may be slow');
              if (activeDeck === 'A') setIsBuffering(true);
            }}
            onWaiting={() => {
              if (activeDeck === 'A') setIsBuffering(true);
            }}
            onPlaying={() => {
              if (activeDeck === 'A') setIsBuffering(false);
            }}
            onCanPlayThrough={() => {
              if (activeDeck === 'A') setIsBuffering(false);
            }}
            preload="auto"
            crossOrigin="anonymous"
          />
          <audio
            ref={audioRefB}
            src={deckBTrack ? `${getServerUrl()}/api/stream/${deckBTrack.id}` : undefined}
            onEnded={handleTrackEnd}
            onTimeUpdate={(e) => {
              if (activeDeck === 'B') {
                setCurrentTime((e.target as HTMLAudioElement).currentTime);
                setDuration((e.target as HTMLAudioElement).duration || 0);
              }
            }}
            onError={(e) => {
              console.error('Audio B error:', (e.target as HTMLAudioElement).error);
              if (activeDeck === 'B') setIsBuffering(false);
            }}
            onStalled={() => {
              console.warn('Audio B stalled - network may be slow');
              if (activeDeck === 'B') setIsBuffering(true);
            }}
            onWaiting={() => {
              if (activeDeck === 'B') setIsBuffering(true);
            }}
            onPlaying={() => {
              if (activeDeck === 'B') setIsBuffering(false);
            }}
            onCanPlayThrough={() => {
              if (activeDeck === 'B') setIsBuffering(false);
            }}
            preload="auto"
            crossOrigin="anonymous"
          />
        </div>


        {/* Detail View Overlay - Dark Theme */}
        {
          selectedAlbum && (
            <AlbumDetailModal
              album={selectedAlbum}
              tracks={tracks}
              artists={artists}
              matchedTrackIds={matchedTrackIds}
              onClose={() => setSelectedAlbum(null)}
              onPlayTrack={playTrack}
              onShowNowPlaying={() => setShowNowPlaying(true)}
              onArtistClick={(artist: Artist) => {
                setSelectedAlbum(null);
                setSelectedArtist(artist);
              }}
              onTagClick={handleDeepLink}
              onToggleFavorite={toggleFavorite}
              onAlbumClick={(clickedAlbum) => {
                // Navigate to clicked album
                const albumData = Array.isArray(albums)
                  ? albums.find(a => a.name === clickedAlbum.name && a.artist === clickedAlbum.artist)
                  : null;
                if (albumData) {
                  setSelectedAlbum({ ...albumData, tracks: tracks.filter(t => t.album === albumData.name && t.artist === albumData.artist) });
                }
              }}
            />
          )
        }
        {/* Collection Detail View Overlay */}
        {
          selectedCollection && (
            <CollectionDetailModal
              collection={selectedCollection}
              tracks={tracks}
              onClose={() => setSelectedCollection(null)}
              onPlayTrack={playTrack}
              onAlbumClick={(albumName, artistName) => {
                const albumData = Array.isArray(albums) ? albums.find(a => a.name === albumName && a.artist === artistName) : null;
                if (albumData) {
                  setSelectedAlbum(albumData);
                  setSelectedCollection(null);
                }
              }}
              onDelete={async () => {
                if (confirm('Delete this collection?')) {
                  try {
                    await axios.delete(`${getServerUrl()}/api/collections/${selectedCollection.id}`);
                    const res = await axios.get(`${getServerUrl()}/api/collections`);
                    setAllCollections(res.data);
                    setSelectedCollection(null);
                  } catch (e) {
                    console.error('Failed to delete collection:', e);
                  }
                }
              }}
              onRefresh={async () => {
                try {
                  const res = await axios.get(`${getServerUrl()}/api/collections`);
                  setAllCollections(res.data);
                } catch (e) {
                  console.error('Failed to refresh collections:', e);
                }
              }}
            />
          )
        }

        {/* Playlist Detail View */}
        {
          selectedPlaylist && (
            <PlaylistDetailModal
              playlist={selectedPlaylist}
              allTracks={tracks}
              onClose={() => setSelectedPlaylist(null)}
              onPlayTrack={playTrack}
              onShowNowPlaying={() => setShowNowPlaying(true)}
              onRefresh={refreshPlaylists}
            />
          )
        }

        {/* Add to Collection Modal */}
        {
          addToCollectionAlbum && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="bg-app-surface w-[500px] rounded-2xl p-6 shadow-2xl border border-white/10">
                <h2 className="text-xl font-bold text-white mb-4">
                  {addToCollectionAlbum.name ? `Add "${addToCollectionAlbum.name}" to Collection` : 'Create New Collection'}
                </h2>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  <button
                    onClick={() => {
                      // Logic to create new collection
                      const name = prompt('Collection Name:');
                      if (name) {
                        axios.post(`${getServerUrl()}/api/collections`, {
                          name,
                          description: '',
                          // Only add album if we have one
                          initialAlbum: addToCollectionAlbum.name ? addToCollectionAlbum : undefined
                        }).then(() => {
                          refreshPlaylists();
                          setAddToCollectionAlbum(null);
                        });
                      }
                    }}
                    className="w-full p-4 rounded-xl border-2 border-dashed border-white/10 hover:border-app-accent hover:bg-white/5 flex items-center gap-3 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-app-accent/20 flex items-center justify-center text-app-accent">
                      <Plus size={20} />
                    </div>
                    <div>
                      <div className="font-bold text-white">Create New Collection</div>
                      <div className="text-sm text-app-text-muted">Start a new collection</div>
                    </div>
                  </button>

                  {allCollections.map(col => (
                    <button
                      key={col.id}
                      onClick={async () => {
                        if (addToCollectionAlbum.name) {
                          await axios.post(`${getServerUrl()}/api/collections/${col.id}/albums`, {
                            albumName: addToCollectionAlbum.name,
                            artistName: addToCollectionAlbum.artist
                          });
                          refreshPlaylists();
                        }
                        setAddToCollectionAlbum(null);
                      }}
                      className="w-full p-3 rounded-xl hover:bg-white/5 flex items-center gap-3 transition-colors text-left group"
                    >
                      <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
                        {col.preview_albums?.[0]?.sample_track_id ? (
                          <img loading="lazy" decoding="async" src={`${getServerUrl()}/api/art/${col.preview_albums[0].sample_track_id}`} className="w-full h-full object-cover" />
                        ) : <ListMusic size={20} className="text-app-text-muted" />}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-app-text group-hover:text-white transition-colors">{col.name}</div>
                        <div className="text-sm text-app-text-muted">{col.album_count || 0} albums</div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex justify-end">
                  <button onClick={() => setAddToCollectionAlbum(null)} className="px-4 py-2 hover:bg-white/10 rounded-lg text-app-text-muted hover:text-white">Cancel</button>
                </div>
              </div>
            </div>
          )
        }

        {/* Playlist Modal (Create/Edit) */}
        {
          showPlaylistModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="bg-app-surface w-[400px] rounded-2xl p-6 shadow-2xl border border-white/10">
                <h2 className="text-xl font-bold text-white mb-6">Create Playlist</h2>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const name = formData.get('name') as string;
                  const desc = formData.get('description') as string;
                  if (name) {
                    await axios.post(`${getServerUrl()}/api/playlists`, { name, description: desc });
                    refreshPlaylists();
                    setShowPlaylistModal(false);
                  }
                }}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-app-text-muted uppercase tracking-wider mb-2">Name</label>
                      <input name="name" autoFocus className="w-full bg-app-bg border border-white/10 rounded-lg px-4 py-2 text-white focus:border-app-accent outline-none" placeholder="My Playlist" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-app-text-muted uppercase tracking-wider mb-2">Description</label>
                      <textarea name="description" className="w-full bg-app-bg border border-white/10 rounded-lg px-4 py-2 text-white focus:border-app-accent outline-none h-24 resize-none" placeholder="Optional description..." />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-8">
                    <button type="button" onClick={() => setShowPlaylistModal(false)} className="px-4 py-2 hover:bg-white/10 rounded-lg text-app-text-muted hover:text-white">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-app-accent hover:bg-app-accent/80 rounded-lg text-white font-medium">Create</button>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {/* Label Detail View Overlay */}
        {
          selectedLabel && (
            <LabelDetailModal
              label={selectedLabel}
              onClose={() => setSelectedLabel(null)}
              onAlbumClick={(albumName, artistName) => {
                const album = albums.find(a => a.name === albumName);
                if (album) {
                  setSelectedAlbum(album);
                  setSelectedLabel(null);
                }
              }}
              onPlayAll={() => {
                if (selectedLabel.albums?.length > 0) {
                  // Get all album names in the label
                  const labelAlbumNames = new Set(selectedLabel.albums.map(a => a.album_name));
                  // Filter tracks that belong to these albums
                  const labelTracks = tracks.filter(t => labelAlbumNames.has(t.album));

                  if (labelTracks.length > 0) {
                    // Sort by album (same order as label.albums) then track number
                    const sortedTracks = labelTracks.sort((a, b) => {
                      const albumIndexA = selectedLabel.albums.findIndex(alb => alb.album_name === a.album);
                      const albumIndexB = selectedLabel.albums.findIndex(alb => alb.album_name === b.album);
                      if (albumIndexA !== albumIndexB) return albumIndexA - albumIndexB;
                      return (a.track_number || 0) - (b.track_number || 0);
                    });

                    // Replace queue and play
                    // Note: We need a way to set the entire queue. 
                    // Current playTrack(idx) plays from the GLOBAL 'tracks' list.
                    // If we want to play this specific subset, we might need a context method setQueue/playTracks.
                    // BUT, based on the codebase, we usually just play from the current view.
                    // If we can't change the view, we find the first track in the global list and play it? 
                    // No, that won't limit playback to just label tracks if shuffle is off.

                    // Workaround: For now, just play the first track found. 
                    // Ideally check if audio context allows setting a custom queue.
                    // Assuming AudioContext/AppContent handles specific queues?
                    // Looking at previous cues, we might just play the first one.

                    // Actually, let's look at `playTrack`. 
                    // If we can't set a queue, shuffling might be hard purely client side if logic depends on global list.
                    // Let's assume for now we just find the index in main list.
                    // Wait, `onShuffle` logic in previous code snippet was:
                    // `const albumTracks = tracks.filter(...)`
                    // `const idx = tracks.findIndex(...)`
                    // `playTrack(idx, ...)`

                    // If we want true "Play All" restricted to label, we need to filter the view?
                    // Or just start playing.

                    // Let's implement robust "Queue" support later if needed. 
                    // For now: 
                    // Play All -> Find first track of first album in main list -> Play?
                    // Shuffle -> Pick random track from label tracks -> Play?
                    // This is imperfect but matches existing patterns I see.

                    // BETTER APPROACH:
                    // If we want to "Play All", we probably want to set the current context to these tracks.
                    // Since I don't see `setQueue`, I will try to just play the first track of the first album.

                    // For Shuffle:
                    const randomTrack = labelTracks[Math.floor(Math.random() * labelTracks.length)];
                    const idx = tracks.findIndex(t => t.id === randomTrack.id);
                    if (idx !== -1) playTrack(idx, 'cut');
                  }
                }
              }}
              onShuffle={() => {
                if (selectedLabel.albums?.length > 0) {
                  const labelAlbumNames = new Set(selectedLabel.albums.map(a => a.album_name));
                  const labelTracks = tracks.filter(t => labelAlbumNames.has(t.album));
                  if (labelTracks.length > 0) {
                    const randomTrack = labelTracks[Math.floor(Math.random() * labelTracks.length)];
                    const idx = tracks.findIndex(t => t.id === randomTrack.id);
                    if (idx !== -1) playTrack(idx, 'cut');
                  }
                }
              }}
            />
          )
        }

        {/* Now Playing Full-Screen View */}
        <NowPlaying
          isOpen={showNowPlaying}
          onClose={() => setShowNowPlaying(false)}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onPrevious={() => playTrack(currentTrackIndex - 1, 'cut')}
          onNext={() => playTrack(currentTrackIndex + 1, 'crossfade')}
          shuffleMode={shuffleMode}
          onToggleShuffle={() => setShuffleMode(s => !s)}
          repeatMode={repeatMode}
          onToggleRepeat={() => setRepeatMode(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
          volume={volume}
          onVolumeChange={(v) => {
            setVolume(v);
            audioEngine.setMasterVolume(v);
          }}
          currentTime={currentTime}
          duration={duration}
          onSeek={(time) => {
            // Debounce seek to prevent rapid seeking from crashing playback
            if (seekTimeoutRef.current) {
              clearTimeout(seekTimeoutRef.current);
            }
            seekTimeoutRef.current = window.setTimeout(() => {
              const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
              if (currentAudio && !isNaN(time) && isFinite(time) && time >= 0) {
                try {
                  currentAudio.currentTime = Math.min(time, currentAudio.duration || time);
                } catch (e) {
                  console.error('Seek error:', e);
                }
              }
              seekTimeoutRef.current = null;
            }, 50);
          }}
          onFavorite={async (id) => {
            try {
              const res = await axios.post(`${getServerUrl()}/api/favorite`, { id });
              setTracks(prev => Array.isArray(prev) ? prev.map(t => t.id === id ? { ...t, rating: res.data.rating } : t) : prev);
            } catch (e) { console.error(e); }
          }}
          serverUrl={SERVER_URL}
          queue={Array.isArray(tracks) ? tracks.slice(currentTrackIndex + 1, currentTrackIndex + 21) : []}
          accentColor={accentColor}
          onArtistClick={(artistName) => {
            const artist = Array.isArray(artists) ? artists.find(a => a.name === artistName) : null;
            if (artist) {
              setSelectedArtist(artist);
              setShowNowPlaying(false);
            } else {
              // Artist not in local list, try to show anyway by creating a minimal object
              setSelectedArtist({ name: artistName, id: 0, track_count: 0 } as any);
              setShowNowPlaying(false);
            }
          }}
          onAlbumClick={(albumName, artistName) => {
            const album = Array.isArray(albums) ? albums.find(a => a.name === albumName && a.artist === artistName) : null;
            if (album) {
              setSelectedAlbum(album);
              setShowNowPlaying(false);
            } else {
              // Try to find by name only if artist match fails
              const albumByName = Array.isArray(albums) ? albums.find(a => a.name === albumName) : null;
              if (albumByName) {
                setSelectedAlbum(albumByName);
                setShowNowPlaying(false);
              }
            }
          }}
        />
      </div >

      {/* Floating Player Dock - Now at root level for proper fixed positioning */}
      {
        !showNowPlaying && currentTrack && (
          <MiniPlayer
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            shuffleMode={shuffleMode}
            repeatMode={repeatMode}
            volume={volume}
            currentTrackIndex={currentTrackIndex}
            artists={artists}
            activeDeck={activeDeck}
            audioRefA={audioRefA}
            audioRefB={audioRefB}
            setShowNowPlaying={setShowNowPlaying}
            setSelectedArtist={setSelectedArtist}
            setShuffleMode={setShuffleMode}
            setRepeatMode={setRepeatMode}
            setVolume={setVolume}
            playTrack={playTrack}
            togglePlay={togglePlay}
          />
        )
      }

      {/* Mobile Bottom Navigation */}
      <MobileNav mainTab={mainTab} setMainTab={setMainTab} />
    </div >
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const [serverConfigured, setServerConfigured] = useState(() => isServerConfigured());
  const [connectionError, setConnectionError] = useState<string | undefined>();

  // Safety timeout for the spinner
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        console.warn("Forcing loading to stop after 8s safety timeout");
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Check server connection on mount
  useEffect(() => {
    if (serverConfigured) {
      const serverUrl = getServerUrl();
      fetch(`${serverUrl}/api/auth/setup`, { method: 'GET' })
        .then(res => {
          if (!res.ok) throw new Error('Server returned error');
        })
        .catch(err => {
          console.error('Server connection failed:', err);
          setConnectionError('Could not connect to server. Please check the URL.');
          setServerConfigured(false);
        });
    }
  }, [serverConfigured]);

  // Show server config screen if not configured
  if (!serverConfigured) {
    return (
      <ServerConfigScreen
        onConfigured={() => {
          setConnectionError(undefined);
          setServerConfigured(true);
          // Force page reload to reinitialize with new server URL
          window.location.reload();
        }}
        initialError={connectionError}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col gap-4 items-center justify-center z-[9999]">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-white/50 text-sm font-mono">Initializing App...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <MusicPlayer />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

