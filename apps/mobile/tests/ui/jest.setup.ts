// Mocks des modules natifs utilisés par l'arbre du carrousel (tests UI uniquement).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
