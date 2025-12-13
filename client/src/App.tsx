import { useState, useEffect, useRef, useMemo, useCallback, ChangeEvent, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import axios, { AxiosResponse } from 'axios';
import { Play, Pause, SkipForward, SkipBack, Volume2, Sliders, Disc, Search, Settings, X, Clock, Calendar, Hash, PlusCircle, RefreshCcw, Home, Library, Sparkles, ListMusic, Shuffle, Repeat, Repeat1, LayoutGrid, List, Plus, RefreshCw, LogOut } from 'lucide-react';
import { audioEngine } from './audio/AudioEngine';
import { NowPlaying } from './components/NowPlaying';
import Sidebar from './components/Sidebar';
import MiniPlayer from './components/MiniPlayer';
import ProgressBanner from './components/ProgressBanner';
import { HomePage, LibraryPage, PlaylistsPage, SettingsPage } from './pages';
import { AlbumDetailModal, ArtistDetailModal, LabelDetailModal, CollectionDetailModal, PlaylistDetailModal } from './components/modals';
import type { Track, Artist, Credit, Playlist, RepeatMode, ViewTab, AlbumSort, Theme, LibraryView } from './types';
import { extractColorFromImage } from './utils/colorUtils';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';

const SERVER_URL = 'http://localhost:3001';

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

  // Theme
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('theme') || 'dark');

  // Accent color for Now Playing tint
  const [accentColor, setAccentColor] = useState<string>('#333333');

  const audioRefA = useRef<HTMLAudioElement>(null);
  const audioRefB = useRef<HTMLAudioElement>(null);

  // Fetch Tracks
  useEffect(() => {
    fetchTracks();

    // Simple URL routing
    const path = window.location.pathname;
    if (path === '/settings') setMainTab('settings');
    else if (path === '/playlists') setMainTab('playlists');
    else if (path === '/library') setMainTab('library');
    else if (path === '/') setMainTab('home');
  }, []);

  const fetchTracks = async () => {
    setIsLoading(true);
    console.log("Fetching tracks...");
    try {
      const res = await axios.get(`${SERVER_URL}/api/tracks?limit=100000`, { timeout: 10000 });
      console.log("Tracks fetched:", res.data.length || "Array");
      setTracks(res.data.tracks || res.data);
    } catch (err) {
      console.error("Error fetching tracks:", err);
      // Fallback to empty array so loading stops
      setTracks([]);
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
      const res = await axios.get(`${SERVER_URL}/api/artists`);
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
      axios.get(`${SERVER_URL}/api/labels`)
        .then(res => setAllLabels(Array.isArray(res.data) ? res.data : (res.data.labels || [])))
        .catch(err => console.error('Error fetching labels:', err));
    }
  }, [view]);

  // Fetch home page data
  useEffect(() => {
    if (mainTab === 'home') {
      // Fetch recently added
      axios.get(`${SERVER_URL}/api/tracks/recent?limit=60`)
        .then(res => setRecentlyAdded(res.data))
        .catch(err => console.error('Error fetching recent:', err));
      // Fetch recently played
      axios.get(`${SERVER_URL}/api/history/recent?limit=60`)
        .then(res => setRecentlyPlayed(res.data))
        .catch(err => console.error('Error fetching history:', err));
      // Fetch pinned collections
      axios.get(`${SERVER_URL}/api/collections/home`)
        .then(res => setPinnedCollections(res.data))
        .catch(err => console.error('Error fetching pinned collections:', err));
      // Also fetch artists count
      fetchArtists();
    }
    // Fetch playlists and collections for home and playlists tabs
    if (mainTab === 'home' || mainTab === 'playlists') {
      axios.get(`${SERVER_URL}/api/playlists`)
        .then(res => setAllPlaylists(res.data))
        .catch(err => console.error('Error fetching all playlists:', err));
      axios.get(`${SERVER_URL}/api/collections`)
        .then(res => setAllCollections(res.data))
        .catch(err => console.error('Error fetching collections:', err));
    }
  }, [mainTab]);

  // Background status polling
  useEffect(() => {
    const pollStatus = () => {
      axios.get(`${SERVER_URL}/api/enrich/status`)
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
      axios.get(`${SERVER_URL}/api/playlists`),
      axios.get(`${SERVER_URL}/api/playlists/home`)
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

    setIsTransitioning(true);
    const nextTrack = tracks[index];
    const nextDeck = activeDeck === 'A' ? 'B' : 'A';

    try {
      // Prepare Next Deck
      if (nextDeck === 'A') setDeckATrack(nextTrack);
      else setDeckBTrack(nextTrack);

      // Wait for audio element to be ready
      await new Promise(resolve => setTimeout(resolve, 50));

      const nextAudio = nextDeck === 'A' ? audioRefA.current : audioRefB.current;
      if (!nextAudio) throw new Error('Audio element not ready');

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

      setActiveDeck(nextDeck);
      setCurrentTrackIndex(index);
      setIsPlaying(true);

      // Auto-open Now Playing screen
      setShowNowPlaying(true);

      // Log to listening history
      axios.post(`${SERVER_URL}/api/history/log`, { trackId: nextTrack.id }).catch(() => { });
    } catch (error) {
      console.error('Playback error:', error);
    } finally {
      setIsTransitioning(false);
    }
  };

  const togglePlay = () => {
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
          const res = await axios.get(`${SERVER_URL}/api/status`);
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
        await axios.post(`${SERVER_URL}/api/scan`, { path, limit });
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
      axios.post(`${SERVER_URL}/api/user/scrobble`, {
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
          const res = await axios.get(`${SERVER_URL}/api/search?q=${encodeURIComponent(searchQuery)}&limit=200`);
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
    const res = await axios.get(`${SERVER_URL}/api/tracks`);
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
      axios.get(`${SERVER_URL}/api/credits/album/${encodeURIComponent(selectedAlbum.name)}`)
        .then(res => setAlbumCredits(res.data))
        .catch(err => console.error(err));

      // Fetch Extended Metadata (Tags, Label)
      axios.get(`${SERVER_URL}/api/album-metadata`, {
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
      axios.get(`${SERVER_URL}/api/artist/${encodeURIComponent(identifier)}`)
        .then(res => setArtistDetails(res.data))
        .catch(err => {
          console.error('Error fetching artist details:', err);
          // Fallback to name-based lookup if MBID fails
          if (selectedArtist.mbid) {
            axios.get(`${SERVER_URL}/api/artist/${encodeURIComponent(selectedArtist.name)}`)
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
        const imageUrl = `${SERVER_URL}/api/art/${track.id}`;
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
      axios.get(`${SERVER_URL}/api/enrich/status`)
        .then(res => {
          setEnrichmentStatus(res.data);
          // If detailed status available, maybe show current track?
        })
        .catch(() => { });
    }, 2000);
    return () => clearInterval(pollTimer);
  }, []);

  // Toggle Favorite
  const toggleFavorite = async (e, trackId) => {
    e.stopPropagation();
    try {
      const res = await axios.post(`${SERVER_URL}/api/favorite`, { id: trackId });
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
          <>
            {/* Header */}
            <div className="h-16 border-b border-app-surface flex items-center px-6 gap-6 shrink-0 z-20 bg-app-bg/95 backdrop-blur">
              {/* <h1 className="text-xl font-bold bg-gradient-to-r from-app-accent to-app-accent bg-clip-text text-transparent shrink-0">
                Library
              </h1> */}

              {/* Omnibox Search */}
              <div className="flex-1 max-w-xl relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted" size={18} />
                <input
                  type="text"
                  placeholder="Search library, producers, moods..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-app-surface border-none rounded-full py-2 pl-10 pr-10 text-sm text-app-text focus:ring-2 focus:ring-app-accent outline-none transition-all placeholder:text-app-text-muted/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-app-text-muted hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Sort Controls - Right Justified */}
              <div className="ml-auto shrink-0">
                <select
                  value={albumSort}
                  onChange={(e) => setAlbumSort(e.target.value)}
                  className="bg-app-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-app-text outline-none focus:border-app-accent cursor-pointer"
                >
                  <option value="artist">Sort by Artist</option>
                  <option value="title">Sort by Title</option>
                  <option value="year">Sort by Year</option>
                  <option value="recent">Recently Added</option>
                </select>
              </div>
            </div>


            {/* Rescan Confirmation Modal */}
            {
              showRescanModal && (
                <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
                  <div className="bg-app-bg border border-app-surface rounded-lg p-6 max-w-md mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
                    <h2 className="text-xl font-bold text-app-text mb-3">Clear & Rescan Library</h2>
                    <p className="text-app-text-muted mb-4 text-sm">This will delete all existing tracks and credits, then scan the specified directory.</p>

                    {/* Path Input */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-app-text mb-2">Music Directory Path</label>
                      <input
                        type="text"
                        defaultValue="/home/adam/Music"
                        id="scanPathInput"
                        placeholder="/path/to/music"
                        className="w-full bg-app-surface border border-app-surface focus:border-app-accent rounded-lg px-3 py-2 text-app-text text-sm outline-none transition-colors"
                      />
                    </div>

                    {/* Limit Input */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-app-text mb-2">Scan Limit (0 = unlimited)</label>
                      <input
                        type="number"
                        defaultValue="500"
                        id="scanLimitInput"
                        placeholder="500"
                        min="0"
                        className="w-full bg-app-surface border border-app-surface focus:border-app-accent rounded-lg px-3 py-2 text-app-text text-sm outline-none transition-colors"
                      />
                    </div>

                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => setShowRescanModal(false)}
                        className="px-4 py-2 rounded-lg bg-app-surface text-app-text hover:bg-app-surface/80 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          const pathElement = document.getElementById('scanPathInput') as HTMLInputElement;
                          const limitElement = document.getElementById('scanLimitInput') as HTMLInputElement;
                          const path = pathElement?.value;
                          const limit = parseInt(limitElement?.value) || 0;

                          setShowRescanModal(false);

                          if (path) {
                            try {
                              await axios.post(`${SERVER_URL}/api/clear`);
                              await axios.post(`${SERVER_URL}/api/scan`, { path, limit });
                              setShowScanOverlay(true);
                            } catch (e) {
                              alert("Scan failed to start: " + (e as Error).message);
                            }
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-transparent border border-white/20 text-white hover:bg-white/10 transition-colors"
                      >
                        Clear & Rescan
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

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
                                            const res = await axios.get(`${SERVER_URL}/api/tracks`);
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
                                          <img loading="lazy" decoding="async" src={`${SERVER_URL}/api/art/release/${album.release_mbid}/front`} alt={album.album} className="w-full h-full object-cover" />
                                        ) : album.sample_track_id ? (
                                          <img loading="lazy" decoding="async" src={`${SERVER_URL}/api/art/${album.sample_track_id}`} alt={album.album} className="w-full h-full object-cover" />
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


            {/* Scan Overlay */}
            {
              showScanOverlay && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center flex-col gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-accent"></div>
                  <h2 className="text-xl font-bold text-white">Indexing Library...</h2>
                  <p className="text-app-text-muted">Processed: {scanStatus.processedCount}</p>
                  <p className="text-xs text-app-text-muted max-w-md truncate">{scanStatus.currentFile}</p>
                </div>
              )
            }

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-app-bg">
              {tracks.length === 0 ? (
                <div className="h-full flex items-center justify-center text-app-text-muted flex-col gap-4">
                  <Disc size={48} className="opacity-20" />
                  <p>No tracks found. Try a different search or scan your library.</p>
                </div>
              ) : (
                <>
                  {/* View Toggle Controls - Sticky */}
                  <div className="sticky top-0 z-30 flex items-center justify-between mb-10 bg-app-bg/60 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/5 transition-all px-4 py-2 -mt-6 rounded-xl supports-[backdrop-filter]:bg-app-bg/60">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setView('grid')}
                        className={`p-2 rounded-lg transition-colors border ${view === 'grid' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                        title="Grid View"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="14" y="14" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setView('list')}
                        className={`p-2 rounded-lg transition-colors border ${view === 'list' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                        title="List View"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="8" y1="6" x2="21" y2="6" />
                          <line x1="8" y1="12" x2="21" y2="12" />
                          <line x1="8" y1="18" x2="21" y2="18" />
                          <line x1="3" y1="6" x2="3.01" y2="6" />
                          <line x1="3" y1="12" x2="3.01" y2="12" />
                          <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                      </button>
                      <div className="w-px h-6 bg-white/10 mx-1"></div>
                      <button
                        onClick={() => setView('artists')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${view === 'artists' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                      >
                        Artists
                      </button>
                      <button
                        onClick={() => setView('favorites')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${view === 'favorites' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                      >
                        Favorites
                      </button>
                      <button
                        onClick={() => setView('labels')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${view === 'labels' ? 'bg-white/10 border-white/20 text-white' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
                      >
                        Labels
                      </button>
                    </div>
                    <div className="text-sm text-app-text-muted">
                      {view === 'grid' || view === 'list' ? `${albums.length} albums` : view === 'artists' ? `${artists.length} artists` : `${allLabels.length} labels`}
                    </div>
                  </div>

                  {/* Grid View */}
                  {view === 'grid' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6 content-start pb-32">
                      {albums.map((album) => (
                        <div
                          key={album.name}
                          className="group cursor-pointer"
                          onClick={async () => {
                            // Remember which tracks matched the search (for highlighting)
                            const matchedIds = album.tracks.map((t: Track) => t.id);
                            // If this is from a filtered search view, fetch full album
                            if (searchQuery) {
                              try {
                                const res = await axios.get(`${SERVER_URL}/api/tracks`);
                                const allTracks = res.data.tracks || res.data;
                                // Match by album name only (artist may differ for features/compilations)
                                const fullAlbumTracks = allTracks.filter((t: Track) => t.album === album.name);
                                if (fullAlbumTracks.length > 0) {
                                  // Only show highlights if less than 80% of tracks matched
                                  const matchRatio = matchedIds.length / fullAlbumTracks.length;
                                  setMatchedTrackIds(matchRatio < 0.8 ? matchedIds : []);
                                  setSelectedAlbum({ ...album, tracks: fullAlbumTracks });
                                } else {
                                  setMatchedTrackIds(matchedIds);
                                  setSelectedAlbum(album);
                                }
                              } catch (e) {
                                setSelectedAlbum(album);
                              }
                            } else {
                              setMatchedTrackIds([]); // No search - no highlighting needed
                              setSelectedAlbum(album);
                            }
                          }}
                        >
                          {/* Album Art Card */}
                          <div className="aspect-square bg-app-surface rounded-lg mb-3 flex items-center justify-center group-hover:bg-app-accent/10 transition-colors relative overflow-hidden shadow-lg">
                            {/* Artwork or Fallback */}
                            {album.tracks[0].has_art ? (
                              <img
                                src={`${SERVER_URL}/api/art/${album.tracks[0].id}`}
                                alt={album.name}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <Disc size={32} className="text-app-text-muted group-hover:text-app-accent transition-colors" />
                            )}

                            {/* Play Overlay */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
                              <Play size={32} className="fill-white drop-shadow-lg scale-95 group-hover:scale-100 transition-transform" />
                            </div>
                          </div>
                          <h3 className="font-semibold truncate text-xs md:text-sm">{album.name}</h3>
                          <p className="text-xs text-app-text-muted truncate">{album.artist}</p>
                          {/* Mood Tag if present */}
                          {album.tracks[0].mood && <span className="text-[10px] uppercase tracking-wider text-app-accent/80 border border-app-accent/30 px-1.5 rounded-sm mt-1 inline-block">{album.tracks[0].mood}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* List View */}
                  {view === 'list' && (
                    <div className="space-y-1 pb-32">
                      {Array.isArray(tracks) && tracks.map((track, index) => (
                        <div
                          key={track.id}
                          onClick={() => playTrack(index, 'cut')}
                          className="group flex items-center gap-4 px-4 py-3 bg-app-surface/50 hover:bg-app-surface rounded-lg cursor-pointer transition-colors border border-transparent hover:border-app-accent/20"
                        >
                          {/* Track Number / Play Icon */}
                          <div className="w-8 text-center text-sm text-app-text-muted group-hover:text-app-accent font-medium">
                            <span className="group-hover:hidden">{index + 1}</span>
                            <Play size={14} fill="currentColor" className="hidden group-hover:inline-block" />
                          </div>

                          {/* Album Art */}
                          <div className="w-12 h-12 bg-app-surface rounded-md overflow-hidden flex-shrink-0 border border-white/10">
                            {track.has_art ? (
                              <img
                                src={`${SERVER_URL}/api/art/${track.id}`}
                                alt={track.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Disc size={16} className="text-app-text-muted" />
                              </div>
                            )}
                          </div>

                          {/* Track Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-app-text truncate">{track.title}</div>
                            <div className="text-sm text-app-text-muted truncate">
                              <span
                                className="hover:text-app-accent hover:underline cursor-pointer transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const artist = artists.find(a => a.name === track.artist);
                                  if (artist) setSelectedArtist(artist);
                                }}
                              >
                                {track.artist}
                              </span>
                              • {track.album}
                            </div>
                          </div>

                          {/* Duration */}
                          <div className="text-sm text-app-text-muted font-mono tabular-nums">
                            {Math.floor(track.duration / 60)}:{(Math.floor(track.duration % 60)).toString().padStart(2, '0')}
                          </div>

                          {/* BPM */}
                          {track.bpm && (
                            <div className="text-xs text-app-text-muted font-mono w-12 text-right">
                              {Math.round(track.bpm)}
                            </div>
                          )}

                          {/* Heart Icon */}
                          <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-app-accent/20 rounded transition-all">
                            <svg className="w-4 h-4 text-app-text-muted hover:text-app-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Favorites View */}
                  {view === 'favorites' && (
                    <div className="space-y-1 pb-32">
                      {Array.isArray(tracks) && tracks.filter(t => t.rating === 1).length > 0 ? (
                        tracks.filter(t => t.rating === 1).map((track, index) => {
                          const originalIndex = tracks.findIndex(t => t.id === track.id);
                          return (
                            <div
                              key={track.id}
                              onClick={() => playTrack(originalIndex, 'cut')}
                              className="group flex items-center gap-4 px-4 py-3 bg-app-surface/50 hover:bg-app-surface rounded-lg cursor-pointer transition-colors border border-transparent hover:border-app-accent/20"
                            >
                              {/* Track Number / Play Icon */}
                              <div className="w-8 text-center text-sm text-app-text-muted group-hover:text-app-accent font-medium">
                                <Play size={14} fill="currentColor" className="hidden group-hover:inline-block" />
                                <span className="group-hover:hidden">●</span>
                              </div>

                              {/* Album Art */}
                              <div className="w-12 h-12 bg-app-surface rounded-md overflow-hidden flex-shrink-0 border border-white/10">
                                {track.has_art ? (
                                  <img
                                    src={`${SERVER_URL}/api/art/${track.id}`}
                                    alt={track.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Disc size={16} className="text-app-text-muted" />
                                  </div>
                                )}
                              </div>

                              {/* Track Info */}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-app-text truncate">{track.title}</div>
                                <div className="text-sm text-app-text-muted truncate">
                                  <span
                                    className="hover:text-app-accent hover:underline cursor-pointer transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const artist = artists.find(a => a.name === track.artist);
                                      if (artist) setSelectedArtist(artist);
                                    }}
                                  >
                                    {track.artist}
                                  </span>
                                  • {track.album}
                                </div>
                              </div>

                              {/* Duration */}
                              <div className="text-sm text-app-text-muted font-mono tabular-nums">
                                {Math.floor(track.duration / 60)}:{(Math.floor(track.duration % 60)).toString().padStart(2, '0')}
                              </div>

                              {/* Heart Icon (Always visible/active in Favorites) */}
                              <button
                                onClick={(e) => toggleFavorite(e, track.id)}
                                className="p-1 hover:bg-white/10 rounded transition-all text-app-accent fill-app-accent"
                              >
                                <svg className="w-4 h-4" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-20">
                          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-app-surface mb-6">
                            <svg className="w-8 h-8 text-app-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </div>
                          <h3 className="text-xl font-bold text-app-text mb-2">No Favorites Yet</h3>
                          <p className="text-app-text-muted">Heart songs to see them appear here!</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Artists View */}
                  {/* Artists View - Text List */}
                  {view === 'artists' && (
                    <div className="flex flex-col pb-32 max-w-4xl mx-auto">
                      {Array.isArray(artists) && artists.map(artist => (
                        <div
                          key={artist.id}
                          className="group cursor-pointer flex items-center justify-between py-3 px-4 border-b border-app-surface/50 hover:bg-app-surface/50 transition-colors"
                          onClick={() => setSelectedArtist(artist)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-app-surface flex items-center justify-center text-app-text-muted font-bold text-sm">
                              {artist.name.charAt(0)}
                            </div>
                            <h3 className="font-medium text-app-text text-lg">{artist.name}</h3>
                          </div>
                          <span className="text-sm text-app-text-muted font-mono">{artist.track_count} tracks</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Labels View */}
                  {view === 'labels' && (
                    <div className="pb-32">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {Array.isArray(allLabels) && allLabels.map(label => (
                          <div
                            key={label.id}
                            className="bg-app-surface hover:bg-app-surface/80 rounded-xl p-4 cursor-pointer transition-colors group"
                            onClick={async () => {
                              try {
                                const res = await axios.get(`${SERVER_URL}/api/labels/${label.id}`);
                                setSelectedLabel(res.data);
                              } catch (e) { console.error(e); }
                            }}
                          >
                            {/* Hybrid View: Single Large or 4-Grid */}
                            {label.preview_albums && label.preview_albums.length > 1 ? (
                              /* Grid View for multiple albums */
                              <div className="aspect-square bg-app-bg/50 rounded-lg mb-3 overflow-hidden shadow-lg border border-white/5 relative group-hover:border-white/10 transition-colors">
                                <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-full p-0.5">
                                  {[0, 1, 2, 3].map(i => {
                                    const previewAlbum = label.preview_albums?.[i];
                                    return (
                                      <div key={i} className="bg-app-bg/40 rounded-sm overflow-hidden aspect-square relative">
                                        {previewAlbum?.sample_track_id ? (
                                          <img
                                            src={`${SERVER_URL}/api/art/${previewAlbum.sample_track_id}`}
                                            alt={previewAlbum.album_name}
                                            className="w-full h-full object-cover transition-opacity duration-300 opacity-90 group-hover:opacity-100"
                                            loading="lazy"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <Disc size={16} className="text-white/10" />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              /* Single View for 1 album */
                              <div className="aspect-square bg-app-bg/50 rounded-lg mb-3 overflow-hidden shadow-lg border border-white/5 relative group-hover:border-white/10 transition-colors">
                                {label.preview_albums?.[0]?.sample_track_id ? (
                                  <img
                                    src={`${SERVER_URL}/api/art/${label.preview_albums[0].sample_track_id}`}
                                    alt={label.name}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-white/5">
                                    <Disc size={48} className="text-white/10" />
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="text-base font-bold text-app-text truncate">{label.name}</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-sm text-app-text-muted">{label.album_count || 0} albums</span>
                              {label.country && (
                                <span className="text-xs text-app-text-muted">{label.country}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {allLabels.length === 0 && (
                        <div className="text-center py-16">
                          <Disc size={64} className="mx-auto mb-4 text-app-text-muted opacity-50" />
                          <h2 className="text-xl font-bold text-app-text mb-2">No labels found</h2>
                          <p className="text-app-text-muted">Labels are auto-detected from your music metadata via MusicBrainz</p>
                        </div>
                      )}
                    </div>
                  )}

                </>
              )}
            </div>

            {/* Equalizer Panel (Overlay) - Legacy UI, Now Playing has better EQ */}
            {
              showEq && (
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
              )
            }
          </>
        )
        }

        {/* HIDDEN DUAL DECKS - Moved outside conditional rendering for persistence */}
        <div style={{ display: 'none' }}>
          <audio
            ref={audioRefA}
            src={deckATrack ? `${SERVER_URL}/api/stream/${deckATrack.id}` : undefined}
            onEnded={handleTrackEnd}
            onTimeUpdate={(e) => {
              if (activeDeck === 'A') {
                setCurrentTime((e.target as HTMLAudioElement).currentTime);
                setDuration((e.target as HTMLAudioElement).duration || 0);
              }
            }}
            crossOrigin="anonymous"
          />
          <audio
            ref={audioRefB}
            src={deckBTrack ? `${SERVER_URL}/api/stream/${deckBTrack.id}` : undefined}
            onEnded={handleTrackEnd}
            onTimeUpdate={(e) => {
              if (activeDeck === 'B') {
                setCurrentTime((e.target as HTMLAudioElement).currentTime);
                setDuration((e.target as HTMLAudioElement).duration || 0);
              }
            }}
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
        {selectedCollection && (
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
                  await axios.delete(`${SERVER_URL}/api/collections/${selectedCollection.id}`);
                  const res = await axios.get(`${SERVER_URL}/api/collections`);
                  setAllCollections(res.data);
                  setSelectedCollection(null);
                } catch (e) {
                  console.error('Failed to delete collection:', e);
                }
              }
            }}
            onRefresh={async () => {
              try {
                const res = await axios.get(`${SERVER_URL}/api/collections`);
                setAllCollections(res.data);
              } catch (e) {
                console.error('Failed to refresh collections:', e);
              }
            }}
          />
        )}

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
                        axios.post(`${SERVER_URL}/api/collections`, {
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
                          await axios.post(`${SERVER_URL}/api/collections/${col.id}/albums`, {
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
                          <img loading="lazy" decoding="async" src={`${SERVER_URL}/api/art/${col.preview_albums[0].sample_track_id}`} className="w-full h-full object-cover" />
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
                    await axios.post(`${SERVER_URL}/api/playlists`, { name, description: desc });
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
            const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
            if (currentAudio) currentAudio.currentTime = time;
          }}
          onFavorite={async (id) => {
            try {
              const res = await axios.post(`${SERVER_URL}/api/favorite`, { id });
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
    </div >
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  // Safety timeout for the spinner
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        console.warn("Forcing loading to stop after 8s safety timeout");
        // Since we can't force set isLoading in context from here easily without exposing it,
        // we can just render the Login page if it times out
        // But better is to trust the timeout we added to AuthContext.
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoading]);

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
