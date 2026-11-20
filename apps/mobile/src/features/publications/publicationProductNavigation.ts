import { router } from 'expo-router';

/** Every Publication product surface leads to the existing, canonical product card. */
export function openPublicationProduct(id: string) {
  router.push({ pathname: '/product/[id]', params: { id } });
}
