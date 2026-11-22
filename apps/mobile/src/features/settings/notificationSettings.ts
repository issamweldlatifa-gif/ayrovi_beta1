import { useQuery } from '@tanstack/react-query';
import { fetchPreferences, type Preferences } from '@/api/account';
import type { TranslationKey } from '@/i18n';

export const notificationChannels = [
  { key: 'orderUpdates', label: 'preferences.order', icon: 'bag-handle-outline' },
  { key: 'paymentUpdates', label: 'preferences.payment', icon: 'card-outline' },
  { key: 'shippingUpdates', label: 'preferences.shipping', icon: 'cube-outline' },
  { key: 'invoiceUpdates', label: 'preferences.invoice', icon: 'receipt-outline' },
] as const satisfies ReadonlyArray<{ key: keyof Preferences; label: TranslationKey; icon: string }>;

export const notificationKey = (owner: string | undefined) => ['account', 'preferences', owner] as const;
export const useNotificationSettings = (owner: string | undefined) => useQuery({
  queryKey: notificationKey(owner), enabled: Boolean(owner), queryFn: ({ signal }) => fetchPreferences({ signal }),
});
