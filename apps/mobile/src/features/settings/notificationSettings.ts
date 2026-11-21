import { useQuery } from '@tanstack/react-query';
import { fetchPreferences, type Preferences } from '@/api/account';
import type { TranslationKey } from '@/i18n';

export const notificationChannels = [
  { key: 'orderUpdates', label: 'preferences.order' },
  { key: 'paymentUpdates', label: 'preferences.payment' },
  { key: 'shippingUpdates', label: 'preferences.shipping' },
  { key: 'invoiceUpdates', label: 'preferences.invoice' },
] as const satisfies ReadonlyArray<{ key: keyof Preferences; label: TranslationKey }>;

export const notificationKey = (owner: string | undefined) => ['account', 'preferences', owner] as const;
export const useNotificationSettings = (owner: string | undefined) => useQuery({
  queryKey: notificationKey(owner), enabled: Boolean(owner), queryFn: ({ signal }) => fetchPreferences({ signal }),
});
