/**
 * Achats AYWEBs — file des commandes payées à acheter chez le marchand.
 *
 * Aucun achat automatique : tant qu'aucune intégration marchand n'existe, l'admin ouvre
 * le lien, achète, puis enregistre le résultat ici.
 *  • « À acheter » : commandes PURCHASE_PENDING → « Commencer l'achat » (purchase/start).
 *  • « Achat commencé » : commandes PURCHASING → « Achat confirmé » (numéro chez le marchand)
 *    ou « Achat échoué » (raison obligatoire).
 * Les informations du client se copient en un clic, prêtes à coller sur le site du marchand.
 * Les échéances sont internes : jamais affichées au client.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, ApiError } from './api';
import { Button, PageHeader, StatusBadge, Toast } from './components';
import { customerCopyText, safeStoreLink, type AyWebsQueueOrder } from './aywebsPurchaseQueueLogic';

type QueueOrder = AyWebsQueueOrder;

const PAYMENT_LABELS: Record<string, string> = {
  CARD: 'Carte',
  BANK_TRANSFER: 'Virement',
  POSTE: 'La Poste',
  D17: 'D17',
  FLOUCI: 'Flouci',
  COD: 'Paiement à la livraison',
};

const PENDING = 'PURCHASE_PENDING';
const STARTED = 'PURCHASING';

function dueLabel(iso: string | null): string {
  if (!iso) return 'Échéance —';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Échéance —';
  return `Échéance ${date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Action impossible pour le moment.';
}

export const AyWebsPurchaseQueuePage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, started] = await Promise.all([
        adminApi<{ data: QueueOrder[] }>(`/aywebs/orders?status=${PENDING}&limit=200`),
        adminApi<{ data: QueueOrder[] }>(`/aywebs/orders?status=${STARTED}&limit=200`),
      ]);
      setOrders([...(pending.data || []), ...(started.data || [])]);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const byDue = (a: QueueOrder, b: QueueOrder) => {
    const da = a.purchaseDueAt ? Date.parse(a.purchaseDueAt) : Number.POSITIVE_INFINITY;
    const db = b.purchaseDueAt ? Date.parse(b.purchaseDueAt) : Number.POSITIVE_INFINITY;
    return da - db;
  };
  const toBuy = useMemo(() => orders.filter((o) => o.status === PENDING).sort(byDue), [orders]);
  const inProgress = useMemo(() => orders.filter((o) => o.status === STARTED).sort(byDue), [orders]);

  const run = async (orderId: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(orderId);
    try {
      await action();
      setToast({ message: success, tone: 'success' });
      await load();
    } catch (err) {
      setToast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const copyCustomer = async (order: QueueOrder) => {
    try {
      await navigator.clipboard.writeText(customerCopyText(order));
      setToast({ message: 'Informations du client copiées.', tone: 'success' });
    } catch {
      setToast({ message: 'Copie impossible : sélectionne le texte à la main.', tone: 'error' });
    }
  };

  return (
    <div className="admin-page">
      <PageHeader
        title="Achats AYWEBs"
        description="Commandes payées à acheter chez le marchand. Ouvre le lien, achète, puis enregistre le résultat."
        action={<Button variant="secondary" onClick={() => void load()} disabled={loading}>Actualiser</Button>}
      />
      {toast && <Toast message={toast.message} tone={toast.tone} />}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading && orders.length === 0 && <p>Chargement…</p>}

      <h3>À acheter ({toBuy.length})</h3>
      {toBuy.length === 0 && !loading && <p>Aucun achat en attente.</p>}
      {toBuy.map((order) => (
        <QueueCard
          key={order.id}
          order={order}
          canWrite={canWrite}
          busy={busyId === order.id}
          onCopy={() => void copyCustomer(order)}
          onStart={() => void run(order.id, () => adminApi(`/aywebs/orders/${encodeURIComponent(order.id)}/purchase/start`, { method: 'POST', body: '{}' }), 'Achat commencé.')}
          onConfirm={null}
          onFail={null}
        />
      ))}

      <h3>Achat commencé ({inProgress.length})</h3>
      {inProgress.length === 0 && !loading && <p>Aucun achat en cours.</p>}
      {inProgress.map((order) => (
        <QueueCard
          key={order.id}
          order={order}
          canWrite={canWrite}
          busy={busyId === order.id}
          onCopy={() => void copyCustomer(order)}
          onStart={null}
          onConfirm={(note) => void run(order.id, () => adminApi(`/aywebs/orders/${encodeURIComponent(order.id)}/purchase/confirm`, { method: 'POST', body: JSON.stringify({ note }) }), 'Achat confirmé.')}
          onFail={(reason) => void run(order.id, () => adminApi(`/aywebs/orders/${encodeURIComponent(order.id)}/purchase/fail`, { method: 'POST', body: JSON.stringify({ reason }) }), 'Échec enregistré.')}
        />
      ))}
    </div>
  );
};

const QueueCard: React.FC<{
  order: QueueOrder;
  canWrite: boolean;
  busy: boolean;
  onCopy: () => void;
  onStart: (() => void) | null;
  onConfirm: ((note: string) => void) | null;
  onFail: ((reason: string) => void) | null;
}> = ({ order, canWrite, busy, onCopy, onStart, onConfirm, onFail }) => {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const address = order.shippingAddress || {};
  const disabled = !canWrite || busy;

  return (
    <section className="admin-card" style={{ marginBottom: 16, padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>{order.orderNumber}</strong>
        <span>
          <StatusBadge status={order.status} /> · {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod || 'Paiement'} · {dueLabel(order.purchaseDueAt)}
        </span>
      </header>

      <ul style={{ margin: '12px 0', paddingInlineStart: 18 }}>
        {order.items.map((item) => {
          const link = safeStoreLink(item.sourceUrl);
          return (
            <li key={item.id} style={{ marginBottom: 8 }}>
              <div>{item.title} × {item.quantity}{item.variantLabel ? ` — ${item.variantLabel}` : ''}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{item.storeName} · {item.lineTotalTnd} TND</div>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer">Ouvrir la page du produit</a>
              ) : (
                <span style={{ color: 'var(--admin-danger-strong)' }}>Lien produit invalide : ne pas acheter avant vérification.</span>
              )}
            </li>
          );
        })}
      </ul>

      <div style={{ borderTop: '1px solid var(--admin-line-soft)', paddingTop: 12 }}>
        <div>{address.name || '—'} · {address.phone || '—'}</div>
        <div>{[address.city, address.line].filter(Boolean).join(' — ') || '—'}</div>
        <Button variant="secondary" onClick={onCopy} style={{ marginTop: 8 }}>Copier les informations du client</Button>
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {onStart && (
          <Button onClick={onStart} disabled={disabled} busy={busy} title={canWrite ? undefined : 'Droit insuffisant'}>
            Commencer l’achat
          </Button>
        )}
        {onConfirm && (
          <>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Numéro de commande chez le marchand"
              aria-label="Numéro de commande chez le marchand"
              disabled={disabled}
            />
            <Button onClick={() => onConfirm(note.trim())} disabled={disabled || !note.trim()} busy={busy}>
              Achat confirmé
            </Button>
          </>
        )}
        {onFail && (
          <>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Raison de l’échec (obligatoire)"
              aria-label="Raison de l’échec"
              disabled={disabled}
            />
            <Button variant="danger" onClick={() => onFail(reason.trim())} disabled={disabled || !reason.trim()}>
              Achat échoué
            </Button>
          </>
        )}
      </div>
    </section>
  );
};
