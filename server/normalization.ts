/**
 * Metadata Normalization Module
 * 
 * Provides canonical mappings for tags, credit roles, and artist names
 * to ensure consistency across the library regardless of data source.
 */

// =============================================================================
// TAG CANONICALIZATION
// =============================================================================

/**
 * Canonical tag mapping - maps variations to a single canonical form.
 * Uses MusicBrainz genre names as base, with additions for modern genres.
 * All keys are lowercase for case-insensitive matching.
 */
const TAG_CANONICAL_MAP: Record<string, string> = {
    // Electronic variants
    'electronic': 'Electronic',
    'electronica': 'Electronic',
    'edm': 'Electronic',
    'electronic music': 'Electronic',

    // Electronic subgenres (keep distinct but capitalize consistently)
    'ambient': 'Ambient',
    'idm': 'IDM',
    'intelligent dance music': 'IDM',
    'techno': 'Techno',
    'house': 'House',
    'deep house': 'Deep House',
    'tech house': 'Tech House',
    'trance': 'Trance',
    'drum and bass': 'Drum and Bass',
    'drum n bass': 'Drum and Bass',
    'dnb': 'Drum and Bass',
    'd&b': 'Drum and Bass',
    'dubstep': 'Dubstep',
    'synthwave': 'Synthwave',
    'synth-wave': 'Synthwave',
    'retrowave': 'Synthwave',
    'vaporwave': 'Vaporwave',
    'vapor wave': 'Vaporwave',
    'chillwave': 'Chillwave',
    'chill wave': 'Chillwave',
    'future bass': 'Future Bass',
    'uk garage': 'UK Garage',
    'garage': 'Garage',
    '2-step': '2-Step',
    'breakbeat': 'Breakbeat',
    'breaks': 'Breakbeat',
    'industrial': 'Industrial',
    'ebm': 'EBM',
    'electro': 'Electro',
    'electroclash': 'Electroclash',
    'trip-hop': 'Trip-Hop',
    'trip hop': 'Trip-Hop',
    'triphop': 'Trip-Hop',
    'downtempo': 'Downtempo',
    'glitch': 'Glitch',
    'glitch hop': 'Glitch Hop',

    // Hip-Hop variants
    'hip hop': 'Hip-Hop',
    'hip-hop': 'Hip-Hop',
    'hiphop': 'Hip-Hop',
    'rap': 'Hip-Hop',
    'rap music': 'Hip-Hop',
    'trap': 'Trap',
    'trap music': 'Trap',
    'drill': 'Drill',
    'uk drill': 'UK Drill',
    'boom bap': 'Boom Bap',
    'lo-fi hip hop': 'Lo-Fi Hip-Hop',
    'lofi hip hop': 'Lo-Fi Hip-Hop',
    'lofi': 'Lo-Fi',
    'lo-fi': 'Lo-Fi',

    // Rock variants
    'rock': 'Rock',
    'rock music': 'Rock',
    'rock and roll': 'Rock',
    'rock & roll': 'Rock',
    "rock 'n' roll": 'Rock',
    'alternative': 'Alternative Rock',
    'alternative rock': 'Alternative Rock',
    'alt rock': 'Alternative Rock',
    'indie': 'Indie',
    'indie rock': 'Indie Rock',
    'indie pop': 'Indie Pop',
    'post-rock': 'Post-Rock',
    'post rock': 'Post-Rock',
    'postrock': 'Post-Rock',
    'shoegaze': 'Shoegaze',
    'shoe gaze': 'Shoegaze',
    'dream pop': 'Dream Pop',
    'dreampop': 'Dream Pop',
    'grunge': 'Grunge',
    'punk': 'Punk',
    'punk rock': 'Punk',
    'post-punk': 'Post-Punk',
    'post punk': 'Post-Punk',
    'postpunk': 'Post-Punk',
    'new wave': 'New Wave',
    'new-wave': 'New Wave',
    'metal': 'Metal',
    'heavy metal': 'Metal',
    'progressive rock': 'Progressive Rock',
    'prog rock': 'Progressive Rock',
    'prog': 'Progressive Rock',
    'psychedelic': 'Psychedelic Rock',
    'psychedelic rock': 'Psychedelic Rock',
    'psych rock': 'Psychedelic Rock',
    'krautrock': 'Krautrock',
    'kraut rock': 'Krautrock',
    'noise rock': 'Noise Rock',
    'math rock': 'Math Rock',
    'mathrock': 'Math Rock',
    'emo': 'Emo',
    'screamo': 'Screamo',
    'hardcore': 'Hardcore',
    'hardcore punk': 'Hardcore',

    // Jazz variants
    'jazz': 'Jazz',
    'jazz music': 'Jazz',
    'bebop': 'Bebop',
    'be-bop': 'Bebop',
    'hard bop': 'Hard Bop',
    'hardbop': 'Hard Bop',
    'cool jazz': 'Cool Jazz',
    'modal jazz': 'Modal Jazz',
    'free jazz': 'Free Jazz',
    'avant-garde jazz': 'Avant-Garde Jazz',
    'fusion': 'Jazz Fusion',
    'jazz fusion': 'Jazz Fusion',
    'jazz-fusion': 'Jazz Fusion',
    'smooth jazz': 'Smooth Jazz',
    'acid jazz': 'Acid Jazz',
    'nu jazz': 'Nu Jazz',
    'nu-jazz': 'Nu Jazz',
    'spiritual jazz': 'Spiritual Jazz',

    // Classical variants
    'classical': 'Classical',
    'classical music': 'Classical',
    'baroque': 'Baroque',
    'romantic': 'Romantic',
    'contemporary classical': 'Contemporary Classical',
    'modern classical': 'Contemporary Classical',
    'minimalism': 'Minimalism',
    'minimalist': 'Minimalism',
    'neo-classical': 'Neoclassical',
    'neoclassical': 'Neoclassical',
    'chamber music': 'Chamber Music',
    'orchestral': 'Orchestral',
    'opera': 'Opera',
    'symphony': 'Symphonic',
    'symphonic': 'Symphonic',

    // Soul/R&B variants
    'soul': 'Soul',
    'soul music': 'Soul',
    'r&b': 'R&B',
    'rnb': 'R&B',
    'rhythm and blues': 'R&B',
    'neo soul': 'Neo Soul',
    'neo-soul': 'Neo Soul',
    'funk': 'Funk',
    'funk music': 'Funk',
    'disco': 'Disco',
    'nu-disco': 'Nu-Disco',
    'nu disco': 'Nu-Disco',
    'motown': 'Motown',

    // Pop variants
    'pop': 'Pop',
    'pop music': 'Pop',
    'synth pop': 'Synth-Pop',
    'synthpop': 'Synth-Pop',
    'synth-pop': 'Synth-Pop',
    'electropop': 'Electropop',
    'electro-pop': 'Electropop',
    'art pop': 'Art Pop',
    'dance pop': 'Dance Pop',
    'dream-pop': 'Dream Pop',
    'k-pop': 'K-Pop',
    'kpop': 'K-Pop',
    'j-pop': 'J-Pop',
    'jpop': 'J-Pop',
    'city pop': 'City Pop',
    'bubblegum': 'Bubblegum Pop',
    'bubblegum pop': 'Bubblegum Pop',

    // Folk/Country variants
    'folk': 'Folk',
    'folk music': 'Folk',
    'folk rock': 'Folk Rock',
    'country': 'Country',
    'country music': 'Country',
    'americana': 'Americana',
    'bluegrass': 'Bluegrass',
    'singer-songwriter': 'Singer-Songwriter',
    'singer songwriter': 'Singer-Songwriter',

    // World/Regional
    'world': 'World',
    'world music': 'World',
    'afrobeat': 'Afrobeat',
    'afro beat': 'Afrobeat',
    'afro-beat': 'Afrobeat',
    'afropop': 'Afropop',
    'reggae': 'Reggae',
    'dub': 'Dub',
    'dancehall': 'Dancehall',
    'ska': 'Ska',
    'bossa nova': 'Bossa Nova',
    'bossa-nova': 'Bossa Nova',
    'latin': 'Latin',
    'latin music': 'Latin',
    'flamenco': 'Flamenco',
    'highlife': 'Highlife',
    'zouk': 'Zouk',
    'cumbia': 'Cumbia',
    'salsa': 'Salsa',
    'samba': 'Samba',
    'fado': 'Fado',

    // Blues
    'blues': 'Blues',
    'blues music': 'Blues',
    'delta blues': 'Delta Blues',
    'chicago blues': 'Chicago Blues',
    'electric blues': 'Electric Blues',

    // Experimental/Avant-Garde
    'experimental': 'Experimental',
    'avant-garde': 'Avant-Garde',
    'avant garde': 'Avant-Garde',
    'avantgarde': 'Avant-Garde',
    'noise': 'Noise',
    'drone': 'Drone',
    'musique concrète': 'Musique Concrète',
    'musique concrete': 'Musique Concrète',
    'field recordings': 'Field Recordings',
    'sound art': 'Sound Art',
    'free improvisation': 'Free Improvisation',
    'free improv': 'Free Improvisation',

    // Descriptors (non-genre tags)
    'melancholic': 'Melancholic',
    'melancholy': 'Melancholic',
    'upbeat': 'Upbeat',
    'energetic': 'Energetic',
    'atmospheric': 'Atmospheric',
    'dark': 'Dark',
    'heavy': 'Heavy',
    'mellow': 'Mellow',
    'chill': 'Chill',
    'relaxing': 'Relaxing',
    'aggressive': 'Aggressive',
    'melodic': 'Melodic',
    'rhythmic': 'Rhythmic',
    'hypnotic': 'Hypnotic',
    'soothing': 'Soothing',
    'groovy': 'Groovy',
    'funky': 'Funky',
    'dreamy': 'Dreamy',
    'ethereal': 'Ethereal',
    'cinematic': 'Cinematic',
    'epic': 'Epic',
    'intimate': 'Intimate',
    'introspective': 'Introspective',
    'political': 'Political',
    'protest': 'Protest',
};

