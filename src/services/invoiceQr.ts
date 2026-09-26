/**
 * QR DE FACTURE — la facture devient vérifiable (25/09/2026).
 *
 * Une facture imprimée n'est qu'un papier : rien n'y prouve qu'elle correspond
 * à une commande réelle, et rien ne permet à un contrôleur, à un transporteur
 * ou au client lui-même de la rapprocher de nos registres sans nous appeler.
 * Le QR porte donc les éléments d'identification de la pièce — émetteur, numéro,
 * commande, date, total, devise — dans un format court, lisible par n'importe
 * quel téléphone, et une adresse de vérification.
 *
 * Deux choix qui comptent :
 *
 *  • AUCUNE nouvelle dépendance. Le générateur (`@zxing/library`) était déjà
 *    dans le projet pour la lecture de codes ; il sait aussi les écrire.
 *  • AUCUNE donnée personnelle dans le code. Ni nom, ni adresse, ni téléphone :
 *    un QR se photographie de loin, se partage, se retrouve dans une poubelle.
 *    Il identifie la FACTURE, il ne décrit pas le client.
 */
import { BarcodeFormat, EncodeHintType, MultiFormatWriter } from '@zxing/library';

export interface InvoiceQrInput {
  /** Raison sociale de l'émetteur, telle qu'elle figure sur la facture. */
  issuer: string;
  /** Identifiant fiscal publié par l'Admin, s'il existe. Jamais inventé. */
  taxId?: string | null;
  invoiceNumber: string;
  orderNumber: string;
  /** Date d'émission au format ISO (AAAA-MM-JJ). */
  issuedOn: string;
  totalTnd: number;
  /** Adresse publique permettant de vérifier la pièce. */
  verifyUrl?: string | null;
}

/** Montant écrit comme sur la facture : trois décimales, point décimal. */
function money(amount: number): string {
  return (Math.round(Number(amount || 0) * 1000) / 1000).toFixed(3);
}

/**
 * Charge utile du QR : des paires `clé:valeur` séparées par des barres
 * verticales. Format court, stable et lisible à l'œil — un humain qui décode le
 * QR doit comprendre ce qu'il lit sans documentation.
 */
export function buildInvoiceQrPayload(input: InvoiceQrInput): string {
  const fields: Array<[string, string]> = [
    ['AYROVI', '1'],
    ['ISS', input.issuer.trim()],
    ['TAX', String(input.taxId || '').trim()],
    ['INV', input.invoiceNumber.trim()],
    ['ORD', input.orderNumber.trim()],
    ['DATE', input.issuedOn.trim()],
    ['TTC', money(input.totalTnd)],
    ['CUR', 'TND'],
    ['URL', String(input.verifyUrl || '').trim()],
  ];
  // Un champ vide n'est pas écrit : mieux vaut son absence qu'un « TAX: » creux
  // qui laisserait croire à un identifiant fiscal manquant par erreur.
  return fields.filter(([, value]) => value.length > 0).map(([key, value]) => `${key}:${value}`).join('|');
}

/**
 * QR rendu en SVG (aucune image binaire à stocker, aucune police à embarquer).
 * Le SVG s'imprime net à toute taille — un QR pixellisé est un QR illisible.
 */
export function renderInvoiceQrSvg(payload: string, options: { size?: number; quietZone?: number } = {}): string {
  const size = Math.max(64, Math.min(512, options.size ?? 160));
  const hints = new Map<EncodeHintType, unknown>();
  // Marge normalisée : sans elle, un lecteur cadre mal le code.
  hints.set(EncodeHintType.MARGIN, options.quietZone ?? 1);
  hints.set(EncodeHintType.CHARACTER_SET, 'UTF-8');

  const matrix = new MultiFormatWriter().encode(payload, BarcodeFormat.QR_CODE, 0, 0, hints as never);
  const width = matrix.getWidth();
  const height = matrix.getHeight();

  let path = '';
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (matrix.get(x, y)) path += `M${x} ${y}h1v1h-1z`;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`,
    ` viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" role="img"`,
    ' aria-label="Code de vérification de la facture">',
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<path d="${path}" fill="#000000"/>`,
    '</svg>',
  ].join('');
}

/** Raccourci : la charge utile et son rendu, en une fois. */
export function invoiceQrSvg(input: InvoiceQrInput, size = 160): string {
  return renderInvoiceQrSvg(buildInvoiceQrPayload(input), { size });
}
