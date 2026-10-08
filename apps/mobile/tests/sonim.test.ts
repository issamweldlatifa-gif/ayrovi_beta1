/**
 * SONIM — historique : ce qui mérite un test, ce sont les DÉCISIONS.
 *
 * Écrire dans AsyncStorage n'est pas intéressant à tester ; décider quoi
 * garder, dans quel ordre, et sous quel titre, l'est. D'où le découpage :
 * tri, coupe et titrage sont des fonctions pures, le stockage n'est qu'un
 * paramètre (une interface de deux méthodes), remplacé ici par un faux.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));

import {
  SONIM_HISTORY_LIMIT, loadSonimThreads, pruneSonimThreads, saveSonimThreads, sonimTitle, upsertSonimThread,
  type SonimThread,
} from '../src/features/sonim/history';

const thread = (id: string, at: number, texts: string[] = ['bonjour']): SonimThread => ({
  id,
  title: '',
  updatedAt: at,
  messages: texts.map((text, index) => ({ role: index === 0 ? 'user' : 'assistant', text })),
});

describe('titre — pris de la vraie question, jamais inventé', () => {
  it('reprend le premier message de la personne', () => {
    expect(sonimTitle([{ role: 'user', text: 'وين ألقى كاسك بلوتوث' }])).toBe('وين ألقى كاسك بلوتوث');
  });

  it('ignore un message vide plutôt que de titrer dans le vide', () => {
    expect(sonimTitle([{ role: 'user', text: '   ' }])).toBe('');
    expect(sonimTitle([])).toBe('');
  });

  it('ne titre jamais sur une réponse de SONIM', () => {
    expect(sonimTitle([{ role: 'assistant', text: 'je peux vous aider' }])).toBe('');
  });

  it('coupe sur un espace : pas de mot tronqué en deux', () => {
    const long = 'je cherche un casque bluetooth pas cher et livrable à Sfax rapidement';
    const title = sonimTitle([{ role: 'user', text: long }]);
    expect(title.length).toBeLessThan(52);
    expect(title.endsWith('…')).toBe(true);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
    expect(title.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('normalise les retours à la ligne (un titre tient sur une ligne)', () => {
    expect(sonimTitle([{ role: 'user', text: 'bonjour\n   comment   ça va' }])).toBe('bonjour comment ça va');
  });
});

describe('tri et coupe', () => {
  it('les plus récentes d’abord', () => {
    const out = pruneSonimThreads([thread('a', 1), thread('b', 30), thread('c', 10)]);
    expect(out.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('plafonne et laisse sortir les PLUS ANCIENNES', () => {
    const many = Array.from({ length: 40 }, (_, i) => thread(`t${i}`, i));
    const out = pruneSonimThreads(many, 5);
    expect(out).toHaveLength(5);
    expect(out.map((item) => item.id)).toEqual(['t39', 't38', 't37', 't36', 't35']);
  });

  it('n’altère pas le tableau reçu', () => {
    const input = [thread('a', 1), thread('b', 30)];
    pruneSonimThreads(input);
    expect(input.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('écarte les entrées sans identifiant au lieu de planter', () => {
    const out = pruneSonimThreads([thread('a', 1), { id: '', title: '', updatedAt: 5, messages: [] } as SonimThread]);
    expect(out.map((item) => item.id)).toEqual(['a']);
  });

  it('un plafond absurde retombe sur la limite du produit', () => {
    const many = Array.from({ length: 50 }, (_, i) => thread(`t${i}`, i));
    expect(pruneSonimThreads(many, Number.NaN)).toHaveLength(SONIM_HISTORY_LIMIT);
    expect(pruneSonimThreads(many, -3)).toHaveLength(SONIM_HISTORY_LIMIT);
  });
});

describe('reprise d’une discussion', () => {
  it('remplace par identifiant : jamais deux fois le même fil', () => {
    const out = upsertSonimThread([thread('a', 1), thread('b', 2)], thread('a', 99));
    expect(out.map((item) => item.id)).toEqual(['a', 'b']);
    expect(out[0]!.updatedAt).toBe(99);
  });

  it('la discussion reprise passe en tête', () => {
    const out = upsertSonimThread([thread('b', 50)], thread('a', 900));
    expect(out.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('lecture tolérante', () => {
  const store = (raw: string | null) => ({ getItem: async () => raw, setItem: async () => undefined });

  it('absence de données ⇒ historique vide, pas une erreur', async () => {
    await expect(loadSonimThreads(store(null))).resolves.toEqual([]);
  });

  it('JSON illisible ⇒ historique vide : un historique ancien ne bloque pas l’écran', async () => {
    await expect(loadSonimThreads(store('{ pas du json'))).resolves.toEqual([]);
    await expect(loadSonimThreads(store('{"a":1}'))).resolves.toEqual([]);
  });

  it('relit, trie et nettoie', async () => {
    const raw = JSON.stringify([thread('vieux', 1), thread('récent', 42), { id: 'x' }]);
    const out = await loadSonimThreads(store(raw));
    expect(out.map((item) => item.id)).toEqual(['récent', 'vieux']);
  });
});

describe('écriture', () => {
  it('coupe AVANT d’écrire : on ne stocke pas 400 discussions', async () => {
    let written = '';
    const store = { getItem: async () => null, setItem: async (_k: string, v: string) => { written = v; } };
    const many = Array.from({ length: 60 }, (_, i) => thread(`t${i}`, i));
    await saveSonimThreads(many, store);
    expect(JSON.parse(written)).toHaveLength(SONIM_HISTORY_LIMIT);
  });

  it('un stockage qui refuse ne fait pas échouer la conversation en cours', async () => {
    const store = {
      getItem: async () => null,
      setItem: async () => { throw new Error('quota'); },
    };
    await expect(saveSonimThreads([thread('a', 1)], store)).resolves.toBeUndefined();
  });
});
