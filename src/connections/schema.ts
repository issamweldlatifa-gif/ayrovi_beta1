import type { QatafoDatabase } from '../db/database';

export function ensureConnectionsSchema(db: QatafoDatabase) {
  db.runSchema(`
    CREATE TABLE IF NOT EXISTS team_connection_members (
      user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      team TEXT NOT NULL CHECK(length(team) BETWEEN 1 AND 32),
      PRIMARY KEY(user_id,team)
    );
    CREATE TABLE IF NOT EXISTS team_connection_requests (
      provider TEXT PRIMARY KEY CHECK(length(provider) BETWEEN 1 AND 64),
      status TEXT NOT NULL CHECK(status IN ('REQUESTED','APPROVED_FOR_SETUP','CLOSED')),
      updated_at TEXT NOT NULL
    );
  `);
}
