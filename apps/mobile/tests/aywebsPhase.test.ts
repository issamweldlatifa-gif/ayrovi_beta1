/**
 * AYWEBs — phases de lecture (Q7).
 *
 * Ce que ces tests protègent, c'est l'honnêteté de l'attente : un indicateur
 * qui annonce une étape franchie avant qu'elle le soit, ou un décompte qui
 * descend sous zéro, « rassure » en mentant. Les deux sont impossibles ici,
 * et ces tests sont là pour que ça le reste.
 */
import { describe, expect, it } from 'vitest';
import {
  CAPTURE_BUDGET_MS, isTerminalPhase, isWaitingPhase, phaseIndex, remainingSeconds, stepState,
  type ReadPhase,
} from '../src/features/aywebs/phase';

describe('position des jalons', () => {
  it('chaque phase d’attente a son rang', () => {
    expect(phaseIndex('preparing')).toBe(0);
    expect(phaseIndex('reading')).toBe(1);
    expect(phaseIndex('resolving')).toBe(2);
  });

  it('avant de commencer : -1 ; terminé : au bout de la file', () => {
    expect(phaseIndex('idle')).toBe(-1);
    expect(phaseIndex('done')).toBe(3);
    expect(phaseIndex('failed')).toBe(3);
  });

  it('les phases terminales arrêtent l’indicateur', () => {
    expect(isTerminalPhase('done')).toBe(true);
    expect(isTerminalPhase('failed')).toBe(true);
    expect(isTerminalPhase('reading')).toBe(false);
  });

  it('seules les trois phases d’attente font attendre', () => {
    for (const phase of ['preparing', 'reading', 'resolving'] as ReadPhase[]) {
      expect(isWaitingPhase(phase)).toBe(true);
    }
    expect(isWaitingPhase('idle')).toBe(false);
    expect(isWaitingPhase('done')).toBe(false);
  });
});

describe('état affiché de chaque jalon', () => {
  it('les jalons franchis sont marqués, le suivant est actif, les autres attendent', () => {
    // En pleine lecture : la préparation est DERrière, la vérification DEVANT.
    expect(stepState(0, 'reading')).toBe('done');
    expect(stepState(1, 'reading')).toBe('active');
    expect(stepState(2, 'reading')).toBe('waiting');
  });

  it('une phase terminale ne laisse AUCUN jalon actif', () => {
    expect(stepState(0, 'done')).toBe('done');
    expect(stepState(1, 'done')).toBe('done');
    expect(stepState(2, 'done')).toBe('done');
    // Échec inclus : l’indicateur s’arrête, il ne continue pas de tourner.
    expect(stepState(2, 'failed')).toBe('done');
  });

  it('avant de commencer, rien n’est franchi', () => {
    expect(stepState(0, 'idle')).toBe('waiting');
  });
});

describe('décompte — un fait, pas une prédiction', () => {
  it('budget entier au départ', () => {
    expect(remainingSeconds(0)).toBe(15);
  });

  it('retranche le temps réellement écoulé', () => {
    expect(remainingSeconds(7_500)).toBe(8);
    expect(remainingSeconds(1_000)).toBe(14);
  });

  it('ne descend JAMAIS sous zéro : une seconde négative n’existe pas', () => {
    expect(remainingSeconds(15_000)).toBe(0);
    expect(remainingSeconds(90_000)).toBe(0);
  });

  it('mesures absurdes ⇒ budget complet, pas un affichage fou', () => {
    expect(remainingSeconds(Number.NaN)).toBe(15);
    expect(remainingSeconds(-5_000)).toBe(15);
  });

  it('suit un budget différent si on lui en donne un', () => {
    expect(remainingSeconds(2_000, 10_000)).toBe(8);
  });

  it('budget invalide ⇒ celui du produit, et le temps déjà écoulé compte quand même', () => {
    // 15 s de budget rendu, moins les 2 s réellement passées : 13. Rendre 15
    // effacerait deux secondes d’attente qui ont bel et bien eu lieu.
    expect(remainingSeconds(2_000, 0)).toBe(13);
    expect(remainingSeconds(2_000, Number.NaN)).toBe(13);
  });

  it('le budget annoncé est celui du minuteur d’abandon (15 s)', () => {
    expect(CAPTURE_BUDGET_MS).toBe(15_000);
  });
});