// =============================================================================
// CREDIT ROLE CANONICALIZATION
// =============================================================================

/**
 * Canonical credit role mapping - maps variations to standard roles.
 * Uses industry-standard terminology.
 */
const CREDIT_ROLE_MAP: Record<string, string> = {
    // Producer variations
    'producer': 'Producer',
    'produced by': 'Producer',
    'production': 'Producer',
    'executive producer': 'Executive Producer',
    'exec producer': 'Executive Producer',
    'co-producer': 'Co-Producer',
    'coproducer': 'Co-Producer',

    // Engineer variations
    'engineer': 'Engineer',
    'recording engineer': 'Recording Engineer',
    'recording': 'Recording Engineer',
    'recorded by': 'Recording Engineer',
    'mix engineer': 'Mix Engineer',
    'mixing engineer': 'Mix Engineer',
    'mixer': 'Mix Engineer',
    'mixed by': 'Mix Engineer',
    'mix': 'Mix Engineer',
    'mastering engineer': 'Mastering Engineer',
    'mastering': 'Mastering Engineer',
    'mastered by': 'Mastering Engineer',
    'remastering': 'Mastering Engineer',
    'audio engineer': 'Audio Engineer',
    'sound engineer': 'Audio Engineer',

    // Composition credits
    'composer': 'Composer',
    'composed by': 'Composer',
    'written by': 'Writer',
    'writer': 'Writer',
    'songwriter': 'Songwriter',
    'lyricist': 'Lyricist',
    'lyrics by': 'Lyricist',
    'lyrics': 'Lyricist',
    'arranger': 'Arranger',
    'arranged by': 'Arranger',
    'arrangement': 'Arranger',
    'orchestrator': 'Orchestrator',
    'orchestration': 'Orchestrator',
    'orchestrated by': 'Orchestrator',

    // Performance credits
    'performer': 'Performer',
    'vocals': 'Vocals',
    'vocal': 'Vocals',
    'lead vocals': 'Lead Vocals',
    'lead vocal': 'Lead Vocals',
    'background vocals': 'Background Vocals',
    'backing vocals': 'Background Vocals',
    'harmony vocals': 'Background Vocals',
    'guest vocals': 'Guest Vocals',
    'featured artist': 'Featured Artist',
    'featuring': 'Featured Artist',
    'feat.': 'Featured Artist',
    'ft.': 'Featured Artist',

    // Instruments (common ones - keep as-is for specificity)
    'guitar': 'Guitar',
    'guitars': 'Guitar',
    'electric guitar': 'Electric Guitar',
    'acoustic guitar': 'Acoustic Guitar',
    'bass': 'Bass',
    'bass guitar': 'Bass',
    'electric bass': 'Bass',
    'double bass': 'Double Bass',
    'upright bass': 'Double Bass',
    'drums': 'Drums',
    'drum': 'Drums',
    'percussion': 'Percussion',
    'keyboard': 'Keyboards',
    'keyboards': 'Keyboards',
    'piano': 'Piano',
    'synthesizer': 'Synthesizer',
    'synth': 'Synthesizer',
    'synths': 'Synthesizer',
    'strings': 'Strings',
    'violin': 'Violin',
    'viola': 'Viola',
    'cello': 'Cello',
    'saxophone': 'Saxophone',
    'sax': 'Saxophone',
    'tenor saxophone': 'Tenor Saxophone',
    'alto saxophone': 'Alto Saxophone',
    'baritone saxophone': 'Baritone Saxophone',
    'soprano saxophone': 'Soprano Saxophone',
    'trumpet': 'Trumpet',
    'trombone': 'Trombone',
    'french horn': 'French Horn',
    'horn': 'Horn',
    'flute': 'Flute',
    'clarinet': 'Clarinet',
    'oboe': 'Oboe',
    'bassoon': 'Bassoon',
    'harmonica': 'Harmonica',
    'accordion': 'Accordion',
    'organ': 'Organ',
    'harp': 'Harp',
    'turntables': 'Turntables',
    'dj': 'DJ',
    'sampler': 'Sampler',
    'programming': 'Programming',
    'drum programming': 'Drum Programming',
    'beat programming': 'Beat Programming',

    // Conducting
    'conductor': 'Conductor',
    'conducted by': 'Conductor',
    'music director': 'Music Director',
    'chorus master': 'Chorus Master',
    'choirmaster': 'Chorus Master',
    'concertmaster': 'Concertmaster',

    // Other production roles
    'remixer': 'Remixer',
    'remixed by': 'Remixer',
    'remix': 'Remixer',
    'additional production': 'Additional Production',
    'additional programming': 'Additional Programming',
    'assistant engineer': 'Assistant Engineer',
    'assistant': 'Assistant',
    'a&r': 'A&R',
    'art direction': 'Art Direction',
    'artwork': 'Artwork',
    'cover art': 'Cover Art',
    'design': 'Design',
    'graphic design': 'Graphic Design',
    'photography': 'Photography',
    'photo': 'Photography',
    'liner notes': 'Liner Notes',
};

