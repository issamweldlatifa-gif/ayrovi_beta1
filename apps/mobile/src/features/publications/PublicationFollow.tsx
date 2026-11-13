/**
 * « Suivre » des blocs Publication (planches Zalando du 13/11, demandé par le
 * propriétaire : « نسيت زر Follow »).
 *
 *  • `pill`   — modèle `container` : pilule détourée « + Suivre » suivie du nom
 *               de l'éditeur, en bas du panneau coloré ;
 *  • `inline` — modèle `media` : « zayrovi team • Suivre » sur la ligne d'en-tête.
 *
 * La relation est celle des Reels (`usePublisherFollow`) : une seule vérité
 * côté serveur. Un invité voit la feuille de connexion de Publication.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import { PUBLICATION_TYPE, PublicationIcon, PublicationText } from './publicationDesign';
import { usePublisherFollow } from './usePublisherFollow';

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
  look: 'pill' | 'inline';
  /** Encre lisible sur le fond du bloc (calculée par `blockInks`). */
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

  return (
    <>
      {look === 'pill' ? (
        <View style={styles.pillRow}>
          <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={a11y}
            accessibilityState={{ disabled: follow.disabled, selected: following }}
            disabled={follow.disabled}
            onPress={follow.press}
            style={({ pressed }) => [styles.pill, { borderColor: ink, borderRadius: theme.radius.full }, busyStyle, pressed ? pressedStyle : null]}
          >
            <PublicationIcon name={following ? 'checkmark-outline' : 'add-outline'} size={PUBLICATION_TYPE.followIcon} color={ink} />
            <PublicationText variant="bodyStrong" color={ink} numberOfLines={1} style={styles.pillText}>{text}</PublicationText>
          </Pressable>
          <PublicationText testID={`${testID}-name`} variant="bodyStrong" color={ink} numberOfLines={1} style={styles.name}>
            {publisherName}
          </PublicationText>
        </View>
      ) : (
        <View style={styles.inlineRow}>
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
        <PublicationText accessibilityRole="alert" variant="caption" color={muted}>{t('publication.followError')}</PublicationText>
      ) : null}
      {auth ? <PublicationAuthSheet visible onClose={() => setAuth(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pill: {
    minHeight: PUBLICATION_TYPE.followHeight,
    paddingHorizontal: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pillText: { fontSize: PUBLICATION_TYPE.followSize, lineHeight: PUBLICATION_TYPE.followLine },
  name: { flexShrink: 1 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: PUBLICATION_TYPE.touch },
  inlineName: { flexShrink: 1 },
});
