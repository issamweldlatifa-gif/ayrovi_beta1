import type { Address, AddressInput } from '@/api/account';
import { isTunisianPhone } from '@/api/checkout';

export type DeliveryDraft = Required<Pick<AddressInput, 'recipientName' | 'phone' | 'governorate' | 'city' | 'postalCode' | 'addressLine' | 'deliveryNotes'>>;
export const DELIVERY_INSTRUCTIONS_MAX = 50;
export const ORDER_ADDRESS_MAX = 500;

export function deliveryDraft(address?: Partial<DeliveryDraft>): DeliveryDraft {
  return { recipientName: address?.recipientName ?? '', phone: address?.phone ?? '', governorate: address?.governorate ?? '',
    city: address?.city ?? '', postalCode: address?.postalCode ?? '', addressLine: address?.addressLine ?? '', deliveryNotes: address?.deliveryNotes ?? '' };
}

export function checkoutDeliverySelection(addresses: readonly Address[], contact: Partial<DeliveryDraft>) {
  const preferred = addresses.find(address => address.isDefault);
  return { draft: deliveryDraft(preferred ?? contact), addressId: preferred?.id ?? '' };
}

/** The existing order contract stores one address string. Keep all entered delivery details within it. */
export function orderAddress(draft: DeliveryDraft) {
  const locality = [draft.postalCode.trim(), draft.city.trim()].filter(Boolean).join(' ');
  return [draft.addressLine.trim(), locality, draft.deliveryNotes.trim()].filter(Boolean).join(', ');
}

export function isDeliveryComplete(draft: DeliveryDraft) {
  return Boolean(draft.recipientName.trim() && draft.addressLine.trim() && draft.governorate.trim() && isTunisianPhone(draft.phone));
}
