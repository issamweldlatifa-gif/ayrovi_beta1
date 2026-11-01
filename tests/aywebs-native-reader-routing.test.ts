import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { findAyWebsStore } from '../shared/aywebsStores';

const ANDROID_ACTIVITY = 'android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java';
const activitySource = readFileSync(ANDROID_ACTIVITY, 'utf8');

describe('AYWEBs Android natif — routage des readers par domaine', () => {
  it('envoie store_id pour chaque domaine déclaré des quatre readers ciblés', () => {
    const routingStart = activitySource.indexOf('private static String captureStoreIdForUrl');
    const routingEnd = activitySource.indexOf('private static boolean matchesAnyDomain', routingStart);
    expect(routingStart).toBeGreaterThanOrEqual(0);
    expect(routingEnd).toBeGreaterThan(routingStart);
    const routing = activitySource.slice(routingStart, routingEnd);

    for (const storeId of ['amazon', 'zalando', 'sephora', 'primark']) {
      const store = findAyWebsStore(storeId);
      expect(store, `${storeId} doit exister dans le registre`).not.toBeNull();
      for (const domain of store!.domains) {
        expect(routing, `${storeId} / ${domain}`).toContain(`"${domain}"`);
      }
      expect(routing, `${storeId} doit renvoyer son identifiant`).toContain(`return "${storeId}"`);
    }
  });

  it('ne réutilise pas le bundle d’un autre magasin après un changement de profil', () => {
    expect(activitySource).toContain('captureScriptStoreId = cacheKey');
    expect(activitySource).toContain('captureScript = "";');
    expect(activitySource).toContain('?store_id=" + storeId');
  });
});
