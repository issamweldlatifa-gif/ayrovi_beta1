/**
 * P2.0 — BackOfficeShell : la coquille unique de /admin.
 *
 * Elle s'ENROULE autour des écrans existants, elle ne les remplace pas :
 *  • la navigation vient de `/api/admin/back-office/navigation` (registre + permissions + statut
 *    de module) — plus aucune liste de modules écrite à la main dans le client ;
 *  • l'état `?section=` (deep links, bouton retour, `request=`/`tab=`) est conservé à
 *    l'identique : `pushUrlPreservingNavigation` et le `popstate` d'avant sont rejoués ici ;
 *  • la recherche globale et la palette ⌘K sont branchées sur le framework ;
 *  • si le framework ne répond pas, la coquille prévient et laisse travailler : aucune page
 *    n'est condamnée par un méta-endpoint indisponible.
 *
 * ── Modèle A « Console opérationnelle » (retenu le 2026-09-22) ────────────────────────────────
 * La coquille a été recomposée selon les conventions d'Amazon Seller Central, en gardant le
 * même contrat serveur (aucune section, aucun droit, aucun deep link n'a bougé) :
 *   1. BARRE 1 (encre) : identité, recherche globale, préférences, cloche, compte.
 *   2. BARRE 2 : les SERVICES — les groupes de la navigation serveur. Choisir un service ne
 *      change pas de contrat, il change de vue : c'est le même payload, filtré.
 *   3. RAIL (blanc) : uniquement les écrans du service actif. L'ancienne liste de 49 entrées
 *      obligeait à faire défiler un menu pour trouver un écran ; ici, trouver c'est lire une
 *      liste de 1 à 15 lignes.
 *   4. FIL D'ARIANE mince : le titre reste la propriété de l'écran (il n'est plus affiché deux
 *      fois — c'était l'un des défauts relevés).
 *   5. FILTRE DE DOMAINE : rendu seulement quand le service mélange réellement plusieurs
 *      domaines (Commerce, Contenu, Système). Ailleurs, c'est un contrôle qui ne filtre rien :
 *      il est retiré, et le filtre est remis à « Tous » pour ne jamais masquer un écran.
 *
 * Ce qui a été retiré, parce que c'était en trop (décision de revue, 2026-09-22) :
 *   • le bloc « Au quotidien », qui recopiait 4 écrans déjà présents en dessous (doublons visibles
 *     dans le rail : « Tableau de bord » et « Commandes » apparaissaient deux fois) ;
 *   • les pastilles « legacy » et « doublon » : vocabulaire d'atelier affiché à l'opérateur. La
 *     même information reste disponible — infobulle de l'entrée, et bandeau « ancienne surface »
 *     de l'écran concerné, qui dit quoi faire.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell, Calculator, Calendar, Camera, ChartLine, CheckCircle2, Clipboard, Eye, FileText, Gift, Globe2, Grid, History, Home, Image, LayoutGrid, LensBox,
  LogOut, MapPin, Menu, MessageSquare, Package, PackageCheck, Palette, Settings, ShieldCheck, ShoppingBag, Sparkles, Tag, Truck, User, X, Zap,
} from '../../components/QatafoIcons';
import { pushUrlPreservingNavigation } from '../../navigation/NavigationHistory';
import { labels } from './resource-ui';
import { NotificationsBell } from './NotificationsBell';
import { CommandPalette, GlobalSearch } from './BackOfficeSearch';
import { sectionFromAdminPath, useBackOffice, type BackOfficeNavItem } from './framework';

export type BackOfficeRenderContext = {
  section: string;
  navigate: (section: string, request?: string) => void;
  requestedReview: string;
  pendingMagazineDraft: string;
  openMagazineDraft: (draftId?: string) => void;
  clearPendingMagazineDraft: () => void;
  can: (permission: string) => boolean;
};

/** Toutes les icônes déclarées par le registre serveur — le sprite partagé, jamais un composant par écran. */
const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  Home, Calendar, ShoppingBag, Gift, ChartLine, FileText, Sparkles, Tag, Image, LensBox, LayoutGrid,
  Bell, ShieldCheck, Package, MessageSquare, Camera, User, Calculator, Grid, History, Settings, Eye, Palette, Zap, CheckCircle2,
  // P2.3 — trois entrées de navigation d'achats ; le sprite partagé reste la seule source d'icônes.
  Truck, Clipboard, PackageCheck,
  // GLOBAL DISCOVERY — registres des sources et des marchés (web mondial).
  Globe2, MapPin,
};

