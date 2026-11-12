/**
 * Relation « suivre un éditeur » persistée côté serveur — lue et écrite par la
 * feuille d'options des Reels. (Déplacée de l'ancien fil Publication, retiré le
 * 13/11/2026 ; les points d'accès serveur sont inchangés.)
 */
import { apiGetData, apiSend, type RequestOptions } from './client';

export async function followPublisher(id: string, following: boolean) {
  const result = await apiSend<{ following: boolean }>(
    'PUT',
    `/api/public/social/publishers/${encodeURIComponent(id)}/follow`,
    { body: { following } }
  );
  return result.data;
}

export async function fetchPublisherFollow(id: string, options?: RequestOptions) {
  return apiGetData<{ following: boolean }>(`/api/public/social/publishers/${encodeURIComponent(id)}/follow`, options);
}
