// Mocks des modules natifs utilisés par l'arbre du carrousel (tests UI uniquement).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

/*
 * RN 0.88 / Expo SDK 58 — combler l'écart de mock du registre d'actifs.
 *
 * Le transformateur d'actifs de jest-expo remplace chaque `require('./x.png')`
 * par un ID numérique (1). En SDK 57, le mock installé par jest-expo couvrait
 * cette lecture. En 0.88, `expo-asset` importe `{ AssetRegistry } from
 * 'react-native'`, qui pointe vers le chemin privé
 * `react-native/src/private/assets/AssetRegistry` — distinct de l'entrée
 * secondaire `react-native/asset-registry` que jest-expo mocke encore. Le vrai
 * registre, vide, fait alors planter `Asset.fromModule(1)` avec
 * « Module "1" is missing from the asset registry ».
 *
 * On rend le registre privé permissif (même contrat que le mock jest-expo) :
 * aucun ID numérique de test ne peut plus y manquer.
 */
jest.mock('react-native/src/private/assets/AssetRegistry', () => ({
  AssetRegistry: {
    registerAsset: jest.fn(() => 1),
    getAssetByID: jest.fn(() => ({
      __packager_asset: true,
      fileSystemLocation: '/full/path/to/directory',
      httpServerLocation: '/assets/full/path/to/directory',
      scales: [1],
      fileHashes: ['md5'],
      name: 'name',
      exists: true,
      type: 'type',
      hash: 'md5',
      uri: 'uri',
      width: 1,
      height: 1,
    })),
  },
}));
