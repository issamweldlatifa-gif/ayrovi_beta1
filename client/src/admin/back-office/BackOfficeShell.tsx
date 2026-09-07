/**
 * P2.0 — BackOfficeShell : la coquille unique de /admin.
 *
 * Elle s'ENROULE autour des écrans existants, elle ne les remplace pas :
 *  • la navigation vient de `/api/admin/back-office/navigation` (registre + permissions + statut
 *    de module) — plus aucune liste de modules écrite à la main dans le client ;
 *  • l'état `?section=` (deep links, bouton retour, `request=`/`tab=`) est conservé à
 *    l'identique : `pushUrlPreservingNavigation` et le `popstate` d'avant sont rejoués ici ;
 *  • l'entête affiche le domaine, le groupe, l'identité employé (`EMP-…`) et la cloche ;
 *  • la recherche globale et la palette ⌘K sont branchées sur le framework ;
 *  • si le framework ne répond pas, la coquille prévient et laisse travailler : aucune page
 *    n'est condamnée par un méta-endpoint indisponible.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell, Calculator, Calendar, Camera, ChartLine, CheckCircle2, Clipboard, Eye, FileText, Gift, Globe2, Grid, History, Home, Image, LayoutGrid, LensBox,
  LogOut, Menu, MessageSquare, Package, PackageCheck, Palette, Settings, ShieldCheck, ShoppingBag, Sparkles, Tag, Truck, User, X, Zap,
} from '../../components/QatafoIcons';
import { pushUrlPreservingNavigation } from '../../navigation/NavigationHistory';
import { labels } from './resource-ui';
import { NotificationsBell } from './NotificationsBell';
import { CommandPalette, GlobalSearch } from './BackOfficeSearch';
import { sectionFromAdminPath, useBackOffice, type BackOfficeNavItem } from './framework';
// P3/T2d : la feuille `back-office.css` a été fondue dans `admin.css` (même couche d'application).

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
};

/**
 * Les icônes sont un détail de présentation : la liste des modules, elle, vit côté serveur.
 *
 * P3/T2 — contrat verrouillé par `tests/back-office-foundation.test.ts` : chaque `nav.icon` du
 * registre a une clé dans `ICONS` (les 43 entrées actuelles sont couvertes). Un nom inconnu rend
 * désormais le glyphe neutre du sprite ; l'ancien repli `<i class="bo-nav-icon …">` comptait sur une
 * variable `--bo-icon` que personne ne définit et sur des classes `.bo-nav-icon--*` absentes du
 * dépôt — c'est-à-dire un carré de 19 px, silencieux. La règle CSS reste en place (aucune
 * suppression) mais n'est plus atteinte.
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
  const [mobile, setMobile] = useState(false);
  const [profile, setProfile] = useState(false);
  const [palette, setPalette] = useState(false);
  const [density, setDensity] = useState<string>(() => {
    if (typeof window === 'undefined') return 'comfortable';
    try { return window.localStorage.getItem('ayrovi.bo.density') === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
  });
  // E8 — thème clair/sombre et direction LTR/RTL de la coquille. Défauts : clair + LTR
  // (aucun changement de rendu pour l'existant). Préférence persistée, application sur
  // <html data-theme dir> — les tokens sombres vivent dans design/tokens.css.
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
    try { window.localStorage.setItem('ayrovi.bo.density', density); } catch { /* stockage indisponible : presentationnel seulement */ }
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

  const groups = useMemo(() => {
    const all = navigation?.groups ?? [];
    const domainOf = (item: BackOfficeNavItem) => item.domain;
    return all
      .map((group) => ({ ...group, items: group.items.filter((item) => domain === 'ALL' || domainOf(item) === domain) }))
      .filter((group) => group.items.length > 0);
  }, [navigation, domain]);

  const activeItem = navigation?.groups.flatMap((group) => group.items).find((item) => item.section === section);
  const descriptor = descriptorFor(section);
  // Le maître canonique est une clé de ressource : on la résout en section, et le lien ne s'affiche
  // que si CET écran est réellement navigable pour ce rôle (sinon le bandeau reste informatif —
  // une action invisible vaut mieux qu'un bouton qui mène dans le vide).
  const canonicalSection = (() => {
    const key = descriptor?.canonicalOf;
    if (!key) return undefined;
    const target = resources.find((item) => item.key === key || item.section === key);
    if (!target) return undefined;
    return navigation?.groups.flatMap((group) => group.items).find((item) => item.section === target.section);
  })();
  const title = descriptor?.label || activeItem?.label || 'Administration';
  const employee = context?.employee;

  return <div className={`admin-shell bo-shell ${density === 'compact' ? 'is-compact' : ''}`.trim()} data-device-target="desktop">
    <aside className={`admin-sidebar ${mobile ? 'is-open' : ''}`}>
      <div className="admin-sidebar-logo">
        <img src="/media/logo-ayrovi.png" alt="AYROVI" style={{ width: 30, height: 30, objectFit: 'contain' }} />
        <div><strong>AYROVI</strong><span>BACK OFFICE</span></div>
        <button onClick={() => setMobile(false)} aria-label="Fermer le menu"><X /></button>
      </div>

      <div className="bo-domains" role="tablist" aria-label="Domaines du back office">
        <button role="tab" aria-selected={domain === 'ALL'} onClick={() => setDomain('ALL')}>
          <span>Tous</span><small>{context?.counts.visible ?? '—'}</small>
        </button>
        {(context?.domains ?? []).map((entry) => (
          <button key={entry.key} role="tab" aria-selected={domain === entry.key} onClick={() => setDomain(entry.key)} title={entry.description}>
            <span>{entry.label}</span><small>{entry.permitted}/{entry.total}</small>
          </button>
        ))}
      </div>

      <nav>
        {loading && <p className="bo-nav-state">Chargement de la navigation…</p>}
        {error && (
          <p className="bo-nav-state is-error">
            Navigation indisponible ({error}). <button type="button" onClick={retry}>Réessayer</button>
          </p>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <span>{group.label}</span>
            {group.items.map((item) => (
              <button key={item.section}
                className={`${section === item.section ? 'is-active' : ''} ${item.section === 'news' ? 'is-magazine-drop-target' : ''}`.trim()}
                onClick={() => navigate(item.section)}
                onDragOver={item.section === 'news' ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } : undefined}
                onDrop={item.section === 'news' ? (event) => {
                  event.preventDefault();
                  const draftId = event.dataTransfer.getData('application/x-ayrovi-magazine-draft') || event.dataTransfer.getData('text/plain');
                  if (draftId.startsWith('mag_draft_')) openMagazineDraft(draftId);
                } : undefined}
                title={item.description}>
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
                {item.moduleStatus === 'legacy' && <em className="bo-tag">legacy</em>}
                {item.canonicalOf && <em className="bo-tag bo-tag--warn">doublon</em>}
                {section === item.section && <i />}
              </button>
            ))}
          </div>
        ))}
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
      </nav>

      <div className="admin-sidebar-foot">
        <a href="/" target="_blank" rel="noopener noreferrer">Voir le site public</a>
        <span>AYROVI v3.10.4 · Tunis · framework {context?.frameworkVersion ?? '—'}</span>
      </div>
    </aside>
    {mobile && <button className="admin-sidebar-overlay" onClick={() => setMobile(false)} aria-label="Fermer le menu" />}

    <div className="admin-workspace">
      <header className="admin-header bo-header">
        <button className="admin-mobile-menu" onClick={() => setMobile(true)} aria-label="Ouvrir le menu"><Menu /></button>
        <div className="admin-header-title">
          <span>
            {domain !== 'ALL' && <>{domain} / </>}
            {activeItem ? `${activeItem.group} /` : 'Console /'} <em>{title}</em>
          </span>
          <strong>{title}</strong>
        </div>
        <div className="admin-header-actions">
          <GlobalSearch onNavigate={navigate} />
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

    <CommandPalette open={palette} onClose={() => setPalette(false)} onNavigate={navigate} />
  </div>;
};
