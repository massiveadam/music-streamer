
import db from './db';

/**
 * Migration: Sync Tag Counts
 * 1. Updates existing tags.count based on entity_tags links.
 * 2. Adds triggers to keep counts in sync automatically.
 */
export function runSyncTagCountsMigration(): boolean {
    try {
        console.log('[Migration] Syncing tag counts...');

        db.transaction(() => {
            // 1. Reset all counts to 0
            db.prepare('UPDATE tags SET count = 0').run();

            // 2. Update counts from entity_tags
            db.prepare(`
                UPDATE tags 
                SET count = (
                    SELECT COUNT(*) 
                    FROM entity_tags 
                    WHERE entity_tags.tag_id = tags.id
                )
            `).run();

            // 3. Add triggers for future synchronization
            db.exec(`
                -- Trigger on INSERT
                CREATE TRIGGER IF NOT EXISTS trg_entity_tags_insert
                AFTER INSERT ON entity_tags
                BEGIN
                    UPDATE tags SET count = count + 1 WHERE id = NEW.tag_id;
                END;

                -- Trigger on DELETE
                CREATE TRIGGER IF NOT EXISTS trg_entity_tags_delete
                AFTER DELETE ON entity_tags
                BEGIN
                    UPDATE tags SET count = count - 1 WHERE id = OLD.tag_id;
                END;
            `);
        })();

        console.log('[Migration] Tag counts synced and triggers created.');
        return true;
    } catch (error) {
        console.error('[Migration] Failed to sync tag counts:', error);
        return false;
    }
}