// =============================================================================
// EXPORTED FUNCTIONS
// =============================================================================

/**
 * Normalize a tag/genre to its canonical form.
 * Returns the canonical version if found, otherwise returns the original
 * with proper title casing.
 */
export function normalizeTag(tag: string): string {
    if (!tag || typeof tag !== 'string') return '';

    const normalized = tag.trim();
    const lowercased = normalized.toLowerCase();

    // Check canonical map
    if (TAG_CANONICAL_MAP[lowercased]) {
        return TAG_CANONICAL_MAP[lowercased];
    }

    // If not in map, return with proper title casing
    return toTitleCase(normalized);
}

/**
 * Normalize a credit role to its canonical form.
 * Returns the canonical version if found, otherwise returns the original
 * with proper title casing.
 */
export function normalizeRole(role: string): string {
    if (!role || typeof role !== 'string') return 'Contributor';

    const normalized = role.trim();
    const lowercased = normalized.toLowerCase();

    // Check canonical map
    if (CREDIT_ROLE_MAP[lowercased]) {
        return CREDIT_ROLE_MAP[lowercased];
    }

    // If not in map, return with proper title casing
    return toTitleCase(normalized);
}

/**
 * Normalize an artist name for consistent storage and comparison.
 * Handles:
 * - Leading "The" (The Beatles -> Beatles, The)
 * - Punctuation normalization
 * - Whitespace normalization
 */
