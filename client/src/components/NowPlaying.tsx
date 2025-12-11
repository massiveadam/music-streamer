import { useState, useEffect, useRef } from 'react';
import {
    X, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
    Volume2, VolumeX, Heart, ListMusic, Sliders, ChevronDown, Disc,
    Upload, Plus
} from 'lucide-react';
import { audioEngine, EQBand, BUILT_IN_PRESETS, EQPreset, FilterType } from '../audio/AudioEngine';
import { Track } from '../types';

interface NowPlayingProps {
    isOpen: boolean;
    onClose: () => void;
    currentTrack: Track | null;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onPrevious: () => void;
    onNext: () => void;
    shuffleMode: boolean;
    onToggleShuffle: () => void;
    repeatMode: 'off' | 'all' | 'one';
    onToggleRepeat: () => void;
    volume: number;
    onVolumeChange: (v: number) => void;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    onFavorite: (id: number) => void;
    serverUrl: string;
    queue: Track[];
    onArtistClick: (artistName: string) => void;
    onAlbumClick: (albumName: string, artistName: string) => void;
    accentColor?: string; // Dynamic color from album art
}

export function NowPlaying({
    isOpen,
    onClose,
    currentTrack,
    isPlaying,
    onTogglePlay,
    onPrevious,
    onNext,
    shuffleMode,
    onToggleShuffle,
    repeatMode,
    onToggleRepeat,
    volume,
    onVolumeChange,
    currentTime,
    duration,
    onSeek,
    onFavorite,
    serverUrl,
    queue,
    onArtistClick,
    onAlbumClick,
    accentColor = '#333333'
}: NowPlayingProps) {
    const [showEq, setShowEq] = useState(false);
    const [eqBands, setEqBands] = useState<EQBand[]>(audioEngine.getBands());
    const [preamp, setPreamp] = useState(audioEngine.getPreamp());
    const [currentPreset, setCurrentPreset] = useState<string>('Custom');
    const [deviceProfiles, setDeviceProfiles] = useState<string[]>([]);
    const [currentDevice, setCurrentDevice] = useState(audioEngine.currentDeviceName);
    const [showQueue, setShowQueue] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            audioEngine.importFromText(text);
            setCurrentPreset('Custom');
        };
        reader.readAsText(file);

        // Reset input so same file can be selected again if needed
        event.target.value = '';
    };

    // Subscribe to audio engine changes
    useEffect(() => {
        const unsubscribe = audioEngine.subscribe(() => {
            setEqBands(audioEngine.getBands());
            setPreamp(audioEngine.getPreamp());
            setDeviceProfiles(audioEngine.getDeviceProfileNames());
            setCurrentDevice(audioEngine.currentDeviceName);
        });

        // Initial load
        setDeviceProfiles(audioEngine.getDeviceProfileNames());

        return unsubscribe;
    }, []);

    // Draw frequency response curve
    useEffect(() => {
        if (!showEq || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Generate frequency points (logarithmic scale)
        const numPoints = width;
        const frequencies = new Float32Array(numPoints);
        for (let i = 0; i < numPoints; i++) {
            frequencies[i] = 20 * Math.pow(1000, i / numPoints); // 20Hz to 20kHz
        }

        // Get response
        const response = audioEngine.getFrequencyResponse(frequencies);

        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        // Horizontal grid lines (dB scale)
        const dbRange = 24; // -12 to +12
        for (let db = -12; db <= 12; db += 3) {
            const y = height / 2 - (db / dbRange) * height;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();

            // Label
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = '10px sans-serif';
            ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 4, y - 2);
        }

        // Vertical grid lines (frequency scale)
        const freqMarkers = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
        freqMarkers.forEach(freq => {
            const x = Math.log10(freq / 20) / Math.log10(1000) * width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Label
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, x + 2, height - 4);
        });

        // Draw frequency response curve
        // Use dynamic tint for canvas
        const computedStyle = getComputedStyle(document.documentElement);
        const accentColor = computedStyle.getPropertyValue('--app-accent').trim() || '#ffffff';

        ctx.beginPath();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;

        for (let i = 0; i < numPoints; i++) {
            const db = 20 * Math.log10(response[i]);
            const y = height / 2 - (db / dbRange) * height;

            if (i === 0) {
                ctx.moveTo(i, y);
            } else {
                ctx.lineTo(i, y);
            }
        }
        ctx.stroke();

        // Fill under curve
        ctx.lineTo(width, height / 2);
        ctx.lineTo(0, height / 2);
        ctx.closePath();
        ctx.closePath();
        // Tinted fill
        const hex = accentColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        ctx.fill();

        // Draw band markers
        eqBands.forEach((band, i) => {
            if (!band.enabled) return;
            const x = Math.log10(band.frequency / 20) / Math.log10(1000) * width;
            const y = height / 2 - (band.gain / dbRange) * height;

            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = band.gain !== 0 ? accentColor : '#666666';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

    }, [showEq, eqBands, preamp]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handlePresetChange = (presetName: string) => {
        const preset = BUILT_IN_PRESETS.find(p => p.name === presetName);
        if (preset) {
            audioEngine.applyPreset(preset);
            setCurrentPreset(presetName);
        }
    };

    const handleSaveProfile = () => {
        const name = prompt('Enter device profile name:', currentDevice);
        if (name) {
            audioEngine.saveDeviceProfile(name);
        }
    };

    const handleLoadProfile = (name: string) => {
        audioEngine.loadDeviceProfile(name);
        setCurrentPreset('Custom');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] bg-black flex">
            {/* Dynamic Background Gradient - using inline style with accentColor prop */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `linear-gradient(to bottom, ${accentColor}80 0%, #000000 50%, #000000 100%)`
                }}
            />

            {/* Left Side - Header + Main Content */}
            <div className={`flex flex-col relative z-10 transition-all ${showQueue || showEq ? 'w-1/2' : 'w-full'}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <ChevronDown size={24} className="text-white" />
                    </button>
                    <div className="text-sm text-gray-400 font-medium">Now Playing</div>
                    <button
                        onClick={() => setShowQueue(!showQueue)}
                        className={`p-2 rounded-full transition-colors border ${showQueue ? 'bg-white/20 border-white/30 text-white' : 'border-transparent hover:bg-white/10 text-white/60 hover:text-white'}`}
                    >
                        <ListMusic size={20} />
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-hidden">
                    {/* Album Artwork */}
                    <div className="w-full max-w-md aspect-square rounded-lg overflow-hidden shadow-2xl mb-8">
                        {currentTrack?.has_art ? (
                            <img
                                src={`${serverUrl}/api/art/${currentTrack.id}`}
                                alt={currentTrack.album}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                <Disc size={120} className="text-gray-600" />
                            </div>
                        )}
                    </div>

                    {/* Track Info */}
                    <div className="w-full max-w-md text-center mb-6">
                        <h1 className="text-2xl font-bold text-white truncate mb-1">
                            {currentTrack?.title || 'No Track Selected'}
                        </h1>
                        <p
                            className="text-lg text-gray-400 truncate cursor-pointer hover:text-white transition-colors"
                            onClick={() => currentTrack && onArtistClick(currentTrack.artist)}
                        >
                            {currentTrack?.artist || '—'}
                        </p>
                        <p
                            className="text-sm text-gray-500 truncate mt-1 cursor-pointer hover:text-gray-300 transition-colors"
                            onClick={() => currentTrack && onAlbumClick(currentTrack.album, currentTrack.artist)}
                        >
                            <span>{currentTrack?.album || ''}</span>
                            {currentTrack?.year && <span className="text-gray-600"> • {currentTrack.year}</span>}
                        </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full max-w-md mb-6">
                        <div className="relative h-1 bg-gray-700 rounded-full overflow-hidden group">
                            <div
                                className="absolute h-full bg-white rounded-full transition-all shadow-[0_0_10px_rgba(255,255,255,0.7),0_0_20px_rgba(255,255,255,0.4)]"
                                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                            />
                            <input
                                type="range"
                                min="0"
                                max={duration || 100}
                                value={currentTime}
                                onChange={(e) => onSeek(parseFloat(e.target.value))}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-gray-500">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Playback Controls */}
                    <div className="flex items-center gap-8 mb-8">
                        <button
                            onClick={onToggleShuffle}
                            className={`p-2 transition-colors relative ${shuffleMode ? 'text-app-accent after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-app-accent after:rounded-full' : 'text-white/40 hover:text-white'}`}
                        >
                            <Shuffle size={20} />
                        </button>
                        <button onClick={onPrevious} className="text-white hover:scale-110 transition-transform">
                            <SkipBack size={28} fill="currentColor" />
                        </button>
                        <button
                            onClick={onTogglePlay}
                            className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                        >
                            {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                        </button>
                        <button onClick={onNext} className="text-white hover:scale-110 transition-transform">
                            <SkipForward size={28} fill="currentColor" />
                        </button>
                        <button
                            onClick={onToggleRepeat}
                            className={`p-2 transition-colors relative ${repeatMode !== 'off' ? 'text-app-accent after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-app-accent after:rounded-full' : 'text-white/40 hover:text-white'}`}
                        >
                            {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
                        </button>
                    </div>

                    {/* Bottom Controls */}
                    <div className="flex items-center gap-6 w-full max-w-md">
                        <button
                            onClick={() => currentTrack && onFavorite(currentTrack.id)}
                            className={`p-2 transition-colors ${currentTrack?.rating ? 'text-red-500' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Heart size={20} fill={currentTrack?.rating ? 'currentColor' : 'none'} />
                        </button>

                        <div className="flex-1 flex items-center gap-3">
                            <button
                                onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                className="flex-1 accent-white h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        <button
                            onClick={() => setShowEq(!showEq)}
                            className={`p-2 rounded-lg transition-colors border ${showEq ? 'bg-app-accent/20 border-app-accent/50 text-white' : 'border-transparent text-white/40 hover:text-white'}`}
                        >
                            <Sliders size={20} />
                        </button>
                    </div>

                    {/* Track Metadata */}
                    {currentTrack && (
                        <div className="flex gap-4 mt-6 text-xs text-gray-500">
                            {currentTrack.format && <span>{currentTrack.format}</span>}
                            {currentTrack.bpm && <span>{Math.round(currentTrack.bpm)} BPM</span>}
                            {currentTrack.key && <span>Key: {currentTrack.key}</span>}
                            {currentTrack.genre && <span>{currentTrack.genre}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* EQ Panel - Full height sidebar */}
            {showEq && (
                <div className="w-1/2 border-l border-white/10 p-6 pt-4 overflow-y-auto bg-black/60 backdrop-blur-md relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-semibold text-white">Parametric EQ</h2>
                        <button
                            onClick={() => setShowEq(false)}
                            className="p-1 hover:bg-white/10 rounded-full"
                        >
                            <X size={18} className="text-gray-400" />
                        </button>
                    </div>

                    {/* Presets */}
                    <div className="mb-6">
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Preset</label>
                        <div className="flex flex-wrap gap-2">
                            {BUILT_IN_PRESETS.map(preset => (
                                <button
                                    key={preset.name}
                                    onClick={() => handlePresetChange(preset.name)}
                                    className={`px-3 py-1.5 rounded-full text-sm transition-colors border ${currentPreset === preset.name
                                        ? 'bg-white text-black border-white font-medium'
                                        : 'bg-transparent border-white/20 text-white/70 hover:border-white/50 hover:text-white'
                                        }`}
                                >
                                    {preset.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Device Profiles */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs text-gray-500 uppercase tracking-wider">Device Profile</label>
                            <button
                                onClick={handleSaveProfile}
                                className="text-xs text-app-accent hover:opacity-80"
                            >
                                Save Current
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {deviceProfiles.length === 0 ? (
                                <span className="text-sm text-gray-500">No saved profiles</span>
                            ) : (
                                deviceProfiles.map(name => (
                                    <button
                                        key={name}
                                        onClick={() => handleLoadProfile(name)}
                                        className={`px-3 py-1.5 rounded-full text-sm transition-colors border ${currentDevice === name
                                            ? 'bg-white text-black border-white font-medium'
                                            : 'bg-transparent border-white/20 text-white/70 hover:border-white/50'
                                            }`}
                                    >
                                        {name}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Frequency Response Curve */}
                    <div className="mb-6">
                        <canvas
                            ref={canvasRef}
                            width={400}
                            height={150}
                            className="w-full rounded-lg"
                        />
                    </div>

                    {/* Preamp */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs text-gray-500 uppercase tracking-wider">Preamp</label>
                            <span className="text-sm text-gray-400">{preamp > 0 ? '+' : ''}{preamp.toFixed(1)} dB</span>
                        </div>
                        <input
                            type="range"
                            min="-12"
                            max="12"
                            step="0.5"
                            value={preamp}
                            onChange={(e) => {
                                audioEngine.setPreamp(parseFloat(e.target.value));
                                setCurrentPreset('Custom');
                            }}
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-app-accent"
                        />
                    </div>

                    {/* EQ Controls Header */}
                    <div className="flex gap-2 mb-4">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImport}
                            className="hidden"
                            accept=".txt"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 py-2 bg-transparent border border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <Upload size={16} />
                            Import EQ
                        </button>
                        <button
                            onClick={() => {
                                audioEngine.addBand();
                                setCurrentPreset('Custom');
                            }}
                            disabled={eqBands.length >= 10}
                            className="flex-1 py-2 bg-transparent border border-white/20 text-white hover:bg-white/10 hover:border-white/40 disabled:border-white/10 disabled:text-white/30 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 font-medium"
                        >
                            <Plus size={16} />
                            Add Filter ({eqBands.length}/10)
                        </button>
                    </div>

                    {/* EQ Bands List */}
                    <div className="space-y-4">
                        {eqBands.length === 0 ? (
                            <div className="text-center py-8 text-white/40 text-sm">
                                No filters active. Add a filter or import a preset.
                            </div>
                        ) : eqBands.map((band, i) => (
                            <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/10">
                                {/* Header: Type and Delete */}
                                <div className="flex items-center gap-3 mb-3">
                                    <button
                                        onClick={() => {
                                            audioEngine.setBandEnabled(i, !band.enabled);
                                            setCurrentPreset('Custom');
                                        }}
                                        className={`w-4 h-4 rounded-full border-2 transition-colors ${band.enabled ? 'bg-app-accent border-app-accent' : 'border-gray-500'}`}
                                        title={band.enabled ? "Disable Band" : "Enable Band"}
                                    />

                                    <select
                                        value={band.type}
                                        onChange={(e) => {
                                            audioEngine.setBandType(i, e.target.value as FilterType);
                                            setCurrentPreset('Custom');
                                        }}
                                        className="bg-black/50 border border-white/20 text-white text-xs rounded px-2 py-1 flex-1"
                                    >
                                        <option value="peaking">Peak</option>
                                        <option value="lowshelf">LSQ</option>
                                        <option value="highshelf">HSQ</option>
                                    </select>

                                    <button
                                        onClick={() => {
                                            audioEngine.removeBand(i);
                                            setCurrentPreset('Custom');
                                        }}
                                        className="text-gray-500 hover:text-red-400 p-1"
                                        title="Remove Band"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                {/* Edit Grid */}
                                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center">

                                    {/* Frequency */}
                                    <div className="text-xs text-gray-400 font-mono w-12">Hz</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={band.frequency}
                                            onChange={(e) => {
                                                audioEngine.setBandFrequency(i, parseFloat(e.target.value) || 1000);
                                                setCurrentPreset('Custom');
                                            }}
                                            className="w-16 bg-black/50 border border-white/20 rounded px-1 py-0.5 text-xs text-right text-white"
                                        />
                                        <input
                                            type="range"
                                            min="20"
                                            max="20000"
                                            step="1"
                                            value={band.frequency}
                                            onChange={(e) => {
                                                audioEngine.setBandFrequency(i, parseFloat(e.target.value));
                                                setCurrentPreset('Custom');
                                            }}
                                            onDoubleClick={() => {
                                                audioEngine.setBandFrequency(i, 1000);
                                                setCurrentPreset('Custom');
                                            }}
                                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                                        />
                                    </div>

                                    {/* Gain */}
                                    <div className="text-xs text-gray-400 font-mono">dB</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min="-12"
                                            max="12"
                                            step="0.1"
                                            value={band.gain}
                                            onChange={(e) => {
                                                audioEngine.setBandGain(i, parseFloat(e.target.value));
                                                setCurrentPreset('Custom');
                                            }}
                                            onDoubleClick={() => {
                                                audioEngine.setBandGain(i, 0);
                                                setCurrentPreset('Custom');
                                            }}
                                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                                        />
                                        <div className="flex items-center bg-black/50 border border-white/20 rounded">
                                            <button
                                                onClick={() => {
                                                    audioEngine.setBandGain(i, parseFloat((band.gain - 0.1).toFixed(1)));
                                                    setCurrentPreset('Custom');
                                                }}
                                                className="px-1.5 py-0.5 text-gray-400 hover:text-white"
                                            >-</button>
                                            <input
                                                type="number"
                                                value={band.gain.toFixed(1)}
                                                onChange={(e) => {
                                                    audioEngine.setBandGain(i, parseFloat(e.target.value) || 0);
                                                    setCurrentPreset('Custom');
                                                }}
                                                step="0.1"
                                                className="w-12 bg-transparent text-center text-xs text-white appearance-none border-x border-white/20"
                                                style={{ MozAppearance: 'textfield' }}
                                            />
                                            <button
                                                onClick={() => {
                                                    audioEngine.setBandGain(i, parseFloat((band.gain + 0.1).toFixed(1)));
                                                    setCurrentPreset('Custom');
                                                }}
                                                className="px-1.5 py-0.5 text-gray-400 hover:text-white"
                                            >+</button>
                                        </div>
                                    </div>

                                    {/* Q Value */}
                                    <div className="text-xs text-gray-400 font-mono">Q</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={band.Q.toFixed(1)}
                                            onChange={(e) => {
                                                audioEngine.setBandQ(i, parseFloat(e.target.value) || 1.0);
                                                setCurrentPreset('Custom');
                                            }}
                                            step="0.1"
                                            className="w-16 bg-black/50 border border-white/20 rounded px-1 py-0.5 text-xs text-right text-white"
                                        />
                                        <input
                                            type="range"
                                            min="0.1"
                                            max="10"
                                            step="0.1"
                                            value={band.Q}
                                            onChange={(e) => {
                                                audioEngine.setBandQ(i, parseFloat(e.target.value));
                                                setCurrentPreset('Custom');
                                            }}
                                            onDoubleClick={() => {
                                                audioEngine.setBandQ(i, 1.0);
                                                setCurrentPreset('Custom');
                                            }}
                                            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => {
                            audioEngine.resetToFlat();
                            setCurrentPreset('Flat');
                        }}
                        className="w-full mt-6 py-2 bg-transparent border border-white/20 hover:bg-white/10 text-white/70 hover:text-white rounded-lg text-sm transition-colors"
                    >
                        Reset to Flat
                    </button>
                </div>
            )}

            {/* Queue Panel - Full height sidebar */}
            {showQueue && (
                <div className="w-1/2 border-l border-white/10 p-6 pt-4 overflow-y-auto bg-black/60 backdrop-blur-md relative z-10">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-semibold text-white">Up Next</h2>
                        <button
                            onClick={() => setShowQueue(false)}
                            className="p-1 hover:bg-white/10 rounded-full"
                        >
                            <X size={18} className="text-gray-400" />
                        </button>
                    </div>
                    <div className="space-y-2">
                        {queue.length === 0 ? (
                            <p className="text-gray-500">Queue is empty</p>
                        ) : (
                            queue.slice(0, 20).map((track, i) => (
                                <div
                                    key={`${track.id}-${i}`}
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                                >
                                    <span className="text-xs text-gray-500 w-6">{i + 1}</span>
                                    <div className="w-10 h-10 bg-gray-800 rounded overflow-hidden">
                                        {track.has_art ? (
                                            <img src={`${serverUrl}/api/art/${track.id}`} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Disc size={16} className="text-gray-600" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white truncate">{track.title}</div>
                                        <div className="text-xs text-gray-500 truncate">{track.artist}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
