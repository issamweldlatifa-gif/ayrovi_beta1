/** Shared Admin shell — the server provides destinations; the workspace rail organizes them. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Calculator, Calendar, Camera, ChartLine, ChevronDown, CheckCircle2, Clipboard, Eye, FileText, Gift, Globe2, Grid, History, Home, Image, LayoutGrid, LensBox,
  LogOut, MapPin, Menu, MessageSquare, Package, PackageCheck, Palette, Settings, ShieldCheck, ShoppingBag, Sparkles, Tag, Truck, User, X, Zap,
} from '../../components/QatafoIcons';
import { pushUrlPreservingNavigation } from '../../navigation/NavigationHistory';
import { labels } from './resource-ui';
import { NotificationsBell } from './NotificationsBell';
import { AccountSecurity } from './AccountSecurity';
import { CommandPalette, GlobalSearch } from './BackOfficeSearch';
import { sectionFromAdminPath, useBackOffice, type BackOfficeNavItem } from './framework';
import { availableGoShortcuts, resolveShortcut } from './shortcuts';
import { buildOfficeWorkspaces, officeItemLabel, officeText } from './workspaces';
import { OfficeIcon } from '../../design/admin/OfficeIcon';
import { ConnectedButton, TeamConnections, useConnectedAccess } from './TeamConnections';
import type { ConnectedTeam } from '../../../../shared/teamConnections';
import { OfficeLanguageContext } from './OfficeLocale';

export type BackOfficeRenderContext = {
  section: string;
  navigate: (section: string, request?: string, focus?: string) => void;
  requestedReview: string;
  /** Fiche à ouvrir/mettre en avant (`?focus=`), distincte du filtre `request` (12/11). */
  focusedRecord: string;
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
  // `?focus=` ; les anciens liens « Nouvelle commande » portent `?order=`.
  const [focusedRecord, setFocusedRecord] = useState(initialParams.get('focus') || initialParams.get('order') || '');
  const [pendingMagazineDraft, setPendingMagazineDraft] = useState('');
  const [workspaceChoice, setWorkspaceChoice] = useState<{ section: string; key: string | null } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [profile, setProfile] = useState(false);
  const [security, setSecurity] = useState(false);
  const [palette, setPalette] = useState(false);
  /** Carte des raccourcis (`?`). */
  const [shortcutHelp, setShortcutHelp] = useState(false);
  const [density, setDensity] = useState<string>(() => {
    if (typeof window === 'undefined') return 'compact';
    try {
      const stored = window.localStorage.getItem('zayrovi.bo.density');
      // Modèle A : la densité d'outil est le défaut ; « confortable » reste un choix explicite.
      return stored === 'comfortable' ? 'comfortable' : 'compact';
    } catch { return 'compact'; }
  });
  // E8 — thème clair/sombre et direction LTR/RTL de la coquille. Défauts : clair + LTR.
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const stored = window.localStorage.getItem('zayrovi.bo.theme');
      if (stored === 'dark' || stored === 'light') return stored;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch { return 'light'; }
  });
  const [dir, setDir] = useState<'ltr' | 'rtl'>(() => {
    if (typeof window === 'undefined') return 'ltr';
    try { return window.localStorage.getItem('zayrovi.bo.dir') === 'rtl' ? 'rtl' : 'ltr'; } catch { return 'ltr'; }
  });

  const lang = dir === 'rtl' ? 'ar' : 'fr';
  const t = (fr: string, ar: string) => officeText(lang, fr, ar);

  const can = useCallback((permission: string) => identity.permissions.includes(permission as never), [identity.permissions]);
  const navigate = useCallback((id: string, request?: string, focus?: string) => {
    setWorkspaceChoice(null); setSection(id); setRequestedReview(request || ''); setFocusedRecord(focus || ''); setMobile(false);
    const params = new URLSearchParams({ section: id });
    if (request) params.set('request', request);
    if (focus) params.set('focus', focus);
    pushUrlPreservingNavigation(`/admin?${params}`);
    if (id === 'arrival-ingestion') window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, []);
  const openMagazineDraft = useCallback((draftId?: string) => { setPendingMagazineDraft(draftId || ''); navigate('news'); }, [navigate]);
  const clearPendingMagazineDraft = useCallback(() => setPendingMagazineDraft(''), []);

  useEffect(() => {
    const onPop = () => {
      setWorkspaceChoice(null);
      const params = new URLSearchParams(location.search);
      setSection(params.get('section') || sectionFromAdminPath(location.pathname) || 'dashboard');
      setRequestedReview(params.get('request') || '');
      setFocusedRecord(params.get('focus') || params.get('order') || '');
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
    // Écran hors navigation mais enregistré (fenêtre fusionnée, ex. `audit`) : il reste joignable.
    const registered = resources.some((item) => item.section === section || (item.aliases ?? []).includes(section));
    if (!registered && !known.some((item) => item.section === section || (item as any).aliases?.includes(section))) {
      if (section !== 'dashboard') navigate('dashboard');
    }
  }, [navigation, resources, section, navigate]);

  useEffect(() => {
    try { window.localStorage.setItem('zayrovi.bo.density', density); } catch { /* stockage indisponible : présentationnel seulement */ }
  }, [density]);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme);
    try { window.localStorage.setItem('zayrovi.bo.theme', theme); } catch { /* idem */ }
  }, [theme]);
  useEffect(() => {
    if (typeof document !== 'undefined') { document.documentElement.setAttribute('dir', dir); document.documentElement.lang = lang; }
    try { window.localStorage.setItem('zayrovi.bo.dir', dir); } catch { /* idem */ }
  }, [dir, lang]);

  // En quittant /admin, on retire les attributs posés sur <html> : le site public
  // redevient LTR par défaut et ne porte pas un data-theme sans son thème sombre.
  useEffect(() => () => {
    if (typeof document === 'undefined') return;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('dir');
    document.documentElement.lang = 'fr';
  }, []);

  const workspaces = useMemo(() => buildOfficeWorkspaces(navigation?.groups ?? []), [navigation]);
  const allItems = useMemo(() => workspaces.flatMap(group => group.items), [workspaces]);
  const activeItem = allItems.find((item) => item.section === section || (item as any).aliases?.includes(section));

  // Raccourcis clavier (11/11) : `g`+lettre, `/` recherche, `?` aide, Échap.
  // Seuls les écrans présents dans la navigation SERVEUR de l'opérateur sont joignables.
  const allowedSections = useMemo(() => new Set(allItems.map((item) => item.section)), [allItems]);
  const armedAt = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { action, armedAt: next } = resolveShortcut(event as any, armedAt.current, Date.now(), allowedSections);
      armedAt.current = next;
      if (!action || action.type === 'arm') return;
      if (action.type === 'close') { setShortcutHelp(false); setMobile(false); return; }
      event.preventDefault();
      if (action.type === 'go') navigate(action.section);
      else if (action.type === 'search') (document.querySelector('.bo-search input') as HTMLInputElement | null)?.focus();
      else if (action.type === 'help') setShortcutHelp((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowedSections, navigate]);
  const activeWorkspace = activeItem ? workspaces.find(group => group.items.includes(activeItem)) : undefined;
  const openWorkspace = workspaceChoice?.section === section ? workspaceChoice.key : activeWorkspace?.key;

  const descriptor = descriptorFor(section);
  const connectedAccess = useConnectedAccess();
  const [connectedTeam, setConnectedTeam] = useState<ConnectedTeam | null>(null);
  const canonicalSection = (() => {
    const key = descriptor?.canonicalOf;
    if (!key) return undefined;
    const target = resources.find((item) => item.key === key || item.section === key);
    if (!target) return undefined;
    return allItems.find((item) => item.section === target.section);
  })();
  const title = officeItemLabel({ section: activeItem?.section ?? section, label: activeItem?.label ?? descriptor?.label ?? t('Administration', 'الإدارة') }, lang);
  const employee = context?.employee;


  /**
   * Une entrée du rail. L'état technique du module (`legacy`, doublon) ne s'affiche plus comme une
   * pastille : il passe dans l'infobulle et dans le bandeau de l'écran, qui dit quoi faire.
   */
  const renderNavButton = (item: BackOfficeNavItem) => {
    const hints = [item.description];
    if (item.moduleStatus === 'legacy') hints.push('ancienne surface conservée');
    if (item.canonicalOf) hints.push(`maître : ${item.canonicalOf}`);
    return <button key={item.section} type="button" aria-current={activeItem === item ? 'page' : undefined}
      className={`${activeItem === item ? 'is-active' : ''} ${item.section === 'news' ? 'is-magazine-drop-target' : ''}`.trim()}
      onClick={() => navigate(item.section)}
      onDragOver={item.section === 'news' ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } : undefined}
      onDrop={item.section === 'news' ? (event) => {
        event.preventDefault();
        const draftId = event.dataTransfer.getData('application/x-zayrovi-magazine-draft') || event.dataTransfer.getData('text/plain');
        if (draftId.startsWith('mag_draft_')) openMagazineDraft(draftId);
      } : undefined}
      title={hints.join(' · ')}>
      {item.section === 'dashboard' ? <OfficeIcon name="overview" size="navigation" /> : <NavIcon name={item.icon} />}
      <span>{officeItemLabel(item, lang)}</span>
      {activeItem === item && <i />}
    </button>;
  };

  const brand = <div className="bo-topbar-brand">
    <img src="/media/logo-zayrovi-logo-dark.svg?v=9.0" alt="ZAYROVI" />
    <div><strong>ZAYROVI</strong><span>{t('BUSINESS SUITE', 'منصّة إدارة الأعمال')}</span></div>
  </div>;

  return <OfficeLanguageContext.Provider value={lang}><div data-workspace={activeWorkspace?.key} className={`admin-shell bo-shell bo-unified ${density === 'compact' ? 'is-compact' : ''}`}>
    <header className="bo-topbar bo-header">
      <div className="bo-mobile-brand">{brand}</div>
      <div className="bo-topbar-search"><GlobalSearch onNavigate={navigate} /></div>
      <div className="bo-topbar-actions admin-header-actions">
        <button className="admin-mobile-menu admin-icon-button" onClick={() => setMobile(true)} aria-expanded={mobile} aria-controls="office-navigation" aria-label={t('Ouvrir le menu', 'افتح القائمة')}><Menu /></button>
        <button className="admin-icon-button" onClick={() => setPalette(true)} title="Palette de commandes (⌘K)" aria-label="Palette de commandes"><Sparkles /></button>
        <button className="admin-icon-button bo-shortcut-button" onClick={() => setShortcutHelp(true)} title="Raccourcis clavier (?)" aria-label="Raccourcis clavier"><kbd>?</kbd></button>
        <button className="admin-icon-button office-density-control" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
          title={density === 'compact' ? 'Densité confortable' : 'Densité compacte'} aria-pressed={density === 'compact'} aria-label={t('Changer la densité', 'بدّل كثافة العرض')}><OfficeIcon name="density" size="navigation" /></button>
        <button className="admin-icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'} aria-pressed={theme === 'dark'} aria-label={t('Basculer le thème sombre / clair', 'بدّل الوضع الفاتح أو الداكن')}><OfficeIcon name={theme === 'dark' ? 'light' : 'dark'} size="navigation" /></button>
        <button className="admin-icon-button bo-language" onClick={() => setDir(dir === 'rtl' ? 'ltr' : 'rtl')}
          title={dir === 'rtl' ? 'Français (LTR)' : 'العربية (RTL)'} aria-label={dir === 'rtl' ? 'Français (LTR)' : 'العربية (RTL)'}><Globe2 /><b>{lang === 'ar' ? 'FR' : 'ع'}</b></button>
        {can('commerce:read') && <NotificationsBell onNavigate={navigate} />}
        <div className="admin-profile">
          <button type="button" aria-expanded={profile} onClick={() => setProfile(!profile)}>
            <i>{identity.name.slice(0, 2).toUpperCase()}</i>
            <span><strong>{identity.name}</strong><small>{labels[identity.role] || identity.role}</small></span>
          </button>
          {profile && <div>
            <span>{identity.email}</span>
            {employee && <span className="bo-profile-employee">{employee.label ?? '—'} · <code>{employee.code}</code>{employee.branch ? ` · ${employee.branch}` : ''}</span>}
            {!employee && <span className="bo-profile-employee muted">Aucune fiche employée rattachée à ce compte</span>}
            <button onClick={() => { setProfile(false); setSecurity(true); }} data-testid="bo-account-security">Sécurité du compte (2FA)</button>
            <button onClick={onLogout}><LogOut />Se déconnecter</button>
          </div>}
        </div>
        <AccountSecurity open={security} onClose={() => setSecurity(false)} />
      </div>
    </header>

    <div className="bo-body">
      <aside id="office-navigation" className={`admin-sidebar ${mobile ? 'is-open' : ''}`}>
        <div className="bo-unified-brand">
          {brand}
          <button type="button" className="bo-rail-close" onClick={() => setMobile(false)} aria-label={t('Fermer le menu', 'اغلق القائمة')}><X size={20} /></button>
        </div>
        <nav aria-label={t('Écrans — espaces de travail', 'أقسام الإدارة')}>
          <p className="bo-rail-caption">{t('ESPACE DE TRAVAIL', 'مساحة العمل')}</p>
          {loading && <p className="bo-nav-state">{t('Chargement de la navigation…', 'جاري تحميل القائمة…')}</p>}
          {error && <p className="bo-nav-state is-error">{t('Navigation indisponible', 'القائمة غير متاحة')} · <button type="button" onClick={retry}>{t('Réessayer', 'عاود المحاولة')}</button></p>}
          {workspaces.map(group => group.key === 'overview' ? <div className="bo-office-overview" key={group.key}>{group.items.map(renderNavButton)}</div> : (
            <div className="bo-office-group" key={group.key} data-active={activeWorkspace?.key === group.key}>
              <button type="button" className="bo-office-module" aria-expanded={openWorkspace === group.key} aria-controls={`bo-group-${group.key}`}
                onClick={() => setWorkspaceChoice({ section, key: openWorkspace === group.key ? null : group.key })}>
                <OfficeIcon name={group.key} size="navigation" /><span>{t(group.fr, group.ar)}{['crm', 'erp', 'cms'].includes(group.key) && <> <small>{group.key.toUpperCase()}</small></>}</span><ChevronDown size={14} />
              </button>
              <ul id={`bo-group-${group.key}`} hidden={openWorkspace !== group.key}>{group.items.map(item => <li key={item.section}>{renderNavButton(item)}</li>)}{connectedAccess?.teams.some(team => team === group.key) && <li><ConnectedButton onClick={() => { setConnectedTeam(group.key as ConnectedTeam); setMobile(false); }} /></li>}</ul>
            </div>
          ))}
          {context?.roadmap?.length ? <details className="bo-roadmap">
            <summary>{t('Modules à venir', 'وحدات قادمة')}</summary>
            {context.roadmap.map(module => <div key={module.key} className="bo-roadmap-item" title={module.description}><strong>{module.label}</strong></div>)}
          </details> : null}
        </nav>
        <div className="admin-sidebar-foot">
          <a href="/" target="_blank" rel="noopener noreferrer"><Globe2 size={16} />{t('Voir le site public', 'شوف الموقع العام')}</a>
          <span>© ZAYROVI · framework {context?.frameworkVersion ?? '—'}</span>
        </div>
      </aside>
      {mobile && <button className="admin-sidebar-overlay" onClick={() => setMobile(false)} aria-label={t('Fermer le menu', 'اغلق القائمة')} />}

      <div className="admin-workspace">
        {/* Fil d'Ariane : le titre de l'écran n'est plus écrit ici (il l'était deux fois). */}
        <div className="bo-screenbar">
          <nav aria-label={t("Fil d’Ariane", "مسار التنقّل")}>
            <b>{activeWorkspace ? t(activeWorkspace.fr, activeWorkspace.ar) : t('Console', 'الإدارة')}</b>
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
          {renderPage({ section, navigate, requestedReview, focusedRecord, pendingMagazineDraft, openMagazineDraft, clearPendingMagazineDraft, can })}
        </main>
      </div>
    </div>

    {connectedTeam && connectedAccess && <TeamConnections key={connectedTeam} team={connectedTeam} access={connectedAccess} onClose={() => setConnectedTeam(null)} />}
    <CommandPalette open={palette} onClose={() => setPalette(false)} onNavigate={navigate} />
    {shortcutHelp && (
      <div className="bo-shortcuts-backdrop" onClick={() => setShortcutHelp(false)}>
        <section className="bo-shortcuts" role="dialog" aria-modal="true" aria-label="Raccourcis clavier" onClick={(event) => event.stopPropagation()}>
          <header>
            <strong>Raccourcis clavier</strong>
            <button type="button" onClick={() => setShortcutHelp(false)} aria-label="Fermer"><X size={16} /></button>
          </header>
          <dl>
            <div><dt><kbd>⌘</kbd><kbd>K</kbd></dt><dd>Palette de commandes</dd></div>
            <div><dt><kbd>/</kbd></dt><dd>Recherche globale</dd></div>
            <div><dt><kbd>?</kbd></dt><dd>Afficher / masquer cette carte</dd></div>
            {availableGoShortcuts(allowedSections).map((entry) => (
              <div key={entry.key}>
                <dt><kbd>g</kbd><kbd>{entry.key}</kbd></dt>
                <dd><button type="button" onClick={() => { setShortcutHelp(false); navigate(entry.section); }}>{entry.label}</button></dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    )}
  </div></OfficeLanguageContext.Provider>;
};
