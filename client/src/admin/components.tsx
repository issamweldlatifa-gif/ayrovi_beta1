import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from './api';
import {
  ArrowLeft, ArrowRight, Calendar, Check, ChevronDown, Image, Loader2, Plus, Search as SearchIcon,
  Trash2, X,
} from '../components/QatafoIcons';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }> = ({
  variant = 'primary', busy, className = '', children, disabled, ...props
}) => (
  <button className={`admin-button admin-button--${variant} ${className}`} disabled={disabled || busy} {...props}>
    {busy && <Loader2 className="admin-spin" size={17} />}{children}
  </button>
);

const statusLabels: Record<string, string> = {
  ACTIVE: 'Actif', INACTIVE: 'Inactif', DRAFT: 'Brouillon', SCHEDULED: 'Programmé', COMPLETED: 'Terminé', ARCHIVED: 'Archivé',
  PUBLISHED: 'Publié', EXPIRED: 'Expiré', AVAILABLE: 'Disponible', LIMITED: 'Limité', OUT_OF_STOCK: 'Épuisé',
  NEW: 'Nouvelle', CONFIRMED: 'Confirmée', PAYMENT_PENDING: 'Paiement en attente', PAID: 'Payée', PURCHASING: 'En achat',
  PURCHASED: 'Achetée', IN_TRANSIT: 'En transit', ARRIVED: 'Arrivée', OUT_FOR_DELIVERY: 'En livraison', DELIVERED: 'Livrée', CANCELLED: 'Annulée',
  PENDING: 'En attente', IN_REVIEW: 'En cours', QUOTED: 'Devis envoyé', REJECTED: 'Refusée', FAILED: 'Échoué', REFUNDED: 'Remboursé', PREPARING: 'Préparation', SHIPPED: 'Expédié', RETURNED: 'Retourné',
  STANDARD: 'Standard', EXPRESS: 'Express', SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', CONTENT_MANAGER: 'Contenu', ORDER_MANAGER: 'Commandes',
  // حالات العربون (dépôt)
  NONE: '—', SUBMITTED: 'Preuve reçue', VERIFIED: 'Prix confirmé', PENDING_MANUAL: 'À vérifier manuellement',
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const normalized = String(status || '').toUpperCase();
  const tone = ['ACTIVE','PAID','DELIVERED','PUBLISHED','AVAILABLE','COMPLETED','QUOTED','VERIFIED'].includes(normalized) ? 'success'
    : ['CANCELLED','FAILED','OUT_OF_STOCK','ARCHIVED','EXPIRED','BLOCKED','REJECTED'].includes(normalized) ? 'danger'
      : ['SCHEDULED','PAYMENT_PENDING','PENDING','PENDING_MANUAL','LIMITED','EXPRESS'].includes(normalized) ? 'warning' : 'neutral';
  return <span className={`status-badge status-badge--${tone}`}>{statusLabels[normalized] || status}</span>;
};

export const Search: React.FC<{ value: string; onChange: (value: string) => void; placeholder?: string }> = ({ value, onChange, placeholder = 'Rechercher…' }) => (
  <label className="admin-search">
    <SearchIcon size={18} />
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    {value && <button type="button" onClick={() => onChange('')} aria-label="Effacer"><X size={15} /></button>}
  </label>
);

export const Filters: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="admin-filters">{children}</div>;

export const Pagination: React.FC<{ page: number; totalPages: number; total: number; onChange: (page: number) => void }> = ({ page, totalPages, total, onChange }) => (
  <div className="admin-pagination">
    <span>{total} résultat{total === 1 ? '' : 's'}</span>
    <div>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Page précédente"><ArrowLeft size={17} /></button>
      <strong>{page} / {Math.max(totalPages, 1)}</strong>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Page suivante"><ArrowRight size={17} /></button>
    </div>
  </div>
);

