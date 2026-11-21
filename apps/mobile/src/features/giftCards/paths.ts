import type { Href } from 'expo-router';
import type { GiftDesign, GiftFormat } from '../../../../../shared/giftCardPreview';

export const giftShop = '/(tabs)/gift-cards' as Href;
export const giftWallet = '/account/gift-cards' as Href;
export const giftDetail = (format: GiftFormat, design: GiftDesign) => `/gift-cards/design?format=${format}&design=${design}` as Href;
