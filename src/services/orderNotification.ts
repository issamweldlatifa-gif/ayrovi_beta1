/**
 * ALERTE « NOUVELLE COMMANDE » (25/09/2026).
 *
 * Constat : une commande entrait en base, sa facture était produite… et
 * personne n'était prévenu. L'équipe devait ouvrir l'Admin et rafraîchir pour
 * découvrir qu'un client attendait. Sur un service où l'achat est suivi d'un
 * appel de confirmation, ce silence coûte des ventes.
 *
 * Le canal existait déjà (`notifyAdminUser` + `queueDelivery`) : il n'est pas
 * réinventé ici, il est enfin appelé au bon moment.
 *
 * Trois règles :
 *  • une notification ne doit JAMAIS faire échouer la commande — tout est
 *    enveloppé, une panne de cloche ne fait pas perdre un achat ;
 *  • elle dit ce qu'il faut pour agir sans ouvrir la fiche : numéro, montant,
 *    moyen de paiement, gouvernorat ;
 *  • elle ne transporte aucune donnée sensible (pas d'adresse complète, pas de
 *    téléphone) : ces canaux sont relus longtemps après, par beaucoup de monde.
 */
import type { QatafoDatabase } from '../db/database';
import { notifyAdminUser, queueDelivery } from '../erp-core/notifications';

export interface NewOrderAlert {
  orderId: string;
  orderNumber: string;
  totalTnd: number;
  paymentMethod: string;
  governorate?: string | null;
  itemCount?: number;
}

/** Destinataires : les comptes d'administration actifs. */
function adminUserIds(db: QatafoDatabase): string[] {
  try {
    const rows = db.all<{ id: string }>(
      "SELECT id FROM users WHERE role IN ('admin','superadmin','owner') AND (is_active IS NULL OR is_active=1)",
    );
    return rows.map((row) => String(row.id));
  } catch {
    return [];
  }
}

export function notifyNewOrder(db: QatafoDatabase, order: NewOrderAlert): { notified: number } {
  const money = `${(Math.round(Number(order.totalTnd || 0) * 1000) / 1000).toFixed(3)} TND`;
  const title = `Nouvelle commande ${order.orderNumber}`;
  const message = [
    money,
    order.paymentMethod,
    order.governorate || null,
    order.itemCount ? `${order.itemCount} article(s)` : null,
  ].filter(Boolean).join(' · ');

  const data = {
    subtype: 'ORDER_CREATED',
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    totalTnd: order.totalTnd,
    paymentMethod: order.paymentMethod,
  };

  let notified = 0;
  try {
    for (const adminUserId of adminUserIds(db)) {
      notifyAdminUser(db, adminUserId, {
        type: 'SYSTEM',
        title,
        message,
        actionUrl: `/admin/orders/${encodeURIComponent(order.orderId)}`,
        data,
        source: 'checkout',
      });
      notified += 1;
    }
    // Trace de sortie, même sans destinataire : on doit pouvoir prouver qu'une
    // commande a bien déclenché une alerte, y compris quand personne n'écoute.
    queueDelivery(db, {
      recipientType: 'admin_user',
      recipientId: 'ALL',
      channel: 'in-app',
      type: 'ORDER_CREATED',
      title,
      message,
      data,
    });
  } catch (error: any) {
    // Une cloche muette ne fait pas perdre une vente.
    console.warn('[checkout] alerte nouvelle commande échouée:', error?.message || error);
  }
  return { notified };
}