export interface DataColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id?: string }>({ columns, rows, loading, emptyText = 'Aucune donnée disponible.', onRowClick }:
  { columns: DataColumn<T>[]; rows: T[]; loading?: boolean; emptyText?: string; onRowClick?: (row: T) => void }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr>{columns.map((column) => <th key={column.key} className={column.className}>{column.label}</th>)}</tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={columns.length}><div className="admin-table-state"><Loader2 className="admin-spin" /> Chargement…</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan={columns.length}><div className="admin-table-state">{emptyText}</div></td></tr>
              : rows.map((row, index) => (
                <tr key={row.id || index} onClick={() => onRowClick?.(row)} className={onRowClick ? 'admin-table-row--clickable' : ''}>
                  {columns.map((column) => <td key={column.key} className={column.className}>{column.render ? column.render(row) : String((row as any)[column.key] ?? '—')}</td>)}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

export const Modal: React.FC<{ open: boolean; title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; footer?: React.ReactNode }> = ({
  open, title, children, onClose, wide, footer,
}) => {
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', escape); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`admin-modal ${wide ? 'admin-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><div><span>AYROVI CMS</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Fermer"><X /></button></header>
        <div className="admin-modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
};

export const ConfirmDialog: React.FC<{ open: boolean; title?: string; message: string; confirmLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }> = ({
  open, title = 'Confirmer cette action', message, confirmLabel = 'Confirmer', busy, onConfirm, onCancel,
}) => (
  <Modal open={open} title={title} onClose={onCancel} footer={<><Button variant="secondary" onClick={onCancel}>Annuler</Button><Button variant="danger" busy={busy} onClick={onConfirm}><Trash2 size={17} />{confirmLabel}</Button></>}>
    <p className="admin-confirm-message">{message}</p>
  </Modal>
);

export const Field: React.FC<{ label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode; full?: boolean }> = ({
  label, hint, required, error, children, full,
}) => (
  <label className={`admin-field ${full ? 'admin-field--full' : ''}`}>
    <span>{label}{required && <em>*</em>}</span>
    {children}
    {hint && <small>{hint}</small>}
    {error && <small className="admin-field-error">{error}</small>}
  </label>
);

export const Form: React.FC<{ children: React.ReactNode; onSubmit: React.FormEventHandler; className?: string }> = ({ children, onSubmit, className = '' }) => (
  <form className={`admin-form ${className}`} onSubmit={onSubmit}>{children}</form>
);

export const DatePicker: React.FC<{ value?: string; onChange: (value: string) => void; required?: boolean }> = ({ value, onChange, required }) => {
  const localValue = useMemo(() => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }, [value]);
  return <div className="admin-date-input"><Calendar size={18} /><input type="datetime-local" value={localValue} required={required} onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : '')} /></div>;
};

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }> }> = ({ options, ...props }) => (
  <div className="admin-select"><select {...props}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={16} /></div>
);

export const ImageUploader: React.FC<{ value?: string; onChange: (value: string) => void; label?: string }> = ({ value, onChange, label = 'Ajouter une image' }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const choose = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) { setError('Image invalide ou supérieure à 4 Mo.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      setUploading(true); setError('');
      try {
        const response = await adminApi<any>('/uploads', { method: 'POST', body: JSON.stringify({ dataUrl: reader.result }) });
        onChange(response.data.url);
      } catch (reason: any) { setError(reason.message); } finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="admin-image-uploader">
      {value ? <div className="admin-image-preview"><img src={value} alt="Aperçu" /><button type="button" onClick={() => onChange('')}><X size={16} /> Retirer</button></div>
        : <label className="admin-image-drop"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => choose(event.target.files?.[0])} /><Image size={25} /><strong>{uploading ? 'Envoi…' : label}</strong><span>PNG, JPG, WEBP ou GIF · 4 Mo max</span></label>}
      {error && <small className="admin-field-error">{error}</small>}
    </div>
  );
};

export const EmptyState: React.FC<{ title: string; description: string; action?: React.ReactNode }> = ({ title, description, action }) => (
  <div className="admin-empty"><div><Plus /></div><h3>{title}</h3><p>{description}</p>{action}</div>
);

export const Toast: React.FC<{ message: string; tone?: 'success' | 'error' }> = ({ message, tone = 'success' }) => (
  <div className={`admin-toast admin-toast--${tone}`} role="status">{tone === 'success' && <Check size={17} />}{message}</div>
);
