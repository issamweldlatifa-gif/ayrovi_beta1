// Tests de COMPOSANTS (React Native Testing Library) avec le preset jest-expo.
//
// Séparé de vitest (logique pure, fichiers .test.ts sous tests/) : ces tests
// sont des fichiers .test.tsx sous tests/ui/, lancés par `npm run test:ui`.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/ui/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/ui/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
