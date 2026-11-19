export const CONNECTED_TEAMS = {
  crm: { fr: 'Clients & relations', ar: 'العملاء والعلاقات' },
  erp: { fr: 'Opérations & expédition', ar: 'العمليات والشحن' },
  finance: { fr: 'Finance & facturation', ar: 'المالية والفوترة' },
  cms: { fr: 'Contenu & création', ar: 'المحتوى والتصميم' },
  admin: { fr: 'Plateforme & développement', ar: 'المنصّة والتطوير' },
} as const;
export type ConnectedTeam = keyof typeof CONNECTED_TEAMS;
export const CONNECTION_CATALOG = [
  { id: 'crm-messaging', team: 'crm', name: 'WhatsApp Business', method: 'OAuth / Business API' },
  { id: 'crm-mail', team: 'crm', name: 'E-mail pro', method: 'OAuth / API' },
  { id: 'erp-dhl-tracking', team: 'erp', name: 'DHL Express · Tracking', method: 'API en lecture · sur une livraison existante' },
  { id: 'erp-carrier', team: 'erp', name: 'Transporteur / Carrier', method: 'API / suivi' },
  { id: 'erp-supplier', team: 'erp', name: 'Fournisseur / Supplier', method: 'API / EDI' },
  { id: 'finance-bank', team: 'finance', name: 'Banque / Bank', method: 'CSV / API en lecture' },
  { id: 'finance-psp', team: 'finance', name: 'PSP / Cartes', method: 'API / Checkout hébergé' },
  { id: 'finance-invoice', team: 'finance', name: 'Facture électronique', method: 'EDI / API' },
  { id: 'cms-canva', team: 'cms', name: 'Canva', method: 'OAuth / Connect API' },
  { id: 'cms-capcut', team: 'cms', name: 'CapCut', method: 'Export manuel' },
  { id: 'cms-figma', team: 'cms', name: 'Figma', method: 'OAuth / API' },
  { id: 'cms-ai', team: 'cms', name: 'AI Core', method: 'Compte fournisseur / API' },
  { id: 'admin-github', team: 'admin', name: 'Dépôts / GitHub', method: 'Application avec accès limité' },
  { id: 'admin-drive', team: 'admin', name: 'Google Drive', method: 'OAuth / API' },
  { id: 'admin-media', team: 'admin', name: 'Cloud images / vidéo', method: 'Object storage / API' },
  { id: 'admin-data', team: 'admin', name: 'Données / infrastructure', method: 'Réseau privé / identité technique' },
] as const satisfies ReadonlyArray<{ id: string; team: ConnectedTeam; name: string; method: string }>;
export type ConnectionStatus = 'REQUESTED' | 'APPROVED_FOR_SETUP' | 'CLOSED';
export type ConnectionRequest = { provider: string; status: ConnectionStatus; updatedAt: string };
export type ConnectedAccess = { teams: ConnectedTeam[]; manage: boolean; mfa: boolean };
