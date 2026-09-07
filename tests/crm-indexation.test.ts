/**
 * AYROVI CRM 360 (E6) — la performance n'est pas un vœu : le plan d'exécution.
 *
 * Chaque requête chaude du module (listes, filtres, vue 360°, notifications)
 * doit traverser un index — jamais un balayage complet. Ce fichier fige la preuve
 * via `EXPLAIN QUERY PLAN` sur le schéma réel : si un jour un index disparaît ou
 * qu'une requête contourne le plan, le test échoue au lieu de le découvrir en prod.
 *
 * Aucune donnée n'est créée : les plans se lisent sur des tables vides (le schéma
 * est déjà amorcé par le serveur de test).
 */
import { describe, expect, test } from 'vitest';
import { db } from '../src/server';

describe('CRM 360 — indexation prouvée par EXPLAIN QUERY PLAN (E6)', () => {
  const cases: Array<{ name: string; table: string; where: string; index: string }> = [
    { name: 'tâches en retard (filtre due=overdue)', table: 'crm360_tasks', where: "status IN ('OPEN','IN_PROGRESS','WAITING') AND due_at < datetime('now')", index: 'idx_crm360_tasks_due' },
    { name: 'tâches d’un responsable', table: 'crm360_tasks', where: "owner_employee_id='e' AND status='OPEN'", index: 'idx_crm360_tasks_owner' },
    { name: 'issues par statut (liste du tableau de bord)', table: 'crm360_issues', where: "status='OPEN'", index: 'idx_crm360_issues_status' },
    { name: 'issues d’un responsable', table: 'crm360_issues', where: "owner_employee_id='e' AND status='OPEN'", index: 'idx_crm360_issues_owner' },
    { name: 'contacts d’une fiche', table: 'crm360_contacts', where: "party_id='p' AND status='ACTIVE'", index: 'idx_crm360_contacts_party' },
    { name: 'activités d’une fiche (timeline 360°)', table: 'crm360_activities', where: "party_id='p'", index: 'idx_crm360_activities_party' },
    { name: 'fiches par statut × nature', table: 'crm360_parties', where: "status='ACTIVE' AND kind='CUSTOMER'", index: 'idx_crm360_parties_kind' },
    { name: 'notes d’une fiche', table: 'crm360_notes', where: "party_id='p'", index: 'idx_crm360_notes_party' },
    { name: 'raccordements legacy (vue 360° enrichie)', table: 'crm360_party_links', where: "ref_type='order' AND ref_id='o'", index: 'idx_crm360_links_ref' },
  ];

  for (const scenario of cases) {
    test(scenario.name, () => {
      const plan = db.all<{ detail: string }>(`EXPLAIN QUERY PLAN SELECT * FROM ${scenario.table} WHERE ${scenario.where}`);
      const details = plan.map((row) => row.detail).join(' ');
      expect(details, `plan pour ${scenario.table}`).toContain('USING INDEX');
      expect(details, `index attendu ${scenario.index}`).toContain(scenario.index);
      expect(details, 'un balayage complet invaliderait la garantie').not.toMatch(/SCAN\s+crm360_/);
    });
  }

  test('les index de la table des fiches couvrent statut, propriétaire et suivi', () => {
    const indexes = db.all<{ name: string }>(`PRAGMA index_list('crm360_parties')`);
    const names = new Set(indexes.map((row) => row.name));
    for (const expected of ['idx_crm360_parties_status', 'idx_crm360_parties_owner', 'idx_crm360_parties_next_follow_up', 'idx_crm360_parties_updated']) {
      expect(names.has(expected), `index manquant: ${expected}`).toBe(true);
    }
  });
});
