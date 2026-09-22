/**
 * Export CSV côté client — une seule implémentation pour tout le back office.
 *
 * Pourquoi côté client, alors que le serveur sait déjà produire un CSV (voir
 * `/api/admin/reports/orders.csv`) ? Parce que les écrans du moteur de ressources affichent une
 * VUE FILTRÉE et PAGINÉE : l'opérateur veut le tableau qu'il a sous les yeux (recherche + statut +
 * tri appliqués), pas une extraction complète de la base. L'export reprend donc exactement les
 * lignes chargées et les colonnes affichées — aucun champ caché ne fuit dans le fichier.
 *
 * Trois détails qui font la différence à l'usage :
 *  1. le BOM UTF-8 en tête : sans lui, Excel affiche « Ã© » au lieu de « é » et casse l'arabe ;
 *  2. l'échappement RFC 4180 (`"` doublés, champ encadré dès qu'il contient , " ou un saut de ligne) :
 *     sinon un titre de produit contenant une virgule décale toutes les colonnes suivantes ;
 *  3. la neutralisation des formules : une cellule qui commence par = + - @ est préfixée d'une
 *     apostrophe. Un contenu de CMS saisi par un tiers ne doit pas s'exécuter dans le tableur de
 *     l'administrateur (injection CSV).
 */

export type CsvColumn = { key: string; label: string };

/** Neutralise les formules et applique l'échappement RFC 4180. */
export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (columns: CsvColumn[], rows: Array<Record<string, any>>): string => {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(','));
  return [header, ...body].join('\r\n');
};

/** Nom de fichier horodaté (fuseau local) : deux exports successifs ne s'écrasent pas. */
export const csvFileName = (base: string): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${base}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
};

/**
 * Déclenche le téléchargement. Le BOM est ajouté ici (et pas dans `toCsv`) pour que la fonction
 * de sérialisation reste testable telle quelle, sans caractère invisible.
 */
export const downloadCsv = (fileName: string, columns: CsvColumn[], rows: Array<Record<string, any>>): void => {
  const blob = new Blob([`\uFEFF${toCsv(columns, rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Révocation différée : Safari annule le téléchargement si l'URL disparaît trop tôt.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
};
