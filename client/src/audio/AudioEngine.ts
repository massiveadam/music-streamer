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

interface BiquadCoefficients {
    b0: number;
    b1: number;
    b2: number;
    a0: number;
    a1: number;
    a2: number;
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
    filters: (BiquadFilterNode | IIRFilterNode)[] = [];

    // State
    isInitialized: boolean = false;
    activeDeck: DeckId = 'A';
    crossfadeDuration: number = 5;

    // EQ State
    bands: EQBand[] = []; // Start with 0 bands
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

        // Create 10 Fixed Filter Nodes (Max Capacity)
        // Mix of BiquadFilterNode and IIRFilterNode depending on type
        this.filters = Array(10).fill(null).map(() => {
            // Start with biquad, will be replaced with IIR if needed for shelf+Q
            const filter = this.audioCtx!.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = 1000;
            filter.Q.value = 1;
            filter.gain.value = 0;
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

    // Calculate biquad coefficients using Audio EQ Cookbook formulas
    private calculateShelfCoefficients(type: 'lowshelf' | 'highshelf', freq: number, gain: number, Q: number, sampleRate: number): BiquadCoefficients {
        const A = Math.pow(10, gain / 40); // sqrt of linear gain
        const w0 = 2 * Math.PI * freq / sampleRate;
        const cosW0 = Math.cos(w0);
        const sinW0 = Math.sin(w0);
        const alpha = sinW0 / (2 * Q);

        const sqrtA = Math.sqrt(A);
        const twoSqrtAAlpha = 2 * sqrtA * alpha;

        let b0, b1, b2, a0, a1, a2;

        if (type === 'lowshelf') {
            b0 = A * ((A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha);
            b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
            b2 = A * ((A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha);
            a0 = (A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha;
            a1 = -2 * ((A - 1) + (A + 1) * cosW0);
            a2 = (A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha;
        } else { // highshelf
            b0 = A * ((A + 1) + (A - 1) * cosW0 + twoSqrtAAlpha);
            b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
            b2 = A * ((A + 1) + (A - 1) * cosW0 - twoSqrtAAlpha);
            a0 = (A + 1) - (A - 1) * cosW0 + twoSqrtAAlpha;
            a1 = 2 * ((A - 1) - (A + 1) * cosW0);
            a2 = (A + 1) - (A - 1) * cosW0 - twoSqrtAAlpha;
        }

        return { b0, b1, b2, a0, a1, a2 };
    }

    addBand(): void {
        if (this.bands.length >= 10) return;

        this.bands.push({
            frequency: 1000,
            gain: 0,
            Q: 1.0,
            type: 'peaking',
            enabled: true
        });

        this.syncFilters();
        this.notifyListeners();
    }

    removeBand(index: number): void {
        if (index < 0 || index >= this.bands.length) return;
        this.bands.splice(index, 1);
        this.syncFilters();
        this.notifyListeners();
    }

    // Syncs the abstract 'bands' state to the physical 'filters' nodes
    private syncFilters(): void {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        const sampleRate = this.audioCtx.sampleRate;

        this.filters.forEach((filter, i) => {
            const band = this.bands[i];

            if (band && band.enabled) {
                // For shelf filters with Q, we need to use IIRFilterNode with custom coefficients
                if ((band.type === 'lowshelf' || band.type === 'highshelf') && band.Q !== 0.7071) {
                    // Need to replace with IIRFilterNode for custom coefficients
                    const coef = this.calculateShelfCoefficients(band.type, band.frequency, band.gain, band.Q, sampleRate);

                    // Normalize coefficients
                    const feedforward = [coef.b0 / coef.a0, coef.b1 / coef.a0, coef.b2 / coef.a0];
                    const feedback = [1, coef.a1 / coef.a0, coef.a2 / coef.a0];

                    // Check if we need to replace the node
                    if (!(filter instanceof IIRFilterNode)) {
                        // Disconnect old filter
                        filter.disconnect();

                        // Create new IIR filter
                        const newFilter = this.audioCtx.createIIRFilter(feedforward, feedback);

                        // Reconnect
                        if (i === 0) {
                            this.preampGain!.disconnect();
                            this.preampGain!.connect(newFilter);
                        } else {
                            this.filters[i - 1].disconnect();
                            this.filters[i - 1].connect(newFilter);
                        }

                        if (i === this.filters.length - 1) {
                            newFilter.connect(this.masterGain!);
                        } else {
                            newFilter.connect(this.filters[i + 1]);
                        }

                        this.filters[i] = newFilter;
                    } else {
                        // IIR filters can't be updated, need to recreate
                        filter.disconnect();
                        const newFilter = this.audioCtx.createIIRFilter(feedforward, feedback);

                        if (i === 0) {
                            this.preampGain!.disconnect();
                            this.preampGain!.connect(newFilter);
                        } else {
                            this.filters[i - 1].disconnect();
                            this.filters[i - 1].connect(newFilter);
                        }

                        if (i === this.filters.length - 1) {
                            newFilter.connect(this.masterGain!);
                        } else {
                            newFilter.connect(this.filters[i + 1]);
                        }

                        this.filters[i] = newFilter;
                    }
                } else {
                    // Use BiquadFilterNode for peaking or shelf with default Q
                    if (!(filter instanceof BiquadFilterNode)) {
                        // Replace IIR with Biquad
                        filter.disconnect();
                        const newFilter = this.audioCtx.createBiquadFilter();

                        if (i === 0) {
                            this.preampGain!.disconnect();
                            this.preampGain!.connect(newFilter);
                        } else {
                            this.filters[i - 1].disconnect();
                            this.filters[i - 1].connect(newFilter);
                        }

                        if (i === this.filters.length - 1) {
                            newFilter.connect(this.masterGain!);
                        } else {
                            newFilter.connect(this.filters[i + 1]);
                        }

                        this.filters[i] = newFilter;
                    }

                    const biquad = filter as BiquadFilterNode;
                    biquad.type = band.type;
                    biquad.frequency.setTargetAtTime(band.frequency, now, 0.05);
                    biquad.Q.setTargetAtTime(band.Q, now, 0.05);
                    biquad.gain.setTargetAtTime(band.gain, now, 0.05);
                }
            } else {
                // Unused slot or disabled band -> set to flat
                if (filter instanceof BiquadFilterNode) {
                    filter.gain.setTargetAtTime(0, now, 0.05);
                } else {
                    // For IIR, replace with flat biquad
                    filter.disconnect();
                    const newFilter = this.audioCtx.createBiquadFilter();
                    newFilter.type = 'peaking';
                    newFilter.gain.value = 0;

                    if (i === 0) {
                        this.preampGain!.disconnect();
                        this.preampGain!.connect(newFilter);
                    } else {
                        this.filters[i - 1].disconnect();
                        this.filters[i - 1].connect(newFilter);
                    }

                    if (i === this.filters.length - 1) {
                        newFilter.connect(this.masterGain!);
                    } else {
                        newFilter.connect(this.filters[i + 1]);
                    }

                    this.filters[i] = newFilter;
                }
            }
        });
    }

    importFromText(text: string): void {
        const newBands: EQBand[] = [];
        const lines = text.split('\n');

        // Regex for REW/Equalizer APO
        // Supports: "Filter 1: ON PK Fc 50.0 Hz Gain 0.0 dB Q 1.00"
        // And: "Filter: ON PK Fc 50.0 Hz Gain 0.0 dB Q 1.00"
        const regex = /Filter\s*(?:\d+)?:\s*ON\s+([A-Z]+)\s+Fc\s+([\d.]+)\s*Hz\s+Gain\s+([-\d.]+)\s*dB\s+Q\s+([\d.]+)/i;

        for (const line of lines) {
            if (newBands.length >= 10) break;

            const match = line.match(regex);
            if (match) {
                const [_, typeCode, freq, gain, q] = match;

                let type: FilterType = 'peaking';
                const t = typeCode.toUpperCase();
                if (t === 'PK') type = 'peaking';
                else if (t === 'LSC' || t === 'LS') type = 'lowshelf';
                else if (t === 'HSC' || t === 'HS') type = 'highshelf';
                else if (t === 'LP') type = 'lowpass';
                else if (t === 'HP') type = 'highpass';

                newBands.push({
                    frequency: parseFloat(freq),
                    gain: parseFloat(gain),
                    Q: parseFloat(q),
                    type: type,
                    enabled: true
                });
            }
        }

        if (newBands.length > 0) {
            this.bands = newBands;
            this.syncFilters();
            this.notifyListeners();
        }
    }

    setBandGain(bandIndex: number, gain: number): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        const clamped = Math.max(-12, Math.min(12, gain));
        this.bands[bandIndex].gain = clamped;
        this.syncFilters();
        this.notifyListeners();
    }

    setBandFrequency(bandIndex: number, frequency: number): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        const clamped = Math.max(20, Math.min(20000, frequency));
        this.bands[bandIndex].frequency = clamped;
        this.syncFilters();
        this.notifyListeners();
    }

    setBandQ(bandIndex: number, Q: number): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        const clamped = Math.max(0.1, Math.min(10, Q));
        this.bands[bandIndex].Q = clamped;
        this.syncFilters();
        this.notifyListeners();
    }

    setBandType(bandIndex: number, type: FilterType): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        this.bands[bandIndex].type = type;
        this.syncFilters();
        this.notifyListeners();
    }

    setBandEnabled(bandIndex: number, enabled: boolean): void {
        if (bandIndex < 0 || bandIndex >= this.bands.length) return;
        this.bands[bandIndex].enabled = enabled;
        this.syncFilters();
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

        // Clear existing bands and copy new ones (up to 10)
        this.bands = preset.bands.slice(0, 10).map(b => ({ ...b }));

        this.syncFilters();
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
        this.bands = [];
        this.preamp = 0;
        this.setPreamp(0);
        this.syncFilters();
        this.notifyListeners();
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

        // Start with flat response
        for (let i = 0; i < frequencies.length; i++) {
            magResponse[i] = 1;
        }

        // Only process if we have active bands
        if (this.bands.length > 0) {
            // Multiply by each filter's response
            // Only active bands (up to bands.length) contribute
            this.filters.forEach((filter, i) => {
                const band = this.bands[i];
                if (!band || !band.enabled) return;

                const filterMag = new Float32Array(frequencies.length);
                const filterPhase = new Float32Array(frequencies.length);
                filter.getFrequencyResponse(frequencies, filterMag, filterPhase);

                for (let j = 0; j < frequencies.length; j++) {
                    magResponse[j] *= filterMag[j];
                }
            });
        }

        // Apply preamp
        const preampLinear = this.dbToLinear(this.preamp);
        for (let i = 0; i < frequencies.length; i++) {
            magResponse[i] *= preampLinear;
        }

        return magResponse;
    }
}

export const audioEngine = new AudioEngine();
