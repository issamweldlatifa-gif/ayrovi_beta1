/**
 * Les primitives du back office vivent désormais dans `client/src/design/admin/` — une primitive,
 * un fichier, une implémentation (P3/T2). Ce fichier reste **la façade publique** demandée par le
 * plan : les 20 écrans et le moteur back office continuent d'importer `../components`, et rien
 * dans leurs appels n'a changé. Aucune définition ici : uniquement des réexports.
 *
 * Le style des primitives n'est pas ici : il vit dans `client/src/admin/admin.css`, la couche
 * d'application unique (P3/T1-c/T1-d), qui ne contient aucun littéral de couleur (P3/T1-a/T2-C5).
 */
export * from '../design/admin/Button';
export * from '../design/admin/ConfirmDialog';
export * from '../design/admin/DataTable';
export * from '../design/admin/DatePicker';
export * from '../design/admin/EmptyState';
export * from '../design/admin/Field';
export * from '../design/admin/Filters';
export * from '../design/admin/Form';
export * from '../design/admin/ImageUploader';
export * from '../design/admin/Modal';
export * from '../design/admin/PageHeader';
export * from '../design/admin/Pagination';
export * from '../design/admin/Search';
export * from '../design/admin/Select';
export * from '../design/admin/StatusBadge';
export * from '../design/admin/Toast';
