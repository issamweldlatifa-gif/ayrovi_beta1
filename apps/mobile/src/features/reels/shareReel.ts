import { Share } from 'react-native';
import { apiUrl } from '@/api/client';
import { DEFAULT_API_BASE_URL } from '@/api/config';
import { sendInteraction, type Reel } from '@/api/social';
import { getSessionId } from '@/session/session';
/** Count only a system-reported share, never opening the menu or dismissing it. */
export async function shareReel(reel: Reel) {
  const url = new URL(
    apiUrl(`/reels-viewer?id=${encodeURIComponent(reel.id)}`),
    typeof location === 'undefined' ? DEFAULT_API_BASE_URL : location.origin
  ).toString();
  const result = await Share.share({
    message: `${reel.title || 'Zayrovi Team'}\n${url}`,
  });
  if (result.action === Share.sharedAction) {
    await sendInteraction({
      type: 'share',
      targetId: reel.id,
      sessionId: await getSessionId(),
    }).catch(() => null);
  }
}
