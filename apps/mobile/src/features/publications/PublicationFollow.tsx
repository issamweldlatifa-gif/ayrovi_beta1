/**
 * « Suivre » des blocs Publication.
 *
 * 15/11 (référence Instagram 002046 / 002058, demande du propriétaire) — même
 * traitement partout : l'éditeur à gauche (avatar cerclé + nom en BLANC), la
 * pilule « Suivre » à droite, TRANSPARENTE, détourée de blanc.
 *
 *  • `media` — posé EN HAUT de la vidéo / de la photo du modèle `media`,
 *              sur un léger voile dégradé pour rester lisible ;
 *  • `block` — modèle `container` : en bas du panneau coloré, pilule plus haute
 *              (44 dp) pour rester bien présente ;
 *  • `inline` — modèle `media` SANS média : rien sur quoi poser du blanc, la
 *              ligne reprend l'encre du bloc (« zayrovi team • Suivre »).
 *
 * 16/11 (capture 031932 : « zayrovi team / Suivre » blancs, illisibles sur le
 * panneau menthe) : sur un PANNEAU (`block`), l'encre suit le fond — blanc pur
 * sur panneau sombre, encre noire sur panneau clair (`blockInks`). Le blanc
 * n'est gardé tel quel que sur l'image / la vidéo (`media`), où il est rendu
 * ÉCLATANT : #FFFFFF plein, ombre nette et voile plus dense derrière.
 *
 * La relation est celle des Reels (`usePublisherFollow`) : une seule vérité
 * côté serveur. Un invité voit la feuille de connexion de Publication.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { veil } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { PUBLICATION_PALETTE as P, PUBLICATION_TYPE, PublicationIcon, PublicationText } from './publicationDesign';
import { usePublisherFollow } from './usePublisherFollow';
import { OFFICIAL_AVATAR, OfficialAvatar } from '@/design/OfficialAvatar';
import { PUBLICATION_PUBLISHER_ID } from '../../../../../shared/publicationBlocks';

export type PublicationFollowLook = 'media' | 'block' | 'inline';

/** Encre et ombre du traitement « blanc sur média » : blanc PUR, ombre nette (lisible sur photo claire). */
export const FOLLOW_ON_MEDIA = {
  ink: P.paper,
  textShadow: veil(0.55),
  textShadowRadius: 4,
  /** Voile dégradé derrière la ligne éditeur posée sur le média (haut → transparent). */
  scrim: veil(0.5),
} as const;

