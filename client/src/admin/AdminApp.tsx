import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Bell, Calculator, Calendar, ChartLine, CheckCircle2, CreditCard, FileText, FigLeaf, Gift, Globe2, Grid,
  History, Home, Image, LogOut, Menu, MessageSquare, Package, Palette, Pencil, Percent, Plus, Search as SearchIcon,
  Settings, ShieldCheck, ShoppingBag, Sparkles, Tag, Truck, User, X,
} from '../components/QatafoIcons';
import { ADMIN_SESSION_EXPIRED_EVENT, adminApi, ApiError, loadIdentity, login, logout, queryString } from './api';
import {
  Button, ConfirmDialog, DataColumn, DataTable, DatePicker, Field, Filters, Form, ImageUploader, Modal,
  Pagination, Search, Select, StatusBadge, Toast,
} from './components';
import './admin.css';

type Permission = 'dashboard:read' | 'content:read' | 'content:write' | 'commerce:read' | 'orders:write' | 'pricing:write' | 'payments:write' | 'settings:write' | 'users:write' | 'audit:read' | 'reports:read' | 'reports:write';
type UserIdentity = { id: string; email: string; name: string; role: string; permissions: Permission[] };
type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'image' | 'boolean' | 'list';
type FieldDefinition = { key: string; label: string; type: FieldType; required?: boolean; options?: string[]; hint?: string; full?: boolean };
type ResourceDefinition = { title: string; singular: string; description: string; endpoint: string; keyField: string; statusField?: string; permission: Permission; fields: FieldDefinition[]; defaults: Record<string, any> };

const labels: Record<string, string> = {
  STANDARD: 'Standard', EXPRESS: 'Express', DRAFT: 'Brouillon', SCHEDULED: 'Programmé', ACTIVE: 'Actif', COMPLETED: 'Terminé', ARCHIVED: 'Archivé',
  SHEIN: 'SHEIN', AMAZON: 'Amazon', TEMU: 'TEMU', ALIEXPRESS: 'AliExpress', OTHER: 'Autre', EUR: 'EUR', USD: 'USD', GBP: 'GBP', JPY: 'JPY', TND: 'TND',
  AVAILABLE: 'Disponible', LIMITED: 'Stock limité', OUT_OF_STOCK: 'Épuisé', INACTIVE: 'Inactif', PERCENTAGE: 'Pourcentage', FIXED: 'Montant fixe',
  IMAGE: 'Image', VIDEO: 'Vidéo', PUBLISHED: 'Publié', EXPIRED: 'Expiré', NEW_ARRIVAL: 'Nouvel arrivage', NEW_BRAND: 'Nouvelle marque', PROMOTION: 'Promotion',
  DELIVERY: 'Livraison', AYROVI: 'AYROVI', INFORMATION: 'Information', FASHION: 'Mode', SPORT_LIFESTYLE: 'Sport & lifestyle', BEAUTY: 'Beauté', TECH: 'Tech', HOME: 'Maison',
  FAQ: 'FAQ', PREDEFINED_RESPONSE: 'Réponse prédéfinie', PAYMENT: 'Paiement', BRAND: 'Marque', ARRIVAL: 'Arrivage', GENERAL: 'Général',
};

const options = (values: string[]) => values.map((value) => ({ value, label: labels[value] || value }));
const nowPlus = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

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
    title: 'Actualités', singular: 'actualité', description: 'Journal éditorial AYROVI relié aux arrivages et aux produits.', endpoint: '/news', keyField: 'title', statusField: 'status', permission: 'content:write',
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
  assistant: {
    title: 'Assistant IA', singular: 'connaissance', description: 'Source administrable des réponses commerciales critiques de l’Assistant AYROVI.', endpoint: '/ai-knowledge', keyField: 'question', statusField: 'active', permission: 'settings:write',
    defaults: { category: 'FAQ', question: '', answer: '', keywords: [], priority: 0, active: true },
    fields: [
      { key: 'category', label: 'Catégorie', type: 'select', options: ['FAQ','PREDEFINED_RESPONSE','DELIVERY','PAYMENT','BRAND','ARRIVAL','PROMOTION','GENERAL'] },
      { key: 'question', label: 'Question / déclencheur', type: 'text', full: true }, { key: 'answer', label: 'Réponse vérifiée', type: 'textarea', required: true, full: true },
      { key: 'keywords', label: 'Mots clés', type: 'list', full: true }, { key: 'priority', label: 'Priorité', type: 'number' }, { key: 'active', label: 'Active', type: 'boolean' },
    ],
  },
};

