import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeTunisianPhone, tunisianPhoneDigits } from '../src/customer/phone';

const pageSource = readFileSync('client/src/admin/ArrivalIngestionPage.tsx', 'utf8');
const pageCss = readFileSync('client/src/admin/arrival-ingestion.css', 'utf8');

describe('Arrival inline CRM customer UI contract', () => {
  it('offers explicit existing-search and canonical-new-customer modes in one modal', () => {
    expect(pageSource).toContain('Rechercher un client');
    expect(pageSource).toContain('Nouveau client');
    expect(pageSource).toContain('Nom ou téléphone…');
    expect(pageSource).toContain('Le client sera enregistré dans la base CRM existante');
    expect(pageSource).toContain('Créer et ajouter');
    expect(pageSource).toContain('Ce téléphone existe déjà : le client CRM existant');
    expect(pageSource).toContain('JSON.stringify({ customer: newCustomer })');
    expect(pageSource).not.toContain('Add existing CRM client');
  });

  it('keeps name and Tunisian phone required while leaving address fields out of the quick form', () => {
    expect(pageSource).toContain('label="Nom du client" required');
    expect(pageSource).toContain('label="Téléphone tunisien" required');
    expect(pageSource).not.toMatch(/arrival-new-customer[\s\S]{0,1800}label="(?:Gouvernorat|Adresse)"/);
    expect(pageCss).toContain('.arrival-customer-modes');
    expect(pageCss).toContain('.arrival-new-customer-actions');
  });

  it('normalizes accepted Tunisian variants to one canonical representation', () => {
    for (const value of ['22 345 678', '+216 22 345 678', '00216 22 345 678', '21622345678']) {
      expect(normalizeTunisianPhone(value)).toBe('+21622345678');
      expect(tunisianPhoneDigits(value)).toBe('22345678');
    }
    expect(normalizeTunisianPhone('12 345 678')).toBeNull();
    expect(normalizeTunisianPhone('22 345 67')).toBeNull();
  });
});