export function PublicationFollow({
  publisherId,
  publisherName,
  look,
  ink,
  muted,
  testID,
}: {
  publisherId: string;
  publisherName: string;
  look: PublicationFollowLook;
  /** Encre lisible sur le fond du bloc (calculée par `blockInks`) — `inline` et `block`. */
  ink: string;
  muted: string;
  testID: string;
}) {
  const theme = useTheme();
  const t = useT();
  const [auth, setAuth] = useState(false);
  const follow = usePublisherFollow(publisherId, () => setAuth(true));
  const following = follow.state === 'following';
  const text = follow.state === 'error'
    ? t('publication.followRetry')
    : following
      ? t('publication.following')
      : t('publication.follow');
  const a11y = following
    ? t('publication.unfollowLabel', { name: publisherName })
    : t('publication.followLabel', { name: publisherName });
  const pressedStyle = { opacity: theme.opacity.subtle };
  const busyStyle = follow.state === 'pending' ? { opacity: theme.opacity.disabled } : null;
  const official = publisherId === PUBLICATION_PUBLISHER_ID;
  const white = look !== 'inline';
  // Encre de la ligne « posée » : blanc pur sur média ; sur panneau, celle que le fond supporte.
  const lineInk = look === 'media' ? FOLLOW_ON_MEDIA.ink : ink;
  const onWhiteInk = lineInk === FOLLOW_ON_MEDIA.ink;
  const textShadow = white && onWhiteInk
    ? { textShadowColor: FOLLOW_ON_MEDIA.textShadow, textShadowRadius: FOLLOW_ON_MEDIA.textShadowRadius, textShadowOffset: { width: 0, height: 1 } }
    : null;

  // Visage du compte officiel devant son nom : disque noir, « Za. » jaune.
  // 19/11 : plus de cercle blanc autour (ni sur média, ni sur panneau). Jamais d'avatar emprunté.
  const avatar = official ? (
    <View testID={`${testID}-avatar-ring`}>
      <OfficialAvatar size={OFFICIAL_AVATAR.publication} testID={`${testID}-avatar`} />
    </View>
  ) : null;

  const direction = theme.isRTL ? 'row-reverse' : 'row';

  return (
    <>
      {white ? (
        <View testID={`${testID}-row`} style={[styles.row, { flexDirection: direction }]}>
          <View style={[styles.identity, { flexDirection: direction }]}>
            {avatar}
            <PublicationText
              testID={`${testID}-name`}
              variant="bodyStrong"
              color={lineInk}
              numberOfLines={1}
              style={[styles.name, textShadow]}
            >
              {publisherName}
            </PublicationText>
          </View>
          <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={a11y}
            accessibilityState={{ disabled: follow.disabled, selected: following }}
            disabled={follow.disabled}
            onPress={follow.press}
            hitSlop={look === 'media' ? (PUBLICATION_TYPE.touch - PUBLICATION_TYPE.followHeightOnMedia) / 2 : 0}
            style={({ pressed }) => [
              styles.pill,
              {
                minHeight: look === 'media' ? PUBLICATION_TYPE.followHeightOnMedia : PUBLICATION_TYPE.followHeight,
                paddingHorizontal: look === 'media' ? 16 : 24,
                borderColor: lineInk,
                borderRadius: theme.radius.full,
                flexDirection: direction,
              },
              busyStyle,
              pressed ? pressedStyle : null,
            ]}
          >
            {following ? (
              <PublicationIcon name="checkmark-outline" size={PUBLICATION_TYPE.followIcon} color={lineInk} />
            ) : null}
            <PublicationText
              variant="bodyStrong"
              color={lineInk}
              numberOfLines={1}
              style={[look === 'block' ? styles.pillText : null, textShadow]}
            >
              {text}
            </PublicationText>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.inlineRow, { flexDirection: direction }]}>
          {avatar}
          <PublicationText testID={`${testID}-name`} variant="bodyStrong" color={ink} numberOfLines={1} style={styles.inlineName}>
            {publisherName}
          </PublicationText>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <PublicationText variant="bodyStrong" color={muted}>•</PublicationText>
          </View>
          <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={a11y}
            accessibilityState={{ disabled: follow.disabled, selected: following }}
            disabled={follow.disabled}
            onPress={follow.press}
            hitSlop={12}
            style={({ pressed }) => [busyStyle, pressed ? pressedStyle : null]}
          >
            <PublicationText variant="bodyStrong" color={following ? muted : ink} numberOfLines={1}>{text}</PublicationText>
          </Pressable>
        </View>
      )}
      {follow.writeFailed ? (
        <PublicationText accessibilityRole="alert" variant="caption" color={white ? FOLLOW_ON_MEDIA.ink : muted} style={textShadow}>
          {t('publication.followError')}
        </PublicationText>
      ) : null}
      {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  identity: { alignItems: 'center', gap: 8, flexShrink: 1 },
  name: { flexShrink: 1 },
  pill: {
    borderWidth: PUBLICATION_TYPE.followBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pillText: { fontSize: PUBLICATION_TYPE.followSize, lineHeight: PUBLICATION_TYPE.followLine },
  inlineRow: { alignItems: 'center', gap: 6, minHeight: PUBLICATION_TYPE.touch },
  inlineName: { flexShrink: 1 },
});