const navGroups = [
  { label: 'Vue générale', items: [{ id: 'dashboard', label: 'Tableau de bord', icon: Home, permission: 'dashboard:read' as Permission }] },
  { label: 'Contenu', items: [
    { id: 'arrivals', label: 'Arrivages', icon: Calendar, permission: 'content:read' as Permission }, { id: 'products', label: 'Produits', icon: ShoppingBag, permission: 'content:read' as Permission },
    { id: 'promotions', label: 'Promotions', icon: Gift, permission: 'content:read' as Permission }, { id: 'stories', label: 'Stories', icon: Image, permission: 'content:read' as Permission },
    { id: 'news', label: 'Actualités', icon: FileText, permission: 'content:read' as Permission }, { id: 'brands', label: 'Marques', icon: Tag, permission: 'content:read' as Permission },
    { id: 'hero', label: 'Hero Slider', icon: Sparkles, permission: 'content:read' as Permission },
  ]},
  { label: 'Commerce', items: [
    { id: 'orders', label: 'Commandes', icon: Package, permission: 'commerce:read' as Permission }, { id: 'customers', label: 'Clients', icon: User, permission: 'commerce:read' as Permission },
    { id: 'pricing', label: 'Prix & taux', icon: Calculator, permission: 'commerce:read' as Permission }, { id: 'reports', label: 'Rapports', icon: ChartLine, permission: 'reports:read' as Permission },
  ]},
  { label: 'Système', items: [
    { id: 'design', label: 'Développement', icon: Palette, permission: 'settings:write' as Permission },
    { id: 'assistant', label: 'Assistant IA', icon: MessageSquare, permission: 'settings:write' as Permission }, { id: 'settings', label: 'Paramètres', icon: Settings, permission: 'content:read' as Permission },
    { id: 'users', label: 'Utilisateurs', icon: ShieldCheck, permission: 'users:write' as Permission }, { id: 'audit', label: 'Journal d’audit', icon: History, permission: 'audit:read' as Permission },
  ]},
];

function formatMoney(value: unknown) { return `${Number(value || 0).toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`; }
function formatDate(value: unknown, time = false) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-TN', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}
function titleFor(section: string) { return resources[section]?.title || navGroups.flatMap((group) => group.items).find((item) => item.id === section)?.label || 'Administration'; }

