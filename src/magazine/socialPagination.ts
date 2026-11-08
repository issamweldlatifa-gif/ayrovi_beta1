/** Content pagination contract, independent of HTTP query parsing. */
export type SocialCursor = { at: string; id: string };
export type SocialPage = { limit: number; cursor?: SocialCursor; anchor?: string };
export function socialCursor(row: { publish_at: string; id: string }): string {
  return Buffer.from(JSON.stringify({ at: row.publish_at, id: row.id })).toString('base64url');
}
