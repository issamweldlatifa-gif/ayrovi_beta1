/**
 * P1-3 (audit 19/11/2026) — lire la fiche du MARCHÉ du client.
 *
 * Les formes canoniques (`www.temu.com/-g-<id>.html`, `www.shein.com/-p-<id>.html`)
 * effacent le marché : relue par le serveur, une fiche `temu.com/uk/…` donnait le
 * prix et la devise du marché américain. La forme canonique ne sert plus qu'à la
 * clé de cache ; la lecture serveur garde l'hôte et le chemin d'origine, sans
 * ancre ni paramètres de suivi.
 */
const TRACKING_PARAM = /^(?:utm_.*|gclid|fbclid|spm|scm|aff_.*|ref|ref_|_encoding|pd_rd_.*|pf_rd_.*|share_.*|_t|_x_.*|refer_.*|src|srcid|campaign.*|adgroup.*|msclkid)$/i;

export function ayWebsMarketReadUrl(rawUrl: string): string {
  try {
    const url = new URL(String(rawUrl || '').trim());
    url.hash = '';
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return String(rawUrl || '');
  }
}
