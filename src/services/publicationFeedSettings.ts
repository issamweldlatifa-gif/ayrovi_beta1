import { normalizePublicationFeedSettings, DEFAULT_PUBLICATION_FEED_SETTINGS } from '../../shared/publicationFeed';
import type { QatafoDatabase } from '../db/database';
export function readPublicationFeedSettings(db: QatafoDatabase) {
  const row = db.get<{ config_json: string }>("SELECT config_json FROM publication_feed_settings WHERE id='global'");
  const settings = normalizePublicationFeedSettings(row ? JSON.parse(row.config_json) : DEFAULT_PUBLICATION_FEED_SETTINGS);
  if (!settings) throw new Error('Invalid stored Publication feed settings');
  return settings;
}
