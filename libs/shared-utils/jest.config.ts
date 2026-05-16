import type { Config } from 'jest';

const config: Config = {
  displayName: 'shared-utils',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@fairplay/shared-types$': '<rootDir>/../shared-types/src/index.ts',
  },
};

export default config;
