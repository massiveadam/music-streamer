// ============================================================
// AudioEngine.ts - Premium Audio Pipeline
// ============================================================
// Features:
// - Dual-deck playback with crossfade
// - 10-band fully parametric EQ
// - Preamp with limiter protection
// - Device-specific profiles (localStorage)
// ============================================================

export type FilterType = 'peaking' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'notch';
export type DeckId = 'A' | 'B';

export interface EQBand {
    frequency: number;      // Center frequency in Hz
    gain: number;           // Gain in dB (-12 to +12)
    Q: number;              // Q factor (0.1 to 10)
    type: FilterType;       // Filter type
    enabled: boolean;       // Band enabled/disabled
}

export interface EQPreset {
    name: string;
    preamp: number;
    bands: EQBand[];
}

interface Deck {
    element: HTMLAudioElement | null;
    source: MediaElementAudioSourceNode | null;
    gain: GainNode | null;
}

// Default 10-band frequencies (ISO standard)
const DEFAULT_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Built-in presets
export const BUILT_IN_PRESETS: EQPreset[] = [
    {
        name: 'Flat',
        preamp: 0,
        bands: DEFAULT_FREQUENCIES.map(freq => ({
            frequency: freq,
            gain: 0,
            Q: 1.4,
            type: 'peaking' as FilterType,
            enabled: true
        }))
    },
    {
        name: 'Bass Boost',
        preamp: -2,
        bands: DEFAULT_FREQUENCIES.map((freq, i) => ({
            frequency: freq,
            gain: i < 3 ? 6 - i * 2 : 0,
            Q: 1.4,
            type: 'peaking' as FilterType,
            enabled: true
        }))
    },
    {
        name: 'Treble Boost',
        preamp: -2,
        bands: DEFAULT_FREQUENCIES.map((freq, i) => ({
            frequency: freq,
            gain: i > 6 ? (i - 6) * 2 : 0,
            Q: 1.4,
            type: 'peaking' as FilterType,
            enabled: true
        }))
    },
    {
        name: 'Vocal Clarity',
        preamp: -1,
        bands: DEFAULT_FREQUENCIES.map((freq, i) => ({
            frequency: freq,
            gain: i >= 3 && i <= 6 ? 3 : i < 2 ? -2 : 0,
            Q: 1.4,
            type: 'peaking' as FilterType,
            enabled: true
        }))
    },
    {
        name: 'Loudness',
        preamp: -3,
        bands: DEFAULT_FREQUENCIES.map((freq, i) => ({
            frequency: freq,
            gain: i < 2 ? 5 : i > 7 ? 4 : 0,
            Q: 1.4,
            type: 'peaking' as FilterType,
            enabled: true
        }))
    },
    {
        name: 'Electronic',
        preamp: -2,
        bands: DEFAULT_FREQUENCIES.map((freq, i) => ({
            frequency: freq,
            gain: i === 0 ? 5 : i === 1 ? 4 : i === 2 ? 2 : i >= 8 ? 3 : 0,
            Q: 1.4,
            type: 'peaking' as FilterType,
            enabled: true
        }))
    }
];

class AudioEngine {
    // Audio Context
    audioCtx: AudioContext | null = null;

    // Dual Decks for gapless/crossfade playback
    decks: Record<DeckId, Deck> = {
        A: { element: null, source: null, gain: null },
        B: { element: null, source: null, gain: null }
    };

    // Signal Chain Nodes
    preampGain: GainNode | null = null;
    masterGain: GainNode | null = null;
    limiter: DynamicsCompressorNode | null = null;
    filters: BiquadFilterNode[] = [];

    // State
    isInitialized: boolean = false;
    activeDeck: DeckId = 'A';
    crossfadeDuration: number = 5;

    // EQ State
    bands: EQBand[] = DEFAULT_FREQUENCIES.map(freq => ({
        frequency: freq,
        gain: 0,
        Q: 1.4,
        type: 'peaking' as FilterType,
        enabled: true
    }));
    preamp: number = 0;

    // Device Profile
    currentDeviceName: string = 'Default';

    // Listeners for UI updates
    private listeners: Set<() => void> = new Set();

    // ========== INITIALIZATION ==========

