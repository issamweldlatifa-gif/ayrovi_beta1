import { FONT_STACK } from '../../../shared/brand.generated';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, RefreshCw, ExternalLink, AlertCircle, Bell, Calculator, Calendar, Camera, ChartLine, CheckCircle2, CreditCard, Eye, Gift, Globe2, Grid,
  History, Home, Image, LayoutGrid, LensBox, Link2, LogOut, Menu, MessageSquare, Package, Palette, Pencil, Percent, Plus, Search as SearchIcon,
  Settings, ShieldCheck, ShoppingBag, Sparkles, Tag, Truck, User, X,
} from '../components/QatafoIcons';
import { ADMIN_SESSION_EXPIRED_EVENT, adminApi, ApiError, loadIdentity, login, logout, queryString } from './api';
import {
  Badge, Button, CardTitle, ConfirmDialog, DataColumn, DataTable, DatePicker, Field, Filters, Form,
  ImageUploader, Modal, PageHeader, Pagination, Search, Select, StatusBadge, Toast,
} from './components';
import './admin.css';
// Modèle A « Console opérationnelle » (2026-09-22) : couche additive chargée APRÈS admin.css.
// Elle ne supprime aucune règle — elle redéfinit la densité, les filets, les rayons et le chrome
// pour que les écrans existants héritent du modèle retenu sans être réécrits un par un.
import '../styles/admin-console.css';;
import { LensLabPage, AiDiscoveryPage } from './AiLabPages';
import { SocialAdminPage } from './SocialAdminPage';
import { InventoryMovementsPage, InventoryStockPage, InventoryStocktakesPage } from './InventoryPage';
import { PurchasingOrdersPage, PurchasingReceiptsPage, PurchasingSuppliersPage } from './PurchasingPage';
import { CrmActivitiesPage, CrmContactsPage, CrmDashboardPage, CrmIssuesPage, CrmPartiesPage, CrmTasksPage } from './CrmPages';
import { MagazineAgentPage } from './MagazineAgentPage';
import { HeroVisualsPage } from './HeroVisualsPage';
import { LensSectionPage } from './LensSectionPage';
import { HomeSectionsPage } from './HomeSectionsPage';
import { MagazineDraftsPanel } from './MagazineDraftsPanel';
import { PricingPage } from './AdminPricingPage';
import { InterfaceStudio } from './InterfaceStudio';
import { ArrivalIngestionPage } from './ArrivalIngestionPage';
import { ErpEmployeesPage, ErpEnvironmentPage, ErpEventsPage, ErpAuditPage, ErpOrganizationPage, ErpPermissionsPage } from './ErpCorePages';
import { CatalogueBrandsPage, CatalogueCategoriesPage, CatalogueProductsPage } from './CataloguePages';
import { pushUrlPreservingNavigation } from '../navigation/NavigationHistory';
// P3/T2d : la feuille `interface-studio.css` a été fondue dans `admin.css` (même couche d'application).
import { BackOfficeProvider, useBackOffice } from './back-office/framework';
import { BackOfficeShell, type BackOfficeRenderContext } from './back-office/BackOfficeShell';
import { NotificationsBell } from './back-office/NotificationsBell';
import { formatMoney, formatDate, labels, nowPlus, options, ResourceForm, type FieldDefinition, type Permission, type ResourceDefinition } from './back-office/resource-ui';
import { renderCell, ResourceWorkspace } from './back-office/ResourceWorkspace';

type UserIdentity = { id: string; email: string; name: string; role: string; permissions: Permission[] };


const resources: Record<string, ResourceDefinition> = {
  arrivals: {
    title: 'Arrivages', singular: 'arrivage', description: 'Pilotez plusieurs arrivages Standard et Express depuis les dates backend.', endpoint: '/arrivals', keyField: 'name', statusField: 'status', permission: 'content:write',
    defaults: { name: '', type: 'STANDARD', departure_at: '', expected_arrival_at: nowPlus(7), ends_at: '', description: '', main_image: '', secondary_images: [], badge: '', status: 'DRAFT', published_at: '' },
    fields: [
      { key: 'name', label: 'Nom', type: 'text', required: true }, { key: 'type', label: 'Type', type: 'select', required: true, options: ['STANDARD','EXPRESS'] },
      { key: 'departure_at', label: 'Départ', type: 'date' }, { key: 'expected_arrival_at', label: 'Arrivée prévue', type: 'date', required: true }, { key: 'ends_at', label: 'Fin de visibilité', type: 'date' },
      { key: 'description', label: 'Description', type: 'textarea', full: true }, { key: 'main_image', label: 'Image principale', type: 'image', full: true },
      { key: 'secondary_images', label: 'Images secondaires (URLs)', type: 'list', full: true }, { key: 'badge', label: 'Badge', type: 'text' },
      { key: 'status', label: 'Statut', type: 'select', required: true, options: ['DRAFT','SCHEDULED','ACTIVE','COMPLETED','ARCHIVED'] }, { key: 'published_at', label: 'Publication', type: 'date' },
    ],
  },
  products: {
    title: 'Produits', singular: 'produit', description: 'Catalogue relié aux arrivages et tarifé exclusivement par le moteur backend.', endpoint: '/products', keyField: 'name', statusField: 'status', permission: 'content:write',
    defaults: { name: '', description: '', image: '', additional_images: [], brand_id: '', brand_name: '', category: '', source_url: '', source_platform: 'SHEIN', original_price: 0, currency: 'EUR', express_available: false, stock_status: 'AVAILABLE', status: 'DRAFT', arrival_ids: [] },
    fields: [
      { key: 'name', label: 'Nom', type: 'text', required: true }, { key: 'category', label: 'Catégorie', type: 'text' }, { key: 'description', label: 'Description', type: 'textarea', full: true },
      { key: 'image', label: 'Image', type: 'image', full: true }, { key: 'additional_images', label: 'Images supplémentaires (URLs)', type: 'list', full: true },
      { key: 'brand_id', label: 'ID marque', type: 'text' }, { key: 'brand_name', label: 'Nom de marque', type: 'text' }, { key: 'source_url', label: 'Lien source', type: 'text', full: true },
      { key: 'source_platform', label: 'Plateforme', type: 'select', required: true, options: ['SHEIN','AMAZON','TEMU','ALIEXPRESS','OTHER'] },
      { key: 'original_price', label: 'Prix original', type: 'number', required: true }, { key: 'currency', label: 'Devise', type: 'select', required: true, options: ['EUR','USD','GBP','JPY','TND'] },
      { key: 'express_available', label: 'Éligible Express', type: 'boolean' }, { key: 'stock_status', label: 'Stock', type: 'select', options: ['AVAILABLE','LIMITED','OUT_OF_STOCK'] },
      { key: 'status', label: 'Statut', type: 'select', options: ['DRAFT','ACTIVE','INACTIVE','ARCHIVED'] }, { key: 'arrival_ids', label: 'IDs arrivages associés', type: 'list', full: true },
    ],
  },
  promotions: {
    title: 'Promotions', singular: 'promotion', description: 'Créez, programmez et mesurez les promotions reliées aux produits et arrivages.', endpoint: '/promotions', keyField: 'name', statusField: 'status', permission: 'content:write',
    defaults: { name: '', description: '', image: '', discount_type: 'PERCENTAGE', value: 10, starts_at: new Date().toISOString(), ends_at: nowPlus(7), promo_code: '', usage_limit: '', status: 'DRAFT', arrival_ids: [], product_ids: [] },
    fields: [
      { key: 'name', label: 'Nom', type: 'text', required: true }, { key: 'promo_code', label: 'Code promo', type: 'text' }, { key: 'description', label: 'Description', type: 'textarea', full: true },
      { key: 'image', label: 'Image', type: 'image', full: true }, { key: 'discount_type', label: 'Type', type: 'select', options: ['PERCENTAGE','FIXED'] }, { key: 'value', label: 'Valeur', type: 'number', required: true },
      { key: 'starts_at', label: 'Début', type: 'date', required: true }, { key: 'ends_at', label: 'Fin', type: 'date', required: true }, { key: 'usage_limit', label: 'Limite d’utilisation', type: 'number' },
      { key: 'status', label: 'Statut', type: 'select', options: ['DRAFT','SCHEDULED','ACTIVE','EXPIRED','ARCHIVED'] }, { key: 'arrival_ids', label: 'IDs arrivages', type: 'list', full: true }, { key: 'product_ids', label: 'IDs produits', type: 'list', full: true },
    ],
  },
  stories: {
    title: 'Stories', singular: 'story', description: 'Stories visuelles programmables avec liens vers produits, promotions et arrivages.', endpoint: '/stories', keyField: 'title', statusField: 'status', permission: 'content:write',
    defaults: { media_type: 'IMAGE', media_url: '', title: '', description: '', cta: '', target_url: '', product_id: '', arrival_id: '', promotion_id: '', publish_at: new Date().toISOString(), expires_at: '', priority: 0, status: 'DRAFT' },
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true }, { key: 'media_type', label: 'Média', type: 'select', options: ['IMAGE','VIDEO'] }, { key: 'media_url', label: 'Image / média', type: 'image', required: true, full: true },
      { key: 'description', label: 'Description', type: 'textarea', full: true }, { key: 'cta', label: 'Appel à l’action', type: 'text' }, { key: 'target_url', label: 'Lien cible', type: 'text' },
      { key: 'product_id', label: 'ID produit', type: 'text' }, { key: 'arrival_id', label: 'ID arrivage', type: 'text' }, { key: 'promotion_id', label: 'ID promotion', type: 'text' },
      { key: 'publish_at', label: 'Publication', type: 'date', required: true }, { key: 'expires_at', label: 'Expiration', type: 'date' }, { key: 'priority', label: 'Priorité', type: 'number' },
      { key: 'status', label: 'Statut', type: 'select', options: ['DRAFT','SCHEDULED','PUBLISHED','EXPIRED'] },
    ],
  },
  news: {
    title: 'مجلتي', singular: 'محتوى مجلتي', description: 'مجلة AYROVI التحريرية المرتبطة بالمنتجات، مع مسودات وكيل مجلتي ومراجعة بشرية قبل النشر.', endpoint: '/news', keyField: 'title', statusField: 'status', permission: 'content:write',
    defaults: { title: '', summary: '', content: '', image: '', category: 'AYROVI', arrival_id: '', product_id: '', author: 'Équipe AYROVI', published_at: new Date().toISOString(), status: 'DRAFT' },
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true }, { key: 'category', label: 'Catégorie', type: 'select', options: ['NEW_ARRIVAL','NEW_BRAND','PROMOTION','DELIVERY','AYROVI','INFORMATION','OTHER'] },
      { key: 'summary', label: 'Résumé', type: 'textarea', full: true }, { key: 'content', label: 'Contenu', type: 'textarea', required: true, full: true }, { key: 'image', label: 'Image', type: 'image', full: true },
      { key: 'arrival_id', label: 'ID arrivage', type: 'text' }, { key: 'product_id', label: 'ID produit', type: 'text' }, { key: 'author', label: 'Auteur', type: 'text' },
      { key: 'published_at', label: 'Publication', type: 'date', required: true }, { key: 'status', label: 'Statut', type: 'select', options: ['DRAFT','SCHEDULED','PUBLISHED','ARCHIVED'] },
    ],
  },
  brands: {
    title: 'Marques', singular: 'marque', description: 'Gérez les logos du bandeau noir automatique et leur ordre public.', endpoint: '/brands', keyField: 'name', statusField: 'active', permission: 'content:write',
    defaults: { name: '', logo: '', image: '', category: 'FASHION', url: '', description: '', display_order: 0, active: true },
    fields: [
      { key: 'name', label: 'Nom', type: 'text', required: true }, { key: 'category', label: 'Catégorie', type: 'select', options: ['FASHION','SPORT_LIFESTYLE','BEAUTY','TECH','HOME','OTHER'] },
      { key: 'logo', label: 'Logo', type: 'image', required: true, full: true }, { key: 'image', label: 'Image secondaire', type: 'image', full: true }, { key: 'url', label: 'Lien', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea', full: true }, { key: 'display_order', label: 'Ordre', type: 'number' }, { key: 'active', label: 'Visible', type: 'boolean' },
    ],
  },
  hero: {
    title: 'Hero Slider', singular: 'slide', description: 'Les slides publiques conservent la promesse AYROVI et le défilement plein écran.', endpoint: '/hero-slides', keyField: 'title', statusField: 'active', permission: 'content:write',
    defaults: { image: '', video: '', title: 'Toute la mode du monde, livrée chez vous.', subtitle: '', cta: '', target_url: '', display_order: 0, active: true },
    fields: [
      { key: 'title', label: 'Titre', type: 'text', required: true }, { key: 'subtitle', label: 'Sous-titre', type: 'text' }, { key: 'image', label: 'Image', type: 'image', required: true, full: true },
      { key: 'video', label: 'URL vidéo', type: 'text' }, { key: 'cta', label: 'CTA', type: 'text' }, { key: 'target_url', label: 'Lien cible', type: 'text' },
      { key: 'display_order', label: 'Ordre', type: 'number' }, { key: 'active', label: 'Visible', type: 'boolean' },
    ],
  },
  ticker: {
    title: 'Ticker annonces', singular: 'message', description: 'Messages du bandeau supérieur AYROVI — contenu uniquement, le design reste fixe.', endpoint: '/announcements', keyField: 'text', statusField: 'active', permission: 'content:write',
    defaults: { text: '', display_order: 0, active: true },
    fields: [
      { key: 'text', label: 'Message affiché', type: 'text', required: true, full: true },
      { key: 'display_order', label: 'Ordre d’affichage', type: 'number' }, { key: 'active', label: 'Publié', type: 'boolean' },
    ],
  },
  assistant: {
    title: 'Assistant IA', singular: 'connaissance', description: 'Source administrable des réponses commerciales critiques de l’Assistant AYROVI.', endpoint: '/ai-knowledge', keyField: 'question', statusField: 'active', permission: 'ai:write',
    defaults: { category: 'FAQ', question: '', answer: '', keywords: [], priority: 0, active: true },
    fields: [
      { key: 'category', label: 'Catégorie', type: 'select', options: ['FAQ','PREDEFINED_RESPONSE','DELIVERY','PAYMENT','BRAND','ARRIVAL','PROMOTION','GENERAL'] },
      { key: 'question', label: 'Question / déclencheur', type: 'text', full: true }, { key: 'answer', label: 'Réponse vérifiée', type: 'textarea', required: true, full: true },
      { key: 'keywords', label: 'Mots clés', type: 'list', full: true }, { key: 'priority', label: 'Priorité', type: 'number' }, { key: 'active', label: 'Active', type: 'boolean' },
    ],
  },
};