export function normalizeArtistName(name: string): string {
    if (!name || typeof name !== 'string') return '';

    let normalized = name.trim();

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ');

    // Normalize quotes and apostrophes
    normalized = normalized.replace(/['']/g, "'");
    normalized = normalized.replace(/[""]/g, '"');

    // Normalize ampersands (keep as-is, but ensure spacing)
    normalized = normalized.replace(/\s*&\s*/g, ' & ');

    // Normalize "and" vs "&" - keep original choice but ensure spacing
    // normalized = normalized.replace(/\s+and\s+/gi, ' and ');

    return normalized;
}

/**
 * Generate a sort name from an artist name.
 * Moves "The" to the end: "The Beatles" -> "Beatles, The"
 */
export function generateSortName(name: string): string {
    if (!name || typeof name !== 'string') return '';

    const normalized = normalizeArtistName(name);

    // Handle "The X" -> "X, The"
    const theMatch = normalized.match(/^The\s+(.+)$/i);
    if (theMatch) {
        return `${theMatch[1]}, The`;
    }

    // Handle "A X" -> "X, A" (less common)
    const aMatch = normalized.match(/^A\s+(.+)$/i);
    if (aMatch && aMatch[1].length > 2) { // Avoid matching "A B" type names
        return `${aMatch[1]}, A`;
    }

    return normalized;
}