const LoginPage: React.FC<{ onAuthenticated: (user: UserIdentity) => void }> = ({ onAuthenticated }) => {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { onAuthenticated(await login(email, password)); } catch (reason: any) { setError(reason.message); } finally { setBusy(false); }
  };
  return (
    <main className="admin-login">
      <section className="admin-login-brand"><div className="admin-login-brand__mark"><FigLeaf size={34} /></div><span>AYROVI / CONTROL</span><h1>Le commerce mondial,<br />piloté depuis Tunis.</h1><p>Contenu, arrivages, commandes, tarification et assistance — une seule source de vérité.</p><div className="admin-login-grid"><article><strong>24</strong><span>gouvernorats</span></article><article><strong>4</strong><span>rôles sécurisés</span></article><article><strong>100%</strong><span>backend-driven</span></article></div></section>
      <section className="admin-login-panel"><div className="admin-login-box"><div className="admin-login-mobile-logo"><FigLeaf /><strong>AYROVI</strong></div><span className="admin-eyebrow">Espace sécurisé</span><h2>Bienvenue.</h2><p>Connectez-vous avec le compte administrateur configuré sur le serveur.</p>
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

const DashboardPage: React.FC = () => {
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
    <div className="admin-metrics">{cards.map(({ label, value, change, icon: Icon }) => <article key={label} className="admin-metric"><div><span>{label}</span><strong>{value}</strong><small className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change}% vs période précédente</small></div><i><Icon /></i></article>)}</div>
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
const CardTitle: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => <header className="admin-card-title"><div><h3>{title}</h3><p>{subtitle}</p></div></header>;
const PageHeader: React.FC<{ title: string; description: string; action?: React.ReactNode }> = ({ title, description, action }) => <div className="admin-page-header"><div><span className="admin-eyebrow">AYROVI ADMIN</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;

const ResourceForm: React.FC<{ definition: ResourceDefinition; value: Record<string, any>; onChange: (value: Record<string, any>) => void; onSubmit: () => void; busy: boolean }> = ({ definition, value, onChange, onSubmit, busy }) => {
  const update = (key: string, next: any) => onChange({ ...value, [key]: next });
  return <Form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    {definition.fields.map((field) => <Field key={field.key} label={field.label} required={field.required} hint={field.hint} full={field.full}>
      {field.type === 'textarea' ? <textarea rows={field.key === 'content' || field.key === 'answer' ? 7 : 4} value={value[field.key] ?? ''} required={field.required} onChange={(event) => update(field.key, event.target.value)} />
        : field.type === 'select' ? <Select value={value[field.key] ?? ''} required={field.required} onChange={(event) => update(field.key, event.target.value)} options={options(field.options || [])} />
          : field.type === 'number' ? <input type="number" min="0" step="any" value={value[field.key] ?? ''} required={field.required} onChange={(event) => update(field.key, event.target.value === '' ? '' : Number(event.target.value))} />
            : field.type === 'date' ? <DatePicker value={value[field.key]} required={field.required} onChange={(next) => update(field.key, next)} />
              : field.type === 'image' ? <ImageUploader value={value[field.key]} onChange={(next) => update(field.key, next)} />
                : field.type === 'boolean' ? <button className={`admin-switch ${value[field.key] ? 'is-on' : ''}`} type="button" onClick={() => update(field.key, !value[field.key])}><i /><span>{value[field.key] ? 'Oui' : 'Non'}</span></button>
                  : field.type === 'list' ? <textarea rows={2} value={Array.isArray(value[field.key]) ? value[field.key].join(', ') : value[field.key] || ''} onChange={(event) => update(field.key, event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="Séparez les valeurs par une virgule" />
                    : <input value={value[field.key] ?? ''} required={field.required} onChange={(event) => update(field.key, event.target.value)} />}
    </Field>)}
    <div className="admin-form-actions"><Button type="submit" busy={busy}><CheckCircle2 size={17} />Enregistrer</Button></div>
  </Form>;
};

const ContentPage: React.FC<{ resource: string; canWrite: boolean }> = ({ resource, canWrite }) => {
  const definition = resources[resource]; const [rows, setRows] = useState<any[]>([]); const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true); const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null); const [form, setForm] = useState<Record<string, any>>({ ...definition.defaults }); const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<any>(null); const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const load = useCallback(async (page = pagination.page) => {
    setLoading(true);
    try { const result = await adminApi<any>(`${definition.endpoint}?${queryString({ page, pageSize: 20, search, status })}`); setRows(result.data); setPagination(result.pagination); }
    catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); } finally { setLoading(false); }
  }, [definition.endpoint, pagination.page, search, status]);
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
  const columns: DataColumn<any>[] = [
    { key: definition.keyField, label: definition.keyField === 'name' ? 'Nom' : definition.keyField === 'question' ? 'Question' : 'Titre', render: (row) => <div className="admin-entity"><span>{row.image || row.main_image || row.logo || row.media_url ? <img src={row.image || row.main_image || row.logo || row.media_url} alt="" /> : <i><FileText /></i>}</span><div><strong>{row[definition.keyField] || (resource === 'assistant' ? row.answer.slice(0, 60) : 'Sans titre')}</strong><small>{row.type || row.category || row.source_platform || row.media_type || ''}</small></div></div> },
    { key: 'status', label: 'Statut', render: (row) => <StatusBadge status={displayStatus(row)} /> },
    { key: 'updated_at', label: 'Dernière modification', render: (row) => formatDate(row.updated_at, true) },
    { key: 'actions', label: '', render: (row) => canWrite && <div className="admin-row-actions"><button type="button" onClick={(event) => { event.stopPropagation(); openEdit(row); }} aria-label="Modifier"><Pencil size={17} /></button><button type="button" onClick={(event) => { event.stopPropagation(); setArchiveTarget(row); }} aria-label="Archiver"><X size={17} /></button></div> },
  ];
  const statusOptions = definition.fields.find((field) => field.key === 'status')?.options || [];
  return <>
    <PageHeader title={definition.title} description={definition.description} action={canWrite ? <Button onClick={openCreate}><Plus size={18} />Nouveau</Button> : undefined} />
    <section className="admin-list-card"><div className="admin-list-toolbar"><Search value={search} onChange={setSearch} /><Filters>{statusOptions.length > 0 && <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'Tous les statuts' }, ...options(statusOptions)]} />}</Filters></div>
      <DataTable columns={columns} rows={rows} loading={loading} emptyText={`Aucun ${definition.singular} pour le moment.`} onRowClick={canWrite ? openEdit : undefined} />
      <Pagination {...pagination} onChange={(page) => load(page)} />
    </section>
    <Modal open={modal} title={`${editing ? 'Modifier' : 'Créer'} ${definition.singular}`} onClose={() => setModal(false)} wide><ResourceForm definition={definition} value={form} onChange={setForm} onSubmit={save} busy={busy} /></Modal>
    <ConfirmDialog open={Boolean(archiveTarget)} title={`Archiver ${definition.singular}`} message="L’élément ne sera plus public mais ses références historiques seront préservées." confirmLabel="Archiver" busy={busy} onConfirm={archive} onCancel={() => setArchiveTarget(null)} />
    {toast && <Toast message={toast.message} tone={toast.tone} />}
  </>;
};

