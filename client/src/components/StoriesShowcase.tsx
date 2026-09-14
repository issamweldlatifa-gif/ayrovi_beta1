import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getStories } from '../social/storyService';
import type { Story, StoryCta } from '../social/types';
import { groupByPublisher, type StoryGroup } from '../social/components/StoryCircles';
import { StoryViewer } from '../social/components/StoryViewer';
import { CommentSheet } from '../social/components/CommentSheet';
import { useNavigationHistory } from '../navigation/NavigationHistory';

/**
 * STORIES — CONTENEUR D'ACCUEIL (référence : Zalando « Stories sur Zalando »)
 * -------------------------------------------------------------------------
 * Le modèle repris de la référence : un conteneur titré, une ligne de 4 ou 5
 * cartes **de dimensions identiques**, puis le lien d'action **centré au milieu
 * du conteneur** (« Explorer toutes les stories › »).
 *
 * Dashboard = Control · CMS = Source of Truth · Frontend = Presentation :
 * le titre, le sous-titre, le libellé et la destination du lien, le nombre de
 * cartes (4 ou 5) et la visibilité du bloc viennent de /api/public/stories-showcase
 * (Admin → Stories → Bloc d'accueil). Les stories, elles, viennent de /api/public/stories.
 * Aucun texte ni image n'est figé dans ce composant.
 *
 * Charte Zalando : conteneur monochrome (blanc/gris/encre). Le liseré des stories
 * non vues est en encre, pas en orange — l'orange reste réservé aux actions décisives.
 */

interface ShowcaseSettings {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
  cardCount: number;
  enabled: boolean;
}

interface Props {
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  /** Facultatif : sans handler fourni, le composant route lui-même les CTA de story. */
  onCta?: (cta: StoryCta) => void;
}

/**
 * Valeurs de repli volontairement vides : la base est la SEULE source de vérité.
 * Si l'API ne répond pas, le bloc ne s'affiche pas du tout plutôt que d'exposer
 * un texte qui ne viendrait pas du Dashboard.
 */
const FALLBACK: ShowcaseSettings = {
  title: '', subtitle: '', ctaLabel: '', ctaUrl: '', cardCount: 4, enabled: true,
};

export const StoriesShowcase: React.FC<Props> = ({ isAuthenticated, onRequireAuth, onCta }) => {
  const navigation = useNavigationHistory();
  const [settings, setSettings] = useState<ShowcaseSettings | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [ready, setReady] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [commentId, setCommentId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/public/stories-showcase').then((res) => (res.ok ? res.json() : null)).catch(() => null),
      getStories().catch(() => [] as Story[]),
    ]).then(([settingsJson, loadedStories]) => {
      if (!alive) return;
      if (settingsJson?.success && settingsJson.data) {
        setSettings({ ...FALLBACK, ...settingsJson.data });
      }
      setStories(loadedStories);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const groups = useMemo<StoryGroup[]>(() => groupByPublisher(stories), [stories]);
  const count = Math.min(5, Math.max(4, Number(settings?.cardCount ?? 4)));
  const visible = useMemo(() => groups.slice(0, count), [groups, count]);

  const refreshSeen = useCallback(() => {
    setStories((current) => current.map((story) => ({ ...story, seen: true })));
  }, []);

  /** Routage par défaut des CTA de story (promotions / url / arrivages). */
  const handleStoryCta = useCallback((cta: StoryCta) => {
    if (onCta) { onCta(cta); return; }
    if (cta.action === 'promotions') { navigation.navigate([{ id: 'cms:promotions' }]); return; }
    if (cta.action === 'url' && /^https?:\/\//i.test(cta.targetId || '')) { window.open(cta.targetId, '_blank', 'noopener,noreferrer'); return; }
    navigation.navigate([{ id: 'cms:arrivals' }]);
  }, [navigation, onCta]);

  /** Le lien central : destination configurée, sinon l'onglet Stories du site. */
  const explore = () => {
    const url = String(settings?.ctaUrl || '').trim();
    if (url.startsWith('/')) { navigation.navigate([{ id: `cms:${url.replace(/^\/+/, '')}` }]); return; }
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    navigation.navigate([{ id: 'cms:stories' }]);
  };

  // Rien à afficher : bloc désactivé, ou aucune story publiée.
  if (!ready || !settings || !settings.enabled || visible.length === 0) return null;

  return (
    <section className="stories-showcase" aria-labelledby="stories-showcase-title">
      <div className="stories-showcase__inner">
        <h2 className="stories-showcase__title" id="stories-showcase-title">{settings.title}</h2>
        {settings.subtitle ? <p className="stories-showcase__subtitle">{settings.subtitle}</p> : null}

        {/* Ligne de cartes — toutes de dimensions identiques (grille à colonnes égales). */}
        <ul
          className="stories-showcase__grid"
          style={{ ['--stories-showcase-count' as string]: String(count) }}
        >
          {visible.map((group, index) => (
            <li key={group.publisher.id} className="stories-showcase__cell">
              <button
                type="button"
                className={`stories-showcase__card${group.hasUnseen ? ' is-unseen' : ''}`}
                onClick={() => setViewerIndex(index)}
                aria-label={`Stories de ${group.publisher.name}`}
              >
                <span className="stories-showcase__thumb">
                  <img src={group.stories[0]?.media?.url || ''} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="stories-showcase__name">{group.publisher.name}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Lien d'action : centré au milieu du conteneur, sous la ligne de cartes. */}
        {settings.ctaLabel ? (
          <div className="stories-showcase__action">
            <button type="button" className="stories-showcase__cta" onClick={explore}>
              <span>{settings.ctaLabel}</span>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {viewerIndex != null && visible[viewerIndex] ? (
        <StoryViewer
          groups={visible}
          startIndex={viewerIndex}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
          onOpenComments={setCommentId}
          onClose={() => setViewerIndex(null)}
          onCta={handleStoryCta}
          onSeenChange={refreshSeen}
        />
      ) : null}

      {commentId ? (
        <CommentSheet
          postId={commentId}
          isAuthenticated={isAuthenticated}
          onRequireAuth={onRequireAuth}
          onClose={() => setCommentId(null)}
        />
      ) : null}
    </section>
  );
};

export default StoriesShowcase;
