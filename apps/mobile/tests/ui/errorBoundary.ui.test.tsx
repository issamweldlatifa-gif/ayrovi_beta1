/**
 * ZAYROVI — le filet de sécurité doit vraiment rattraper.
 *
 * Ce test monte un enfant qui LÈVE pendant son rendu, sous `AppErrorBoundary`,
 * et vérifie trois choses :
 *   1. l'écran de repli s'affiche (l'application ne meurt pas) ;
 *   2. « Réessayer » relance le rendu des enfants ;
 *   3. le repli n'a besoin d'AUCUN fournisseur (ni thème, ni langue) — c'est ce
 *      qui le rend utilisable même quand l'erreur vient d'un fournisseur.
 */
import { fireEvent, render } from '@testing-library/react-native';
import { AppErrorBoundary, ErrorFallback } from '@/design/AppErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boum');
  return null;
}

describe('AppErrorBoundary — un écran qui plante ne ferme plus l’application', () => {
  it('affiche le repli arabe/français au lieu de propager l’erreur', () => {
    // `componentDidCatch` journalise en développement : on tait la sortie.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(
      <AppErrorBoundary>
        <Boom explode />
      </AppErrorBoundary>,
    );

    expect(view.getByText('حدث خطأ في العرض')).toBeTruthy();
    expect(view.getByText('Une erreur d’affichage')).toBeTruthy();
    expect(view.getByText('boum')).toBeTruthy();
    expect(view.getByTestId('error-boundary-retry')).toBeTruthy();
    warn.mockRestore();
  });

  it('« Réessayer » re-rend les enfants', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // L'enfant lève TANT QUE `broken` est vrai ; React tente un rendu de
    // secours à la première erreur, donc le drapeau doit rester vrai jusqu'au
    // clic — sinon le repli ne serait jamais atteint.
    const state = { broken: true };
    function Flaky() {
      if (state.broken) throw new Error('premier essai');
      return null;
    }
    const view = render(
      <AppErrorBoundary>
        <Flaky />
      </AppErrorBoundary>,
    );
    expect(view.getByTestId('error-boundary-retry')).toBeTruthy();
    state.broken = false;
    fireEvent.press(view.getByTestId('error-boundary-retry'));
    expect(view.queryByTestId('error-boundary-retry')).toBeNull();
    warn.mockRestore();
  });

  it('le repli se rend seul, sans thème ni langue', () => {
    const view = render(<ErrorFallback error={new Error('sans contexte')} />);
    expect(view.getByText('Une erreur d’affichage')).toBeTruthy();
    // Pas de `onRetry` ⇒ pas de bouton fantôme.
    expect(view.queryByTestId('error-boundary-retry')).toBeNull();
  });
});
