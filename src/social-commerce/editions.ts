import type { QatafoDatabase } from '../db/database';
import { parseSocialEdition, type SocialEdition } from '../../shared/socialCommerce';

const KEY = 'social_commerce_editions_v1';
export interface EditionState {
  revision: number;
  draft: SocialEdition | null;
  published: SocialEdition | null;
  previous: SocialEdition | null;
}
export function readEditionState(db: QatafoDatabase): EditionState {
  const row = db.get<{ setting_value: string }>('SELECT setting_value FROM settings WHERE setting_key=?', KEY);
  if (!row) return { revision: 0, draft: null, published: null, previous: null };
  const input = JSON.parse(row.setting_value) as EditionState;
  return { revision: input.revision, draft: parseSocialEdition(input.draft), published: parseSocialEdition(input.published), previous: parseSocialEdition(input.previous) };
}
export function activeEdition(state: EditionState, at: string): SocialEdition | null {
  const live = (e: SocialEdition | null) => e && e.startsAt <= at && e.endsAt > at;
  if (live(state.published)) return state.published;
  if (state.published && at < state.published.startsAt && live(state.previous)) return state.previous;
  return null;
}
export function updateEditionState(db: QatafoDatabase, action: unknown, revision: unknown, draft: unknown, now: string) {
  return db.transaction(() => {
    const state = readEditionState(db);
    if (revision !== state.revision) return { status: 409, error: 'L’édition a changé. Rechargez avant de continuer.' } as const;
    if (action === 'save') {
      const parsed = parseSocialEdition(draft);
      if (!parsed) return { status: 400, error: 'Édition invalide : vérifiez médias, dates, identifiants et points du look.' } as const;
      state.draft = parsed;
    } else if (action === 'publish') {
      if (!state.draft || state.draft.endsAt <= now) return { status: 400, error: 'Enregistrez un brouillon valable avant publication.' } as const;
      state.previous = state.published && state.published.startsAt <= now ? state.published : state.previous;
      state.published = state.draft;
    } else if (action === 'rollback') {
      if (!state.published) return { status: 409, error: 'Aucune édition à retirer.' } as const;
      state.published = state.previous;
      state.previous = null;
    } else return { status: 400, error: 'Action inconnue.' } as const;
    state.revision++;
    db.run(`INSERT INTO settings (id,category,setting_key,setting_value,value_type,label,updated_at)
      VALUES (?, 'INTERFACE', ?, ?, 'JSON', ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
    KEY, KEY, JSON.stringify(state), 'Éditions Social Commerce', now);
    return { status: 200, state } as const;
  });
}
