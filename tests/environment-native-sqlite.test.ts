/**
 * ENVIRONNEMENT DE TEST — SQLite natif.
 *
 * Ce test n'éprouve pas l'application : il éprouve la MACHINE qui la teste.
 *
 * Constaté le 26/10/2026 : dans un bac à sable où `npm ci --ignore-scripts` a
 * sauté la compilation de `better-sqlite3`, 248 tests répartis sur 135 fichiers
 * tombaient avec « Could not locate the bindings file. Tried: … » — un message
 * qui parle de `.node`, pas de la cause réelle, et qu'on a mis des jours à
 * attribuer. Une panne d'environnement ne doit pas ressembler à une panne de
 * code : elle doit se voir UNE fois, avec le remède.
 *
 * En CI (où `npm ci` compile), ce test passe comme les autres : il ne remplace
 * aucune garantie, il nomme celle qui manquait.
 */
import { describe, expect, test } from 'vitest';

describe('environnement — SQLite natif', () => {
  test('better-sqlite3 se charge (sinon 248 tests tombent sans dire pourquoi)', () => {
    let failure = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require('better-sqlite3');
      const db = new Database(':memory:');
      db.exec('CREATE TABLE probe (a INTEGER)');
      db.prepare('INSERT INTO probe (a) VALUES (?)').run(1);
      const row = db.prepare('SELECT a FROM probe').get() as { a: number };
      if (row?.a !== 1) failure = 'lecture/écriture SQLite incohérente';
      db.close();
    } catch (error: any) {
      failure = String(error?.message || error);
    }
    expect(failure, [
      '',
      'better-sqlite3 ne se charge pas : les suites serveur ne peuvent pas tourner.',
      'Cause la plus fréquente : installation faite avec `--ignore-scripts`.',
      'Remède (Linux, en-têtes Node locaux) :',
      '  cd node_modules/better-sqlite3',
      '  npx node-gyp rebuild --release --nodedir=/usr/local',
      `Erreur d’origine : ${failure}`,
      '',
    ].join('\n')).toBe('');
  });
});
