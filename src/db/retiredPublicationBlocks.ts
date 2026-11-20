/** Storage only: the old Publication templates are retired. Keep the table for
 * existing installations and backup/restore; do not seed, serve, or edit its rows. */
export const RETIRED_PUBLICATION_BLOCKS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS publication_blocks (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('container','media','sponsored_pair','cinema')),
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    collection_description TEXT NOT NULL DEFAULT '',
    bg_color TEXT NOT NULL DEFAULT '#FFFFFF',
    panel_color TEXT NOT NULL DEFAULT '',
    sponsored INTEGER NOT NULL DEFAULT 0,
    media_type TEXT NOT NULL DEFAULT '' CHECK(media_type IN ('','image','video')),
    image_format TEXT NOT NULL DEFAULT 'cover' CHECK(image_format IN ('cover','wide')),
    media_url TEXT NOT NULL DEFAULT '',
    poster_url TEXT NOT NULL DEFAULT '',
    product_ids TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_publication_blocks_order ON publication_blocks(active, sort_order, id);
`;
