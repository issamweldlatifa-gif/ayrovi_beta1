/**
 * Z Lens — le wrapper ML Kit ne bloque jamais : module natif présent → produits,
 * absent ou en panne → [] (retour au cadre « toute la photo »).
 */
const mockDetect = jest.fn();
const mockLoad = jest.fn();
let mockAvailable = true;
jest.mock('@infinitered/react-native-mlkit-object-detection', () => {
  if (!mockAvailable) throw new Error("Cannot find native module 'RNMLKitObjectDetection'");
  return {
    RNMLKitDefaultObjectDetector: jest.fn().mockImplementation(() => ({
      load: mockLoad,
      isLoaded: () => true,
      detectObjects: mockDetect,
    })),
  };
});

import { detectProductsOnDevice, resetOnDeviceDetectorForTests } from '../../src/features/lens/onDeviceDetection';

beforeEach(() => {
  jest.resetModules();
  resetOnDeviceDetectorForTests();
  mockDetect.mockReset();
  mockLoad.mockReset().mockResolvedValue(undefined);
  mockAvailable = true;
});

it('produits normalisés, image passée en URL file://', async () => {
  mockDetect.mockResolvedValue([{ frame: { origin: { x: 100, y: 100 }, size: { x: 400, y: 600 } }, labels: [{ text: 'Fashion good', confidence: 0.9 }] }]);
  const products = await detectProductsOnDevice('/cache/photo.jpg', 1000, 1000);
  expect(mockDetect).toHaveBeenCalledWith('file:///cache/photo.jpg');
  expect(products).toEqual([{ name: 'Fashion good', category: 'fashion', source: 'device', box: { x: 0.1, y: 0.1, w: 0.4, h: 0.6 } }]);
});

it('détection en panne → []', async () => {
  mockDetect.mockRejectedValue(new Error('decode failed'));
  await expect(detectProductsOnDevice('file:///x.jpg', 100, 100)).resolves.toEqual([]);
});

it('trop lent → [] au bout du délai', async () => {
  mockDetect.mockImplementation(() => new Promise(() => undefined));
  await expect(detectProductsOnDevice('file:///x.jpg', 100, 100, 20)).resolves.toEqual([]);
});

it('module natif absent (ancien APK) → []', async () => {
  mockAvailable = false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fresh = require('../../src/features/lens/onDeviceDetection') as typeof import('../../src/features/lens/onDeviceDetection');
  fresh.resetOnDeviceDetectorForTests();
  await expect(fresh.detectProductsOnDevice('file:///x.jpg', 100, 100)).resolves.toEqual([]);
});
