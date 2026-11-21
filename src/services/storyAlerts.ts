import { createHash } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { isStoryId } from '../../shared/storyEditorial';

/** In-app only. Sync the reader's inbox, never fan out to every follower on a CRM write. */
export function syncStoryAlerts(db: QatafoDatabase, accountId: string, now: string, locale: string) {
  const follow = db.get<{ created_at: string }>(`SELECT created_at FROM publication_follows
    WHERE account_id=? AND publisher_id='pub_zayrovi'`, accountId);
  if (!follow) return;
  const stories = db.all<{ id: string; title: string; title_ar: string; publish_at: string }>(`SELECT id,title,title_ar,publish_at FROM stories
    WHERE status='PUBLISHED' AND publish_at>? AND publish_at<=? AND (expires_at IS NULL OR expires_at>?)
    ORDER BY publish_at DESC,id LIMIT 20`, follow.created_at, now, now);
  if (!stories.length) return;
  const arabic = locale === 'ar';
  db.transaction(() => {
    for (const story of stories) {
      if (!isStoryId(story.id)) continue;
      const action = `/stories?id=${encodeURIComponent(story.id)}`;
      const notification = `story_alert_${createHash('sha256').update(JSON.stringify([accountId, story.id])).digest('hex')}`;
      // Also covers account merges, where the notification ID may belong to the old identity.
      db.run(`INSERT OR IGNORE INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
        SELECT ?,?,'GENERAL',?,?,?,? WHERE NOT EXISTS (
          SELECT 1 FROM customer_notifications WHERE account_id=? AND action_url=? AND id LIKE 'story_alert_%'
        )`, notification, accountId, arabic ? 'قصة جديدة من Zayrovi' : 'Nouvelle Story Zayrovi',
      (arabic && story.title_ar) || story.title, action, story.publish_at, accountId, action);
    }
  });
}