/**
 * Normalize a tag for comparison (lowercase, no whitespace variations)
 * Used for deduplication checking
 */
export function normalizeTagForComparison(tag: string): string {
    return tag.toLowerCase().replace(/[\s\-_]+/g, '').trim();
}

/**
 * Check if two tags are equivalent (should be deduplicated)
 */
export function tagsAreEquivalent(tag1: string, tag2: string): boolean {
    return normalizeTagForComparison(tag1) === normalizeTagForComparison(tag2);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert a string to proper title case.
 * Handles common exceptions (articles, conjunctions, prepositions).
 */
function toTitleCase(str: string): string {
    const exceptions = new Set([
        'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor',
        'on', 'at', 'to', 'by', 'of', 'in', 'vs', 'vs.'
    ]);

    return str.split(' ').map((word, index) => {
        const lower = word.toLowerCase();

        // Always capitalize first word
        if (index === 0) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }

        // Don't capitalize exceptions
        if (exceptions.has(lower)) {
            return lower;
        }

        // Handle hyphenated words
        if (word.includes('-')) {
            return word.split('-')
                .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join('-');
        }

        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
}

// =============================================================================
// BATCH OPERATIONS (for migration)
// =============================================================================

/**
 * Get all unique tags that should be merged with their canonical forms
 */
export function getTagMergeMap(existingTags: string[]): Map<string, string> {
    const mergeMap = new Map<string, string>();

    for (const tag of existingTags) {
        const canonical = normalizeTag(tag);
        if (canonical !== tag) {
            mergeMap.set(tag, canonical);
        }
    }

    return mergeMap;
}

/**
 * Get all unique roles that should be merged with their canonical forms
 */
export function getRoleMergeMap(existingRoles: string[]): Map<string, string> {
    const mergeMap = new Map<string, string>();

    for (const role of existingRoles) {
        const canonical = normalizeRole(role);
        if (canonical !== role) {
            mergeMap.set(role, canonical);
        }
    }

    return mergeMap;
}

export default {
    normalizeTag,
    normalizeRole,
    normalizeArtistName,
    generateSortName,
    normalizeTagForComparison,
    tagsAreEquivalent,
    getTagMergeMap,
    getRoleMergeMap,
};
