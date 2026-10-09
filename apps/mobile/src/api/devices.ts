/**
 * Appareil et notifications push — transport.
 *
 * Le principe, et il est le même que partout ailleurs dans cette application :
 * le serveur DÉCIDE, l'appareil RAPPORTE. On lui remet le jeton que le système
 * nous a donné ; il répond s'il est en mesure de s'en servir (`pushEnabled`).
 *
 * Ce dernier point compte plus qu'il n'en a l'air : sans lui, l'application
 * afficherait « notifications activées » alors que rien ne peut partir, et la
 * personne attendrait une notification de commande qui n'arrivera jamais.
 * C'est exactement la règle appliquée à `google.enabled` — un bouton qui
 * promet ce que le serveur ne tient pas est pire qu'une absence expliquée.
 */
import { Platform } from 'react-native';
import { apiSendData, type RequestOptions } from './client';

export interface DeviceRegistration {
  deviceId: string;
  /** L'appareil est-il rattaché à un compte (et non resté anonyme) ? */
  attached: boolean;
  /** Le SERVEUR peut-il réellement envoyer ? Décisif pour l'affichage. */
  pushEnabled: boolean;
}

function parseRegistration(payload: unknown): DeviceRegistration {
  const row = (payload ?? {}) as Record<string, unknown>;
  return {
    deviceId: typeof row.deviceId === 'string' ? row.deviceId : '',
    attached: row.attached === true,
    pushEnabled: row.pushEnabled === true,
  };
}

/** Inscrit l'appareil. `sessionId` permet le rattachement différé au compte. */
export async function registerDevice(
  input: { token: string; sessionId?: string; locale?: string },
  options?: RequestOptions,
): Promise<DeviceRegistration> {
  const data = await apiSendData<unknown>('POST', '/api/customer/account/devices', {
    ...options,
    body: {
      token: input.token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      locale: input.locale ?? 'fr',
      sessionId: input.sessionId ?? '',
    },
  });
  return parseRegistration(data);
}

/** Retrait volontaire : désactivation côté serveur, jamais effacement. */
export async function revokeDevice(token: string, options?: RequestOptions): Promise<void> {
  await apiSendData('DELETE', '/api/customer/account/devices', {
    ...options,
    body: { token },
  });
}