const OrdersPage: React.FC<{ canWrite: boolean; canPay: boolean }> = ({ canWrite, canPay }) => {
  const [rows, setRows] = useState<any[]>([]); const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 }); const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<any>(null); const [detailLoading, setDetailLoading] = useState(false); const [toast, setToast] = useState<any>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async (page = 1) => { setLoading(true); try { const result = await adminApi<any>(`/orders?${queryString({ page, pageSize: 20, search, status })}`); setRows(result.data); setPagination(result.pagination); } catch (e: any) { setToast({message:e.message,tone:'error'}); } finally { setLoading(false); } }, [search,status]);
  useEffect(() => { const timer = setTimeout(() => load(), 250); return () => clearTimeout(timer); }, [search,status]);
  const open = async (row: any) => { setSelected(row); setDetailLoading(true); try { setSelected((await adminApi<any>(`/orders/${row.id}`)).data); } catch (e: any) { setToast({message:e.message,tone:'error'}); } finally { setDetailLoading(false); } };
  const changeStatus = async (next: string) => { if (!selected) return; setBusy(true); try { await adminApi(`/orders/${selected.id}/status`, { method:'PUT', body:JSON.stringify({status:next}) }); await open(selected); await load(pagination.page); setToast({message:'Statut de commande mis à jour.',tone:'success'}); } catch(e:any){setToast({message:e.message,tone:'error'});} finally{setBusy(false);} };
  const changePayment = async (next: string) => { if (!selected) return; setBusy(true); try { await adminApi(`/orders/${selected.id}/payment`, {method:'PUT',body:JSON.stringify({status:next})}); await open(selected); await load(pagination.page); setToast({message:'Paiement mis à jour.',tone:'success'}); }catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);} };
  const [reviewNote, setReviewNote] = useState('');
  const reviewDeposit = async (decision: 'approve' | 'reject') => { if (!selected || busy) return; setBusy(true); try { const r = await adminApi<any>(`/orders/${selected.id}/deposit/review`, { method:'POST', body: JSON.stringify({ decision, note: reviewNote }) }); await open(selected); await load(pagination.page); setReviewNote(''); setToast({ message: decision === 'approve' ? `Acompte confirmé — facture ${r.data?.invoice?.number || ''} ${r.data?.mail?.delivered ? 'et e-mail envoyé' : 'générée'}.` : 'Acompte refusé — le client a été notifié.', tone:'success'}); } catch(e:any){setToast({message:e.message,tone:'error'});} finally{setBusy(false);} };
  return <>
    <PageHeader title="Commandes" description="OMS persistant : clients, articles, paiements, livraisons et historique immuable." action={<a className="admin-button admin-button--secondary" href="/api/admin/reports/orders.csv" target="_blank">Exporter CSV</a>} />
    <section className="admin-list-card"><div className="admin-list-toolbar"><Search value={search} onChange={setSearch} placeholder="Référence, client ou téléphone…"/><Select value={status} onChange={(e)=>setStatus(e.target.value)} options={[{value:'',label:'Tous les statuts'},...options(['NEW','CONFIRMED','PAYMENT_PENDING','PAID','PURCHASING','PURCHASED','IN_TRANSIT','ARRIVED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'])]} /></div>
      <DataTable rows={rows} loading={loading} onRowClick={open} columns={[
        {key:'order_number',label:'Commande',render:(row)=><div><strong>{row.order_number}</strong><small className="admin-block-small">{formatDate(row.created_at,true)}</small></div>},
        {key:'customer_name',label:'Client',render:(row)=><div><strong>{row.customer_name}</strong><small className="admin-block-small">{row.customer_phone}</small></div>},
        {key:'source',label:'Source'}, {key:'status',label:'Statut',render:(row)=><StatusBadge status={row.status}/>}, {key:'payment_status',label:'Paiement',render:(row)=><StatusBadge status={row.payment_status}/>},
        {key:'deposit_status',label:'Acompte',render:(row)=><div><StatusBadge status={row.deposit_status||'NONE'}/><small className="admin-block-small">{row.deposit_amount_tnd?formatMoney(row.deposit_amount_tnd):''}</small></div>},
        {key:'total_tnd',label:'Total',render:(row)=><strong>{formatMoney(row.total_tnd)}</strong>},
      ]}/><Pagination {...pagination} onChange={load}/></section>
    <Modal open={Boolean(selected)} title={selected?.order_number || 'Commande'} onClose={()=>setSelected(null)} wide>{detailLoading ? <PageLoading/> : selected && <div className="admin-order-detail">
      <div className="admin-order-summary"><article><span>Client</span><strong>{selected.customer_name}</strong><small>{selected.phone}</small></article><article><span>Total</span><strong>{formatMoney(selected.total_tnd)}</strong><small>{selected.payment_method}</small></article><article><span>Livraison</span><strong>{selected.governorate}</strong><small>{selected.address}</small></article></div>
      <div className="admin-order-controls"><Field label="Statut commande"><Select disabled={!canWrite||busy} value={selected.status} onChange={(e)=>changeStatus(e.target.value)} options={options(['NEW','CONFIRMED','PAYMENT_PENDING','PAID','PURCHASING','PURCHASED','IN_TRANSIT','ARRIVED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'])}/></Field><Field label="Paiement"><Select disabled={!canPay||busy} value={selected.payment_status} onChange={(e)=>changePayment(e.target.value)} options={options(['PENDING','PAID','FAILED','REFUNDED','CANCELLED'])}/></Field></div>

      {selected.deposit_status && selected.deposit_status!=='NONE' && <section className="admin-list-card" style={{marginBottom:16}}>
        <h3>Acompte de confirmation ({Number(selected.deposit_percent||20)}%)</h3>
        <div className="admin-order-summary">
          <article><span>Montant de l’acompte</span><strong>{formatMoney(selected.deposit_amount_tnd)}</strong><small>{selected.payment_method}</small></article>
          <article><span>Statut</span><strong><StatusBadge status={selected.deposit_status}/></strong><small>{selected.deposit_paid_at?`Confirmé le ${formatDate(selected.deposit_paid_at,true)}`:selected.deposit_submitted_at?`Reçu le ${formatDate(selected.deposit_submitted_at,true)}`:'En attente du client'}</small></article>
          <article><span>Solde à la livraison</span><strong>{formatMoney(Math.max(0,Number(selected.total_tnd)-Number(selected.deposit_amount_tnd||0)))}</strong><small>{selected.tracking_code?`Suivi : ${selected.tracking_code}`:''}</small></article>
        </div>
        {selected.deposit_review_note&&<p className="admin-block-small" style={{margin:'8px 0'}}>Note de révision : {selected.deposit_review_note}</p>}
        {selected.deposit_proof_path
          ?<a className="admin-button admin-button--secondary" href={`/api/admin/orders/${selected.id}/deposit-proof`} target="_blank" rel="noreferrer">👁 Voir la preuve d’acompte</a>
          :<p className="admin-block-small" style={{margin:'8px 0'}}>Aucune preuve téléversée{selected.payment_method==='CARD'?' — paiement carte à confirmer après encaissement':''}.</p>}
        {canPay&&selected.status==='PAYMENT_PENDING'&&['PENDING','SUBMITTED'].includes(selected.deposit_status)&&<div style={{display:'flex',gap:8,alignItems:'flex-end',marginTop:10,flexWrap:'wrap'}}>
          <Field label="Note (optionnelle)"><input value={reviewNote} onChange={(e)=>setReviewNote(e.target.value)} placeholder="Référence virement, motif du refus…" style={{minWidth:220}}/></Field>
          <button className="admin-button admin-button--primary" disabled={busy||(selected.payment_method!=='CARD'&&!selected.deposit_proof_path)} onClick={()=>reviewDeposit('approve')}>✓ Confirmer l’acompte{selected.payment_method==='CARD'?' (paiement carte reçu)':''}</button>
          <button className="admin-button admin-button--danger" disabled={busy} onClick={()=>reviewDeposit('reject')}>✕ Refuser</button>
        </div>}
        {selected.deposit_status==='PAID'&&<div style={{marginTop:10,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><p className="admin-block-small" style={{margin:0}}>Facture : {selected.invoice_number||'—'} {selected.invoice_path?'(PDF généré)':'(génération en cours)'}</p>{canPay&&selected.invoice_number&&<button className="admin-button admin-button--secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await adminApi<any>(`/orders/${selected.id}/invoice/resend`,{method:'POST'});setToast({message:`Facture ${r.data?.invoiceNumber} ${r.data?.mail?.delivered?'renvoyée par e-mail ✓':'régénérée (e-mail non configuré ou client sans adresse)'}.`,tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}}}>↻ Régénérer / renvoyer la facture</button>}</div>}
      </section>}
      <h3>Articles</h3><DataTable<any> rows={selected.items||[]} columns={[{key:'product_name',label:'Produit'},{key:'source_platform',label:'Source'},{key:'quantity',label:'Qté'},{key:'original_price',label:'Prix source',render:(row)=>`${row.original_price} ${row.currency}`},{key:'total_tnd',label:'Total figé',render:(row)=>formatMoney(row.total_tnd)}]}/>
      <h3>Historique</h3><div className="admin-timeline">{(selected.history||[]).map((item:any)=><div key={item.id}><i/><div><StatusBadge status={item.to_status}/><p>{item.note||'Mise à jour du statut'}</p><small>{formatDate(item.created_at,true)}</small></div></div>)}</div>
    </div>}</Modal>{toast&&<Toast {...toast}/>}</>;
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

const PricingPage: React.FC<{ canWrite:boolean }> = ({canWrite}) => {
  const [form,setForm]=useState<any>(null); const [preview,setPreview]=useState<any>(null); const [busy,setBusy]=useState(false); const [toast,setToast]=useState<any>(null);
  useEffect(()=>{adminApi<any>('/pricing').then(r=>setForm(r.data));},[]);
  if(!form)return <PageLoading/>;
  const pricingFields=[['rateEUR','Taux EUR'],['rateUSD','Taux USD'],['rateGBP','Taux GBP'],['rateJPY','Taux JPY'],['customsFeePercent','Douane (%)'],['shippingFeeTND','Livraison (TND)'],['serviceFeePercent','Service (%)'],['minimumServiceFeeTND','Minimum service (TND)'],['expressFeeTND','Supplément Express (TND)']];
  const save=async()=>{setBusy(true);try{const r=await adminApi<any>('/pricing',{method:'PUT',body:JSON.stringify(form)});setForm(r.data);setToast({message:'Configuration tarifaire versionnée et enregistrée.',tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}};
  const calculate=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const data=new FormData(e.currentTarget);try{const r=await adminApi<any>('/pricing/preview',{method:'POST',body:JSON.stringify({originalPrice:Number(data.get('price')),currency:data.get('currency'),quantity:Number(data.get('quantity')),express:data.get('express')==='on'})});setPreview(r.data);}catch(error:any){setToast({message:error.message,tone:'error'});}};
  return <><PageHeader title="Prix & taux" description={`Moteur central AYROVI · configuration v${form.version}. Les commandes existantes gardent leur snapshot.`} action={canWrite?<Button busy={busy} onClick={save}>Enregistrer les taux</Button>:undefined}/>
    <div className="admin-pricing-layout"><section className="admin-card"><CardTitle title="Règles tarifaires" subtitle={`Mise à jour ${formatDate(form.updatedAt,true)}`}/><div className="admin-pricing-grid">{pricingFields.map(([key,label])=><Field key={key} label={label}><input disabled={!canWrite} type="number" min="0" step="0.0001" value={form[key]} onChange={e=>setForm({...form,[key]:Number(e.target.value)})}/></Field>)}</div></section>
    <section className="admin-card admin-price-preview"><CardTitle title="Simulateur" subtitle="Résultat calculé par le backend"/><Form onSubmit={calculate}><Field label="Prix source"><input name="price" type="number" min="0.01" step="0.01" defaultValue="21.99" required/></Field><Field label="Devise"><Select name="currency" defaultValue="EUR" options={options(['EUR','USD','GBP','JPY','TND'])}/></Field><Field label="Quantité"><input name="quantity" type="number" min="1" defaultValue="1"/></Field><Field label="Express"><input name="express" type="checkbox"/></Field><Button type="submit">Calculer</Button></Form>{preview&&<div className="admin-price-result"><div><span>Converti</span><b>{formatMoney(preview.convertedPriceTND)}</b></div><div><span>Douane</span><b>{formatMoney(preview.customsFeeTND)}</b></div><div><span>Livraison</span><b>{formatMoney(preview.shippingFeeTND)}</b></div><div><span>Service</span><b>{formatMoney(preview.serviceFeeTND)}</b></div><div><span>Express</span><b>{formatMoney(preview.expressFeeTND)}</b></div><strong><span>Total</span><b>{formatMoney(preview.totalTND)}</b></strong></div>}</section></div>{toast&&<Toast {...toast}/>}</>;
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

// ===== جرس إشعارات الإدارة (وصل جديد / طلب جديد) =====
const NotificationsBell:React.FC<{onNavigate:(section:string)=>void}>=({onNavigate})=>{
  const [open,setOpen]=useState(false);const [rows,setRows]=useState<any[]>([]);const [unread,setUnread]=useState(0);
  const load=useCallback(async()=>{try{const r=await adminApi<any>('/notifications?limit=20');setRows(r.data||[]);setUnread(Number(r.unread)||0);}catch{/* صامت */}},[]);
  useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t);},[load]);
  const markAll=async()=>{try{await adminApi('/notifications/read-all',{method:'POST'});await load();}catch{/* */}};
  const openItem=async(item:any)=>{try{const r=await adminApi<any>(`/notifications/${item.id}/read`,{method:'POST'});setUnread(Number(r.unread)||0);}catch{/* */}setOpen(false);if(String(item.action_url||'').includes('tab=orders'))onNavigate('orders');};
  return <div className="admin-bell"><button className="admin-icon-button" onClick={()=>{setOpen(!open);if(!open)void load();}} aria-label="Notifications"><Bell/>{unread>0&&<b className="admin-bell-badge">{unread>99?'99+':unread}</b>}</button>
  {open&&<div className="admin-bell-panel"><header><strong>Notifications</strong>{unread>0&&<button onClick={markAll}>Tout marquer lu</button>}</header>
  <div className="admin-bell-list">{rows.length===0&&<p className="admin-bell-empty">Aucune notification.</p>}{rows.map(item=><button key={item.id} className={item.read_at?'':'is-unread'} onClick={()=>openItem(item)}><strong>{item.title}</strong><span>{item.message}</span><time>{formatDate(item.created_at,true)}</time></button>)}</div></div>}</div>;
};

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
          <span className={`admin-badge ${ayx.providers.vision?.configured?'is-success':'is-warning'}`}>{ayx.providers.vision?.configured?'✅':'⚠️'} Vision IA (Claude) : {ayx.providers.vision?.configured?'Clé configurée':'Clé manquante — ANTHROPIC_API_KEY'}</span>
          <span className={`admin-badge ${ayx.providers.serpapi?.valid?'is-success':ayx.providers.serpapi?.configured?'is-warning':''}`}>{ayx.providers.serpapi?.valid?'✅':ayx.providers.serpapi?.configured?'⚠️':'ℹ️'} Recherche SerpAPI : {ayx.providers.serpapi?.valid?`Connectée${ayx.providers.serpapi.searchesLeft!=null?` · ${ayx.providers.serpapi.searchesLeft} recherches restantes`:''}`:ayx.providers.serpapi?.configured?(ayx.providers.serpapi.reachable?'Clé invalide':'Injoignable'):'Non configurée (catalogue seul)'}</span>
        </div>}
        <div className="admin-kpi-grid" style={{marginBottom:12}}>
          <section className="admin-kpi"><span>Analyses</span><strong>{ayx.last7d.total}</strong><small>📷 {ayx.last7d.image} · 🔗 {ayx.last7d.url} · ▦ {ayx.last7d.qr}</small></section>
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
  {id:'violet',label:'Violet AYROVI',primary:'#673de6',primaryDark:'#5025d1',primaryLight:'#7e57ff',accent:'#fbbf24',gradient:'linear-gradient(135deg,#24104f 0%,#673de6 100%)',font:'jakarta'},
  {id:'nuit',label:'Bleu nuit',primary:'#2563eb',primaryDark:'#1d4ed8',primaryLight:'#60a5fa',accent:'#f59e0b',gradient:'linear-gradient(135deg,#0b1e4b 0%,#2563eb 100%)',font:'inter'},
  {id:'emeraude',label:'Émeraude',primary:'#059669',primaryDark:'#047857',primaryLight:'#34d399',accent:'#fbbf24',gradient:'linear-gradient(135deg,#064e3b 0%,#059669 100%)',font:'jakarta'},
  {id:'framboise',label:'Framboise',primary:'#db2777',primaryDark:'#be185d',primaryLight:'#f472b6',accent:'#fde047',gradient:'linear-gradient(135deg,#500724 0%,#db2777 100%)',font:'inter'},
  {id:'sable',label:'Sable doré',primary:'#b45309',primaryDark:'#92400e',primaryLight:'#d97706',accent:'#673de6',gradient:'linear-gradient(135deg,#431407 0%,#b45309 100%)',font:'jakarta'},
  {id:'charbon',label:'Charbon chic',primary:'#334155',primaryDark:'#1e293b',primaryLight:'#64748b',accent:'#fbbf24',gradient:'linear-gradient(135deg,#0f172a 0%,#334155 100%)',font:'inter'},
];
const FONT_OPTIONS=[{value:'jakarta',label:'Plus Jakarta Sans (moderne)'},{value:'inter',label:'Inter (neutre)'},{value:'system',label:'Système (rapide)'}];
const DesignPage:React.FC<{canWrite:boolean}>=({canWrite})=>{
  const [rows,setRows]=useState<any[]>([]);const [theme,setTheme]=useState<any>(THEME_PRESETS[0]);const [footerAbout,setFooterAbout]=useState('');
  const [channels,setChannels]=useState({facebook:'',instagram:'',tiktok:'',whatsapp:''});
  const [toast,setToast]=useState<any>(null);const [busy,setBusy]=useState(false);
  const parseJson=(v:any)=>{try{return typeof v==='string'?JSON.parse(v):v;}catch{return null;}};
  const load=()=>adminApi<any>('/settings').then(r=>{setRows(r.data);
    const find=(key:string)=>r.data.find((row:any)=>row.setting_key===key);
    const t=parseJson(find('site_theme')?.setting_value);if(t&&t.primary)setTheme({preset:'custom',ink:'#1d2130',...t});
    setFooterAbout(String(find('footer_about')?.setting_value??''));
    setChannels({facebook:String(find('facebook_url')?.setting_value??''),instagram:String(find('instagram_url')?.setting_value??''),tiktok:String(find('tiktok_url')?.setting_value??''),whatsapp:String(find('whatsapp_url')?.setting_value??'')});
  });
  useEffect(()=>{load();},[]);
  const saveRow=(key:string,value:any)=>{const row=rows.find((r:any)=>r.setting_key===key);if(!row)return Promise.resolve();return adminApi(`/settings/${row.id}`,{method:'PUT',body:JSON.stringify({value})});};
  const save=async()=>{setBusy(true);try{await Promise.all([saveRow('site_theme',theme),saveRow('footer_about',footerAbout),saveRow('facebook_url',channels.facebook),saveRow('instagram_url',channels.instagram),saveRow('tiktok_url',channels.tiktok),saveRow('whatsapp_url',channels.whatsapp)]);await load();setToast({message:'Design publié — la boutique adopte le nouveau thème (rechargement des pages).',tone:'success'});}catch(e:any){setToast({message:e.message,tone:'error'});}finally{setBusy(false);}};
  const applyPreset=(preset:any)=>setTheme({...theme,...preset,preset:preset.id});
  return <><PageHeader title="Développement & design" description="Thème complet de la boutique (couleurs, dégradés, police), canaux sociaux et texte du pied de page." action={canWrite?<Button busy={busy} onClick={save}>Publier le design</Button>:undefined}/>
  <div className="admin-report-grid">
    <section className="admin-card"><CardTitle title="Modèles prêts" subtitle="Choisissez un modèle, personnalisez ensuite ses couleurs"/><div className="admin-theme-grid">{THEME_PRESETS.map(preset=><button key={preset.id} type="button" disabled={!canWrite} className={`admin-theme-card ${theme.preset===preset.id?'is-active':''}`} onClick={()=>applyPreset(preset)}><i style={{background:preset.gradient}}/><span>{preset.label}</span><small>{preset.primary} · {preset.accent}</small></button>)}</div>
    <div className="admin-form-row" style={{marginTop:16}}><Field label="Couleur principale" full><input type="color" value={theme.primary} disabled={!canWrite} onChange={e=>setTheme({...theme,preset:'custom',primary:e.target.value})}/></Field><Field label="Accent (promos)" full><input type="color" value={theme.accent} disabled={!canWrite} onChange={e=>setTheme({...theme,preset:'custom',accent:e.target.value})}/></Field><Field label="Police" full><Select value={theme.font||'jakarta'} onChange={e=>setTheme({...theme,preset:'custom',font:e.target.value})} options={FONT_OPTIONS}/></Field></div>
    <div className="admin-theme-preview" style={{background:theme.gradient}}><strong>Boutique AYROVI</strong><span>Aperçu du dégradé principal</span><button style={{background:theme.accent,color:'#17131f'}} type="button">Bouton accent</button></div></section>
    <section className="admin-card"><CardTitle title="Canaux & pied de page" subtitle="Liens affichés dans la section « Nos canaux » du site"/><div className="admin-settings-list">
      <Field label="Facebook" full><input disabled={!canWrite} value={channels.facebook} onChange={e=>setChannels({...channels,facebook:e.target.value})} placeholder="https://facebook.com/ayrovi"/></Field>
      <Field label="Instagram" full><input disabled={!canWrite} value={channels.instagram} onChange={e=>setChannels({...channels,instagram:e.target.value})} placeholder="https://instagram.com/ayrovi"/></Field>
      <Field label="TikTok" full><input disabled={!canWrite} value={channels.tiktok} onChange={e=>setChannels({...channels,tiktok:e.target.value})} placeholder="https://tiktok.com/@ayrovi"/></Field>
      <Field label="WhatsApp" full><input disabled={!canWrite} value={channels.whatsapp} onChange={e=>setChannels({...channels,whatsapp:e.target.value})} placeholder="https://wa.me/21600000000"/></Field>
      <Field label="Texte du pied de page" full><textarea rows={4} disabled={!canWrite} value={footerAbout} onChange={e=>setFooterAbout(e.target.value)}/></Field>
    </div></section>
  </div>{toast&&<Toast {...toast}/>}</>;
};

const AdminShell:React.FC<{user:UserIdentity;onLogout:()=>void}>=({user,onLogout})=>{
  const initial=new URLSearchParams(location.search).get('section')||'dashboard';const[section,setSection]=useState(initial);const[mobile,setMobile]=useState(false);const[profile,setProfile]=useState(false);
  const has=(permission:Permission)=>user.permissions.includes(permission);const navigate=(id:string)=>{setSection(id);setMobile(false);history.pushState({},'',`/admin?section=${id}`);};
  useEffect(()=>{const pop=()=>setSection(new URLSearchParams(location.search).get('section')||'dashboard');addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);},[]);
  useEffect(()=>{if(!navGroups.flatMap(g=>g.items).some(i=>i.id===section&&has(i.permission)))navigate('dashboard');},[section]);
  let page:React.ReactNode;if(section==='dashboard')page=<DashboardPage/>;else if(resources[section])page=<ContentPage resource={section} canWrite={has(resources[section].permission)}/>;else if(section==='orders')page=<OrdersPage canWrite={has('orders:write')} canPay={has('payments:write')}/>;else if(section==='customers')page=<CustomersPage canWrite={has('orders:write')}/>;else if(section==='pricing')page=<PricingPage canWrite={has('pricing:write')}/>;else if(section==='reports')page=<ReportsPage canWrite={has('reports:write')}/>;else if(section==='design')page=<DesignPage canWrite={has('settings:write')}/>;else if(section==='settings')page=<SettingsPage canWrite={has('settings:write')}/>;else if(section==='users')page=<UsersPage/>;else if(section==='audit')page=<AuditPage/>;
  return <div className="admin-shell"><aside className={`admin-sidebar ${mobile?'is-open':''}`}><div className="admin-sidebar-logo"><FigLeaf/><div><strong>AYROVI</strong><span>ADMIN CONTROL</span></div><button onClick={()=>setMobile(false)}><X/></button></div><nav>{navGroups.map(group=>{const items=group.items.filter(item=>has(item.permission));return items.length?<div key={group.label}><span>{group.label}</span>{items.map(({id,label,icon:Icon})=><button key={id} className={section===id?'is-active':''} onClick={()=>navigate(id)}><Icon/><span>{label}</span>{section===id&&<i/>}</button>)}</div>:null;})}</nav><div className="admin-sidebar-foot"><a href="/" target="_blank"><Globe2/>Voir le site public</a><span>AYROVI v3.1 · Tunis</span></div></aside>{mobile&&<button className="admin-sidebar-overlay" onClick={()=>setMobile(false)} aria-label="Fermer le menu"/>}
  <div className="admin-workspace"><header className="admin-header"><button className="admin-mobile-menu" onClick={()=>setMobile(true)}><Menu/></button><div className="admin-header-title"><span>Console /</span><strong>{titleFor(section)}</strong></div><div className="admin-header-actions"><button className="admin-icon-button"><SearchIcon/></button><NotificationsBell onNavigate={navigate}/><div className="admin-profile"><button onClick={()=>setProfile(!profile)}><i>{user.name.slice(0,2).toUpperCase()}</i><span><strong>{user.name}</strong><small>{labels[user.role]||user.role}</small></span></button>{profile&&<div><span>{user.email}</span><button onClick={onLogout}><LogOut/>Se déconnecter</button></div>}</div></div></header><main className="admin-main">{page}</main></div></div>;
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
  if(loading)return <div className="admin-boot"><FigLeaf/><span/></div>;
  if(!user)return <LoginPage onAuthenticated={setUser}/>;
  return <AdminShell user={user} onLogout={async()=>{await logout();setUser(null);}}/>;
};
