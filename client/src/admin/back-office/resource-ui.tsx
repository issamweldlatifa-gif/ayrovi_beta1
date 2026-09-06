/**
 * P2.0 — primitives partagées du back office (une seule implémentation par fonction).
 *
 * Ce fichier déplace hors de `AdminApp.tsx` ce que plusieurs écrans réinventaient :
 *  • le formulaire déclaratif (`ResourceForm`) — le même pour les 9 ressources du moteur et pour
 *    toute ressource ajoutée au framework ;
 *  • le dictionnaire de libellés d'énumérations et les deux formatteurs (montant, date), qui
 *    étaient dupliqués dans `CataloguePages.tsx`, `ErpCorePages.tsx` et `components.tsx` ;
 *  • les types de descripteur client, qui ne sont plus qu'une projection du descripteur serveur.
 *
 * Rien n'est réécrit : le markup rendu est identique à celui d'avant le déplacement.
 */
import React from 'react';
import { CheckCircle2 } from '../../components/QatafoIcons';
import { Button, DatePicker, Field, Form, ImageUploader, Select, Switch } from '../components';

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'image' | 'boolean' | 'list';
export type Permission = 'dashboard:read' | 'content:read' | 'content:write' | 'commerce:read' | 'orders:write' | 'pricing:write' | 'payments:write' | 'settings:write' | 'users:write' | 'users:read' | 'ai:read' | 'ai:write' | 'audit:read' | 'reports:read' | 'reports:write';

export type FieldDefinition = { key: string; label: string; type: FieldType; required?: boolean; options?: string[]; hint?: string; full?: boolean; readonly?: boolean };
export type ResourceDefinition = { title: string; singular: string; description: string; endpoint: string; keyField: string; statusField?: string; permission: Permission; fields: FieldDefinition[]; defaults: Record<string, any> };

/**
 * Libellés FR des valeurs d'énumération (type de campagne, plateforme, devise, mode de
 * livraison…) — une seule table pour tout le back office. À ne pas confondre avec `statusLabels`
 * de `components.tsx`, qui habille uniquement le badge de statut. Deux écrans gardent volontairement
 * leur formatteur local : `ArrivalIngestionPage` (fichier gelé en P2.1) et `MagazineAgentPage`
 * (dates en `ar-TN`, autre locale par conception) — les rapprocher changerait l'affichage, ce
 * n'est pas une décision de coquille.
 */
export const labels: Record<string, string> = {
  STANDARD: 'Standard', EXPRESS: 'Express', DRAFT: 'Brouillon', SCHEDULED: 'Programmé', ACTIVE: 'Actif', COMPLETED: 'Terminé', ARCHIVED: 'Archivé',
  SHEIN: 'SHEIN', AMAZON: 'Amazon', TEMU: 'TEMU', ALIEXPRESS: 'AliExpress', OTHER: 'Autre', EUR: 'EUR', USD: 'USD', GBP: 'GBP', JPY: 'JPY', TND: 'TND',
  AVAILABLE: 'Disponible', LIMITED: 'Stock limité', OUT_OF_STOCK: 'Épuisé', INACTIVE: 'Inactif', PERCENTAGE: 'Pourcentage', FIXED: 'Montant fixe',
  IMAGE: 'Image', VIDEO: 'Vidéo', PUBLISHED: 'Publié', EXPIRED: 'Expiré', NEW_ARRIVAL: 'Nouvel arrivage', NEW_BRAND: 'Nouvelle marque', PROMOTION: 'Promotion',
  DELIVERY: 'Livraison', AYROVI: 'AYROVI', INFORMATION: 'Information', FASHION: 'Mode', SPORT_LIFESTYLE: 'Sport & lifestyle', BEAUTY: 'Beauté', TECH: 'Tech', HOME: 'Maison',
  FAQ: 'FAQ', PREDEFINED_RESPONSE: 'Réponse prédéfinie', PAYMENT: 'Paiement', BRAND: 'Marque', ARRIVAL: 'Arrivage', GENERAL: 'Général',
  PENDING: 'En attente', IN_PROGRESS: 'En cours', RESOLVED: 'Résolu', CLOSED: 'Fermé', NORMAL: 'Normale', HIGH: 'Haute',
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', CONTENT_MANAGER: 'Contenu', ORDER_MANAGER: 'Commandes',
};

export const options = (values: string[]) => values.map((value) => ({ value, label: labels[value] || value }));
export const nowPlus = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

export function formatMoney(value: unknown) {
  return `${Number(value || 0).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;
}

export function formatDate(value: unknown, time = false) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-TN', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

/**
 * Le formulaire du framework : une file unique de primitives, pilotée par la définition de la
 * ressource. `FieldDefinition` côté client et `BackOfficeFieldDef` côté serveur décrivent le même
 * vocabulaire de champs — un module qui déclare ses champs n'a plus à écrire de JSX.
 */
export const ResourceForm: React.FC<{
  definition: { fields: FieldDefinition[] };
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  onSubmit: () => void;
  busy: boolean;
  /** Bouton supplémentaire (ex. « Archiver ») — jamais un formulaire par écran. */
  extraActions?: React.ReactNode;
  submitLabel?: string;
}> = ({ definition, value, onChange, onSubmit, busy, extraActions, submitLabel = 'Enregistrer' }) => {
  const update = (key: string, next: any) => onChange({ ...value, [key]: next });
  return <Form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    {definition.fields.map((field) => <Field key={field.key} label={field.label} required={field.required} hint={field.hint} full={field.full}>
      {field.type === 'textarea' ? <textarea rows={field.key === 'content' || field.key === 'answer' ? 7 : 4} value={value[field.key] ?? ''} required={field.required} disabled={field.readonly} onChange={(event) => update(field.key, event.target.value)} />
        : field.type === 'select' ? <Select value={value[field.key] ?? ''} required={field.required} onChange={(event) => update(field.key, event.target.value)} options={options(field.options || [])} />
          : field.type === 'number' ? <input type="number" min="0" step="any" value={value[field.key] ?? ''} required={field.required} onChange={(event) => update(field.key, event.target.value === '' ? '' : Number(event.target.value))} />
            : field.type === 'date' ? <DatePicker value={value[field.key]} required={field.required} onChange={(next) => update(field.key, next)} />
              : field.type === 'image' ? <ImageUploader value={value[field.key]} onChange={(next) => update(field.key, next)} />
                : field.type === 'boolean' ? <Switch checked={Boolean(value[field.key])} onLabel="Oui" offLabel="Non" onChange={() => update(field.key, !value[field.key])} />
                  : field.type === 'list' ? <textarea rows={2} value={Array.isArray(value[field.key]) ? value[field.key].join(', ') : value[field.key] || ''} onChange={(event) => update(field.key, event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="Séparez les valeurs par une virgule" />
                    : <input value={value[field.key] ?? ''} required={field.required} onChange={(event) => update(field.key, event.target.value)} />}
    </Field>)}
    <div className="admin-form-actions">
      <Button type="submit" busy={busy}><CheckCircle2 size={17} />{submitLabel}</Button>
      {extraActions}
    </div>
  </Form>;
};
