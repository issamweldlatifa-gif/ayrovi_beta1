/**
 * Carrousel Hero — réglages globaux + aperçu mobile.
 *
 * Le contenu (les cartes) se gère dans « Hero Slider » (`hero_slides`) ; cette
 * page pilote les RÉGLAGES du carrousel (activation, limite de cartes, autoplay,
 * transitions, pagination) et affiche un aperçu fidèle de la présentation
 * mobile : carte 4:5, fond adaptatif, fondu du visuel vers le fond de la carte,
 * carte voisine visible, points de pagination.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Field, PageHeader, Switch, Toast } from './components';
import { adminApi } from './api';

type Settings = {
  enabled: boolean;
  maxCards: number;
  autoplay: boolean;
  autoplayIntervalMs: number;
  transitionMs: number;
  paginationVisible: boolean;
};

type PreviewCard = {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  cta: string;
  background: string;
  dominant: string;
  luminance: number;
};

const EMPTY: Settings = { enabled: true, maxCards: 6, autoplay: false, autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true };
const NEUTRAL = '#F4F4F2';

/** Contraste : l'encre suit la luminance du fond EFFECTIF (même règle que le mobile). */
const inkOn = (luminance: number) => (luminance > 0.45 ? '#1A1A1A' : '#FFFFFF');

export function HeroCarouselPage({ canWrite }: { canWrite: boolean }) {
  const [draft, setDraft] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [cards, setCards] = useState<PreviewCard[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await adminApi<any>('/hero-carousel-settings');
      if (settings?.data) setDraft({ ...EMPTY, ...settings.data });
      const published = await fetch('/api/public/hero-slides')
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
      setCards(Array.isArray(published?.data) ? published.data : []);
    } catch {
      setToast({ message: 'Réglages introuvables.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const patch = (change: Partial<Settings>) => setDraft((previous) => ({ ...previous, ...change }));

  const save = async () => {
    setBusy(true);
    try {
      const result = await adminApi<any>('/hero-carousel-settings', { method: 'PUT', body: JSON.stringify(draft) });
      if (result?.data) setDraft({ ...EMPTY, ...result.data });
      setToast({ message: 'Réglages enregistrés.', tone: 'success' });
    } catch (error: any) {
      setToast({ message: error?.message || 'Enregistrement impossible.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const first = cards[0];
  const sectionBg = first?.background || NEUTRAL;
  const sectionInk = inkOn(first?.luminance ?? 1);

  return (
    <div>
      <PageHeader
        title="Carrousel Hero"
        description="Réglages de l’accueil mobile : activation, nombre de cartes, autoplay, transitions, pagination. Les cartes se gèrent dans « Hero Slider »."
        action={<Button variant="secondary" onClick={() => void load()} disabled={busy || loading}>Recharger</Button>}
      />
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 380px)', gap: 24, alignItems: 'start' }}>
        <section>
          <Field label="Carrousel" full>
            <Switch disabled={!canWrite || loading} checked={draft.enabled} onLabel="Carrousel visible" offLabel="Carrousel masqué (repli sur l’ancien hero)" onChange={() => patch({ enabled: !draft.enabled })} />
          </Field>
          <Field label="Nombre max de cartes" hint="1 à 12 — les cartes au-delà sont ignorées.">
            <input disabled={!canWrite || loading} type="number" min={1} max={12} value={draft.maxCards} onChange={(event) => patch({ maxCards: Number(event.target.value) || 1 })} />
          </Field>
          <Field label="Autoplay" full>
            <Switch disabled={!canWrite || loading} checked={draft.autoplay} onLabel="Défilement automatique" offLabel="Défilement manuel" onChange={() => patch({ autoplay: !draft.autoplay })} />
          </Field>
          <Field label="Intervalle autoplay (ms)" hint="1000 à 60000 — n’a d’effet que si l’autoplay est actif.">
            <input disabled={!canWrite || loading || !draft.autoplay} type="number" min={1000} max={60000} step={500} value={draft.autoplayIntervalMs} onChange={(event) => patch({ autoplayIntervalMs: Number(event.target.value) || 5000 })} />
          </Field>
          <Field label="Durée de transition (ms)" hint="100 à 2000 — fondu du fond entre deux cartes.">
            <input disabled={!canWrite || loading} type="number" min={100} max={2000} step={50} value={draft.transitionMs} onChange={(event) => patch({ transitionMs: Number(event.target.value) || 300 })} />
          </Field>
          <Field label="Pagination" full>
            <Switch disabled={!canWrite || loading} checked={draft.paginationVisible} onLabel="Points de pagination visibles" offLabel="Pagination masquée (la carte voisine suffit)" onChange={() => patch({ paginationVisible: !draft.paginationVisible })} />
          </Field>
          <Button onClick={() => void save()} busy={busy} disabled={!canWrite || loading}>Enregistrer</Button>
        </section>

        {/* Aperçu fidèle de la présentation mobile (carte 4:5, fond adaptatif, fondu, voisin, points). */}
        <aside aria-label="Aperçu mobile" style={{ border: '1px solid var(--admin-line)', borderRadius: 16, padding: 16, background: sectionBg }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: sectionInk }}>Aperçu mobile</p>
          {cards.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: sectionInk }}>
              Aucune carte publiée : l’accueil retombe sur l’ancien hero. Activez une carte dans « Hero Slider ».
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
                {cards.slice(0, 3).map((card, index) => {
                  const ink = inkOn(card.luminance);
                  return (
                    <div key={card.id} aria-hidden={index > 0} style={{
                      flex: '0 0 76%',
                      transform: index === 0 ? 'none' : 'scale(0.94)',
                      opacity: index === 0 ? 1 : 0.8,
                      borderRadius: 24,
                      background: card.background || NEUTRAL,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      minHeight: 340,
                    }}>
                      {card.title ? (
                        <strong style={{ color: ink, fontSize: 18, lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{card.title}</strong>
                      ) : null}
                      {card.subtitle ? <span style={{ color: ink, opacity: 0.75, fontSize: 13 }}>{card.subtitle}</span> : null}
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', borderRadius: 16, overflow: 'hidden', background: card.dominant || 'transparent' }}>
                        {card.image ? <img src={card.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', background: `linear-gradient(to top, ${card.background || NEUTRAL}, transparent)` }} />
                      </div>
                      {card.cta ? (
                        <span style={{ alignSelf: 'flex-start', background: ink, color: card.background || NEUTRAL, borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>{card.cta}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {draft.paginationVisible && cards.length > 1 ? (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }} aria-hidden="true">
                  {cards.map((card, index) => (
                    <span key={card.id} style={{ width: index === 0 ? 16 : 6, height: 6, borderRadius: 999, background: sectionInk, opacity: index === 0 ? 1 : 0.35 }} />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