const LoginPage: React.FC<{ onAuthenticated: (user: UserIdentity) => void }> = ({ onAuthenticated }) => {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { onAuthenticated(await login(email, password)); } catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  };
  return (
    <main className="admin-login">
      <section className="admin-login-brand"><div className="admin-login-brand__mark"><img src="/media/logo-ayrovi.png" alt="AYROVI" style={{width:40,height:40,objectFit:"contain"}} /></div><span>AYROVI / CONTROL</span><h1>Le commerce mondial,<br />piloté depuis Tunis.</h1><p>Contenu, arrivages, commandes, tarification et assistance — une seule source de vérité.</p><div className="admin-login-grid"><article><strong>24</strong><span>gouvernorats</span></article><article><strong>4</strong><span>rôles sécurisés</span></article><article><strong>100%</strong><span>backend-driven</span></article></div></section>
      <section className="admin-login-panel"><div className="admin-login-box"><div className="admin-login-mobile-logo"><img src="/media/logo-ayrovi-lockup-black-orange.svg" alt="AYROVI" style={{height:20,width:'auto',objectFit:'contain'}} /></div><span className="admin-eyebrow">Espace sécurisé</span><h2>Bienvenue.</h2><p>Connectez-vous avec le compte administrateur configuré sur le serveur.</p>
        <Form onSubmit={submit}>
          <Field label="Adresse email" required full><input type="email" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} placeholder="admin@ayrovi.tn" required /></Field>
          <Field label="Mot de passe" required full><div className="admin-password"><input type={show ? 'text' : 'password'} value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required /><button type="button" onClick={() => setShow(!show)}>{show ? 'Masquer' : 'Afficher'}</button></div></Field>
          {error && <div className="admin-login-error"><AlertCircle size={18} />{error}</div>}
          <Button busy={busy} className="admin-login-submit" type="submit">Se connecter</Button>
        </Form>
        <div className="admin-login-security"><ShieldCheck size={18} /><span>Session HttpOnly, protection CSRF et permissions par rôle.</span></div>
      </div></section>
    </main>
  );
};

const queueTotal = async (path: string): Promise<number | null> => {
  try {
    const result = await adminApi<any>(path);
    if (result?.pagination?.total != null) return Number(result.pagination.total);
    const rows = Array.isArray(result?.rows) ? result.rows : Array.isArray(result?.data) ? result.data : [];
    return rows.length;
  } catch { return null; }
};

const queueReviewCount = async (): Promise<number | null> => {
  try {
    const result = await adminApi<any>('/arrival-ingestion/arrivals?pageSize=100');
    const rows = Array.isArray(result?.rows) ? result.rows : Array.isArray(result?.data) ? result.data : [];
    return rows.filter((row: any) => String(row.status) === 'REVIEW').length;
  } catch { return null; }
};

/**
 * Poste de travail (Model C) — les files d'action du jour, calculées en direct
 * depuis le backend (aucune donnée copiée côté client). Chaque carte ouvre la
 * section correspondante, pré-filtrée quand la section le supporte.
 */
const WorkbenchQueues: React.FC<{ navigate: (section: string, request?: string) => void }> = ({ navigate }) => {
  const [queues, setQueues] = useState<Array<{ key: string; label: string; sub: string; count: number | null; section: string; request?: string; icon: React.ComponentType<{ size?: number | string }> }>>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [deposits, fresh, support, arrivals] = await Promise.all([
        queueTotal('/orders?status=AWAITING_PAYMENT_VERIFICATION&pageSize=1'),
        queueTotal('/orders?status=AWAITING_DEPOSIT&pageSize=1'),
        queueTotal('/assistant-support?status=PENDING&pageSize=1'),
        queueReviewCount(),
      ]);
      if (!alive) return;
      setQueues([
        { key: 'deposits', label: 'Acomptes à vérifier', sub: 'Justificatifs reçus, en attente de votre décision', count: deposits, section: 'orders', request: 'AWAITING_PAYMENT_VERIFICATION', icon: ShieldCheck },
        { key: 'fresh', label: 'Nouvelles commandes', sub: 'Acompte en attente de paiement client', count: fresh, section: 'orders', request: 'AWAITING_DEPOSIT', icon: Package },
        { key: 'support', label: 'Questions support', sub: 'Tickets en attente de réponse', count: support, section: 'assistant-support', icon: MessageSquare },
        { key: 'arrivals', label: 'Arrivages à valider', sub: 'Cartes CRM en révision', count: arrivals, section: 'arrival-ingestion', icon: Truck },
      ]);
    })();
    return () => { alive = false; };
  }, []);
  if (!queues.length) return null;
  return <section className="admin-queues">
    <header><strong>À traiter</strong><span>Files du jour, calculées en direct</span></header>
    <div className="admin-queues-grid">
      {queues.map(({ key, label, sub, count, section, request, icon: Icon }) => (
        <button key={key} type="button" className={`admin-queue-card ${count ? 'is-pending' : ''}`} onClick={() => navigate(section, request)}>
          <Icon size={18} />
          <div><span>{label}</span><small>{sub}</small></div>
          <strong>{count ?? '—'}</strong>
        </button>
      ))}
    </div>
  </section>;
};

const DashboardPage: React.FC<{ navigate: (section: string, request?: string) => void }> = ({ navigate }) => {
  const [data, setData] = useState<any>(null); const [days, setDays] = useState(30); const [error, setError] = useState('');
  useEffect(() => { setData(null); adminApi<any>(`/dashboard?days=${days}`).then((result) => setData(result.data)).catch((reason) => setError(reason.message)); }, [days]);
  const maxRevenue = Math.max(...(data?.daily || []).map((row: any) => Number(row.revenue)), 1);
  const maxStatus = Math.max(...(data?.statuses || []).map((row: any) => Number(row.count)), 1);
  if (!data) return <PageLoading error={error} />;
  const cards = [
    { label: 'Commandes', value: data.metrics.orders, change: data.metrics.changes.orders, icon: Package },
    { label: 'Chiffre d’affaires', value: formatMoney(data.metrics.revenue), change: data.metrics.changes.revenue, icon: CreditCard },
    { label: 'Clients actifs', value: data.metrics.customers, change: data.metrics.changes.customers, icon: User },
    { label: 'Panier moyen', value: formatMoney(data.metrics.averageBasket), change: data.metrics.changes.averageBasket, icon: ShoppingBag },
  ];
  return <>
    <PageHeader title="Tableau de bord" description="L’activité AYROVI consolidée en temps réel depuis SQLite." action={<Select value={days} onChange={(event) => setDays(Number(event.target.value))} options={[{value:'7',label:'7 jours'},{value:'30',label:'30 jours'},{value:'90',label:'90 jours'},{value:'365',label:'12 mois'}]} />} />
    <WorkbenchQueues navigate={navigate} />
    <div className="admin-metrics">{cards.map(({ label, value, change }) => <article key={label} className="admin-metric"><div><span>{label}</span><strong>{value}</strong><small className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change}% vs période précédente</small></div></article>)}</div>
    <div className="admin-arrival-summary"><article><span>Arrivages Standard actifs</span><strong>{data.metrics.activeStandardArrivals}</strong><Calendar /></article><article><span>Arrivages Express actifs</span><strong>{data.metrics.activeExpressArrivals}</strong><Truck /></article></div>
    <div className="admin-dashboard-grid">
      <section className="admin-card admin-chart-card"><CardTitle title="Revenu journalier" subtitle={`Sur ${days} jours`} /><div className="admin-bar-chart">{data.daily.length ? data.daily.map((row: any) => <div key={row.date} title={`${formatDate(row.date)} · ${formatMoney(row.revenue)}`}><span style={{ height: `${Math.max((Number(row.revenue) / maxRevenue) * 100, 3)}%` }} /><small>{row.date.slice(5)}</small></div>) : <ChartEmpty />}</div></section>
      <section className="admin-card"><CardTitle title="Statuts des commandes" subtitle="Répartition actuelle" /><div className="admin-status-chart">{data.statuses.length ? data.statuses.map((row: any) => <div key={row.status}><span><StatusBadge status={row.status} /><b>{row.count}</b></span><i><em style={{ width: `${(Number(row.count) / maxStatus) * 100}%` }} /></i></div>) : <ChartEmpty />}</div></section>
      <section className="admin-card"><CardTitle title="Plateformes sources" subtitle="Commandes & revenu" /><div className="admin-source-list">{data.sources.length ? data.sources.map((row: any) => <div key={row.source}><span>{row.source}</span><strong>{row.orders} commande{row.orders === 1 ? '' : 's'}</strong><b>{formatMoney(row.revenue)}</b></div>) : <ChartEmpty />}</div></section>
      <section className="admin-card admin-card--wide"><CardTitle title="Dernières commandes" subtitle="Flux opérationnel" /><DataTable rows={data.recentOrders} columns={[
        { key: 'order_number', label: 'Référence', render: (row: any) => <strong>{row.order_number}</strong> }, { key: 'customer_name', label: 'Client' }, { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} /> },
        { key: 'total_tnd', label: 'Total', render: (row: any) => formatMoney(row.total_tnd) }, { key: 'created_at', label: 'Date', render: (row: any) => formatDate(row.created_at, true) },
      ]} /></section>
    </div>
  </>;
};

const PageLoading: React.FC<{ error?: string }> = ({ error }) => <div className="admin-page-loading">{error ? <><AlertCircle /><strong>{error}</strong></> : <><span /><p>Chargement des données…</p></>}</div>;
const ChartEmpty = () => <div className="admin-chart-empty">Les premières données apparaîtront ici.</div>;
// `PageHeader` vient de ./components : un seul en-tête pour tout le back office (P2.2).


