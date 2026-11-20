import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { PublicUpcomingStore } from '../../../../../shared/aywebsUpcoming';

const CHANNEL = 'aywebs-upcoming';
const PREFIX = 'aywebs-upcoming:';
const identifierFor = (id: string) => `${PREFIX}${id}`;
export const supportsUpcomingReminder = Platform.OS === 'ios' || Platform.OS === 'android';

export async function readUpcomingReminders() {
  if (!supportsUpcomingReminder) return new Map<string, string>();
  const result = await Notifications.getAllScheduledNotificationsAsync();
  return new Map(result.flatMap(item => {
    const opensAt = item.content.data?.opensAt;
    return item.identifier.startsWith(PREFIX) && typeof opensAt === 'string' ? [[item.identifier.slice(PREFIX.length), opensAt] as const] : [];
  }));
}

export async function toggleUpcomingReminder(store: PublicUpcomingStore, previous: string | undefined, title: string, body: string) {
  if (!supportsUpcomingReminder) return false;
  const identifier = identifierFor(store.id);
  if (previous === store.opensAt) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    return false;
  }
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'AYWEBs', importance: Notifications.AndroidImportance.DEFAULT });
  const permitted = (permission: Notifications.NotificationPermissionsStatus) => permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const permission = await Notifications.getPermissionsAsync();
  if (!permitted(permission) && (!permission.canAskAgain || !permitted(await Notifications.requestPermissionsAsync()))) throw new Error('permission');
  const date = new Date(store.opensAt);
  if (date.getTime() <= Date.now()) return false;
  if (previous) await Notifications.cancelScheduledNotificationAsync(identifier);
  await Notifications.scheduleNotificationAsync({ identifier,
    content: { title, body, data: { opensAt: store.opensAt } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
  });
  return true;
}