    initialize(elementA: HTMLAudioElement, elementB: HTMLAudioElement): void {
        if (this.isInitialized) return;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioContextClass();

        // Create Preamp Gain (before EQ)
        this.preampGain = this.audioCtx.createGain();
        this.preampGain.gain.value = this.dbToLinear(this.preamp);

        // Create Master Gain (after EQ)
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1;

        // Create Limiter (prevents clipping)
        this.limiter = this.audioCtx.createDynamicsCompressor();
        this.limiter.threshold.value = -1;  // Start limiting at -1dB
        this.limiter.knee.value = 0;        // Hard knee
        this.limiter.ratio.value = 20;      // Heavy limiting
        this.limiter.attack.value = 0.001;  // Fast attack
        this.limiter.release.value = 0.1;   // Quick release

        // Create 10-band Parametric EQ
        this.filters = this.bands.map((band, _i) => {
            const filter = this.audioCtx!.createBiquadFilter();
            filter.type = band.type;
            filter.frequency.value = band.frequency;
            filter.Q.value = band.Q;
            filter.gain.value = band.enabled ? band.gain : 0;
            return filter;
        });

        // Chain: Preamp -> Filters -> Master -> Limiter -> Destination
        this.preampGain.connect(this.filters[0]);

        for (let i = 0; i < this.filters.length - 1; i++) {
            this.filters[i].connect(this.filters[i + 1]);
        }

        this.filters[this.filters.length - 1].connect(this.masterGain);
        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.audioCtx.destination);

        // Setup Decks
        this.setupDeck('A', elementA);
        this.setupDeck('B', elementB);

        // Load saved device profile
        this.loadDeviceProfile(this.currentDeviceName);

