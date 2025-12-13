/**
 * Sonic Profiles
 * Maps descriptive terms to audio feature ranges
 */

export interface SonicProfile {
    name: string;
    description: string;
    conditions: {
        energy?: { min?: number; max?: number };
        valence?: { min?: number; max?: number };
        danceability?: { min?: number; max?: number };
        bpm?: { min?: number; max?: number };
    };
}

export const SONIC_PROFILES: SonicProfile[] = [
    {
        name: 'High Energy',
        description: 'Intense and powerful tracks',
        conditions: { energy: { min: 0.8 } }
    },
    {
        name: 'Chill',
        description: 'Relaxed and low-key',
        conditions: { energy: { max: 0.4 }, bpm: { max: 110 } }
    },
    {
        name: 'Dark',
        description: 'Moody and somber',
        conditions: { valence: { max: 0.3 } }
    },
    {
        name: 'Happy',
        description: 'Positive and uplifting',
        conditions: { valence: { min: 0.7 } }
    },
    {
        name: 'Danceable',
        description: 'Music to move to',
        conditions: { danceability: { min: 0.7 } }
    },
    {
        name: 'Fast',
        description: 'High tempo',
        conditions: { bpm: { min: 140 } }
    },
    {
        name: 'Slow',
        description: 'Downtempo and drag',
        conditions: { bpm: { max: 90 } }
    },
    {
        name: 'Acoustic / Organic',
        description: 'Low energy but high valence/neutral',
        conditions: { energy: { max: 0.5 }, valence: { min: 0.4 } }
    },
    {
        name: 'Intense',
        description: 'High energy and potentially dark',
        conditions: { energy: { min: 0.7 }, valence: { max: 0.4 } }
    }
];

/**
 * Generate SQL WHERE clause for a given profile
 */
export function getProfileSql(profileName: string): { sql: string; params: any[] } | null {
    const profile = SONIC_PROFILES.find(p => p.name.toLowerCase() === profileName.toLowerCase());
    if (!profile) return null;

    const clauses: string[] = [];
    const params: any[] = [];

    if (profile.conditions.energy) {
        if (profile.conditions.energy.min !== undefined) {
            clauses.push('energy >= ?');
            params.push(profile.conditions.energy.min);
        }
        if (profile.conditions.energy.max !== undefined) {
            clauses.push('energy <= ?');
            params.push(profile.conditions.energy.max);
        }
    }

    if (profile.conditions.valence) {
        if (profile.conditions.valence.min !== undefined) {
            clauses.push('valence >= ?');
            params.push(profile.conditions.valence.min);
        }
        if (profile.conditions.valence.max !== undefined) {
            clauses.push('valence <= ?');
            params.push(profile.conditions.valence.max);
        }
    }

    if (profile.conditions.danceability) {
        if (profile.conditions.danceability.min !== undefined) {
            clauses.push('danceability >= ?');
            params.push(profile.conditions.danceability.min);
        }
        if (profile.conditions.danceability.max !== undefined) {
            clauses.push('danceability <= ?');
            params.push(profile.conditions.danceability.max);
        }
    }

    if (profile.conditions.bpm) {
        if (profile.conditions.bpm.min !== undefined) {
            clauses.push('bpm >= ?');
            params.push(profile.conditions.bpm.min);
        }
        if (profile.conditions.bpm.max !== undefined) {
            clauses.push('bpm <= ?');
            params.push(profile.conditions.bpm.max);
        }
    }

    return { sql: clauses.join(' AND '), params };
}

/**
 * Get applicable profiles for a track
 */
export function getTrackProfiles(features: { energy: number; valence: number; danceability: number; bpm: number }): string[] {
    return SONIC_PROFILES.filter(p => {
        if (p.conditions.energy?.min !== undefined && features.energy < p.conditions.energy.min) return false;
        if (p.conditions.energy?.max !== undefined && features.energy > p.conditions.energy.max) return false;

        if (p.conditions.valence?.min !== undefined && features.valence < p.conditions.valence.min) return false;
        if (p.conditions.valence?.max !== undefined && features.valence > p.conditions.valence.max) return false;

        if (p.conditions.danceability?.min !== undefined && features.danceability < p.conditions.danceability.min) return false;
        if (p.conditions.danceability?.max !== undefined && features.danceability > p.conditions.danceability.max) return false;

        if (p.conditions.bpm?.min !== undefined && features.bpm < p.conditions.bpm.min) return false;
        if (p.conditions.bpm?.max !== undefined && features.bpm > p.conditions.bpm.max) return false;

        return true;
    }).map(p => p.name);
}
