import { useState, useEffect, useRef, useMemo, useCallback, ChangeEvent, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import axios, { AxiosResponse } from 'axios';
import { Play, Pause, SkipForward, SkipBack, Volume2, Sliders, Disc, Search, Settings, X, Clock, Calendar, Hash, PlusCircle, RefreshCcw, Home, Library, Sparkles, ListMusic, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import { audioEngine } from './audio/AudioEngine';
import { NowPlaying } from './components/NowPlaying';
import type { Track, Artist, Credit, Playlist, RepeatMode, ViewTab, AlbumSort, Theme } from './types';
import { extractColorFromImage } from './utils/colorUtils';

const SERVER_URL = 'http://localhost:3001';

// Local types for UI state
interface Album {
  name: string;
  artist: string;
  tracks: Track[];
  year: number | null;
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
type LibraryView = 'grid' | 'list' | 'artists';
type MainTab = 'home' | 'library' | 'settings';
type ActiveTab = 'tracks' | 'credits' | 'discography';

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
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
  }, []);

  const fetchTracks = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${SERVER_URL}/api/tracks?limit=10000`);
      setTracks(res.data.tracks || res.data);
    } catch (err) {
      console.error("Error fetching tracks:", err);
    } finally {
      setIsLoading(false);
    }
  };

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
  }, [view]);

  // Fetch home page data
  useEffect(() => {
    if (mainTab === 'home') {
      // Fetch recently added
      axios.get(`${SERVER_URL}/api/tracks/recent?limit=10`)
        .then(res => setRecentlyAdded(res.data))
        .catch(err => console.error('Error fetching recent:', err));
      // Fetch recently played
      axios.get(`${SERVER_URL}/api/history/recent?limit=10`)
        .then(res => setRecentlyPlayed(res.data))
        .catch(err => console.error('Error fetching history:', err));
      // Fetch featured playlists
      axios.get(`${SERVER_URL}/api/playlists/featured`)
        .then(res => setFeaturedPlaylists(res.data))
        .catch(err => console.error('Error fetching playlists:', err));
      // Also fetch artists count
      fetchArtists();
    }
  }, [mainTab]);

  // Theme persistence
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Album sorting
  const [albumSort, setAlbumSort] = useState('artist'); // 'artist' | 'title' | 'year' | 'recent'

  // Group Tracks by Album (rudimentary grouping)
  const albums = useMemo((): Album[] => {
    if (!Array.isArray(tracks)) return [];

    const groups: Record<string, Album> = {};
    tracks.forEach(track => {
      const key = track.album || 'Unknown Album';
      if (!groups[key]) groups[key] = { name: key, artist: track.artist, tracks: [], year: track.year };
      groups[key].tracks.push(track);
      // Use most recent year from tracks
      if (track.year && (!groups[key].year || track.year > groups[key].year)) {
        groups[key].year = track.year;
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

  // Handle Playback & Crossfading
  const playTrack = async (index, transition = 'cut') => {
    if (!Array.isArray(tracks) || index < 0 || index >= tracks.length) return;

    const nextTrack = tracks[index];
    const nextDeck = activeDeck === 'A' ? 'B' : 'A';

    // Prepare Next Deck
    if (nextDeck === 'A') setDeckATrack(nextTrack);
    else setDeckBTrack(nextTrack);

    // Wait for React to render the new src (microtask/render cycle)
    // In a real app we'd wait for 'canplay' event.
    setTimeout(async () => {
      const nextAudio = nextDeck === 'A' ? audioRefA.current : audioRefB.current;

      if (transition === 'crossfade') {
        await nextAudio.play();
        audioEngine.crossfadeTo(nextDeck);
      } else {
        // Hard Cut
        // Stop current
        const currentAudio = activeDeck === 'A' ? audioRefA.current : audioRefB.current;
        currentAudio.pause();
        currentAudio.currentTime = 0;
        // Play next
        // Quick fade helper could go here, but for now strict cut
        audioEngine.decks[activeDeck].gain.gain.value = 0;
        audioEngine.decks[nextDeck].gain.gain.value = 1;
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
    }, 100);
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
      // Pick random track
      nextIndex = Math.floor(Math.random() * tracks.length);
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
          const res = await axios.get(`${SERVER_URL}/api/search?q=${encodeURIComponent(searchQuery)}`);
          setTracks(res.data.tracks || res.data);
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
      <div className="w-16 bg-app-bg border-r border-app-surface flex flex-col items-center py-6 gap-6 shrink-0">
        <button
          onClick={() => setMainTab('home')}
          className={`p-3 rounded-xl transition-all border ${mainTab === 'home' ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
          title="Home"
        >
          <Home size={22} />
        </button>
        <button
          onClick={() => setMainTab('library')}
          className={`p-3 rounded-xl transition-all border ${mainTab === 'library' ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
          title="Library"
        >
          <Library size={22} />
        </button>
        <button
          onClick={() => setMainTab('settings')}
          className={`p-3 rounded-xl transition-all border ${mainTab === 'settings' ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'border-transparent text-app-text-muted hover:text-white hover:bg-white/5'}`}
          title="Settings"
        >
          <Settings size={22} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ===== HOME PAGE ===== */}
        {mainTab === 'home' && (
          <div className="flex-1 overflow-y-auto p-8 bg-app-bg">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-serif font-bold text-app-text mb-8">
                Your Library
              </h1>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-6 mb-12">
                <div className="bg-app-surface rounded-xl p-6 text-center">
                  <div className="text-3xl font-bold text-app-accent mb-2">{tracks.length}</div>
                  <div className="text-sm text-app-text-muted">Tracks</div>
                </div>
                <div className="bg-app-surface rounded-xl p-6 text-center">
                  <div className="text-3xl font-bold text-app-accent mb-2">{albums.length}</div>
                  <div className="text-sm text-app-text-muted">Albums</div>
                </div>
                <div className="bg-app-surface rounded-xl p-6 text-center">
                  <div className="text-3xl font-bold text-app-accent mb-2">{artists.length}</div>
                  <div className="text-sm text-app-text-muted">Artists</div>
                </div>
              </div>

              {/* Mood Discovery */}
              <h2 className="text-xl font-bold text-app-text mb-4">Mood Discovery</h2>
              <div className="flex gap-4 mb-12">
                {['Energy', 'Chill', 'Focus', 'Party', 'Dark'].map(m => (
                  <button
                    key={m}
                    onClick={() => {
                      handleMoodSelect(m);
                      setMainTab('library');
                    }}
                    className="flex-1 bg-app-surface hover:bg-app-accent/20 border border-app-surface hover:border-app-accent rounded-xl p-6 text-center transition-all"
                  >
                    <Sparkles size={24} className="mx-auto mb-2 text-app-accent" />
                    <div className="font-medium text-app-text">{m}</div>
                  </button>
                ))}
              </div>

              {/* Quick Actions */}
              <h2 className="text-xl font-bold text-app-text mb-4">Quick Actions</h2>
              <div className="flex gap-4">
                <button
                  onClick={() => setMainTab('library')}
                  className="flex-1 bg-app-surface hover:bg-app-surface/80 rounded-xl p-6 flex items-center gap-4 transition-colors"
                >
                  <ListMusic size={24} className="text-app-accent" />
                  <div className="text-left">
                    <div className="font-medium text-app-text">Browse Library</div>
                    <div className="text-sm text-app-text-muted">Explore your collection</div>
                  </div>
                </button>
                <button
                  onClick={() => setMainTab('settings')}
                  className="flex-1 bg-app-surface hover:bg-app-surface/80 rounded-xl p-6 flex items-center gap-4 transition-colors"
                >
                  <Settings size={24} className="text-app-accent" />
                  <div className="text-left">
                    <div className="font-medium text-app-text">Settings</div>
                    <div className="text-sm text-app-text-muted">Manage your library</div>
                  </div>
                </button>
              </div>

              {/* Recently Added */}
              {recentlyAdded.length > 0 && (
                <div className="mt-12">
                  <h2 className="text-xl font-bold text-app-text mb-4">Recently Added</h2>
                  <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {recentlyAdded.map(track => (
                      <div
                        key={track.id}
                        className="shrink-0 w-40 cursor-pointer group"
                        onClick={() => {
                          if (Array.isArray(tracks)) {
                            const idx = tracks.findIndex(t => t.id === track.id);
                            if (idx !== -1) playTrack(idx, 'cut');
                          }
                        }}
                      >
                        <div className="aspect-square bg-app-surface rounded-lg mb-2 overflow-hidden">
                          {track.has_art ? (
                            <img src={`${SERVER_URL}/api/art/${track.id}`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Disc className="text-app-text-muted" /></div>
                          )}
                        </div>
                        <div className="text-sm font-medium text-app-text truncate">{track.title}</div>
                        <div className="text-xs text-app-text-muted truncate">{track.artist}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recently Played */}
              {recentlyPlayed.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-xl font-bold text-app-text mb-4">Recently Played</h2>
                  <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {recentlyPlayed.map((track, i) => (
                      <div
                        key={`${track.id}-${i}`}
                        className="shrink-0 w-40 cursor-pointer group"
                        onClick={() => {
                          if (!Array.isArray(tracks)) return;
                          const idx = tracks.findIndex(t => t.id === track.id);
                          if (idx !== -1) {
                            playTrack(idx, 'cut');
                            setShowNowPlaying(true);
                          }
                        }}
                      >
                        <div className="aspect-square bg-app-surface rounded-lg mb-2 overflow-hidden">
                          {track.has_art ? (
                            <img src={`${SERVER_URL}/api/art/${track.id}`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Disc className="text-app-text-muted" /></div>
                          )}
                        </div>
                        <div className="text-sm font-medium text-app-text truncate">{track.title}</div>
                        <div className="text-xs text-app-text-muted truncate">{track.artist}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Featured Playlists */}
              {featuredPlaylists.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-xl font-bold text-app-text mb-4">Featured Playlists</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {featuredPlaylists.map(pl => (
                      <div
                        key={pl.id}
                        className="bg-app-surface hover:bg-app-surface/80 rounded-xl p-6 cursor-pointer transition-colors"
                      >
                        <div className="text-lg font-bold text-app-text mb-1">{pl.name}</div>
                        <div className="text-sm text-app-text-muted">{pl.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== SETTINGS PAGE ===== */}
        {mainTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-8 bg-app-bg">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-3xl font-bold text-app-text mb-8">Settings</h1>

              {/* Library Management */}
              <div className="bg-app-surface rounded-xl p-6 mb-6">
                <h2 className="text-lg font-bold text-app-text mb-4">Library Management</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-app-text mb-2">Music Directory</label>
                    <input
                      type="text"
                      defaultValue="/home/adam/Music"
                      id="settingsScanPath"
                      className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-3 text-app-text outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-app-text mb-2">Scan Limit (0 = unlimited)</label>
                    <input
                      type="number"
                      defaultValue="500"
                      id="settingsScanLimit"
                      min="0"
                      className="w-full bg-app-bg border border-app-surface focus:border-app-accent rounded-lg px-4 py-3 text-app-text outline-none transition-colors"
                    />
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={async () => {
                        const pathElement = document.getElementById('settingsScanPath') as HTMLInputElement;
                        const limitElement = document.getElementById('settingsScanLimit') as HTMLInputElement;
                        const path = pathElement?.value;
                        const limit = parseInt(limitElement?.value) || 0;
                        if (path) {
                          try {
                            await axios.post(`${SERVER_URL}/api/clear`);
                            await axios.post(`${SERVER_URL}/api/scan`, { path, limit });
                            setShowScanOverlay(true);
                          } catch (e) {
                            alert("Scan failed: " + (e as Error).message);
                          }
                        }
                      }}
                      className="flex-1 bg-transparent border border-white/20 hover:bg-white/10 text-white rounded-lg py-3 font-medium transition-colors"
                    >
                      <RefreshCcw size={16} className="inline mr-2" />
                      Rescan Library
                    </button>
                  </div>
                </div>
              </div>

              {/* Enrichment */}
              <div className="bg-app-surface rounded-xl p-6 mb-6">
                <h2 className="text-lg font-bold text-app-text mb-4">Metadata Enrichment</h2>
                <p className="text-sm text-app-text-muted mb-4">
                  Fetch additional metadata from MusicBrainz, Last.fm, and Wikipedia.
                </p>
                <button
                  onClick={async () => {
                    try {
                      await axios.post(`${SERVER_URL}/api/enrich`);
                      alert("Enrichment started in background!");
                    } catch (e) {
                      alert("Failed: " + e.message);
                    }
                  }}
                  className="bg-transparent border border-white/20 hover:bg-white/10 text-white rounded-lg px-6 py-3 font-medium transition-colors"
                >
                  Start Enrichment
                </button>
              </div>

              {/* Theme */}
              <div className="bg-app-surface rounded-xl p-6 mb-6">
                <h2 className="text-lg font-bold text-app-text mb-4">Appearance</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-app-text">Theme</div>
                    <div className="text-xs text-app-text-muted">Switch between dark and light mode</div>
                  </div>
                  <button
                    onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                    className={`relative w-14 h-7 rounded-full transition-colors border ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-gray-300 border-transparent'}`}
                  >
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${theme === 'light' ? 'translate-x-7' : ''}`} />
                  </button>
                </div>
              </div>

              {/* About */}
              <div className="bg-app-surface rounded-xl p-6">
                <h2 className="text-lg font-bold text-app-text mb-2">About OpenStream</h2>
                <p className="text-sm text-app-text-muted">
                  A modern, open-source music streaming application for your local library.
                </p>
              </div>
            </div>
          </div>
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

              {/* Curation / Moods */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mask-linear-fade">
                {['Energy', 'Chill', 'Focus', 'Party', 'Dark'].map(m => (
                  <button
                    key={m}
                    onClick={() => handleMoodSelect(moodFilter === m ? '' : m)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all whitespace-nowrap ${moodFilter === m
                      ? 'bg-white text-black border-white font-medium'
                      : 'border-white/20 hover:border-white text-app-text-muted hover:text-white bg-transparent'
                      }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="flex gap-4 shrink-0">
                <button
                  onClick={() => setShowRescanModal(true)}
                  className="p-2 hover:bg-app-surface rounded-full text-app-text-muted hover:text-white"
                  title="Rescan / Settings"
                >
                  <Settings size={20} />
                </button>
              </div>
            </div>


            {/* Rescan Confirmation Modal */}
            {showRescanModal && (
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
            )}

            {/* Artist Detail Overlay */}
            {selectedArtist && artistDetails && (
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
                                    onClick={() => {
                                      const target = albums.find(a => a.name === album.album);
                                      if (target) {
                                        setSelectedArtist(null);
                                        setSelectedAlbum(target);
                                      }
                                    }}
                                  >
                                    <div className="aspect-square bg-app-surface rounded-lg mb-3 overflow-hidden shadow-lg group-hover:scale-105 transition-transform">
                                      {album.art_path ? (
                                        <img src={`${SERVER_URL}/api/art/release/${album.release_mbid}/front`} alt={album.album} className="w-full h-full object-cover" />
                                      ) : album.sample_track_id ? (
                                        <img src={`${SERVER_URL}/api/art/${album.sample_track_id}`} alt={album.album} className="w-full h-full object-cover" />
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
            )}

            {/* Detail View Overlay - Dark Theme */}
            {selectedAlbum && (
              <div className="fixed inset-0 z-[100] bg-app-bg text-app-text overflow-y-auto animate-in fade-in duration-200 custom-scrollbar">

                {/* Header Bar */}
                <div className="sticky top-0 z-50 bg-app-bg border-b border-app-surface px-6 py-4 flex items-center justify-between">
                  <button
                    onClick={() => setSelectedAlbum(null)}
                    className="p-2 hover:bg-app-surface rounded-full transition-colors"
                  >
                    <X size={20} className="text-app-text-muted" />
                  </button>
                  <div className="flex items-center gap-2 text-sm text-app-text-muted">
                    {/* Breadcrumb or additional controls could go here */}
                  </div>
                </div>

                {/* Main Content Container */}
                <div className="max-w-5xl mx-auto px-8 py-12">

                  {/* Hero Section */}
                  <div className="flex flex-col md:flex-row gap-8 mb-8">

                    {/* Album Artwork - Fixed 320px */}
                    {/* Album Artwork - Fixed 320px with Flip Effect */}
                    <div className="shrink-0 perspective-[1000px]">
                      <div
                        className={`w-64 h-64 relative transition-transform duration-700 [transform-style:preserve-3d] ${albumMetadata?.images?.find(i => i.type === 'back') ? 'cursor-pointer' : ''} ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
                        onClick={() => albumMetadata?.images?.find(i => i.type === 'back') && setIsFlipped(!isFlipped)}
                      >
                        {/* Front Face */}
                        <div className="absolute inset-0 [backface-visibility:hidden] rounded-sm overflow-hidden shadow-lg bg-app-surface">
                          {selectedAlbum.tracks[0].has_art ? (
                            <img
                              src={`${SERVER_URL}/api/art/${selectedAlbum.tracks[0].id}`}
                              alt={selectedAlbum.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Disc size={64} className="text-app-text-muted" />
                            </div>
                          )}

                          {/* Hint to flip if back art exists */}
                          {albumMetadata?.images?.find(i => i.type === 'back') && (
                            <div className="absolute bottom-2 right-2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors" title="View Back Cover">
                              <RefreshCcw size={14} />
                            </div>
                          )}
                        </div>

                        {/* Back Face */}
                        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-sm overflow-hidden shadow-lg bg-app-surface border border-app-surface">
                          {albumMetadata?.images?.find(i => i.type === 'back') ? (
                            <img
                              src={`${SERVER_URL}/api/art/release/${albumMetadata.release.mbid}/back`}
                              alt="Back Cover"
                              className="w-full h-full object-contain bg-black"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-app-text-muted text-xs">
                              No Back Cover
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Album Info */}
                    <div className="flex-1 flex flex-col justify-end min-w-0">

                      {/* Album Title - Serif Font */}
                      <h1 className="text-5xl md:text-6xl font-serif font-normal leading-tight mb-3 text-app-text">
                        {selectedAlbum.name}
                      </h1>

                      {/* Artist */}
                      <button
                        onClick={() => {
                          const artist = artists.find(a => a.name === selectedAlbum.artist);
                          if (artist) {
                            setSelectedAlbum(null); // Close album detail
                            setSelectedArtist(artist); // Open artist detail
                          }
                        }}
                        className="text-lg text-app-text-muted hover:text-app-text hover:underline self-start mb-4"
                      >
                        {selectedAlbum.artist}
                      </button>

                      {/* Metadata Line */}
                      <div className="flex flex-wrap gap-4 text-sm text-app-text-muted font-medium mb-4">
                        <span>{selectedAlbum.genre || 'Unknown Genre'}</span>
                        {selectedAlbum.year && (
                          <>
                            <span>•</span>
                            <span>{selectedAlbum.year}</span>
                          </>
                        )}
                        {selectedAlbum.tracks.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{selectedAlbum.tracks.length} Songs</span>
                            <span>•</span>
                            <span>
                              {Math.floor(selectedAlbum.tracks.reduce((acc, t) => acc + t.duration, 0) / 60)} min
                            </span>
                          </>
                        )}
                        {albumMetadata?.label && (
                          <>
                            <span>•</span>
                            <span
                              className="text-app-text hover:text-app-accent cursor-pointer"
                              title="Record Label"
                              onClick={() => handleDeepLink(albumMetadata.label.name)}
                            >
                              {albumMetadata.label.name}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Genre Tags */}
                      {albumMetadata?.tags && albumMetadata.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {albumMetadata.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-full bg-app-surface/50 border border-app-surface text-xs text-app-text-muted hover:text-white hover:border-app-accent transition-colors cursor-pointer"
                              title="Filter by this tag"
                              onClick={() => handleDeepLink(tag.name)}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-4 mt-6">
                        <button
                          onClick={() => {
                            const idx = Array.isArray(tracks) ? tracks.findIndex(t => t.album === selectedAlbum.name) : -1;
                            if (idx !== -1) {
                              playTrack(idx, 'cut');
                              setShowNowPlaying(true);
                            }
                          }}
                          className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-6 py-2.5 rounded-full font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
                        >
                          <Play size={16} fill="currentColor" />
                          Play now
                        </button>
                        <button
                          onClick={(e) => toggleFavorite(e, selectedAlbum.tracks[0].id)}
                          className="p-2.5 hover:bg-app-surface rounded-full transition-colors"
                        >
                          <svg className={`w-5 h-5 transition-colors ${selectedAlbum.tracks[0].rating === 1 ? 'text-app-accent fill-app-accent' : 'text-app-text-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={addToQueue}
                          title="Add to Queue"
                          className="p-2.5 hover:bg-app-surface rounded-full transition-colors"
                        >
                          <svg className="w-5 h-5 text-app-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />

                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" className="hidden" />
                          </svg>
                          {/* Replaced Dots with Plus Circle for "Add to Library/Queue" metaphor */}
                          <PlusCircle size={20} className="text-app-text-muted" />
                        </button>
                      </div>


                    </div>
                  </div>

                  {/* Description & Metadata Grid */}
                  <div className="grid md:grid-cols-3 gap-8 mb-8 pb-8 border-b border-app-surface">

                    {/* Description Column */}
                    <div className="md:col-span-2">
                      <p className="text-sm text-app-text-muted leading-relaxed line-clamp-6">
                        {albumMetadata?.release?.description
                          ? albumMetadata.release.description.replace(/<[^>]*>?/gm, '') // Strip HTML
                          : selectedAlbum.tracks[0].genre
                            ? `A ${selectedAlbum.tracks[0].genre} album by ${selectedAlbum.artist}.`
                            : "No description available."
                        }
                      </p>
                      {/* Track count debug */}
                      <p className="mt-2 text-sm text-app-text-muted">Tracks: {selectedAlbum.tracks.length}</p>
                    </div>

                    {/* Stats Column */}
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-app-text-muted mb-1">Length</div>
                        <div className="text-app-text font-medium">
                          {Math.floor(selectedAlbum.tracks.reduce((acc, t) => acc + t.duration, 0) / 60)} minutes
                        </div>
                      </div>
                      <div>
                        <div className="text-app-text-muted mb-1">Format</div>
                        <div className="text-app-text font-medium flex items-center gap-1">
                          {selectedAlbum.tracks[0].format || 'FLAC'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center justify-center gap-8 mb-8 border-b border-app-surface sticky top-0 bg-app-bg z-10 transition-all">
                    <button
                      onClick={() => setActiveTab('tracks')}
                      className={`pb-3 border-b-2 font-medium text-sm uppercase tracking-wider transition-colors ${activeTab === 'tracks' ? 'border-app-accent text-app-text' : 'border-transparent text-app-text-muted hover:text-app-text'}`}
                    >
                      Tracks
                    </button>
                    <button
                      onClick={() => setActiveTab('credits')}
                      className={`pb-3 border-b-2 font-medium text-sm uppercase tracking-wider transition-colors ${activeTab === 'credits' ? 'border-app-accent text-app-text' : 'border-transparent text-app-text-muted hover:text-app-text'}`}
                    >
                      Credits
                    </button>
                  </div>

                  {/* Tracklist vs Credits Content - Added pb-32 for floating dock clearance */}
                  <div className="space-y-1 pb-32">
                    {activeTab === 'tracks' ? (
                      selectedAlbum.tracks.map((track, i) => (
                        <div
                          key={track.id}
                          onClick={() => {
                            const idx = Array.isArray(tracks) ? tracks.findIndex(t => t.id === track.id) : -1;
                            if (idx !== -1) {
                              playTrack(idx, 'cut');
                              setShowNowPlaying(true);
                            }
                          }}
                          className="group flex items-center gap-4 px-4 py-3 hover:bg-app-surface rounded-md cursor-pointer transition-colors"
                        >
                          {/* Track Number / Play Icon */}
                          <div className="w-8 text-center text-sm text-app-text-muted group-hover:text-app-accent font-medium">
                            <span className="group-hover:hidden">{i + 1}</span>
                            <Play size={14} fill="currentColor" className="hidden group-hover:inline-block" />
                          </div>

                          {/* Title */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-app-text truncate">{track.title}</div>
                            {track.artist !== selectedAlbum.artist && (
                              <div className="text-sm text-app-text-muted truncate">{track.artist}</div>
                            )}
                          </div>

                          {/* Duration */}
                          <div className="text-sm text-app-text-muted font-mono tabular-nums">
                            {Math.floor(track.duration / 60)}:{(Math.floor(track.duration % 60)).toString().padStart(2, '0')}
                          </div>

                          {/* Heart Icon */}
                          <button
                            onClick={(e) => toggleFavorite(e, track.id)}
                            className={`p-1 hover:bg-white/10 rounded transition-all ${track.rating === 1 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          >
                            <svg className={`w-4 h-4 transition-colors ${track.rating === 1 ? 'text-app-accent fill-app-accent' : 'text-app-text-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                        </div>
                      ))
                    ) : (
                      /* Credits View - Grouped by Role */
                      <div className="space-y-6 px-4">
                        {Object.keys(albumCredits).length > 0 ? (
                          Object.entries(albumCredits)
                            .filter(([role]) => role !== 'Lyricist') // Remove Lyricist as requested
                            .map(([role, credits]) => (
                              <div key={role} className="mb-6">
                                <h3 className="text-sm font-semibold text-app-accent uppercase tracking-wider mb-3 border-b border-app-surface pb-2">
                                  {role}
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                                  {(credits as any[]).map((credit, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => {
                                        if (credit.artist_mbid) {
                                          // TODO: Open artist detail panel
                                          console.log('Open artist:', credit.artist_mbid);
                                        }
                                        handleDeepLink(credit.name);
                                      }}
                                      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-app-surface transition-colors text-left group"
                                    >
                                      <div className="w-8 h-8 rounded-full bg-app-surface flex items-center justify-center text-xs font-medium text-app-text-muted group-hover:bg-white/10 group-hover:text-white transition-colors border border-transparent group-hover:border-white/20">
                                        {credit.name?.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-app-text truncate group-hover:text-app-accent transition-colors">
                                          {credit.name}
                                        </div>
                                        {credit.instrument && (
                                          <div className="text-xs text-app-text-muted truncate">
                                            {credit.instrument}
                                          </div>
                                        )}
                                      </div>
                                      {credit.artist_mbid && (
                                        <svg className="w-4 h-4 text-app-text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))
                        ) : (
                          <div className="py-12 text-center">
                            <div className="text-app-text-muted mb-4">No detailed credits available.</div>
                          </div>
                        )}

                        {/* Always show Enrich button (or progress) at the bottom */}
                        <div className="mt-8 pt-8 border-t border-app-surface flex flex-col items-center">
                          {enrichmentStatus.isEnriching ? (
                            <div className="w-full max-w-sm">
                              <div className="flex justify-between text-xs text-app-text-muted mb-2">
                                <span>Enriching Library...</span>
                                <span>{enrichmentStatus.processed} / {enrichmentStatus.total}</span>
                              </div>
                              <div className="w-full h-1.5 bg-app-surface rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-all duration-300 ease-out"
                                  style={{ width: `${(enrichmentStatus.processed / (enrichmentStatus.total || 1)) * 100}%` }}
                                />
                              </div>
                              {enrichmentStatus.currentTrack && (
                                <div className="text-xs text-app-text-muted mt-2 text-center truncate">
                                  {enrichmentStatus.currentTrack}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={async () => {
                                  try {
                                    await axios.post(`${SERVER_URL}/api/enrich`);
                                    // Status will update via polling
                                  } catch (e) {
                                    console.error("Enrichment failed:", e);
                                  }
                                }}
                                className="px-4 py-2 bg-app-surface border border-white/5 hover:bg-white/10 hover:border-white/20 hover:text-white text-app-text-muted rounded-lg transition-colors text-sm flex items-center gap-2"
                              >
                                <span>🎵</span>
                                <span>Enrich with MusicBrainz</span>
                              </button>
                              <p className="text-xs text-app-text-muted mt-2">Fetches producer, engineer, labels, and genre tags</p>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Album Footer Info - Copyright & Labels */}
                    <div className="mt-12 pt-8 border-t border-app-surface/30 text-center">
                      <div className="text-sm font-medium text-app-text-muted">
                        © {selectedAlbum.year || ''} {albumMetadata?.label?.name || selectedAlbum.artist}
                      </div>
                      <div className="flex flex-col items-center gap-1 mt-2 text-xs text-app-text-muted/60 font-mono">
                        {albumMetadata?.label?.name && (
                          <span>Released by {albumMetadata.label.name}</span>
                        )}
                        {albumMetadata?.release?.country && (
                          <span>{albumMetadata.release.country} Release</span>
                        )}
                        {albumMetadata?.release?.barcode && (
                          <span className="opacity-50">UPC: {albumMetadata.release.barcode}</span>
                        )}
                      </div>
                      <div className="mt-6 flex justify-center gap-4 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
                        {/* Placeholder for label logos / copyright badges */}
                        <Disc size={24} />
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Scan Overlay */}
            {showScanOverlay && (
              <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center flex-col gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-accent"></div>
                <h2 className="text-xl font-bold text-white">Indexing Library...</h2>
                <p className="text-app-text-muted">Processed: {scanStatus.processedCount}</p>
                <p className="text-xs text-app-text-muted max-w-md truncate">{scanStatus.currentFile}</p>
              </div>
            )}

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-app-bg">
              {tracks.length === 0 ? (
                <div className="h-full flex items-center justify-center text-app-text-muted flex-col gap-4">
                  <Disc size={48} className="opacity-20" />
                  <p>No tracks found. Try a different search or scan your library.</p>
                </div>
              ) : (
                <>
                  {/* View Toggle Controls */}
                  <div className="flex items-center justify-between mb-6 bg-app-surface/30 p-4 rounded-lg border border-white/5">
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
                    </div>
                    <div className="flex items-center gap-4">
                      {view === 'grid' && (
                        <select
                          value={albumSort}
                          onChange={(e) => setAlbumSort(e.target.value)}
                          className="bg-app-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-app-text outline-none focus:border-app-accent"
                        >
                          <option value="artist">Sort by Artist</option>
                          <option value="title">Sort by Title</option>
                          <option value="year">Sort by Year</option>
                          <option value="recent">Recently Added</option>
                        </select>
                      )}
                      <div className="text-sm text-app-text-muted">
                        {view === 'grid' ? `${albums.length} albums` : `${tracks.length} tracks`}
                      </div>
                    </div>
                  </div>

                  {/* Grid View */}
                  {view === 'grid' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6 content-start pb-32">
                      {albums.map((album) => (
                        <div
                          key={album.name}
                          className="group cursor-pointer"
                          onClick={() => setSelectedAlbum(album)}
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

                </>
              )}
            </div>

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
          </>
        )}

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

        {/* Floating Player Dock - Always visible except when Now Playing is open */}
        {!showNowPlaying && currentTrack && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
            <div className="pointer-events-auto bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-8">
              {/* Track Info */}
              <div className="flex items-center gap-3">
                <div
                  onClick={() => setShowNowPlaying(true)}
                  className="h-12 w-12 bg-black/20 rounded-lg flex items-center justify-center text-app-text-muted cursor-pointer hover:scale-105 transition-transform overflow-hidden"
                >
                  {currentTrack.has_art ? (
                    <img src={`${SERVER_URL}/api/art/${currentTrack.id}`} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Disc size={20} />
                  )}
                </div>
                <div className="max-w-[200px]">
                  <div className="font-medium text-white text-sm truncate">{currentTrack.title}</div>
                  <div
                    className="text-xs text-gray-400 truncate cursor-pointer hover:text-white transition-colors"
                    onClick={() => {
                      const artist = artists.find(a => a.name === currentTrack.artist);
                      if (artist) setSelectedArtist(artist);
                    }}
                  >
                    {currentTrack.artist}
                  </div>
                </div>
              </div>

              {/* Controls (Center) */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShuffleMode(s => !s)}
                  className={`transition-colors ${shuffleMode ? 'text-app-accent' : 'text-gray-400 hover:text-white'}`}
                  title="Shuffle (S)"
                >
                  <Shuffle size={18} />
                </button>
                <button onClick={() => playTrack(currentTrackIndex - 1, 'cut')} className="text-gray-400 hover:text-white transition-colors"><SkipBack size={22} /></button>
                <button
                  onClick={togglePlay}
                  className="h-12 w-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                >
                  {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
                </button>
                <button onClick={() => playTrack(currentTrackIndex + 1, 'crossfade')} className="text-gray-400 hover:text-white transition-colors"><SkipForward size={22} /></button>
                <button
                  onClick={() => setRepeatMode(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
                  className={`transition-colors ${repeatMode !== 'off' ? 'text-app-accent' : 'text-gray-400 hover:text-white'}`}
                  title="Repeat (R)"
                >
                  {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                </button>
              </div>

              {/* Volume Control */}
              <div className="flex items-center gap-2">
                <Volume2 size={18} className="text-gray-400" />
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={volume}
                  onChange={(e) => {
                    const newVolume = parseFloat(e.target.value);
                    setVolume(newVolume);
                    if (activeDeck === 'A' && audioRefA.current) audioRefA.current.volume = newVolume;
                    if (activeDeck === 'B' && audioRefB.current) audioRefB.current.volume = newVolume;
                  }}
                  className="w-20 accent-app-accent h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}

export default App;
