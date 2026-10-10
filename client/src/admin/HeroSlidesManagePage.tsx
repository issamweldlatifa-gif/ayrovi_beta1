/**
 * Hero — gestion des cartes (Contenu → Hero) : brouillons, aperçu, publication.
 *
 * Contrat : rien de ce qui est édité ici n'atteint les visiteurs avant « Publier ».
 *  • chaque modification devient un BROUILLON (table hero_slide_drafts) ;
 *  • l'aperçu montre le rendu visiteur brouillons inclus (même code serveur) ;
 *  • publier = tout ou rien ; une carte invalide bloque la publication et est signalée ;
 *  • visuel : téléversement réel (/api/admin/uploads), image absente signalée.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, ConfirmDialog, Field, ImageUploader, PageHeader, Switch, Toast } from './components';
import { adminApi } from './api';
import { HERO_DESTINATIONS } from '../../../shared/heroDestinations';

type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE' | null;
type SlideStatus = 'PUBLISHED' | 'SCHEDULED' | 'EXPIRED' | 'DISABLED' | 'NEW_DRAFT' | 'MODIFIED' | 'DELETING';

interface Slide {
  id: string;
  status: SlideStatus;
  changeType: ChangeType;
  liveId: string | null;
  image: string;
  video: string;
  title: string;
  title_ar: string;
  subtitle: string;
  subtitle_ar: string;
  cta: string;
  cta_ar: string;
  destination_type: string;
  destination_value: string;
  bg_mode: 'auto' | 'manual';
  bg_color: string;
  display_order: number;
  active: 0 | 1;
  published_from: string;
  published_to: string;
  imageAvailable: boolean;
  hasPalette: boolean;
}

interface PreviewCard {
  id: string;
  image: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  cta: string;
  ctaAr: string;
  href: string;
  background: string;
  dominant: string;
  luminance: number;
}

type Form = Omit<Slide, 'id' | 'status' | 'changeType' | 'liveId' | 'imageAvailable' | 'hasPalette' | 'active' | 'published_from' | 'published_to'> & {
  active: boolean;
  published_from: string;
  published_to: string;
};

const STATUS_LABEL: Record<SlideStatus, string> = {
  PUBLISHED: 'En ligne',
  SCHEDULED: 'Planifiée',
  EXPIRED: 'Expirée',
  DISABLED: 'Désactivée',
  NEW_DRAFT: 'Nouvelle (brouillon)',
  MODIFIED: 'Modifiée (non publiée)',
  DELETING: 'À supprimer',
};

const STATUS_TONE: Record<SlideStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  PUBLISHED: 'success',
  SCHEDULED: 'neutral',
  EXPIRED: 'neutral',
  DISABLED: 'warning',
  NEW_DRAFT: 'warning',
  MODIFIED: 'warning',
  DELETING: 'danger',
};

const EMPTY_FORM: Form = {
  image: '', video: '', title: '', title_ar: '', subtitle: '', subtitle_ar: '', cta: '', cta_ar: '',
  destination_type: 'CAMPAIGN', destination_value: '', bg_mode: 'auto', bg_color: '',
  display_order: 10, active: true, published_from: '', published_to: '',
};

const NEUTRAL = '#F4F4F2';

/** ISO ⇄ champ datetime-local (heure locale de l'opérateur). */
function toLocalInput(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const fromLocalInput = (local: string): string => (local ? new Date(local).toISOString() : '');

const inkOn = (luminance: number) => (luminance > 0.45 ? '#1A1A1A' : '#FFFFFF');

function formFromSlide(slide: Slide): Form {
  return {
    image: slide.image, video: slide.video, title: slide.title, title_ar: slide.title_ar,
    subtitle: slide.subtitle, subtitle_ar: slide.subtitle_ar, cta: slide.cta, cta_ar: slide.cta_ar,
    destination_type: slide.destination_type || 'CAMPAIGN', destination_value: slide.destination_value,
    bg_mode: slide.bg_mode, bg_color: slide.bg_color, display_order: slide.display_order,
    active: Boolean(slide.active), published_from: toLocalInput(slide.published_from),
    published_to: toLocalInput(slide.published_to),
  };
}

function payloadFromForm(form: Form) {
  return {
    ...form,
    active: form.active,
    published_from: fromLocalInput(form.published_from),
    published_to: fromLocalInput(form.published_to),
  };
}

export function HeroSlidesManagePage({ canWrite }: { canWrite: boolean }) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [cards, setCards] = useState<PreviewCard[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [maxCards, setMaxCards] = useState(6);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [previewLang, setPreviewLang] = useState<'fr' | 'ar'>('fr');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [manage, preview] = await Promise.all([
        adminApi<any>('/hero-slides/manage'),
        adminApi<any>('/hero-slides/preview'),
      ]);
      setSlides(manage.data ?? []);
      setPendingCount(manage.pendingCount ?? 0);
      setMaxCards(manage.maxCards ?? 6);
      setCards(preview.data ?? []);
    } catch (error: any) {
      setToast({ message: error?.message || 'Chargement impossible.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Exécute une action serveur, rafraîchit la liste, et remonte l'erreur lisible. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      setToast({ message: success, tone: 'success' });
      await load();
      return true;
    } catch (error: any) {
      setToast({ message: error?.message || 'Action impossible.', tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => slides.filter((slide) => slide.changeType !== 'DELETE'), [slides]);

  const openNew = () => {
    setErrors({});
    setEditing({ id: null, form: { ...EMPTY_FORM, display_order: (visible.length + 1) * 10 } });
  };
  const openEdit = (slide: Slide) => {
    setErrors({});
    setEditing({ id: slide.id, form: formFromSlide(slide) });
  };

  const patchForm = (change: Partial<Form>) => setEditing((current) => (current ? { ...current, form: { ...current.form, ...change } } : current));

  const saveDraft = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = JSON.stringify(payloadFromForm(editing.form));
      if (editing.id) await adminApi(`/hero-slides/drafts/${editing.id}`, { method: 'PUT', body });
      else await adminApi('/hero-slides/drafts', { method: 'POST', body });
      setEditing(null);
      setToast({ message: 'Brouillon enregistré — non visible par les visiteurs tant que vous ne publiez pas.', tone: 'success' });
      await load();
    } catch (error: any) {
      if (error?.body?.errors) setErrors(error.body.errors);
      setToast({ message: error?.message || 'Enregistrement impossible.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const move = (slide: Slide, direction: -1 | 1) => {
    const index = visible.findIndex((item) => item.id === slide.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= visible.length) return;
    const order = visible.map((item) => item.id);
    [order[index], order[target]] = [order[target], order[index]];
    void run(() => adminApi('/hero-slides/reorder', { method: 'POST', body: JSON.stringify({ ids: order }) }), 'Ordre mis en brouillon.');
  };

  const toggleActive = (slide: Slide) => run(
    () => adminApi(`/hero-slides/drafts/${slide.id}`, { method: 'PUT', body: JSON.stringify({ active: !slide.active }) }),
    slide.active ? 'Carte désactivée en brouillon.' : 'Carte réactivée en brouillon.',
  );

  const publish = async () => {
    setConfirmPublish(false);
    setBusy(true);
    try {
      const result = await adminApi<any>('/hero-slides/publish', { method: 'POST' });
      setProblems({});
      setToast({ message: `Publié : ${result.data.created} créée(s), ${result.data.updated} modifiée(s), ${result.data.deleted} supprimée(s).`, tone: 'success' });
      await load();
    } catch (error: any) {
      // 422 : une ou plusieurs cartes incomplètes — on les signale dans la liste.
      const map: Record<string, string> = {};
      const details: Record<string, Record<string, string>> = error?.body?.problems ?? {};
      for (const [id, fields] of Object.entries(details)) map[id] = Object.values(fields)[0] ?? 'Carte incomplète.';
      setProblems(map);
      setToast({ message: error?.message || 'Publication refusée.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const discardAll = () => run(() => adminApi('/hero-slides/discard-all', { method: 'POST' }), 'Modifications en attente abandonnées.');

  const previewCardsList = previewLang === 'ar'
    ? cards.map((card) => ({ ...card, title: card.titleAr || card.title, subtitle: card.subtitleAr || card.subtitle, cta: card.ctaAr || card.cta }))
    : cards;
  const first = previewCardsList[0];
  const sectionBg = first?.background || NEUTRAL;
  const sectionInk = inkOn(first?.luminance ?? 1);

  return (
    <div>
      <PageHeader
        title="Hero Slider"
        description="Cartes du carrousel de l’accueil. Chaque modification est un brouillon ; rien n’est visible par les visiteurs avant « Publier »."
        action={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => void load()} disabled={busy || loading}>Recharger</Button>
            {canWrite ? <Button variant="secondary" onClick={openNew} disabled={busy || loading || editing !== null}>Nouvelle carte</Button> : null}
            {canWrite && pendingCount > 0 ? <Button variant="secondary" onClick={() => void discardAll()} disabled={busy}>Tout abandonner</Button> : null}
            {canWrite ? (
              <Button onClick={() => setConfirmPublish(true)} busy={busy} disabled={pendingCount === 0 || busy}>
                {pendingCount > 0 ? `Publier (${pendingCount})` : 'Publier'}
              </Button>
            ) : null}
          </div>
        )}
      />
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
      {pendingCount > 0 ? (
        <p role="status" style={{ margin: '0 0 16px', padding: '10px 14px', borderRadius: 12, background: 'var(--admin-surface-tint)' }}>
          {pendingCount} modification(s) en brouillon — <strong>non visibles</strong> par les visiteurs.
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1.2fr) minmax(300px, 0.8fr)', gap: 24, alignItems: 'start' }}>
        <section aria-label="Cartes">
          {loading ? <p>Chargement…</p> : null}
          {!loading && slides.length === 0 ? <p>Aucune carte. Créez la première : elle restera en brouillon jusqu’à publication.</p> : null}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {slides.map((slide) => {
              const position = visible.findIndex((item) => item.id === slide.id);
              const deleting = slide.changeType === 'DELETE';
              return (
                <li key={slide.id} data-testid={`hero-slide-${slide.id}`} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 12, padding: 12, border: '1px solid var(--admin-line)', borderRadius: 14, opacity: deleting ? 0.6 : 1 }}>
                  <div style={{ position: 'relative', width: 72, aspectRatio: '4 / 5', borderRadius: 10, overflow: 'hidden', background: 'var(--admin-surface-soft)' }}>
                    {slide.image && slide.imageAvailable ? <img src={slide.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                    {!slide.imageAvailable ? <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 10, textAlign: 'center', padding: 4 }}>Image introuvable</span> : null}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slide.title || '(sans titre)'}</strong>
                      <Badge tone={STATUS_TONE[slide.status]}>{STATUS_LABEL[slide.status]}</Badge>
                      {!deleting ? <small>Position {position + 1}</small> : null}
                    </div>
                    {slide.title_ar ? <div dir="rtl" style={{ fontSize: 13, opacity: 0.8 }}>{slide.title_ar}</div> : null}
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {HERO_DESTINATIONS.find((d) => d.id === slide.destination_type)?.adminLabel ?? 'Destination non définie'}
                      {slide.bg_mode === 'manual' && slide.bg_color ? ` · fond ${slide.bg_color}` : ''}
                    </div>
                    {problems[slide.id] ? <div role="alert" className="admin-field-error" style={{ marginTop: 4 }}>{problems[slide.id]}</div> : null}
                    {canWrite ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {!deleting ? <Button variant="secondary" onClick={() => move(slide, -1)} disabled={busy || position <= 0} aria-label="Monter">↑</Button> : null}
                        {!deleting ? <Button variant="secondary" onClick={() => move(slide, 1)} disabled={busy || position < 0 || position >= visible.length - 1} aria-label="Descendre">↓</Button> : null}
                        {!deleting ? <Button variant="secondary" onClick={() => openEdit(slide)} disabled={busy || editing !== null}>Modifier</Button> : null}
                        {!deleting ? <Button variant="secondary" onClick={() => void toggleActive(slide)} disabled={busy}>{slide.active ? 'Désactiver' : 'Réactiver'}</Button> : null}
                        {deleting || slide.changeType === 'UPDATE' ? (
                          <Button variant="secondary" onClick={() => void run(() => adminApi(`/hero-slides/drafts/${slide.id}/discard`, { method: 'POST' }), 'Modification annulée.')} disabled={busy}>
                            {deleting ? 'Annuler la suppression' : 'Abandonner la modification'}
                          </Button>
                        ) : null}
                        {!deleting ? (
                          <Button variant="danger" onClick={() => void run(() => adminApi(`/hero-slides/${slide.id}`, { method: 'DELETE' }), slide.changeType === 'CREATE' ? 'Brouillon supprimé.' : 'Suppression mise en brouillon.')} disabled={busy}>Supprimer</Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside aria-label="Aperçu visiteur" style={{ position: 'sticky', top: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Aperçu visiteur (brouillons inclus)</strong>
            <div role="group" aria-label="Langue de l’aperçu" style={{ display: 'flex', gap: 4 }}>
              <Button variant={previewLang === 'fr' ? 'primary' : 'secondary'} onClick={() => setPreviewLang('fr')}>FR · LTR</Button>
              <Button variant={previewLang === 'ar' ? 'primary' : 'secondary'} onClick={() => setPreviewLang('ar')}>AR · RTL</Button>
            </div>
          </div>
          <div dir={previewLang === 'ar' ? 'rtl' : 'ltr'} data-testid="hero-preview" style={{ border: '1px solid var(--admin-line)', borderRadius: 16, padding: 16, background: sectionBg }}>
            {previewCardsList.length === 0 ? (
              <p style={{ margin: 0, color: sectionInk }}>Aucune carte visible : l’accueil affiche l’ancien hero.</p>
            ) : (
              <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
                {previewCardsList.slice(0, 3).map((card, index) => {
                  const ink = inkOn(card.luminance);
                  return (
                    <div key={card.id} style={{ flex: '0 0 76%', transform: index === 0 ? 'none' : 'scale(0.94)', opacity: index === 0 ? 1 : 0.8, borderRadius: 24, background: card.background || NEUTRAL, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {card.title ? <strong style={{ color: ink, fontSize: 17, lineHeight: 1.15 }}>{card.title}</strong> : null}
                      {card.subtitle ? <span style={{ color: ink, opacity: 0.75, fontSize: 13 }}>{card.subtitle}</span> : null}
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', borderRadius: 16, overflow: 'hidden', background: card.dominant || 'transparent' }}>
                        {card.image ? <img src={card.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                      </div>
                      {card.cta ? <span style={{ alignSelf: 'flex-start', background: ink, color: card.background || NEUTRAL, borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700 }}>{card.cta}</span> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, opacity: 0.75 }}>Visible : {cards.length} carte(s) sur {maxCards} autorisées (réglage « Carrousel Hero »).</p>
        </aside>
      </div>

      {editing ? (
        <section aria-label={editing.id ? 'Modifier la carte' : 'Nouvelle carte'} style={{ marginTop: 24, padding: 20, border: '1px solid var(--admin-line)', borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>{editing.id ? 'Modifier la carte (brouillon)' : 'Nouvelle carte (brouillon)'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <Field label="Visuel" required full error={errors.image} hint="Téléversé dans la médiathèque ; remplacer le visuel ne touche pas la version publiée avant publication.">
              <ImageUploader value={editing.form.image} onChange={(url) => patchForm({ image: url })} label="Ajouter ou remplacer le visuel" />
            </Field>
            <Field label="Titre (français)" required error={errors.title}>
              <input value={editing.form.title} maxLength={80} onChange={(event) => patchForm({ title: event.target.value })} />
            </Field>
            <Field label="Titre (arabe)" error={errors.title_ar}>
              <input dir="rtl" value={editing.form.title_ar} maxLength={80} onChange={(event) => patchForm({ title_ar: event.target.value })} />
            </Field>
            <Field label="Description (français)" error={errors.subtitle}>
              <input value={editing.form.subtitle} maxLength={160} onChange={(event) => patchForm({ subtitle: event.target.value })} />
            </Field>
            <Field label="Description (arabe)" error={errors.subtitle_ar}>
              <input dir="rtl" value={editing.form.subtitle_ar} maxLength={160} onChange={(event) => patchForm({ subtitle_ar: event.target.value })} />
            </Field>
            <Field label="Bouton (français)" error={errors.cta}>
              <input value={editing.form.cta} maxLength={40} onChange={(event) => patchForm({ cta: event.target.value })} />
            </Field>
            <Field label="Bouton (arabe)" error={errors.cta_ar}>
              <input dir="rtl" value={editing.form.cta_ar} maxLength={40} onChange={(event) => patchForm({ cta_ar: event.target.value })} />
            </Field>
            <Field label="Destination" required error={errors.destination_type} hint={HERO_DESTINATIONS.find((d) => d.id === editing.form.destination_type)?.adminLabel}>
              <select value={editing.form.destination_type} onChange={(event) => patchForm({ destination_type: event.target.value, destination_value: '' })}>
                {HERO_DESTINATIONS.map((destination) => <option key={destination.id} value={destination.id}>{destination.adminLabel}</option>)}
              </select>
            </Field>
            {HERO_DESTINATIONS.find((d) => d.id === editing.form.destination_type)?.needsValue ? (
              <Field label={editing.form.destination_type === 'EXTERNAL' ? 'Lien (https)' : 'Identifiant de la cible'} required error={errors.destination_value}>
                <input value={editing.form.destination_value} onChange={(event) => patchForm({ destination_value: event.target.value })} />
              </Field>
            ) : null}
            <Field label="Fond" error={errors.bg_color} hint="Automatique = couleur extraite du visuel. Manuel = couleur choisie.">
              <select value={editing.form.bg_mode} onChange={(event) => patchForm({ bg_mode: event.target.value as 'auto' | 'manual' })}>
                <option value="auto">Automatique (depuis le visuel)</option>
                <option value="manual">Manuel</option>
              </select>
            </Field>
            {editing.form.bg_mode === 'manual' ? (
              <Field label="Couleur de fond" error={errors.bg_color}>
                <input value={editing.form.bg_color} placeholder="#rrggbb" onChange={(event) => patchForm({ bg_color: event.target.value })} />
              </Field>
            ) : null}
            <Field label="Position" error={errors.display_order} hint="Plus petit = plus à gauche.">
              <input type="number" min={0} max={9999} value={editing.form.display_order} onChange={(event) => patchForm({ display_order: Number(event.target.value) || 0 })} />
            </Field>
            <Field label="Début de publication (optionnel)" error={errors.published_from}>
              <input type="datetime-local" value={editing.form.published_from} onChange={(event) => patchForm({ published_from: event.target.value })} />
            </Field>
            <Field label="Fin de publication (optionnel)" error={errors.published_to}>
              <input type="datetime-local" value={editing.form.published_to} onChange={(event) => patchForm({ published_to: event.target.value })} />
            </Field>
            <Field label="Carte" full>
              <Switch checked={editing.form.active} onChange={() => patchForm({ active: !editing.form.active })} onLabel="Active (visible à la publication)" offLabel="Désactivée" />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button onClick={() => void saveDraft()} busy={busy} disabled={!canWrite}>Enregistrer le brouillon</Button>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Annuler</Button>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmPublish}
        title="Publier les modifications ?"
        message={`${pendingCount} modification(s) seront visibles par les visiteurs. Si une carte est incomplète, rien ne sera publié.`}
        confirmLabel="Publier"
        busy={busy}
        onConfirm={() => void publish()}
        onCancel={() => setConfirmPublish(false)}
      />
    </div>
  );
}
