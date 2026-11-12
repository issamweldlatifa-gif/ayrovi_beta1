/**
 * Champ des écrans d'authentification — noir et blanc (référence Zalando).
 *
 * Deux formes demandées par les captures :
 *   • étiquette AU-DESSUS de la boîte (« Mot de passe », « Prénom ») ;
 *   • action soulignée DANS la boîte, à droite (« RÉVÉLER »), sur une zone
 *     de toucher de 44 — jamais un bouton flottant par-dessus le texte.
 *
 * Tout est dans le flux (aucune superposition) et tout vient des jetons :
 * bordure encre constante, curseur encre, fond canvas. Le violet de la
 * marque n'existe nulle part sur ces écrans.
 *
 * 12/11/2026 (comparaison avec Zalando) : boîte de 48 pt (comme les boutons
 * `lg`), étiquette 14, et l'erreur s'affiche SOUS le champ concerné — plus en
 * haut de page, où elle poussait tout le formulaire vers le bas. La place de
 * l'erreur n'est occupée que lorsqu'il y en a une ; la bordure, elle, ne change
 * que de couleur (jamais d'épaisseur) : rien ne saute pendant la saisie.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from '@/design/ui';
import { RADIUS } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';

export function AuthField({
  label, value, onChangeText, secureTextEntry = false, trailing, editable = true, error, testID, ...rest
}: TextInputProps & {
  label: string;
  /** Message d'erreur propre à ce champ, affiché juste dessous. */
  error?: string | null;
  /** Action soulignée dans la boîte (« Révéler ») : le parent décide du geste. */
  trailing?: { label: string; onPress: () => void; testID?: string; disabled?: boolean };
  testID?: string;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const locked = editable === false;
  return (
    <View>
      <AppText variant="bodySmall" color={theme.colors.ink} style={styles.label}>{label}</AppText>
      <View
        style={[
          styles.box,
          {
            flexDirection: rowDirectionFor(theme.isRTL),
            minHeight: theme.geometry.controlHeight,
            // Le texte côté début, l'action (« Révéler ») côté fin — miroir en arabe.
            ...(theme.isRTL ? { paddingLeft: 8, paddingRight: 16 } : { paddingLeft: 16, paddingRight: 8 }),
            // Le focus change la COULEUR, jamais l'épaisseur : le texte ne saute pas.
            borderColor: error ? theme.status.danger.fg : focused && !locked ? theme.colors.ink : theme.colors.lineControl,
            borderWidth: 1.5,
            backgroundColor: locked ? theme.colors.disabled : theme.colors.canvas,
          },
        ]}
      >
        <TextInput
          {...rest}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          editable={editable}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          accessibilityHint={error ?? rest.accessibilityHint}
          placeholderTextColor={theme.colors.muted}
          selectionColor={theme.colors.ink}
          cursorColor={theme.colors.ink}
          onFocus={(event) => { setFocused(true); rest.onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); rest.onBlur?.(event); }}
          style={[
            theme.text('body'),
            styles.input,
            { color: locked ? theme.colors.muted : theme.colors.ink },
            theme.isRTL ? { textAlign: 'right' } : null,
          ]}
        />
        {trailing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={trailing.label}
            onPress={trailing.onPress}
            // Un champ verrouillé garde son action (« Modifier » est justement
            // ce qui le déverrouille) ; seul le parent peut la couper.
            disabled={trailing.disabled}
            accessibilityState={{ disabled: Boolean(trailing.disabled) }}
            testID={trailing.testID}
            style={styles.trailing}
          >
            <AppText variant="label" color={trailing.disabled ? theme.colors.muted : theme.colors.ink} style={styles.trailingLabel}>
              {trailing.label}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          variant="caption"
          color={theme.status.danger.fg}
          style={styles.error}
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 4 },
  box: {
    alignItems: 'center',
    borderRadius: RADIUS.sm,
    paddingVertical: 4,
  },
  error: { marginTop: 4 },
  input: { flex: 1, padding: 0, backgroundColor: 'transparent', borderWidth: 0, textAlignVertical: 'center' },
  trailing: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  trailingLabel: { textDecorationLine: 'underline' },
});