const ContentPage: React.FC<{ resource: string; canWrite: boolean }> = ({ resource, canWrite }) => {
  // P2.0 — les actions de cette page sont d'abord décidées par la matrice centrale
  // (`module:action:resource:scope`, rendue par `GET /back-office/resources/:key`). Tant que le
  // framework n'a pas répondu — ou qu'il ne grise rien (`null`) — on garde la règle legacy de
  // l'écran : aucune page ne se retrouve bloquée par un méta-endpoint.
  const { capabilitiesFor, loadCapabilities, descriptorFor } = useBackOffice();
  const capability = capabilitiesFor(resource);
  // Le descripteur du framework pilote ce qui peut l'être sans changer l'écran : colonnes
  // triables (validées côté serveur) et libellés. Sans lui, l'écran rend exactement comme avant.
  const descriptor = descriptorFor(resource);
  useEffect(() => { void loadCapabilities(resource); }, [resource]);
  const writable = capability?.edit ?? canWrite;
  const creatable = capability?.create ?? canWrite;
  const definition = resources[resource]; const [rows, setRows] = useState<any[]>([]); const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true); const [modal, setModal] = useState(false);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<any>(null); const [form, setForm] = useState<Record<string, any>>({ ...definition.defaults }); const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<any>(null); const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const load = useCallback(async (page = pagination.page) => {
    setLoading(true); setLoadError('');
    try {
      // `sort`/`direction` sont validés côté serveur contre `config.sortable` : aucun nom de
      // colonne inventé n'atteint le SQL. Sans descripteur, la liste garde son ordre habituel.
      const query: Record<string, any> = { page, pageSize: 20, search, status };
      if (sort) { query.sort = sort.key; query.direction = sort.direction; }
      const result = await adminApi<any>(`${definition.endpoint}?${queryString(query)}`);
      setRows(result.data); setPagination(result.pagination);
    }
    catch (reason: any) { setLoadError(reason.message || 'Liste indisponible.'); setToast({ message: reason.message, tone: 'error' }); }
    finally { setLoading(false); }
  }, [definition.endpoint, pagination.page, search, status, sort]);
  const toggleSort = (key: string) => setSort((current) => (current?.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
  useEffect(() => { const timer = window.setTimeout(() => load(1), 250); return () => clearTimeout(timer); }, [search, status]);
  const openCreate = () => { setEditing(null); setForm({ ...definition.defaults }); setModal(true); };
  const openEdit = (row: any) => { setEditing(row); setForm({ ...definition.defaults, ...row }); setModal(true); };
  const save = async () => {
    setBusy(true);
    try {
      const endpoint = editing ? `${definition.endpoint}/${editing.id}` : definition.endpoint;
      await adminApi(endpoint, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) });
      setModal(false); setToast({ message: `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} enregistré${definition.singular.endsWith('e') ? 'e' : ''}.`, tone: 'success' }); await load();
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); } finally { setBusy(false); }
  };
  const archive = async () => {
    if (!archiveTarget) return; setBusy(true);
    try { await adminApi(`${definition.endpoint}/${archiveTarget.id}`, { method: 'DELETE' }); setArchiveTarget(null); setToast({ message: 'Élément archivé sans supprimer ses références historiques.', tone: 'success' }); await load(); }
    catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); } finally { setBusy(false); }
  };
  const displayStatus = (row: any) => definition.statusField === 'active' ? (row.active ? 'ACTIVE' : 'INACTIVE') : row[definition.statusField || 'status'];
  const sortableOf = (key: string) => Boolean(descriptor?.columns.find((column) => column.key === key && column.sortable));
  const columns: DataColumn<any>[] = [
    { key: definition.keyField, label: definition.keyField === 'name' ? 'Nom' : definition.keyField === 'question' ? 'Question' : definition.keyField === 'text' ? 'Message' : 'Titre', render: (row) => renderCell('entity', { ...row, [definition.keyField]: row[definition.keyField] || (resource === 'assistant' ? row.answer.slice(0, 60) : '') }, definition.keyField) },
    { key: 'status', label: 'Statut', render: (row) => <StatusBadge status={displayStatus(row)} /> },
    { key: 'updated_at', label: 'Dernière modification', render: (row) => formatDate(row.updated_at, true) },
    { key: 'actions', label: '', render: (row) => writable && <div className="admin-row-actions"><button type="button" onClick={(event) => { event.stopPropagation(); openEdit(row); }} aria-label="Modifier"><Pencil size={17} /></button><button type="button" onClick={(event) => { event.stopPropagation(); setArchiveTarget(row); }} aria-label="Archiver"><X size={17} /></button></div> },
  ];
  const statusOptions = definition.fields.find((field) => field.key === 'status')?.options || [];
  return <>
    <PageHeader title={definition.title} description={definition.description} action={creatable ? <Button onClick={openCreate}><Plus size={18} />Nouveau</Button> : undefined} />
    <section className="admin-list-card"><div className="admin-list-toolbar"><Search value={search} onChange={setSearch} /><Filters>{statusOptions.length > 0 && <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'Tous les statuts' }, ...options(statusOptions)]} />}</Filters></div>
      <DataTable columns={columns.map((column) => ({ ...column, sortable: sortableOf(column.key) }))} rows={rows} loading={loading}
        error={loadError || undefined} onRetry={() => void load()} onSortChange={toggleSort} sort={sort}
        emptyText={`Aucun ${definition.singular} pour le moment.`} onRowClick={writable ? openEdit : undefined} />
      <Pagination {...pagination} onChange={(page) => load(page)} />
    </section>
    <Modal open={modal} title={`${editing ? 'Modifier' : 'Créer'} ${definition.singular}`} onClose={() => setModal(false)} wide><ResourceForm definition={definition} value={form} onChange={setForm} onSubmit={save} busy={busy} /></Modal>
    <ConfirmDialog open={Boolean(archiveTarget)} title={`Archiver ${definition.singular}`} message="L’élément ne sera plus public mais ses références historiques seront préservées." confirmLabel="Archiver" busy={busy} onConfirm={archive} onCancel={() => setArchiveTarget(null)} />
    {toast && <Toast message={toast.message} tone={toast.tone} />}
  </>;
};

const MagazinePage: React.FC<{
  canWrite: boolean;
  pendingDraftId?: string;
  onPendingHandled: () => void;
}> = ({ canWrite, pendingDraftId, onPendingHandled }) => {
  const [cmsRevision, setCmsRevision] = useState(0);
  return <>
    <ContentPage key={`magazine-cms-${cmsRevision}`} resource="news" canWrite={canWrite} />
    <MagazineDraftsPanel
      canWrite={canWrite}
      pendingDraftId={pendingDraftId}
      onPendingHandled={onPendingHandled}
      onCmsChanged={() => setCmsRevision((value) => value + 1)}
    />
  </>;
};

/**
 * Model C — ligne de KPIs cliquables au-dessus du tableau des commandes :
 * chaque carte applève/retire le filtre de statut correspondant (les valeurs
 * viennent du backend via /orders, jamais d'une copie côté client).
 */
const OrderKpis: React.FC<{ active: string; onSelect: (status: string) => void }> = ({ active, onSelect }) => {
  const [kpis, setKpis] = useState<Array<{ status: string; label: string; count: number | null }>>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const fetchCount = async (statusValue: string) => queueTotal(`/orders?${statusValue ? `status=${statusValue}&` : ''}pageSize=1`);
      const [total, awaitingDeposit, verification, delivered, cancelled] = await Promise.all([
        fetchCount(''), fetchCount('AWAITING_DEPOSIT'), fetchCount('AWAITING_PAYMENT_VERIFICATION'),
        fetchCount('DELIVERED'), fetchCount('CANCELLED'),
      ]);
      if (!alive) return;
      setKpis([
        { status: '', label: 'Toutes', count: total },
        { status: 'AWAITING_DEPOSIT', label: 'Acompte en attente', count: awaitingDeposit },
        { status: 'AWAITING_PAYMENT_VERIFICATION', label: 'À vérifier', count: verification },
        { status: 'DELIVERED', label: 'Livrées', count: delivered },
        { status: 'CANCELLED', label: 'Annulées', count: cancelled },
      ]);
    })();
    return () => { alive = false; };
  }, []);
  if (!kpis.length) return null;
  return <div className="admin-order-kpis">
    {kpis.map(({ status: value, label, count }) => (
      <button key={value || 'all'} type="button" className={`admin-order-kpi ${active === value ? 'is-active' : ''}`} onClick={() => onSelect(value)}>
        <span>{label}</span><strong>{count ?? '—'}</strong>
      </button>
    ))}
  </div>;
};

const PIPELINE_STEPS: Array<{ status: string; label: string }> = [
  { status: 'CREATED', label: 'Créée' },
  { status: 'AWAITING_DEPOSIT', label: 'Acompte attendu' },
  { status: 'AWAITING_PAYMENT_VERIFICATION', label: 'Vérification' },
  { status: 'CONFIRMED', label: 'Confirmée' },
  { status: 'PREPARING', label: 'Préparation' },
  { status: 'SHIPPED', label: 'Expédiée' },
  { status: 'IN_TRANSIT', label: 'En transit' },
  { status: 'OUT_FOR_DELIVERY', label: 'En livraison' },
  { status: 'DELIVERED', label: 'Livrée' },
];

/** Pipeline visuel de la commande (Model C) — étape courante + étapes passées. */
const OrderPipeline: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'CANCELLED') {
    return <div className="admin-pipeline admin-pipeline--cancelled"><AlertCircle size={16} /><span>Commande annulée — le pipeline normal ne s’applique plus.</span></div>;
  }
  const currentIndex = PIPELINE_STEPS.findIndex((step) => step.status === status);
  if (currentIndex === -1) return null;
  return <ol className="admin-pipeline">
    {PIPELINE_STEPS.map((step, index) => (
      <li key={step.status} className={index < currentIndex ? 'is-done' : index === currentIndex ? 'is-current' : ''} title={step.status}>
        <i /><span>{step.label}</span>
      </li>
    ))}
  </ol>;
};

