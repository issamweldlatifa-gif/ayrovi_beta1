/**
 * AYROVI CRM 360 (E1) — types et constantes du module relationnel.
 *
 * Ce module construit le domaine « relation client / partenaire » qui n'existait pas :
 * Party / Contact / Relationship, Activités, Tâches & follow-ups, Notes, Issues/support,
 * Communications, Timeline, Dashboard — sans toucher aux tables existantes
 * (`customers`, `customer_accounts`, `suppliers`, `assistant_support_tickets`, `crm_arrival*`).
 *
 * Contrats respectés (les mêmes que P2.1/P2.2/P2.3) :
 *  • un seul module ERP (`crm360`) déclaré dans le registre, des grants `crm360:<action>`
 *    en données, jamais une autorisation parallèle ;
 *  • un seul rédacteur d'audit (`writeAuditEvent`) pour chaque mutation ;
 *  • numérotation par `erp_sequences`, vocabulaires par `src/domain/statuses.ts` ;
 *  • additif uniquement : aucune table existante n'est modifiée ni renommée.
 */

export const CRM_MODULE_KEY = 'crm360' as const;

/** Le « quoi » de la permission : chaque ressource mappée sur une table ou un agrégat du module. */
export const CRM_RESOURCES = [
  'party',
  'contact',
  'activity',
  'task',
  'note',
  'issue',
  'communication',
  'timeline',
  'dashboard',
  'crm_config',
] as const;
export type CrmResource = (typeof CRM_RESOURCES)[number];

/** Actions granulaires — seules `view`/`create`/`edit` sont octroyées aux rôles qui
 *  disposaient déjà d'un accès legacy ; `archive`/`delete`/`export`/`manage` exigent un
 *  grant explicite (personne ne les détenait avant, personne n'est donc verrouillé). */
export const CRM_ACTIONS = ['view', 'create', 'edit', 'archive', 'delete', 'export', 'manage'] as const;
export type CrmAction = (typeof CRM_ACTIONS)[number];

/* ------------------------------------------------------------------ */
/* Types de fiche (Party) et catégories relationnelles                 */
/* ------------------------------------------------------------------ */

export const PARTY_TYPES = ['INDIVIDUAL', 'COMPANY'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

/** Catégorie relationnelle de la fiche : client, partenaire, fournisseur, prospect… */
export const PARTY_KINDS = ['CUSTOMER', 'PARTNER', 'SUPPLIER', 'PROSPECT', 'OTHER'] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

export const PARTY_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

/** La fiche ne se supprime jamais physiquement : on l'archive (soft-delete tracé). */
export const PARTY_ARCHIVE_TERMINAL = true as const;

/** Origine de la fiche — aide à la traçabilité (aucune fiche n'est « orpheline »). */
export const PARTY_SOURCES = ['MANUAL', 'IMPORT', 'CHECKOUT', 'ARRIVAL', 'LEGACY', 'API'] as const;
export type PartySource = (typeof PARTY_SOURCES)[number];

export const CONTACT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/** Lien entre deux fiches ou entre une fiche et un objet legacy (commande, compte, fournisseur). */
export const RELATIONSHIP_TYPES = ['ACCOUNT_MANAGER', 'CUSTOMER', 'PARTNER', 'SUPPLIER', 'CONTACT', 'REFERRAL', 'OTHER'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Nature du lien legacy porté par `crm360_party_links` (jamais une table dupliquée). */
export const PARTY_LINK_TYPES = ['customer', 'customer_account', 'supplier', 'order', 'assistant_ticket', 'external'] as const;
export type PartyLinkType = (typeof PARTY_LINK_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Activités / tâches / follow-ups / notes / issues / communications    */
/* ------------------------------------------------------------------ */

export const ACTIVITY_KINDS = ['CALL', 'MEETING', 'EMAIL', 'MESSAGE', 'VISIT', 'FOLLOW_UP', 'INTERNAL', 'OTHER'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Statuts exigés par la commande (Phase 4). */
export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Une « tâche de suivi » est une tâche marquée is_follow_up : elle ne disparaît jamais de la
 *  liste des prochaines actions tant qu'elle n'est pas COMPLETED/CANCELLED. */
export const ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const COMM_CHANNELS = ['EMAIL', 'PHONE', 'SMS', 'WHATSAPP', 'INTERNAL', 'OTHER'] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number];

export const COMM_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type CommDirection = (typeof COMM_DIRECTIONS)[number];

/* ------------------------------------------------------------------ */
/* Codes d'erreur métier → HTTP (un refus contrôlé, jamais un 500)     */
/* ------------------------------------------------------------------ */

export const CRM_ERRORS = {
  VALIDATION: 'CRM_VALIDATION',
  NOT_FOUND: 'CRM_NOT_FOUND',
  PARTY_NOT_FOUND: 'CRM_PARTY_NOT_FOUND',
  CONTACT_NOT_FOUND: 'CRM_CONTACT_NOT_FOUND',
  ACTIVITY_NOT_FOUND: 'CRM_ACTIVITY_NOT_FOUND',
  TASK_NOT_FOUND: 'CRM_TASK_NOT_FOUND',
  NOTE_NOT_FOUND: 'CRM_NOTE_NOT_FOUND',
  ISSUE_NOT_FOUND: 'CRM_ISSUE_NOT_FOUND',
  COMMUNICATION_NOT_FOUND: 'CRM_COMMUNICATION_NOT_FOUND',
  DUPLICATE_PARTY: 'CRM_DUPLICATE_PARTY',
  DUPLICATE_CONTACT: 'CRM_DUPLICATE_CONTACT',
  ALREADY_LINKED: 'CRM_ALREADY_LINKED',
  INVALID_PHONE: 'CRM_INVALID_PHONE',
  INVALID_EMAIL: 'CRM_INVALID_EMAIL',
  BAD_TRANSITION: 'CRM_BAD_STATUS_TRANSITION',
  INVALID_REFERENCE: 'CRM_INVALID_REFERENCE',
  PERMISSION_DENIED: 'CRM_PERMISSION_DENIED',
  IMMUTABLE: 'CRM_IMMUTABLE',
} as const;
export type CrmErrorCode = (typeof CRM_ERRORS)[keyof typeof CRM_ERRORS];

/** Statuts pour lesquels une tâche reste « active » (pas terminée ni annulée). */
export const TASK_ACTIVE_STATUSES: readonly TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING'];

/** Statuts d'une issue encore « vivante ». */
export const ISSUE_ACTIVE_STATUSES: readonly IssueStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING'];

/** Limites de saisie (cohérentes avec les autres modules). */
export const CRM_LIMITS = {
  NAME_MAX: 200,
  SUBJECT_MAX: 300,
  DESCRIPTION_MAX: 8000,
  NOTES_MAX: 12000,
  EMAIL_MAX: 320,
  PHONE_MAX: 32,
  CODE_MAX: 120,
  TAGS_MAX: 24,
  PAGE_SIZE_MAX: 100,
  CONTENT_MAX: 12000,
} as const;