        this.isInitialized = true;
        this.notifyListeners();
    }

    private setupDeck(id: DeckId, element: HTMLAudioElement): void {
        const deck = this.decks[id];
        deck.element = element;
        deck.source = this.audioCtx!.createMediaElementSource(element);
        deck.gain = this.audioCtx!.createGain();

        // Initial State
        deck.gain.gain.value = id === 'A' ? 1 : 0;

        // Route Deck -> DeckGain -> Preamp (start of EQ chain)
        deck.source.connect(deck.gain);
        deck.gain.connect(this.preampGain!);
    }

    resumeContext(): void {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    // ========== CROSSFADE ==========

    async crossfadeTo(targetDeckId: DeckId): Promise<void> {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        const incoming = this.decks[targetDeckId];
        const outgoing = this.decks[targetDeckId === 'A' ? 'B' : 'A'];

        incoming.gain!.gain.cancelScheduledValues(now);
        outgoing.gain!.gain.cancelScheduledValues(now);

        incoming.gain!.gain.setValueAtTime(0, now);
        incoming.gain!.gain.linearRampToValueAtTime(1, now + this.crossfadeDuration);

        outgoing.gain!.gain.setValueAtTime(1, now);
        outgoing.gain!.gain.linearRampToValueAtTime(0, now + this.crossfadeDuration);

        this.activeDeck = targetDeckId;
    }

    // ========== PARAMETRIC EQ CONTROLS ==========

    setBandGain(bandIndex: number, gain: number): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        const clamped = Math.max(-12, Math.min(12, gain));
        this.bands[bandIndex].gain = clamped;

        if (this.filters[bandIndex] && this.audioCtx && this.bands[bandIndex].enabled) {
            this.filters[bandIndex].gain.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.05);
        }
        this.notifyListeners();
    }

    setBandFrequency(bandIndex: number, frequency: number): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        const clamped = Math.max(20, Math.min(20000, frequency));
        this.bands[bandIndex].frequency = clamped;

        if (this.filters[bandIndex] && this.audioCtx) {
            this.filters[bandIndex].frequency.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.05);
        }
        this.notifyListeners();
    }

    setBandQ(bandIndex: number, Q: number): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        const clamped = Math.max(0.1, Math.min(10, Q));
        this.bands[bandIndex].Q = clamped;

        if (this.filters[bandIndex] && this.audioCtx) {
            this.filters[bandIndex].Q.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.05);
        }
        this.notifyListeners();
    }

    setBandType(bandIndex: number, type: FilterType): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        this.bands[bandIndex].type = type;

        if (this.filters[bandIndex]) {
            this.filters[bandIndex].type = type;
        }
        this.notifyListeners();
    }

    setBandEnabled(bandIndex: number, enabled: boolean): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        this.bands[bandIndex].enabled = enabled;

        if (this.filters[bandIndex] && this.audioCtx) {
            const gain = enabled ? this.bands[bandIndex].gain : 0;
            this.filters[bandIndex].gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.05);
        }
        this.notifyListeners();
    }

    // ========== PREAMP & VOLUME ==========

    setPreamp(db: number): void {
        this.preamp = Math.max(-12, Math.min(12, db));
        if (this.preampGain && this.audioCtx) {
            this.preampGain.gain.setTargetAtTime(
                this.dbToLinear(this.preamp),
                this.audioCtx.currentTime,
                0.05
            );
        }
        this.notifyListeners();
    }

    setMasterVolume(value: number): void {
        const clamped = Math.max(0, Math.min(1, value));
        if (this.masterGain && this.audioCtx) {
            this.masterGain.gain.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.05);
        }
    }

    // ========== PRESETS ==========

    applyPreset(preset: EQPreset): void {
        this.preamp = preset.preamp;
        this.setPreamp(this.preamp);

        preset.bands.forEach((band, i) => {
            if (i < this.bands.length) {
                this.bands[i] = { ...band };
                if (this.filters[i] && this.audioCtx) {
                    this.filters[i].type = band.type;
                    this.filters[i].frequency.setTargetAtTime(band.frequency, this.audioCtx.currentTime, 0.05);
                    this.filters[i].Q.setTargetAtTime(band.Q, this.audioCtx.currentTime, 0.05);
                    this.filters[i].gain.setTargetAtTime(
                        band.enabled ? band.gain : 0,
                        this.audioCtx.currentTime,
                        0.05
                    );
                }
            }
        });
        this.notifyListeners();
    }

    getCurrentPreset(): EQPreset {
        return {
            name: 'Current',
            preamp: this.preamp,
            bands: this.bands.map(b => ({ ...b }))
        };
    }

    resetToFlat(): void {
        const flatPreset = BUILT_IN_PRESETS.find(p => p.name === 'Flat');
        if (flatPreset) this.applyPreset(flatPreset);
    }

    // ========== DEVICE PROFILES ==========

    saveDeviceProfile(deviceName: string): void {
        const profile: EQPreset = {
            name: deviceName,
            preamp: this.preamp,
            bands: this.bands.map(b => ({ ...b }))
        };

        const profiles = this.getAllDeviceProfiles();
        profiles[deviceName] = profile;
        localStorage.setItem('audioEngine_deviceProfiles', JSON.stringify(profiles));
        this.currentDeviceName = deviceName;
        this.notifyListeners();
    }

    loadDeviceProfile(deviceName: string): boolean {
        const profiles = this.getAllDeviceProfiles();
        const profile = profiles[deviceName];

        if (profile) {
            this.applyPreset(profile);
            this.currentDeviceName = deviceName;
            return true;
        }
        return false;
    }

    deleteDeviceProfile(deviceName: string): void {
        const profiles = this.getAllDeviceProfiles();
        delete profiles[deviceName];
        localStorage.setItem('audioEngine_deviceProfiles', JSON.stringify(profiles));
        this.notifyListeners();
    }

    getAllDeviceProfiles(): Record<string, EQPreset> {
        try {
            const data = localStorage.getItem('audioEngine_deviceProfiles');
            return data ? JSON.parse(data) : {};
        } catch {
            return {};
        }
    }

    getDeviceProfileNames(): string[] {
        return Object.keys(this.getAllDeviceProfiles());
    }

    // ========== STATE ACCESS ==========

    getBands(): EQBand[] {
        return this.bands.map(b => ({ ...b }));
    }

    getPreamp(): number {
        return this.preamp;
    }

    getActiveDeck(): DeckId {
        return this.activeDeck;
    }

    // ========== LISTENERS ==========

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener());
    }

    // ========== UTILITIES ==========

    private dbToLinear(db: number): number {
        return Math.pow(10, db / 20);
    }

    // Calculate frequency response for visualization
    getFrequencyResponse(frequencies: Float32Array): Float32Array {
        const magResponse = new Float32Array(frequencies.length);
        const phaseResponse = new Float32Array(frequencies.length);

        // Start with flat response
        for (let i = 0; i < frequencies.length; i++) {
            magResponse[i] = 1;
        }

        // Multiply by each filter's response
        this.filters.forEach((filter, bandIndex) => {
            if (!this.bands[bandIndex].enabled) return;

            const filterMag = new Float32Array(frequencies.length);
            const filterPhase = new Float32Array(frequencies.length);
            filter.getFrequencyResponse(frequencies, filterMag, filterPhase);

            for (let i = 0; i < frequencies.length; i++) {
                magResponse[i] *= filterMag[i];
            }
        });

        // Apply preamp
        const preampLinear = this.dbToLinear(this.preamp);
        for (let i = 0; i < frequencies.length; i++) {
            magResponse[i] *= preampLinear;
        }

        return magResponse;
    }
}

export const audioEngine = new AudioEngine();