/**
 * Les icônes sont un détail de présentation : la liste des modules, elle, vit côté serveur.
 *
 * P3/T2 — contrat verrouillé par `tests/back-office-foundation.test.ts` : chaque `nav.icon` du
 * registre a une clé dans `ICONS` (les 49 entrées actuelles sont couvertes). Un nom inconnu rend
 * le glyphe neutre du sprite.
 */
function NavIcon({ name }: { name: string }) {
  const Icon = ICONS[name] ?? Grid;
  return <Icon size={17} />;
}

export const BackOfficeShell: React.FC<{
  identity: { name: string; email: string; role: string; permissions: string[] };
  onLogout: () => void;
  renderPage: (context: BackOfficeRenderContext) => React.ReactNode;
}> = ({ identity, onLogout, renderPage }) => {
  const { context, navigation, resources, loading, error, retry, descriptorFor } = useBackOffice();
  // Garde d'environnement : le rendu serveur (tests, pré-rendu) n'a pas d'URL — la coquille
  // démarre alors sur le tableau de bord, sans jamais lever d'exception.
  const initialParams = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const initialSection = initialParams.get('section')
    || (typeof window === 'undefined' ? null : sectionFromAdminPath(window.location.pathname))
    || 'dashboard';
  const [section, setSection] = useState(initialSection);
  const [requestedReview, setRequestedReview] = useState(initialParams.get('request') || '');
  const [pendingMagazineDraft, setPendingMagazineDraft] = useState('');
  const [domain, setDomain] = useState<string>('ALL');
  /** Service choisi explicitement : `null` = on suit l'écran courant (deep links, palette, popstate). */
  const [service, setService] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [profile, setProfile] = useState(false);
  const [palette, setPalette] = useState(false);
  const [density, setDensity] = useState<string>(() => {
    if (typeof window === 'undefined') return 'compact';
    try {
      const stored = window.localStorage.getItem('ayrovi.bo.density');
      // Modèle A : la densité d'outil est le défaut ; « confortable » reste un choix explicite.
      return stored === 'comfortable' ? 'comfortable' : 'compact';
    } catch { return 'compact'; }
  });
  // E8 — thème clair/sombre et direction LTR/RTL de la coquille. Défauts : clair + LTR.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const stored = window.localStorage.getItem('ayrovi.bo.theme');
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { return 'light'; }
  });
  const [dir, setDir] = useState<'ltr' | 'rtl'>(() => {
    if (typeof window === 'undefined') return 'ltr';
    try { return window.localStorage.getItem('ayrovi.bo.dir') === 'rtl' ? 'rtl' : 'ltr'; } catch { return 'ltr'; }
  });

  const can = useCallback((permission: string) => identity.permissions.includes(permission as never), [identity.permissions]);
  const navigate = useCallback((id: string, request?: string) => {
    setSection(id); setRequestedReview(request || ''); setMobile(false);
    const params = new URLSearchParams({ section: id });
    if (request) params.set('request', request);
    pushUrlPreservingNavigation(`/admin?${params}`);
    if (id === 'arrival-ingestion') window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, []);
  const openMagazineDraft = useCallback((draftId?: string) => { setPendingMagazineDraft(draftId || ''); navigate('news'); }, [navigate]);
  const clearPendingMagazineDraft = useCallback(() => setPendingMagazineDraft(''), []);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(location.search);
      setSection(params.get('section') || sectionFromAdminPath(location.pathname) || 'dashboard');
      setRequestedReview(params.get('request') || '');
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  // ⌘K / Ctrl+K : la palette est le seul launcher du back office.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette((value) => !value); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Le deep-link d'une section inconnue ou non permise retombe sur le tableau de bord (comme avant).
  useEffect(() => {
    if (!navigation) return;
    const known = navigation.groups.flatMap((group) => group.items);
    if (!known.some((item) => item.section === section || (item as any).aliases?.includes(section))) {
      if (section !== 'dashboard') navigate('dashboard');
    }
  }, [navigation, section, navigate]);

  useEffect(() => {
    try { window.localStorage.setItem('ayrovi.bo.density', density); } catch { /* stockage indisponible : présentationnel seulement */ }
  }, [density]);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem('ayrovi.bo.theme', theme); } catch { /* idem */ }
  }, [theme]);
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('dir', dir);
    try { window.localStorage.setItem('ayrovi.bo.dir', dir); } catch { /* idem */ }
  }, [dir]);

  // En quittant /admin, on retire les attributs posés sur <html> : le site public
  // redevient LTR par défaut et ne porte pas un data-theme sans son thème sombre.
  useEffect(() => () => {
    if (typeof document === 'undefined') return;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('dir');
  }, []);

  /** Services = groupes de la navigation serveur (aucun regroupement inventé côté client). */
  const services = useMemo(() => navigation?.groups ?? [], [navigation]);
  const allItems = useMemo(() => services.flatMap((group) => group.items), [services]);
  const activeItem = allItems.find((item) => item.section === section || (item as any).aliases?.includes(section));
  // Le service affiché suit l'écran courant, sauf si l'utilisateur a choisi un service explicitement.
  const activeService = services.find((group) => group.label === service)
    ?? services.find((group) => group.label === activeItem?.group)
    ?? services[0];

  const domainOf = useCallback((item: BackOfficeNavItem) => item.domain, []);
  const serviceItems = useMemo(
    () => (activeService?.items ?? []).filter((item) => domain === 'ALL' || domainOf(item) === domain),
    [activeService, domain, domainOf],
  );
  /** Le filtre de domaine n'a de sens que si le service mélange plusieurs domaines. */
  const mixesDomains = useMemo(
    () => new Set((activeService?.items ?? []).map((item) => item.domain)).size > 1,
    [activeService],
  );
  /**
   * Un service homogène remet le filtre à « Tous » : sinon le filtre disparaît de l'écran mais
   * reste actif en mémoire, et le rail peut se retrouver vide sans que rien ne l'explique.
   */
  useEffect(() => { if (!mixesDomains && domain !== 'ALL') setDomain('ALL'); }, [mixesDomains, domain]);

  const selectService = useCallback((label: string) => {
    setService(label);
    // Comme dans une console de service : choisir un service ouvre son premier écran.
    const first = navigation?.groups.find((group) => group.label === label)?.items[0];
    if (first && first.section !== section) navigate(first.section);
  }, [navigation, navigate, section]);

  const descriptor = descriptorFor(section);
  const canonicalSection = (() => {
    const key = descriptor?.canonicalOf;
    if (!key) return undefined;
    const target = resources.find((item) => item.key === key || item.section === key);
    if (!target) return undefined;
    return allItems.find((item) => item.section === target.section);
  })();
  const title = descriptor?.label || activeItem?.label || 'Administration';
  const employee = context?.employee;
  const domains = context?.domains ?? [];

  /**
   * Une entrée du rail. L'état technique du module (`legacy`, doublon) ne s'affiche plus comme une
   * pastille : il passe dans l'infobulle et dans le bandeau de l'écran, qui dit quoi faire.
   */
  const renderNavButton = (item: BackOfficeNavItem) => {
    const hints = [item.description];
    if (item.moduleStatus === 'legacy') hints.push('ancienne surface conservée');
    if (item.canonicalOf) hints.push(`maître : ${item.canonicalOf}`);
    return <button key={item.section}
      className={`${section === item.section ? 'is-active' : ''} ${item.section === 'news' ? 'is-magazine-drop-target' : ''}`.trim()}
      onClick={() => navigate(item.section)}
      onDragOver={item.section === 'news' ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } : undefined}
      onDrop={item.section === 'news' ? (event) => {
        event.preventDefault();
        const draftId = event.dataTransfer.getData('application/x-ayrovi-magazine-draft') || event.dataTransfer.getData('text/plain');
        if (draftId.startsWith('mag_draft_')) openMagazineDraft(draftId);
      } : undefined}
      title={hints.join(' · ')}>
      <NavIcon name={item.icon} />
      <span>{item.label}</span>
      {section === item.section && <i />}
    </button>;
  };

  return <div className={`admin-shell bo-shell ${density === 'compact' ? 'is-compact' : ''}`.trim()} data-device-target="desktop">
    {/* Barre 1 — identité, recherche globale, préférences, compte */}
    <header className="bo-topbar bo-header">
      <div className="bo-topbar-brand">
        <img src="/media/logo-ayrovi-lockup-white-orange.svg" alt="AYROVI" style={{ width: 'auto', height: 22 }} />
        <div><span>CONSOLE DE GESTION</span></div>
      </div>
      <div className="bo-topbar-search"><GlobalSearch onNavigate={navigate} /></div>
      <div className="bo-topbar-actions admin-header-actions">
        <button className="admin-mobile-menu admin-icon-button" onClick={() => setMobile(true)} aria-label="Ouvrir le menu"><Menu /></button>
        <button className="admin-icon-button" onClick={() => setPalette(true)} title="Palette de commandes (⌘K)" aria-label="Palette de commandes"><Sparkles /></button>
        <button className="admin-icon-button" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
          title={density === 'compact' ? 'Densité confortable' : 'Densité compacte'} aria-label="Changer la densité"><Zap /></button>
        <button className="admin-icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'} aria-label="Basculer le thème sombre / clair"><Palette /></button>
        <button className="admin-icon-button" onClick={() => setDir(dir === 'rtl' ? 'ltr' : 'rtl')}
          title={dir === 'rtl' ? 'Basculer en français (LTR)' : 'Basculer en arabe (RTL)'} aria-label="Basculer la direction droite-à-gauche"><Globe2 /></button>
        <NotificationsBell onNavigate={navigate} />
        <div className="admin-profile">
          <button onClick={() => setProfile(!profile)}>
            <i>{identity.name.slice(0, 2).toUpperCase()}</i>
            <span><strong>{identity.name}</strong><small>{labels[identity.role] || identity.role}</small></span>
          </button>
          {profile && <div>
            <span>{identity.email}</span>
            {employee && <span className="bo-profile-employee">{employee.label ?? '—'} · <code>{employee.code}</code>{employee.branch ? ` · ${employee.branch}` : ''}</span>}
            {!employee && <span className="bo-profile-employee muted">Aucune fiche employée rattachée à ce compte</span>}
            <button onClick={onLogout}><LogOut />Se déconnecter</button>
          </div>}
        </div>
      </div>
    </header>

    {/* Barre 2 — services : les groupes du registre serveur, rien d'autre */}
    <nav className="bo-servicebar" aria-label="Services de la console">
      {services.map((group) => (
        <button key={group.label} type="button"
          className={`bo-service ${activeService?.label === group.label ? 'is-active' : ''}`.trim()}
          aria-current={activeService?.label === group.label ? 'page' : undefined}
          onClick={() => selectService(group.label)}>
          <span>{group.label}</span>
          <small>{group.items.length}</small>
        </button>
      ))}
      {(context?.roadmap?.length ?? 0) > 0 && <span className="bo-service-placeholder" aria-hidden="true" />}
    </nav>

    <div className="bo-body">
      <aside className={`admin-sidebar ${mobile ? 'is-open' : ''}`}>
        <div className="bo-rail-head">
          <div>
            <strong>{activeService?.label ?? 'Console'}</strong>
            <span>{serviceItems.length} écran{serviceItems.length > 1 ? 's' : ''}{domain !== 'ALL' ? ` · ${domain}` : ''}</span>
          </div>
          <button onClick={() => setMobile(false)} aria-label="Fermer le menu"><X /></button>
        </div>

        {/* Filtre de domaine : seulement quand le service mélange les domaines */}
        {(mixesDomains || domain !== 'ALL') && domains.length > 1 && (
          <div className="bo-domains" role="tablist" aria-label="Domaine du back office">
            <button role="tab" aria-selected={domain === 'ALL'} onClick={() => setDomain('ALL')}>
              <span>Tous</span><small>{activeService?.items.length ?? 0}</small>
            </button>
            {domains.map((entry) => {
              const count = (activeService?.items ?? []).filter((item) => item.domain === entry.key).length;
              if (!count) return null;
              return <button key={entry.key} role="tab" aria-selected={domain === entry.key}
                onClick={() => setDomain(entry.key)} title={entry.description}>
                <span>{entry.label}</span><small>{count}</small>
              </button>;
            })}
          </div>
        )}

        <nav aria-label={`Écrans — ${activeService?.label ?? 'console'}`}>
          {loading && <p className="bo-nav-state">Chargement de la navigation…</p>}
          {error && (
            <p className="bo-nav-state is-error">
              Navigation indisponible ({error}). <button type="button" onClick={retry}>Réessayer</button>
            </p>
          )}
          {!loading && !error && serviceItems.length === 0 && (
            <p className="bo-nav-state">
              Aucun écran dans ce domaine.
              <button type="button" onClick={() => setDomain('ALL')}> Voir tous les écrans du service</button>
            </p>
          )}
          {serviceItems.map(renderNavButton)}

          {/* La feuille de route n'appartient pas à un service : elle reste en bas du rail. */}
          {(context?.roadmap?.length ?? 0) > 0 && (
            <div className="bo-roadmap">
              <span>Modules à venir</span>
              {context!.roadmap.map((module) => (
                <div key={module.key} className="bo-roadmap-item" title={module.description}>
                  <strong>{module.label}</strong><em>{module.status}</em>
                </div>
              ))}
            </div>
          )}

          {/* Accès rapide aux autres services : le rail ne les affiche plus en entier, mais on ne
              perd pas le « où aller ensuite » (même donnée serveur, aucun doublon d'écran). */}
          {services.filter((group) => group.label !== activeService?.label).length > 0 && (
            <div className="bo-rail-services">
              <span>Autres services</span>
              {services.filter((group) => group.label !== activeService?.label).map((group) => (
                <button key={group.label} type="button" className="bo-rail-service" onClick={() => selectService(group.label)}>
                  <span>{group.label}</span><small>{group.items.length}</small>
                </button>
              ))}
            </div>
          )}
        </nav>

        <div className="admin-sidebar-foot">
          <a href="/" target="_blank" rel="noopener noreferrer">Voir le site public</a>
          <span>AYROVI v3.10.4 · Tunis · framework {context?.frameworkVersion ?? '—'}</span>
        </div>
      </aside>
      {mobile && <button className="admin-sidebar-overlay" onClick={() => setMobile(false)} aria-label="Fermer le menu" />}

      <div className="admin-workspace">
        {/* Fil d'Ariane : le titre de l'écran n'est plus écrit ici (il l'était deux fois). */}
        <div className="bo-screenbar">
          <nav aria-label="Fil d'Ariane">
            <b>{activeService?.label ?? 'Console'}</b>
            <span aria-hidden="true">/</span>
            <strong>{title}</strong>
            {descriptor?.moduleStatus === 'legacy' && <><span aria-hidden="true">·</span><span>ancienne surface</span></>}
          </nav>
          <div className="bo-screenbar-end">
            {descriptor?.domain && <code>{descriptor.domain}</code>}
          </div>
        </div>

        {descriptor?.canonicalOf && (
          <p className="bo-notice">
            <ShieldCheck size={16} />
            <span>
              Ancienne surface : le maître canonique est <code>{canonicalSection?.label ?? descriptor.canonicalOf}</code>.
              {descriptor.notes ? ` ${descriptor.notes}` : ''}
            </span>
            {canonicalSection && <button type="button" onClick={() => navigate(canonicalSection.section)}>Ouvrir la surface canonique</button>}
          </p>
        )}

        <main className="admin-main">
          {renderPage({ section, navigate, requestedReview, pendingMagazineDraft, openMagazineDraft, clearPendingMagazineDraft, can })}
        </main>
      </div>
    </div>

    <CommandPalette open={palette} onClose={() => setPalette(false)} onNavigate={navigate} />
  </div>;
};
