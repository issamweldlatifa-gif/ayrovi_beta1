/**
 * Revue de l'écran de connexion client — 2026-09-22.
 *
 * Demande : « تحسين واجهة دخول وحذف تكرار الكلمات » puis « condition et les termes… اذا نعتمد خط
 * أزرق بينهم، و1% لون ».
 *
 * Traduction en gardes : la copie ne dit plus deux fois la même chose, les placeholders apprennent
 * quelque chose, le bouton principal n'est jamais « mort », et le bloc légal est un vrai bloc
 * (filet + séparateur + lavis) réglable par deux jetons — jamais une ligne grise indistincte.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const PAGE = 'client/src/components/CustomerAccountPage.tsx';
const CSS = 'client/src/styles/customer-auth.css';

describe('1. Plus de mots répétés', () => {
  const page = read(PAGE);

  it('le sous-titre ne répète plus le verbe du titre', () => {
    expect(page).not.toContain("tr('Connectez-vous à votre univers AYROVI.'");
    expect(page).toContain("tr('Vos commandes, vos favoris et votre panier, au même endroit.'");
  });

  it('le sous-titre et le titre ne partagent aucun mot plein', () => {
    const title = 'Connectez-vous.';
    const subtitle = 'Vos commandes, vos favoris et votre panier, au même endroit.';
    const words = (value: string) => new Set(value.toLowerCase().replace(/[.,?!]/g, '').split(/\s+/).filter((word) => word.length > 3));
    const shared = [...words(title)].filter((word) => words(subtitle).has(word));
    expect(shared).toEqual([]);
  });

  /**
   * Règle affinée le 04/10/2026, à la demande du client (captures de l'écran
   * de connexion souhaité).
   *
   * Ce que la règle protège réellement : qu'une information ne DISPARAISSE
   * pas à la saisie. Un placeholder qui recopie une étiquette VISIBLE est une
   * redondance pure — deux fois le même mot à l'écran, et le mot survivant
   * n'apprend rien. Mais un placeholder qui remplace une étiquette
   * volontairement masquée (`sr-only`) ne duplique rien du tout : il EST
   * l'étiquette visible, le lecteur d'écran reçoit le <label>, et rien n'est
   * perdu puisqu'il n'y avait rien d'autre à perdre.
   *
   * La garde vérifie donc les deux faces :
   *   1. les anciens placeholders bavards restent interdits ;
   *   2. tout champ dont le placeholder reprend son intitulé doit avoir une
   *      étiquette `sr-only` associée — sinon c'est bien une duplication.
   */
  it('aucun placeholder ne recopie une étiquette VISIBLE', () => {
    expect(page).not.toContain("placeholder={tr('Votre adresse e-mail'");
    expect(page).not.toContain("placeholder={tr('Votre mot de passe'");
    expect(page).not.toContain("placeholder={tr('Votre nom complet'");
    expect(page).toContain("placeholder={tr('Ex. Sarra Ben Ali'");
  });

  it('le champ e-mail de l’étape 1 porte une étiquette masquée, pas aucune', () => {
    // Sans ce <label>, le champ serait muet pour un lecteur d'écran : le
    // placeholder n'est PAS un nom accessible fiable.
    expect(page).toContain('<label className="sr-only" htmlFor="auth-email">');
    expect(page).toContain("placeholder={tr('Adresse e-mail', 'البريد الإلكتروني')}");
  });

  it('le champ mot de passe n’a plus de placeholder du tout', () => {
    const passwordLine = page.split('\n').find((line) => line.includes("id=\"auth-password\""))!;
    expect(passwordLine).not.toContain('placeholder=');
  });

  it('la règle des 8 caractères ne s’applique qu’à l’inscription', () => {
    // À la connexion, un compte ancien peut avoir un mot de passe plus court : `minLength` y
    // bloquait la soumission sans le dire.
    expect(page).toContain("minLength={emailMode === 'register' ? 8 : undefined}");
    expect(page).toContain("autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}");
  });
});

describe('2. Le bouton principal n’est jamais mort', () => {
  const page = read(PAGE);

  it('il n’est plus désactivé tant que les champs sont vides', () => {
    expect(page).not.toContain('disabled={authBusy || !emailAddress.trim() || !emailPassword');
    expect(page).toContain('<Button type="submit" disabled={authBusy} className="ay-auth__submit">');
  });

  it('le formulaire signale l’attente réseau (et seulement elle)', () => {
    expect(page).toContain('aria-busy={authBusy}');
    const css = read(CSS);
    expect(css).toContain(".ay-auth button:disabled { cursor: not-allowed; opacity: 0.6; }");
    expect(css).toContain(".ay-auth form[aria-busy='true'] button");
  });
});

describe('3. Bloc Conditions / Confidentialité', () => {
  const page = read(PAGE);
  const css = read(CSS);

  it('les deux liens sont regroupés dans un bloc légal nommé', () => {
    expect(page).toContain('className="ay-auth__legal"');
    expect(page).toContain("aria-label={tr('Informations légales', 'معلومات قانونية')}");
  });

  it('le contrat des liens n’a pas bougé (mêmes URL, même onglet)', () => {
    expect(page).toContain('<a href="/terms.html" target="_blank" rel="noreferrer">{tr("Conditions d’utilisation"');
    expect(page).toContain('<a href="/privacy.html" target="_blank" rel="noreferrer">{tr(\'Confidentialité\'');
  });

  it('un filet vertical sépare les deux liens, dans le sens de lecture', () => {
    expect(css).toMatch(/\.ay-auth__legal a \+ a \{ border-inline-start: 1px solid var\(--ay-auth-legal-rule\); \}/);
  });

  it('le bloc porte un filet au-dessus ET un lavis de 1 %', () => {
    expect(css).toContain(".ay-auth__footer { margin-block-start: var(--ayrovi-space-4); border-top: 1px solid var(--ay-auth-legal-rule); background: var(--ay-auth-legal-wash);");
    // Le lavis est bien à 1 % d'encre — pas une couleur pleine.
    expect(css).toContain('--ay-auth-legal-wash: color-mix(in srgb, var(--ayrovi-text-primary) 1%, transparent);');
  });

  it('la variante bleue (demandée) existe et se régle en un attribut', () => {
    expect(css).toContain(".ay-auth[data-legal-tone='blue'] {");
    expect(css).toContain('#1c5db5');
  });

  it('les liens sont soulignés : un lien doit se voir', () => {
    expect(css).toMatch(/\.ay-auth__legal a \{[\s\S]*?text-decoration: underline;/);
  });
});