const OrdersPage: React.FC<{ canWrite: boolean; canPay: boolean; initialStatus?: string }> = ({ canWrite, canPay, initialStatus }) => {
  const [rows, setRows] = useState<any[]>([]); const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 }); const [search, setSearch] = useState(''); const [status, setStatus] = useState(initialStatus || ''); const [paymentStatus, setPaymentStatus] = useState('');
  const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<any>(null); const [detailLoading, setDetailLoading] = useState(false); const [toast, setToast] = useState<any>(null); const [busy, setBusy] = useState(false);
  const [deliveryDraft,setDeliveryDraft]=useState({status:'PENDING',carrier:'',tracking_number:'',tracking_url:''});
  const load = useCallback(async (page = 1) => { setLoading(true); try { const result = await adminApi<any>(`/orders?${queryString({ page, pageSize: 20, search, status, payment_status:paymentStatus })}`); setRows(result.data); setPagination(result.pagination); } catch (e: any) { setToast({message:e.message,tone:'error'}); } finally { setLoading(false); } }, [search,status,paymentStatus]);
  useEffect(() => { const timer = setTimeout(() => load(), 250); return () => clearTimeout(timer); }, [search,status,paymentStatus]);
  const open = async (row: any) => { setSelected(row); setDetailLoading(true); try { const detail=(await adminApi<any>(`/orders/${row.id}`)).data; setSelected(detail); setDeliveryDraft({status:detail.delivery?.status||'PENDING',carrier:detail.delivery?.carrier||'',tracking_number:detail.delivery?.tracking_number||'',tracking_url:detail.delivery?.tracking_url||''}); } catch (e: any) { setToast({message:e.message,tone:'error'}); } finally { setDetailLoading(false); } };
  const changeStatus = async (next: string) => { if (!selected) return; setBusy(true); try { await adminApi(`/orders/${selected.id}/status`, { method:'PUT', body:JSON.stringify({status:next}) }); await open(selected); await load(pagination.page); setToast({message:'Statut de commande mis à jour.',tone:'success'}); } catch(e:any){setToast({message:e.message,tone:'error'});} finally{setBusy(false);} };
  const changePayment = async (next: string) => { if (!selected) return; setBusy(true); try { await adminApi(`/orders/${selected.id}/payment`, {method:'PUT',body:JSON.stringify({status:next})}); await open(selected); await load(pagination.page); setToast({message:'Paiement mis à jour.',tone:'success'}); }catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);} };
  const [reviewNote, setReviewNote] = useState('');
  const reviewDeposit = async (decision: 'approve' | 'reject') => { if (!selected || busy) return; setBusy(true); try { await adminApi<any>(`/orders/${selected.id}/deposit/review`, { method:'POST', body: JSON.stringify({ decision, note: reviewNote }) }); await open(selected); await load(pagination.page); setReviewNote(''); setToast({ message: decision === 'approve' ? 'Justificatif validé — paiement et commande confirmés.' : 'Justificatif refusé — le client peut le renvoyer.', tone:'success'}); } catch(e:any){setToast({message:e.message,tone:'error'});} finally{setBusy(false);} };
  const updateDelivery=async()=>{if(!selected||busy)return;setBusy(true);try{await adminApi(`/orders/${selected.id}/delivery`,{method:'PUT',body:JSON.stringify(deliveryDraft)});await open(selected);await load(pagination.page);setToast({message:'Livraison et suivi synchronisés.',tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}};
  const issueInvoice=async()=>{if(!selected||busy)return;setBusy(true);try{const r=await adminApi<any>(`/orders/${selected.id}/invoice/issue`,{method:'POST'});await open(selected);setToast({message:`Facture ${r.data?.invoiceNumber} émise.`,tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}};
  return <>
    <PageHeader title="Commandes" description="OMS persistant : clients, articles, paiements, livraisons et historique immuable." action={<a className="admin-button admin-button--secondary" href="/api/admin/reports/orders.csv" target="_blank" rel="noopener noreferrer">Exporter CSV</a>} />
    <OrderKpis active={status} onSelect={setStatus} />
    <section className="admin-list-card"><div className="admin-list-toolbar"><Search value={search} onChange={setSearch} placeholder="Référence, client ou téléphone…"/><Select value={status} onChange={(e)=>setStatus(e.target.value)} options={[{value:'',label:'Tous les statuts'},...options(['CREATED','AWAITING_DEPOSIT','AWAITING_PAYMENT_VERIFICATION','CONFIRMED','PREPARING','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'])]} /><Select value={paymentStatus} onChange={(e)=>setPaymentStatus(e.target.value)} options={[{value:'',label:'Tous les paiements'},...options(['PENDING','PENDING_VERIFICATION','PAID','PARTIALLY_PAID','FAILED','REJECTED','REFUNDED'])]} /></div>
      <DataTable rows={rows} loading={loading} onRowClick={open} columns={[
        {key:'order_number',label:'Commande',render:(row)=><div><strong>{row.order_number}</strong><small className="admin-block-small">{formatDate(row.created_at,true)}</small></div>},
        {key:'customer_name',label:'Client',render:(row)=><div><strong>{row.customer_name}</strong><small className="admin-block-small">{row.customer_phone}</small></div>},
        {key:'source',label:'Source'}, {key:'status',label:'Statut',render:(row)=><StatusBadge status={row.status}/>}, {key:'payment_status',label:'Paiement',render:(row)=><StatusBadge status={row.payment_status}/>},
        {key:'deposit_status',label:'Acompte',render:(row)=><div><StatusBadge status={row.deposit_status||'NONE'}/><small className="admin-block-small">{row.deposit_amount_tnd?formatMoney(row.deposit_amount_tnd):''}</small></div>},
        {key:'total_tnd',label:'Total',render:(row)=><strong>{formatMoney(row.total_tnd)}</strong>},
      ]}/><Pagination {...pagination} onChange={load}/></section>
    <Modal open={Boolean(selected)} title={selected?.order_number || 'Commande'} onClose={()=>setSelected(null)} wide>{detailLoading ? <PageLoading/> : selected && <div className="admin-order-detail">
      <OrderPipeline status={selected.status} />
      <div className="admin-order-summary"><article><span>Client</span><strong>{selected.customer_name}</strong><small>{selected.phone}</small></article><article><span>Total</span><strong>{formatMoney(selected.total_tnd)}</strong><small>{selected.payment_method}</small></article><article><span>Livraison</span><strong>{selected.governorate}</strong><small>{selected.address}</small></article></div>
      <section className="admin-list-card" style={{marginBottom:16}}>
        <h3>Snapshot CIF figé (millimes)</h3>
        <div className="admin-order-summary">
          <article><span>Sous-total converti</span><strong>{formatMoney(selected.subtotal_tnd)}</strong><small>Règles v{selected.pricing_snapshot?.version ?? '—'}</small></article>
          <article><span>Douane</span><strong>{formatMoney(selected.customs_tnd)}</strong><small>Droit + TVA + redevance</small></article>
          <article><span>Fret & local</span><strong>{formatMoney(selected.shipping_tnd)}</strong><small>International + livraison locale</small></article>
          <article><span>Commission</span><strong>{formatMoney(selected.service_tnd)}</strong><small>Express {formatMoney(selected.express_tnd)}</small></article>
          <article><span>Total figé</span><strong>{formatMoney(selected.total_tnd)}</strong><small>Inchangé après confirmation</small></article>
          <article><span>Acompte figé</span><strong>{formatMoney(selected.deposit_amount_tnd)}</strong><small>{Number(selected.deposit_percent||20)}% · {selected.tracking_code?`Suivi : ${selected.tracking_code}`:'Suivi après expédition réelle'}</small></article>
        </div>
      </section>
      <div className="admin-order-controls"><Field label="Statut commande"><Select disabled={!canWrite||busy} value={selected.status} onChange={(e)=>changeStatus(e.target.value)} options={options(['CREATED','AWAITING_DEPOSIT','AWAITING_PAYMENT_VERIFICATION','CONFIRMED','PREPARING','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'])}/></Field><Field label="Paiement (lecture seule)"><div style={{paddingTop:10}}><StatusBadge status={selected.payment_status}/></div></Field></div>

      {selected.deposit_status && selected.deposit_status!=='NONE' && <section className="admin-list-card" style={{marginBottom:16}}>
        <h3>Acompte de confirmation ({Number(selected.deposit_percent||20)}%)</h3>
        <div className="admin-order-summary">
          <article><span>Montant de l’acompte</span><strong>{formatMoney(selected.deposit_amount_tnd)}</strong><small>{selected.payment_method}</small></article>
          <article><span>Statut</span><strong><StatusBadge status={selected.deposit_status}/></strong><small>{selected.deposit_paid_at?`Confirmé le ${formatDate(selected.deposit_paid_at,true)}`:selected.deposit_submitted_at?`Reçu le ${formatDate(selected.deposit_submitted_at,true)}`:'En attente du client'}</small></article>
          <article><span>Solde à la livraison</span><strong>{formatMoney(Math.max(0,Number(selected.total_tnd)-Number(selected.deposit_amount_tnd||0)))}</strong><small>{selected.tracking_code?`Suivi : ${selected.tracking_code}`:''}</small></article>
        </div>
        {selected.deposit_review_note&&<p className="admin-block-small" style={{margin:'8px 0'}}>Dernière décision : {selected.deposit_review_note}</p>}
        {(selected.proofs||[]).length
          ?<div style={{display:'grid',gap:8,marginTop:10}}>{selected.proofs.map((proof:any)=><div key={proof.id} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><StatusBadge status={proof.status}/><a className="admin-button admin-button--secondary" href={`/api/admin/payment-proofs/${proof.id}/file`} target="_blank" rel="noreferrer"><Eye size={14}/>Voir {proof.original_name}</a><small className="admin-block-small">Réf. transfert : {proof.transfer_reference} · {formatDate(proof.submitted_at,true)}</small>{proof.rejection_reason&&<small className="admin-block-small" style={{color:'var(--admin-danger)'}}>Motif : {proof.rejection_reason}</small>}</div>)}</div>
          :<p className="admin-block-small" style={{margin:'8px 0'}}>{selected.payment_method==='CARD'?'La carte est confirmée exclusivement par Konnect.':'Aucun justificatif téléversé.'}</p>}
        {canPay&&selected.status==='AWAITING_PAYMENT_VERIFICATION'&&selected.payment_method!=='CARD'&&(selected.proofs||[]).some((proof:any)=>proof.status==='PENDING_VERIFICATION')&&<div style={{display:'flex',gap:8,alignItems:'flex-end',marginTop:10,flexWrap:'wrap'}}>
          <Field label="Note d’approbation / motif de refus"><input value={reviewNote} onChange={(e)=>setReviewNote(e.target.value)} placeholder="Motif obligatoire en cas de refus" style={{minWidth:260}}/></Field>
          <button className="admin-button admin-button--primary" disabled={busy} onClick={()=>reviewDeposit('approve')}><Check size={16}/> Valider le virement</button>
          <button className="admin-button admin-button--danger" disabled={busy||!reviewNote.trim()} onClick={()=>reviewDeposit('reject')}><X size={16}/> Refuser</button>
        </div>}
        {selected.payment_status==='PAID'&&<div style={{marginTop:12,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <p className="admin-block-small" style={{margin:0}}>Facture : {selected.invoice?.invoice_number||'non émise'}</p>
          {canPay&&!selected.invoice&&<button className="admin-button admin-button--primary" disabled={busy} onClick={issueInvoice}>Émettre la facture</button>}
          {canPay&&selected.invoice&&<button className="admin-button admin-button--secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await adminApi<any>(`/orders/${selected.id}/invoice/resend`,{method:'POST'});setToast({message:`Facture ${r.data?.invoiceNumber} ${r.data?.mail?.delivered?'renvoyée par e-mail':'régénérée'}.`,tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}}}><RefreshCw size={16}/> Régénérer / renvoyer</button>}
        </div>}
      </section>}
      <section className="admin-list-card" style={{marginBottom:16}}><h3>Expédition & suivi</h3><div className="admin-order-controls">
        <Field label="Étape"><Select disabled={!canWrite||busy} value={deliveryDraft.status} onChange={(e)=>setDeliveryDraft({...deliveryDraft,status:e.target.value})} options={options(['PENDING','PREPARING','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED'])}/></Field>
        <Field label="Transporteur"><input value={deliveryDraft.carrier} onChange={(e)=>setDeliveryDraft({...deliveryDraft,carrier:e.target.value})} placeholder="Transporteur réel"/></Field>
        <Field label="N° de suivi"><input value={deliveryDraft.tracking_number} onChange={(e)=>setDeliveryDraft({...deliveryDraft,tracking_number:e.target.value})} placeholder="Numéro fourni par le transporteur"/></Field>
        <Field label="URL HTTPS (optionnelle)"><input value={deliveryDraft.tracking_url} onChange={(e)=>setDeliveryDraft({...deliveryDraft,tracking_url:e.target.value})} placeholder="https://…"/></Field>
      </div><button className="admin-button admin-button--primary" disabled={!canWrite||busy} onClick={updateDelivery}>Enregistrer la livraison</button><p className="admin-block-small">Le suivi client n’apparaît qu’après SHIPPED. Transporteur et numéro sont alors obligatoires.</p></section>
      <h3>Articles</h3><DataTable<any> rows={selected.items||[]} columns={[
        {key:'product_name',label:'Produit',render:(row)=><div><strong>{row.product_name}</strong>{(row.requested_size||row.requested_color)&&<small className="admin-block-small">{[row.requested_size&&`Taille : ${row.requested_size}`,row.requested_color&&`Couleur : ${row.requested_color}`].filter(Boolean).join(' · ')}</small>}{row.customer_note&&<small className="admin-block-small">Note client : {row.customer_note}</small>}</div>},
        {key:'source_url',label:'Lien client',render:(row)=><div>{/^https?:\/\//i.test(row.source_url||'')?<a href={row.source_url} target="_blank" rel="noreferrer" className="admin-link">Ouvrir le produit <ExternalLink size={14}/></a>:<span>—</span>}{/^https?:\/\//i.test(row.reference_url||'')&&row.reference_url!==row.source_url&&<a href={row.reference_url} target="_blank" rel="noreferrer" className="admin-block-small">Référence Lens <ExternalLink size={14}/></a>}{(row.reference_url||row.price_verification_status==='PENDING_MANUAL')&&<small className="admin-block-small"><StatusBadge status={row.price_verification_status||'VERIFIED'}/></small>}</div>},
        {key:'source_platform',label:'Source'}, {key:'quantity',label:'Qté'},
        {key:'original_price',label:'Prix source',render:(row)=>`${row.original_price} ${row.currency}`},
        {key:'total_tnd',label:'Total figé',render:(row)=>formatMoney(row.total_tnd)},
      ]}/>
      <h3>Historique</h3><div className="admin-timeline">{(selected.history||[]).map((item:any)=><div key={item.id}><i/><div><StatusBadge status={item.to_status}/><p>{item.note||'Mise à jour du statut'}</p><small>{formatDate(item.created_at,true)}</small></div></div>)}</div>
    </div>}</Modal>{toast&&<Toast {...toast}/>}</>;
};

const LensRequestsPage: React.FC<{ canWrite: boolean; requestedId?: string }> = ({ canWrite, requestedId }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<any>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await adminApi<any>(`/ayrovix-reviews?${queryString({ page, pageSize: 20, search, status })}`);
      setRows(result.data || []);
      setPagination(result.pagination);
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  const open = useCallback(async (row: any) => {
    setSelected(row);
    setDetailLoading(true);
    try {
      const result = await adminApi<any>(`/ayrovix-reviews/${row.id}`);
      setSelected(result.data);
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (requestedId) void open({ id: requestedId });
  }, [open, requestedId]);

  const save = async () => {
    if (!selected || !canWrite) return;
    setBusy(true);
    try {
      const result = await adminApi<any>(`/ayrovix-reviews/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: selected.status,
          quotedPrice: selected.quoted_price ?? '',
          quotedCurrency: selected.quoted_currency || 'TND',
          verifiedVariant: selected.verified_variant || '',
          verifiedUrl: selected.verified_url || '',
          customerMessage: selected.customer_message || '',
          adminNote: selected.admin_note || '',
        }),
      });
      setSelected(result.data);
      await load(pagination.page);
      setToast({ message: 'Demande Lens mise à jour et auditée.', tone: 'success' });
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return <>
    <PageHeader title="Demandes Lens" description="File de vérification manuelle : prix marchand, stock et variante doivent être confirmés avant toute commande." />
    <section className="admin-list-card">
      <div className="admin-list-toolbar">
        <Search value={search} onChange={setSearch} placeholder="Produit, source, contact ou référence…" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)} options={[
          { value: '', label: 'Tous les statuts' }, ...options(['PENDING','IN_REVIEW','QUOTED','REJECTED','CANCELLED']),
        ]} />
      </div>
      <DataTable rows={rows} loading={loading} emptyText="Aucune demande Lens." onRowClick={open} columns={[
        { key: 'title', label: 'Produit', render: (row) => <div><strong>{row.title}</strong><small className="admin-block-small">{row.source || 'Source externe'}</small></div> },
        { key: 'contact', label: 'Contact', render: (row) => <div>{row.account_name || row.contact}<small className="admin-block-small">{row.account_name ? row.contact : 'Visiteur'}</small></div> },
        { key: 'lens_price', label: 'Prix repéré', render: (row) => row.lens_price ? `${Number(row.lens_price).toFixed(2)} ${row.lens_currency || ''}` : '—' },
        { key: 'variant', label: 'Souhait', render: (row) => <small>{[row.desired_size && `Taille ${row.desired_size}`, row.desired_color].filter(Boolean).join(' · ') || 'Non précisé'}</small> },
        { key: 'status', label: 'Statut', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'created_at', label: 'Reçue le', render: (row) => formatDate(row.created_at, true) },
      ]} />
      <Pagination {...pagination} onChange={load} />
    </section>

    <Modal open={Boolean(selected)} title={selected?.title || 'Demande Lens'} onClose={() => setSelected(null)} wide
      footer={selected && !detailLoading && canWrite ? <><Button variant="secondary" onClick={() => setSelected(null)}>Fermer</Button><Button busy={busy} onClick={save}>Enregistrer</Button></> : undefined}>
      {detailLoading ? <PageLoading /> : selected && <div className="admin-order-detail">
        <div className="admin-order-summary">
          <article><span>Contact</span><strong>{selected.account_name || selected.contact}</strong><small>{selected.account_name ? selected.contact : 'Demande visiteur'}</small></article>
          <article><span>Prix Lens non confirmé</span><strong>{selected.lens_price ? `${Number(selected.lens_price).toFixed(2)} ${selected.lens_currency || ''}` : 'Non disponible'}</strong><small>Ne jamais utiliser pour encaisser</small></article>
          <article><span>Variante souhaitée</span><strong>{selected.desired_size || selected.desired_color ? [selected.desired_size, selected.desired_color].filter(Boolean).join(' · ') : 'Non précisée'}</strong><small>À vérifier sur la fiche marchand</small></article>
        </div>
        <section className="admin-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: selected.image_url ? '96px minmax(0,1fr)' : '1fr', gap: 16, alignItems: 'center' }}>
            {selected.image_url && <img src={selected.image_url} alt="" referrerPolicy="no-referrer" style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 12, background: 'var(--admin-surface-sunken)' }} />}
            <div><strong>{selected.title}</strong><p className="admin-block-small">{selected.source || 'Source Lens'}</p><a href={selected.source_url} target="_blank" rel="noreferrer" className="admin-button admin-button--secondary" style={{ marginTop: 8 }}>Ouvrir la fiche marchand</a><code className="admin-block-small" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{selected.id}</code></div>
          </div>
        </section>
        <div className="admin-form-row">
          <Field label="Statut" required><Select disabled={!canWrite || busy} value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value })} options={options(['PENDING','IN_REVIEW','QUOTED','REJECTED','CANCELLED'])} /></Field>
          <Field label="Prix confirmé / devis" required={selected.status === 'QUOTED'}><input disabled={!canWrite || busy} type="number" min="0.01" max="1000000" step="0.01" value={selected.quoted_price ?? ''} onChange={(event) => setSelected({ ...selected, quoted_price: event.target.value })} /></Field>
          <Field label="Devise"><Select disabled={!canWrite || busy} value={selected.quoted_currency || 'TND'} onChange={(event) => setSelected({ ...selected, quoted_currency: event.target.value })} options={options(['TND','EUR','USD','GBP'])} /></Field>
          <Field label="Variante confirmée" full><input disabled={!canWrite || busy} value={selected.verified_variant || ''} onChange={(event) => setSelected({ ...selected, verified_variant: event.target.value })} placeholder="Ex. 41 EU · Noir · en stock" /></Field>
          <Field label="Lien vérifié" full><input disabled={!canWrite || busy} type="url" value={selected.verified_url || ''} onChange={(event) => setSelected({ ...selected, verified_url: event.target.value })} placeholder="https://…" /></Field>
          <Field label="Message au client" hint="Visible dans le suivi de sa demande." full><textarea disabled={!canWrite || busy} rows={3} value={selected.customer_message || ''} onChange={(event) => setSelected({ ...selected, customer_message: event.target.value })} /></Field>
          <Field label="Note interne" hint="Réservée à l’équipe et au journal d’audit." full><textarea disabled={!canWrite || busy} rows={3} value={selected.admin_note || ''} onChange={(event) => setSelected({ ...selected, admin_note: event.target.value })} /></Field>
        </div>
        {selected.resolved_by_name && <p className="admin-block-small">{selected.resolved_at ? 'Résolue' : 'Prise en charge'} par {selected.resolved_by_name}{selected.resolved_at ? ` · ${formatDate(selected.resolved_at, true)}` : ''}</p>}
      </div>}
    </Modal>
    {toast && <Toast message={toast.message} tone={toast.tone} />}
  </>;
};

const AssistantSupportPage: React.FC<{ canWrite: boolean; requestedId?: string }> = ({ canWrite, requestedId }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<any>(null);
  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await adminApi<any>(`/assistant-support?${queryString({ page, pageSize: 20, search, status })}`);
      setRows(result.data || []);
      setPagination(result.pagination);
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
    finally { setLoading(false); }
  }, [search, status]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);
  const open = async (row: any) => {
    try { setSelected((await adminApi<any>(`/assistant-support/${row.id}`)).data); }
    catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
  };
  useEffect(() => { if (requestedId) void open({ id: requestedId }); }, [requestedId]);
  const save = async () => {
    if (!selected || !canWrite) return;
    setBusy(true);
    try {
      const result = await adminApi<any>(`/assistant-support/${selected.id}`, {
        method: 'PUT', body: JSON.stringify({ status: selected.status, priority: selected.priority, adminNote: selected.admin_note || '' }),
      });
      setSelected({ ...selected, ...result.data });
      await load(pagination.page);
      setToast({ message: 'Ticket support mis à jour et audité.', tone: 'success' });
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeader title="Support IA" description="Demandes transférées par l’assistant à l’équipe AYROVI, avec identité vérifiée ou contact visiteur." />
    <section className="admin-list-card">
      <div className="admin-list-toolbar"><Search value={search} onChange={setSearch} placeholder="Référence, client, contact ou motif…"/><Select value={status} onChange={event=>setStatus(event.target.value)} options={[{value:'',label:'Tous les statuts'},...options(['PENDING','IN_PROGRESS','RESOLVED','CLOSED'])]}/></div>
      <DataTable rows={rows} loading={loading} emptyText="Aucun ticket support." onRowClick={open} columns={[
        {key:'reason',label:'Demande',render:row=><div><strong>{row.reason}</strong><small className="admin-block-small">{row.id}</small></div>},
        {key:'contact',label:'Client',render:row=><div>{row.account_name||row.contact}<small className="admin-block-small">{row.account_name?row.contact:'Visiteur'}</small></div>},
        {key:'priority',label:'Priorité',render:row=><StatusBadge status={row.priority}/>},
        {key:'status',label:'Statut',render:row=><StatusBadge status={row.status}/>},
        {key:'created_at',label:'Créé le',render:row=>formatDate(row.created_at,true)},
      ]}/><Pagination {...pagination} onChange={load}/>
    </section>
    <Modal open={Boolean(selected)} title="Ticket support IA" onClose={()=>setSelected(null)} wide footer={selected&&canWrite?<><Button variant="secondary" onClick={()=>setSelected(null)}>Fermer</Button><Button busy={busy} onClick={save}>Enregistrer</Button></>:undefined}>
      {selected&&<div className="admin-order-detail">
        <div className="admin-order-summary"><article><span>Client</span><strong>{selected.account_name||selected.contact}</strong><small>{selected.account_name?selected.contact:'Visiteur'}</small></article><article><span>Priorité</span><strong>{selected.priority}</strong><small>{formatDate(selected.created_at,true)}</small></article><article><span>Assigné à</span><strong>{selected.assigned_name||'Non assigné'}</strong><small>{selected.id}</small></article></div>
        <section className="admin-card" style={{marginBottom:16}}><h3>Motif</h3><p className="admin-block-small">{selected.reason}</p><h3 style={{marginTop:16}}>Contexte transmis</h3><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',fontSize:13,lineHeight:1.6,background:'var(--admin-surface-sunken)',padding:14,borderRadius:12}}>{selected.context_excerpt||'Aucun contexte enregistré.'}</pre></section>
        <div className="admin-form-row"><Field label="Statut"><Select disabled={!canWrite||busy} value={selected.status} onChange={event=>setSelected({...selected,status:event.target.value})} options={options(['PENDING','IN_PROGRESS','RESOLVED','CLOSED'])}/></Field><Field label="Priorité"><Select disabled={!canWrite||busy} value={selected.priority} onChange={event=>setSelected({...selected,priority:event.target.value})} options={options(['NORMAL','HIGH'])}/></Field><Field label="Note interne" full><textarea rows={4} disabled={!canWrite||busy} value={selected.admin_note||''} onChange={event=>setSelected({...selected,admin_note:event.target.value})}/></Field></div>
      </div>}
    </Modal>{toast&&<Toast message={toast.message} tone={toast.tone}/>}
  </>;
};

const CustomersPage: React.FC<{ canWrite?: boolean }> = ({canWrite=false}) => {
  const [tab,setTab]=useState<'accounts'|'files'>('accounts');
  const [rows,setRows]=useState<any[]>([]); const [page,setPage]=useState({page:1,totalPages:1,total:0}); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true); const [selected,setSelected]=useState<any>(null);
  const [accRows,setAccRows]=useState<any[]>([]); const [accPage,setAccPage]=useState({page:1,totalPages:1,total:0}); const [accSearch,setAccSearch]=useState(''); const [accLoading,setAccLoading]=useState(true); const [accSelected,setAccSelected]=useState<any>(null); const [statusBusy,setStatusBusy]=useState(false);
  const load=useCallback(async(p=1)=>{setLoading(true);try{const r=await adminApi<any>(`/customers?${queryString({page:p,pageSize:20,search})}`);setRows(r.data);setPage(r.pagination);}finally{setLoading(false);}},[search]);
  const loadAccounts=useCallback(async(p=1)=>{setAccLoading(true);try{const r=await adminApi<any>(`/customer-accounts?${queryString({page:p,pageSize:20,search:accSearch})}`);setAccRows(r.data);setAccPage(r.pagination);}finally{setAccLoading(false);}},[accSearch]);
  useEffect(()=>{const t=setTimeout(()=>load(),250);return()=>clearTimeout(t);},[search]);
  useEffect(()=>{const t=setTimeout(()=>loadAccounts(),250);return()=>clearTimeout(t);},[accSearch]);
  const open=async(row:any)=>setSelected((await adminApi<any>(`/customers/${row.id}`)).data);
  const openAccount=async(row:any)=>setAccSelected((await adminApi<any>(`/customer-accounts/${row.id}`)).data);
  const changeAccountStatus=async(status:'ACTIVE'|'BLOCKED')=>{if(!accSelected||statusBusy)return;setStatusBusy(true);try{const r=await adminApi<any>(`/customer-accounts/${accSelected.id}/status`,{method:'PUT',body:JSON.stringify({status})});setAccSelected({...accSelected,status:r.data.status});loadAccounts(accPage.page||1);}finally{setStatusBusy(false);}};
  return <><PageHeader title="Clients" description="Comptes enregistrés (Google / SMS) et fiches historiques de commande, réunis dans un seul espace."/>
    <div style={{display:'flex',gap:8,marginBottom:16}}>
      <button className={tab==='accounts'?'admin-button admin-button--primary':'admin-button admin-button--secondary'} onClick={()=>setTab('accounts')}>Comptes enregistrés</button>
      <button className={tab==='files'?'admin-button admin-button--primary':'admin-button admin-button--secondary'} onClick={()=>setTab('files')}>Fiches de commande</button>
    </div>
    {tab==='accounts'&&<><section className="admin-list-card"><div className="admin-list-toolbar"><Search value={accSearch} onChange={setAccSearch} placeholder="Nom, e-mail ou téléphone…"/></div><DataTable rows={accRows} loading={accLoading} onRowClick={openAccount} columns={[
      {key:'display_name',label:'Identité',render:(r)=><div><strong>{r.display_name}</strong><small className="admin-block-small">{r.email||'Compte SMS'}</small></div>},
      {key:'phone',label:'Téléphone',render:(r)=><div>{r.phone||'—'}<small className="admin-block-small">{r.phone_verified?'Vérifié par SMS':'Non vérifié'}</small></div>},
      {key:'status',label:'Statut',render:(r)=><StatusBadge status={r.status}/>},
      {key:'order_count',label:'Commandes'},{key:'lifetime_value',label:'Valeur client',render:(r)=>formatMoney(r.lifetime_value)},
      {key:'created_at',label:'Inscrit le',render:(r)=>formatDate(r.created_at)},
      {key:'last_login_at',label:'Dernière connexion',render:(r)=>formatDate(r.last_login_at,true)}]}/><Pagination {...accPage} onChange={loadAccounts}/></section>
    <Modal open={Boolean(accSelected)} title={accSelected?.display_name||'Compte client'} onClose={()=>setAccSelected(null)} wide>{accSelected&&<><div className="admin-order-summary"><article><span>E-mail</span><strong>{accSelected.email||'—'}</strong><small>{accSelected.email_verified_at?`Vérifié le ${formatDate(accSelected.email_verified_at,true)}`:'Connexion Google'}</small></article><article><span>Téléphone</span><strong>{accSelected.phone||'Non renseigné'}</strong><small>{accSelected.phone_verified_at?`Vérifié le ${formatDate(accSelected.phone_verified_at,true)}`:'Non vérifié'}</small></article><article><span>Accès</span><strong><StatusBadge status={accSelected.status}/></strong><small>Dernière connexion {formatDate(accSelected.last_login_at,true)}</small></article><article><span>Marketing</span><strong>{accSelected.marketing_opt_in?'Abonné':'Non abonné'}</strong><small>Inscrit le {formatDate(accSelected.created_at)}</small></article></div>
      {canWrite&&<div style={{display:'flex',gap:8,margin:'14px 0'}}>{accSelected.status==='ACTIVE'?<button className="admin-button admin-button--danger" disabled={statusBusy} onClick={()=>changeAccountStatus('BLOCKED')}>Bloquer le compte</button>:<button className="admin-button admin-button--primary" disabled={statusBusy} onClick={()=>changeAccountStatus('ACTIVE')}>Réactiver le compte</button>}</div>}
      <h3>Adresses enregistrées</h3>{(accSelected.addresses||[]).length?<DataTable<any> rows={accSelected.addresses} columns={[{key:'label',label:'Libellé'},{key:'recipient_name',label:'Destinataire'},{key:'phone',label:'Téléphone'},{key:'governorate',label:'Gouvernorat'},{key:'address_line',label:'Adresse'}]}/>:<div className="admin-empty"><User size={26}/><strong>Aucune adresse</strong><span>Le client n’a pas encore enregistré d’adresse.</span></div>}
      <h3>Commandes du compte</h3><DataTable<any> rows={accSelected.orders||[]} columns={[{key:'order_number',label:'Commande'},{key:'status',label:'Statut',render:(r)=><StatusBadge status={r.status}/>},{key:'payment_status',label:'Paiement',render:(r)=><StatusBadge status={r.payment_status}/>},{key:'total_tnd',label:'Total',render:(r)=>formatMoney(r.total_tnd)},{key:'created_at',label:'Date',render:(r)=>formatDate(r.created_at,true)}]}/></>}</Modal></>}
    {tab==='files'&&<><section className="admin-list-card"><div className="admin-list-toolbar"><Search value={search} onChange={setSearch} placeholder="Nom ou téléphone…"/></div><DataTable rows={rows} loading={loading} onRowClick={open} columns={[
    {key:'name',label:'Client',render:(r)=><div><strong>{r.name}</strong><small className="admin-block-small">{r.phone}</small></div>},
    {key:'account_id',label:'Compte client',render:(r)=><div>{r.account_id?<><StatusBadge status={r.phone_verified_at?'VERIFIED':'ACTIVE'}/><small className="admin-block-small">{r.account_email||'Connexion SMS'}</small></>:<><StatusBadge status="UNLINKED"/><small className="admin-block-small">Aucun compte lié</small></>}</div>},
    {key:'governorate',label:'Gouvernorat'},{key:'order_count',label:'Commandes'},{key:'lifetime_value',label:'Valeur client',render:(r)=>formatMoney(r.lifetime_value)},{key:'registered_at',label:'Client depuis',render:(r)=>formatDate(r.registered_at)}]}/><Pagination {...page} onChange={load}/></section>
    <Modal open={Boolean(selected)} title={selected?.name||'Client'} onClose={()=>setSelected(null)} wide>{selected&&<><div className="admin-order-summary"><article><span>Téléphone historique</span><strong>{selected.phone}</strong></article><article><span>Gouvernorat</span><strong>{selected.governorate}</strong></article><article><span>Adresse</span><strong>{selected.address}</strong></article></div><h3>Compte client lié</h3>{selected.account?<div className="admin-order-summary"><article><span>Identité du compte</span><strong>{selected.account.display_name}</strong><small>{selected.account.email||'Sans e-mail'}</small></article><article><span>Téléphone</span><strong>{selected.account.phone||'Non renseigné'}</strong><small>{selected.account.phone_verified_at?`Vérifié le ${formatDate(selected.account.phone_verified_at,true)}`:'Non vérifié'}</small></article><article><span>Accès</span><strong><StatusBadge status={selected.account.status}/></strong><small>Dernière connexion {formatDate(selected.account.last_login_at,true)}</small></article></div>:<div className="admin-empty"><User size={26}/><strong>Aucun compte client lié</strong><span>Cette fiche reste un contact historique de commande.</span></div>}<h3>Commandes du client</h3><DataTable<any> rows={selected.orders||[]} columns={[{key:'order_number',label:'Commande'},{key:'account_id',label:'Propriété',render:(r)=><StatusBadge status={r.account_id?'LINKED':'GUEST'}/>},{key:'status',label:'Statut',render:(r)=><StatusBadge status={r.status}/>},{key:'total_tnd',label:'Total',render:(r)=>formatMoney(r.total_tnd)},{key:'created_at',label:'Date',render:(r)=>formatDate(r.created_at,true)}]}/></>}</Modal></>}
  </>;
};

const SettingsPage:React.FC<{canWrite:boolean}>=({canWrite})=>{
  const [rows,setRows]=useState<any[]>([]);const [busy,setBusy]=useState('');const [toast,setToast]=useState<any>(null);
  const load=()=>adminApi<any>('/settings').then(r=>setRows(r.data.map((row:any)=>row.value_type==='JSON'?{...row,setting_value:JSON.stringify(row.setting_value,null,2)}:row)));
  useEffect(()=>{load();},[]);
  const update=async(row:any)=>{setBusy(row.id);try{let value=row.setting_value;if(row.value_type==='JSON'){try{value=JSON.parse(String(value));}catch{throw new Error('Le JSON est invalide. Corrigez sa syntaxe avant d’enregistrer.');}}await adminApi(`/settings/${row.id}`,{method:'PUT',body:JSON.stringify({value})});await load();setToast({message:'Paramètre enregistré.',tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy('');}};
  const groups=['GENERAL','COMMERCE','DELIVERY','PAYMENT','CHANNELS','DESIGN'];return <><PageHeader title="Paramètres" description="Configuration générale, commerce, livraison, paiements, canaux et design — sans secret dans le frontend."/>
  <div className="admin-settings-grid">{groups.map(group=><section className="admin-card" key={group}><CardTitle title={labels[group]||group} subtitle={`${rows.filter(r=>r.category===group).length} paramètres`}/><div className="admin-settings-list">{rows.filter(r=>r.category===group).map(row=><div key={row.id}><Field label={row.label}>{row.value_type==='JSON'?<textarea rows={3} disabled={!canWrite} value={String(row.setting_value)} onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,setting_value:e.target.value}:r))}/>:<input disabled={!canWrite} type={row.value_type==='NUMBER'?'number':'text'} value={String(row.setting_value)} onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,setting_value:e.target.value}:r))}/>}</Field>{canWrite&&<Button variant="secondary" busy={busy===row.id} onClick={()=>update(row)}>Enregistrer</Button>}</div>)}</div></section>)}</div>{toast&&<Toast {...toast}/>}</>;
};

const UsersPage:React.FC=()=>{
  const [rows,setRows]=useState<any[]>([]);const [modal,setModal]=useState(false);const [form,setForm]=useState({name:'',email:'',password:'',role:'CONTENT_MANAGER'});const [toast,setToast]=useState<any>(null);const [busy,setBusy]=useState(false);const load=()=>adminApi<any>('/users').then(r=>setRows(r.data));useEffect(()=>{load();},[]);
  const create=async()=>{setBusy(true);try{await adminApi('/users',{method:'POST',body:JSON.stringify(form)});setModal(false);setForm({name:'',email:'',password:'',role:'CONTENT_MANAGER'});await load();setToast({message:'Utilisateur créé.',tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}};
  const toggle=async(row:any)=>{try{await adminApi(`/users/${row.id}`,{method:'PUT',body:JSON.stringify({active:!row.active})});await load();}catch(e:any){setToast({message:e.message,tone:'error'});}};
  return <><PageHeader title="Utilisateurs" description="Comptes internes et contrôle d’accès par rôle." action={<Button onClick={()=>setModal(true)}><Plus/>Nouvel utilisateur</Button>}/><section className="admin-list-card"><DataTable rows={rows} columns={[{key:'name',label:'Utilisateur',render:r=><div><strong>{r.name}</strong><small className="admin-block-small">{r.email}</small></div>},{key:'role',label:'Rôle',render:r=><StatusBadge status={r.role}/>},{key:'active',label:'Statut',render:r=><StatusBadge status={r.active?'ACTIVE':'INACTIVE'}/>},{key:'last_login_at',label:'Dernière connexion',render:r=>formatDate(r.last_login_at,true)},{key:'action',label:'',render:r=><Button variant="ghost" onClick={()=>toggle(r)}>{r.active?'Désactiver':'Activer'}</Button>}]}/></section>
  <Modal open={modal} title="Créer un utilisateur" onClose={()=>setModal(false)}><Form onSubmit={e=>{e.preventDefault();create();}}><Field label="Nom" required full><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></Field><Field label="Email" required full><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></Field><Field label="Mot de passe" hint="12 caractères minimum" required full><input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/></Field><Field label="Rôle" full><Select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} options={options(['SUPER_ADMIN','ADMIN','CONTENT_MANAGER','ORDER_MANAGER'])}/></Field><Button busy={busy} type="submit">Créer le compte</Button></Form></Modal>{toast&&<Toast {...toast}/>}</>;
};

const AuditPage:React.FC=()=>{const[rows,setRows]=useState<any[]>([]);const[page,setPage]=useState({page:1,totalPages:1,total:0});const[loading,setLoading]=useState(true);const load=async(p=1)=>{setLoading(true);const r=await adminApi<any>(`/audit-logs?page=${p}&pageSize=30`);setRows(r.data);setPage(r.pagination);setLoading(false);};useEffect(()=>{load();},[]);return <><PageHeader title="Journal d’audit" description="Qui a fait quoi, quand, sur quelle donnée — avec valeurs avant et après."/><section className="admin-list-card"><DataTable rows={rows} loading={loading} columns={[{key:'created_at',label:'Date',render:r=>formatDate(r.created_at,true)},{key:'user_name',label:'Acteur'},{key:'action',label:'Action',render:r=><StatusBadge status={r.action}/>},{key:'module',label:'Module'},{key:'entity_id',label:'Cible',render:r=><code>{r.entity_id||'—'}</code>},{key:'changes',label:'Modification',render:r=><small>{r.old_value?'Valeur précédente conservée':''}{r.old_value&&r.new_value?' → ':''}{r.new_value?'Nouvelle valeur conservée':''}</small>}]}/><Pagination {...page} onChange={load}/></section></>};


// ===== التقارير المالية: مداخيل / مصاريف / أرباح =====
const ReportsPage:React.FC<{canWrite:boolean}>=({canWrite})=>{
  const today=new Date().toISOString().slice(0,10);const monthStart=`${today.slice(0,7)}-01`;
  const [from,setFrom]=useState(monthStart);const [to,setTo]=useState(today);
  const [report,setReport]=useState<any>(null);const [expenses,setExpenses]=useState<any[]>([]);const [ayx,setAyx]=useState<any>(null);const [toast,setToast]=useState<any>(null);const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({label:'',category:'OTHER',amountTnd:'',expenseDate:today,notes:''});
  const load=useCallback(async()=>{try{const[r,e,a]=await Promise.all([adminApi<any>(`/reports/finance?from=${from}&to=${to}`),adminApi<any>(`/expenses?from=${from}&to=${to}`),adminApi<any>('/ayrovix/stats')]);setReport(r.data);setExpenses(e.data||[]);setAyx(a.data);}catch(err:any){setToast({message:err.message,tone:'error'});}},[from,to]);
  useEffect(()=>{load();},[load]);
  const add=async()=>{setBusy(true);try{await adminApi('/expenses',{method:'POST',body:JSON.stringify({...form,amountTnd:Number(form.amountTnd)})});setForm({label:'',category:'OTHER',amountTnd:'',expenseDate:today,notes:''});await load();setToast({message:'Dépense enregistrée.',tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}};
  const remove=async(id:string)=>{try{await adminApi(`/expenses/${id}`,{method:'DELETE'});await load();}catch(e:any){setToast({message:e.message,tone:'error'});}};
  const maxMonthly=Math.max(1,...((report?.monthly||[]) as any[]).flatMap(m=>[m.income,m.expenses]));
  return <><PageHeader title="Rapports financiers" description="Revenus encaissés (acomptes confirmés), dépenses et bénéfice net — calculés depuis la base." action={<div className="admin-report-range"><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><span>→</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>}/>
  {report&&<div className="admin-kpi-grid">
    <section className="admin-kpi"><span>Revenus encaissés</span><strong className="is-income">{formatMoney(report.income)}</strong><small>{report.incomeCount} acompte(s) confirmé(s)</small></section>
    <section className="admin-kpi"><span>Dépenses</span><strong className="is-expense">{formatMoney(report.expenses)}</strong><small>{report.expensesCount} ligne(s)</small></section>
    <section className="admin-kpi"><span>Bénéfice net</span><strong className={report.profit>=0?'is-income':'is-expense'}>{formatMoney(report.profit)}</strong><small>Revenus − dépenses</small></section>
    <section className="admin-kpi"><span>Acomptes en attente</span><strong>{formatMoney(report.pendingDeposits?.total)}</strong><small>{report.pendingDeposits?.count} commande(s) non confirmée(s)</small></section>
  </div>}
  <div className="admin-report-grid">
    <section className="admin-card"><CardTitle title="6 derniers mois" subtitle="Revenus vs dépenses (TND)"/><div className="admin-chart">{((report?.monthly||[]) as any[]).map(m=><div key={m.month} className="admin-chart-col"><div className="admin-chart-bars"><i className="is-income" style={{height:`${Math.max(2,Math.round((m.income/maxMonthly)*110))}px`}} title={`Revenus ${formatMoney(m.income)}`}/><i className="is-expense" style={{height:`${Math.max(2,Math.round((m.expenses/maxMonthly)*110))}px`}} title={`Dépenses ${formatMoney(m.expenses)}`}/></div><span>{m.month.slice(5)}/{m.month.slice(2,4)}</span></div>)}<div className="admin-chart-legend"><i className="is-income"/>Revenus<i className="is-expense"/>Dépenses</div></div></section>
      <section className="admin-card"><CardTitle title="Dépenses par catégorie" subtitle="Période sélectionnée"/><div className="admin-settings-list">{((report?.expensesByCategory||[]) as any[]).length===0&&<p className="admin-block-small">Aucune dépense sur la période.</p>}{((report?.expensesByCategory||[]) as any[]).map(row=><div key={row.category} className="admin-cat-row"><span>{({ADS:'Publicité',SHIPPING:'Transport',STOCK:'Stock',SERVICES:'Services',SALARIES:'Salaires',FEES:'Frais',OTHER:'Autres'} as any)[row.category]||row.category}</span><strong>{formatMoney(row.total)}</strong></div>)}</div></section>
      {ayx&&<section className="admin-card"><CardTitle title="AYROVIX Lens · 7 derniers jours" subtitle="Usage du scan produit (image / lien / QR) — données anonymes"/>
        {ayx.providers&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          <Badge tone={ayx.providers.vision?.configured?'success':'warning'}>{ayx.providers.vision?.configured?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>} AI Core Vision : {ayx.providers.vision?.configured?'Prix et compréhension actifs':'Fournisseur non configuré'}</Badge>
          <Badge tone={ayx.providers.visualSearch?.configured?'success':'warning'}>{ayx.providers.visualSearch?.configured?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>} Google Lens : {ayx.providers.visualSearch?.configured?'SerpApi configuré · produits visuels actifs':'Clé manquante — SERPAPI_KEY'}</Badge>
          <Badge tone={ayx.providers.search?.configured?'success':'warning'}>{ayx.providers.search?.configured?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>} AI Core Web Search : {ayx.providers.search?.configured?`Fallback texte actif · 1 recherche max/requête`:'Fournisseur non configuré'}</Badge>
        </div>}
        <div className="admin-kpi-grid" style={{marginBottom:12}}>
          <section className="admin-kpi"><span>Analyses</span><strong>{ayx.last7d.total}</strong><small className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1"><Camera size={12} />{ayx.last7d.image}</span><span className="inline-flex items-center gap-1"><Link2 size={12} />{ayx.last7d.url}</span><span className="inline-flex items-center gap-1"><Grid size={12} />{ayx.last7d.qr}</span></small></section>
          <section className="admin-kpi"><span>Taux de correspondance</span><strong className="is-income">{ayx.last7d.matchRate}%</strong><small>{ayx.last7d.withCandidates} avec résultats</small></section>
          <section className="admin-kpi"><span>Produits confirmés</span><strong>{ayx.last7d.chosen}</strong><small>choix client après analyse</small></section>
        </div>
        <div className="admin-settings-list">
          {(ayx.topBrands||[]).length===0&&(ayx.topQueries||[]).length===0&&<p className="admin-block-small">Aucune analyse sur la période.</p>}
          {(ayx.topBrands||[]).map((row:any)=><div key={row.brand} className="admin-cat-row"><span>Marque : {row.brand}</span><strong>×{row.count}</strong></div>)}
          {(ayx.topQueries||[]).map((row:any)=><div key={row.query} className="admin-cat-row"><span className="admin-block-small" style={{maxWidth:'70%'}}>{row.query}</span><strong>×{row.count}</strong></div>)}
        </div>
      </section>}
  </div>
  <div className="admin-report-grid">
    <section className="admin-card"><CardTitle title="Nouvelle dépense" subtitle="Enregistrez vos charges pour un bénéfice exact"/>{canWrite?<Form onSubmit={e=>{e.preventDefault();add();}}><Field label="Libellé" required full><input value={form.label} onChange={e=>setForm({...form,label:e.target.value})} required placeholder="Ex : Campagne Facebook Ads"/></Field><div className="admin-form-row"><Field label="Catégorie" full><Select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} options={options(['ADS','SHIPPING','STOCK','SERVICES','SALARIES','FEES','OTHER'])}/></Field><Field label="Montant (TND)" required full><input type="number" min="0.001" step="0.001" value={form.amountTnd} onChange={e=>setForm({...form,amountTnd:e.target.value})} required/></Field></div><div className="admin-form-row"><Field label="Date" full><input type="date" value={form.expenseDate} onChange={e=>setForm({...form,expenseDate:e.target.value})} required/></Field><Field label="Notes" full><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field></div><Button busy={busy} type="submit">Ajouter la dépense</Button></Form>:<p className="admin-block-small">Lecture seule pour votre rôle.</p>}</section>
    <section className="admin-card"><CardTitle title="Dépenses de la période" subtitle={`${expenses.length} ligne(s)`}/><div className="admin-settings-list">{expenses.length===0&&<p className="admin-block-small">Aucune dépense.</p>}{expenses.map(row=><div key={row.id} className="admin-cat-row"><span><strong>{row.label}</strong><small className="admin-block-small">{row.expense_date} · {({ADS:'Publicité',SHIPPING:'Transport',STOCK:'Stock',SERVICES:'Services',SALARIES:'Salaires',FEES:'Frais',OTHER:'Autres'} as any)[row.category]||row.category}{row.notes?` · ${row.notes}`:''}</small></span><span className="admin-cat-amount">{formatMoney(row.amount_tnd)}{canWrite&&<Button variant="ghost" onClick={()=>remove(row.id)}>Suppr.</Button>}</span></div>)}</div></section>
  </div>{toast&&<Toast {...toast}/>}</>;
};

// ===== قسم التطوير: ثيم المنصة بالكامل + القنوات + نص الفوتر =====
const THEME_PRESETS=[
  {id:'noir',label:'Noir AYROVI',primary:'#111318',primaryDark:'#050505',primaryLight:'#3f3f46',accent:'#ff6900',gradient:'linear-gradient(135deg,#050505 0%,#111318 100%)',font:FONT_STACK},
  {id:'nuit',label:'Bleu nuit',primary:'#2563eb',primaryDark:'#1d4ed8',primaryLight:'#60a5fa',accent:'#ff6900',gradient:'linear-gradient(135deg,#0b1e4b 0%,#2563eb 100%)',font:FONT_STACK},
  {id:'emeraude',label:'Émeraude',primary:'#059669',primaryDark:'#047857',primaryLight:'#34d399',accent:'#ff6900',gradient:'linear-gradient(135deg,#064e3b 0%,#059669 100%)',font:FONT_STACK},
  {id:'framboise',label:'Framboise',primary:'#db2777',primaryDark:'#be185d',primaryLight:'#f472b6',accent:'#ff6900',gradient:'linear-gradient(135deg,#500724 0%,#db2777 100%)',font:FONT_STACK},
  {id:'sable',label:'Sable doré',primary:'#b45309',primaryDark:'#92400e',primaryLight:'#d97706',accent:'#ff6900',gradient:'linear-gradient(135deg,#431407 0%,#b45309 100%)',font:FONT_STACK},
  {id:'charbon',label:'Charbon chic',primary:'#334155',primaryDark:'#1e293b',primaryLight:'#64748b',accent:'#ff6900',gradient:'linear-gradient(135deg,#0f172a 0%,#334155 100%)',font:FONT_STACK},
];
const FONT_OPTIONS=[{value:FONT_STACK,label:'AYROVI A — identité verrouillée'}];
const DesignPage:React.FC<{canWrite:boolean}>=({canWrite})=>{
  const [rows,setRows]=useState<any[]>([]);const [theme,setTheme]=useState<any>(THEME_PRESETS[0]);const [footerAbout,setFooterAbout]=useState('');
  const [channels,setChannels]=useState({facebook:'',instagram:'',tiktok:'',whatsapp:''});
  const [toast,setToast]=useState<any>(null);const [busy,setBusy]=useState(false);
  const parseJson=(v:any)=>{try{return typeof v==='string'?JSON.parse(v):v;}catch{return null;}};
  const load=()=>adminApi<any>('/settings').then(r=>{setRows(r.data);
    const find=(key:string)=>r.data.find((row:any)=>row.setting_key===key);
    const t=parseJson(find('site_theme')?.setting_value);if(t&&t.primary)setTheme({preset:'custom',ink:'#1d2130',...t,font:FONT_STACK});
    setFooterAbout(String(find('footer_about')?.setting_value??''));
    setChannels({facebook:String(find('facebook_url')?.setting_value??''),instagram:String(find('instagram_url')?.setting_value??''),tiktok:String(find('tiktok_url')?.setting_value??''),whatsapp:String(find('whatsapp_url')?.setting_value??'')});
  });
  useEffect(()=>{load();},[]);
  const saveRow=(key:string,value:any)=>{const row=rows.find((r:any)=>r.setting_key===key);if(!row)return Promise.resolve();return adminApi(`/settings/${row.id}`,{method:'PUT',body:JSON.stringify({value})});};
  const save=async()=>{setBusy(true);try{await Promise.all([saveRow('site_theme',theme),saveRow('footer_about',footerAbout),saveRow('facebook_url',channels.facebook),saveRow('instagram_url',channels.instagram),saveRow('tiktok_url',channels.tiktok),saveRow('whatsapp_url',channels.whatsapp)]);await load();setToast({message:'Design publié — la boutique adopte le nouveau thème (rechargement des pages).',tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}};
  const applyPreset=(preset:any)=>setTheme({...theme,...preset,preset:preset.id});
  return <><PageHeader title="Développement & design" description="Système AYROVI 70% blanc / 25% noir / 5% orange. Inter + Noto Sans Arabic unifient latin et arabe." action={canWrite?<Button busy={busy} onClick={save}>Publier le design</Button>:undefined}/>
  <div className="admin-report-grid">
    <section className="admin-card"><CardTitle title="Modèles prêts" subtitle="Choisissez un modèle, personnalisez ensuite ses couleurs"/><div className="admin-theme-grid">{THEME_PRESETS.map(preset=><button key={preset.id} type="button" disabled={!canWrite} className={`admin-theme-card ${theme.preset===preset.id?'is-active':''}`} onClick={()=>applyPreset(preset)}><i style={{background:preset.gradient}}/><span>{preset.label}</span><small>{preset.primary} · {preset.accent}</small></button>)}</div>
    <div className="admin-form-row" style={{marginTop:16}}><Field label="Couleur principale" full><input type="color" value={theme.primary} disabled={!canWrite} onChange={e=>setTheme({...theme,preset:'custom',primary:e.target.value})}/></Field><Field label="Accent (promos)" full><input type="color" value={theme.accent} disabled={!canWrite} onChange={e=>setTheme({...theme,preset:'custom',accent:e.target.value})}/></Field><Field label="Police" full><Select disabled value={FONT_STACK} onChange={e=>setTheme({...theme,preset:'custom',font:FONT_STACK})} options={FONT_OPTIONS}/></Field></div>
    <div className="admin-theme-preview" style={{background:theme.gradient}}><strong>Boutique AYROVI</strong><span>70% blanc · 25% noir · 5% orange</span><button style={{background:theme.accent,color:'#fff'}} type="button">CTA</button></div></section>
    <section className="admin-card"><CardTitle title="Canaux & pied de page" subtitle="Liens affichés dans la section « Nos canaux » du site"/><div className="admin-settings-list">
      <Field label="Facebook" full><input disabled={!canWrite} value={channels.facebook} onChange={e=>setChannels({...channels,facebook:e.target.value})} placeholder="https://facebook.com/ayrovi"/></Field>
      <Field label="Instagram" full><input disabled={!canWrite} value={channels.instagram} onChange={e=>setChannels({...channels,instagram:e.target.value})} placeholder="https://instagram.com/ayrovi"/></Field>
      <Field label="TikTok" full><input disabled={!canWrite} value={channels.tiktok} onChange={e=>setChannels({...channels,tiktok:e.target.value})} placeholder="https://tiktok.com/@ayrovi"/></Field>
      <Field label="WhatsApp" full><input disabled={!canWrite} value={channels.whatsapp} onChange={e=>setChannels({...channels,whatsapp:e.target.value})} placeholder="https://wa.me/21600000000"/></Field>
      <Field label="Texte du pied de page" full><textarea rows={4} disabled={!canWrite} value={footerAbout} onChange={e=>setFooterAbout(e.target.value)}/></Field>
    </div></section>
  </div>{toast&&<Toast {...toast}/>}</>;
};

/**
 * P2.0 — `AdminShell` n'est plus la mise en page : il fournit la page du `section` demandé et
 * laisse la coquille (`BackOfficeShell`) gérer navigation, recherche, palette, notifications et
 * identité employé. La résolution d'écran est inchangée, écran par écran — seuls les états de
 * navigation viennent maintenant de la coquille (deep links `?section=&request=` conservés).
 */
const AdminShell:React.FC<{user:UserIdentity;onLogout:()=>void}>=({user,onLogout})=>{
  const { descriptorFor } = useBackOffice();
  const renderSection=(ctx:BackOfficeRenderContext)=>{
    const {section,requestedReview,pendingMagazineDraft,openMagazineDraft,clearPendingMagazineDraft,can:has}=ctx;
  let page:React.ReactNode;if(section==='dashboard')page=<DashboardPage navigate={ctx.navigate}/>;else if(section==='news')page=<MagazinePage canWrite={has('content:write')} pendingDraftId={pendingMagazineDraft||undefined} onPendingHandled={clearPendingMagazineDraft}/>;else if(section==='magazine-agent')page=<MagazineAgentPage canWrite={has('content:write')} onOpenMagazine={openMagazineDraft}/>;else if(resources[section])page=<ContentPage resource={section} canWrite={has(resources[section].permission)}/>;else if(section==='arrival-ingestion')page=<ArrivalIngestionPage canWrite={has('orders:write')} canManageStores={has('settings:write')}/>;else if(section==='orders')page=<OrdersPage canWrite={has('orders:write')} canPay={has('payments:write')} initialStatus={requestedReview||undefined}/>;else if(section==='lens-requests')page=<LensRequestsPage canWrite={has('orders:write')} requestedId={requestedReview||undefined}/>;else if(section==='assistant-support')page=<AssistantSupportPage canWrite={has('orders:write')} requestedId={requestedReview||undefined}/>;else if(section==='hero-visuals')page=<HeroVisualsPage canWrite={has('content:write')}/>;else if(section==='lens-section')page=<LensSectionPage canWrite={has('content:write')}/>;else if(section==='home-sections')page=<HomeSectionsPage canWrite={has('content:write')}/>;else if(section==='social')page=<SocialAdminPage/>;else if(section==='lens-lab')page=<LensLabPage/>;else if(section==='ai-discovery')page=<AiDiscoveryPage/>;else if(section==='customers')page=<CustomersPage canWrite={has('orders:write')}/>;else if(section==='pricing')page=<PricingPage canWrite={has('pricing:write')}/>;else if(section==='reports')page=<ReportsPage canWrite={has('reports:write')}/>;else if(section==='interface')page=<InterfaceStudio canWrite={has('settings:write')}/>;else if(section==='design')page=<DesignPage canWrite={has('settings:write')}/>;else if(section==='settings')page=<SettingsPage canWrite={has('settings:write')}/>;else if(section==='users')page=<UsersPage/>;else if(section==='audit')page=<AuditPage/>;else if(section==='catalogue-products')page=<CatalogueProductsPage/>;else if(section==='catalogue-categories')page=<CatalogueCategoriesPage/>;else if(section==='catalogue-brands')page=<CatalogueBrandsPage/>;else if(section==='erp-employees')page=<ErpEmployeesPage canManage={has('users:write')}/>;else if(section==='erp-organization')page=<ErpOrganizationPage canManage={has('users:write')}/>;else if(section==='erp-permissions')page=<ErpPermissionsPage canManage={has('users:write')} role={user.role}/>;else if(section==='erp-audit')page=<ErpAuditPage/>;else if(section==='erp-events')page=<ErpEventsPage/>;else if(section==='erp-environment')page=<ErpEnvironmentPage/>;
    else if(section==='inventory')page=<InventoryStockPage/>;
    else if(section==='inventory-movements')page=<InventoryMovementsPage/>;
    else if(section==='inventory-stocktakes')page=<InventoryStocktakesPage/>;
    // P2.3 — Achats : la liste des fournisseurs EST le descripteur serveur (ResourceWorkspace),
    // les commandes et les réceptions sont des écrans métier qui appellent le même moteur.
    else if(section==='purchasing')page=<PurchasingSuppliersPage/>;
    else if(section==='purchasing-orders')page=<PurchasingOrdersPage/>;
    else if(section==='purchasing-receipts')page=<PurchasingReceiptsPage/>;
    // E5 — CRM 360 : tableau de bord + cinq écrans métier. La navigation reste `commerce:read`,
    // chaque action d'écriture est décidée par l'écran lui-même via `/crm/meta` (grants `crm360:*`).
    else if(section==='crm-dashboard')page=<CrmDashboardPage/>;
    else if(section==='crm-parties')page=<CrmPartiesPage/>;
    else if(section==='crm-contacts')page=<CrmContactsPage/>;
    else if(section==='crm-activities')page=<CrmActivitiesPage/>;
    else if(section==='crm-tasks')page=<CrmTasksPage/>;
    else if(section==='crm-issues')page=<CrmIssuesPage/>;
    // P2.2 — premier écran métier servi par `ResourceWorkspace` : la liste de stock n'a pas
    // de page dédiée, elle EST le descripteur serveur (colonnes, tri, droits, audit).
    else { const descriptor = descriptorFor(section); if (descriptor?.surface === 'framework') page = <ResourceWorkspace descriptor={descriptor} />; }
    return page;
  };
  return <BackOfficeShell identity={user} onLogout={onLogout} renderPage={renderSection}/>;
};

export const AdminApp:React.FC=()=>{
  const[user,setUser]=useState<UserIdentity|null>(null);const[loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    const resetExpiredSession=()=>{if(active){setUser(null);setLoading(false);}};
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT,resetExpiredSession);
    loadIdentity().then((identity)=>{if(active)setUser(identity);}).catch((e)=>{if(!(e instanceof ApiError&&e.status===401))console.warn(e);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT,resetExpiredSession);};
  },[]);
  if(loading)return <div className="admin-boot"><img src="/media/logo-ayrovi.png" alt="" style={{width:52,height:52,objectFit:'contain'}} /><span/></div>;
  if(!user)return <LoginPage onAuthenticated={setUser}/>;
  // Un seul provider pour tout le back office : contexte, navigation et descripteurs partagés.
  return <BackOfficeProvider><AdminShell user={user} onLogout={async()=>{await logout();setUser(null);}}/></BackOfficeProvider>;
};
