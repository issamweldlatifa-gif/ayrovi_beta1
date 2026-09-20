import { ArrowRight } from './QatafoIcons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getStories } from '../social/storyService';
import type { Story, StoryCta } from '../social/types';
import type { StoryGroup } from '../social/components/StoryCircles';
import { StoryViewer } from '../social/components/StoryViewer';
import { CommentSheet } from '../social/components/CommentSheet';
import { useNavigationHistory } from '../navigation/NavigationHistory';

/**
 * STORIES — SECTION D'ACCUEIL (modèle fourni : « Stories sur Zalando »)
 * --------------------------------------------------------------------
 * Le modèle de référence, relevé au pixel sur la capture :
 *   • un titre très lisible, son sous-titre, puis le lien « Explorer toutes les stories › » ;
 *   • une CARTE TRÈS GRANDE — environ 78 % de la largeur de l'écran — la suivante
 *     dépasse légèrement du bord droit pour inviter au défilement ;
 *   • sur chaque carte, un texte posé EN BAS de l'image : une pastille de canal,
 *     le titre de la story puis sa description.
 *
 * Tout est piloté depuis Admin → Contenu → Social → onglet Story → « Bloc d'accueil ».
 * Aucun texte ni image n'est figé dans ce composant.
 *
 * Charte Zalando : la section reste monochrome. La seule touche orangée est la
 * flèche du lien « Explorer toutes les stories ».
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
 * Si l'API ne répond pas, la section ne s'affiche pas plutôt que d'exposer un
 * texte qui ne viendrait pas du Dashboard.
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
      if (settingsJson?.success && settingsJson.data) setSettings({ ...FALLBACK, ...settingsJson.data });
      setStories(loadedStories);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const count = Math.min(5, Math.max(4, Number(settings?.cardCount ?? 4)));
  /** Les stories les plus prioritaires d'abord — comme les trie le Dashboard. */
  const visible = useMemo(() => stories.slice(0, count), [stories, count]);

  /** Le viewer attend des groupes : ici, une carte = une story. */
  const groups = useMemo<StoryGroup[]>(
    () => visible.map((story) => ({
      publisher: story.publisher,
      stories: [story],
      hasUnseen: !story.seen,
    })),
    [visible],
  );

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

  /** Le lien du haut : destination configurée, sinon l'onglet Stories du site. */
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
      <div className="stories-showcase__head">
        <h2 className="stories-showcase__title" id="stories-showcase-title">{settings.title}</h2>
        {settings.subtitle ? <p className="stories-showcase__subtitle">{settings.subtitle}</p> : null}
        {settings.ctaLabel ? (
          <button type="button" className="stories-showcase__cta" onClick={explore}>
            <span>{settings.ctaLabel}</span>
            <ArrowRight size={17} />
          </button>
        ) : null}
      </div>

      {/* Rail horizontal : une carte très large, la suivante dépasse du bord. */}
      <ul className="stories-showcase__rail">
        {visible.map((story, index) => (
          <li key={story.id} className="stories-showcase__cell">
            <button
              type="button"
              className="stories-showcase__card"
              onClick={() => setViewerIndex(index)}
              aria-label={story.title}
            >
              <img className="stories-showcase__img" src={story.media?.url || ''} alt="" loading="lazy" decoding="async" />
              <span className="stories-showcase__overlay">
                {story.publisher?.name ? <span className="stories-showcase__badge">{story.publisher.name}</span> : null}
                <span className="stories-showcase__cardtitle">{story.title}</span>
                {story.description ? <span className="stories-showcase__carddesc">{story.description}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {viewerIndex != null && groups[viewerIndex] ? (
        <StoryViewer
          groups={groups}
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
