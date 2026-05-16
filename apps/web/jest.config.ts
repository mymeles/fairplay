import type { Config } from 'jest';

const config: Config = {
  displayName: 'web',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  rootDir: '.',
  testMatch: ['<rootDir>/**/*.spec.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/e2e/', '<rootDir>/.next/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@fairplay/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@fairplay/shared-utils$': '<rootDir>/../../libs/shared-utils/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

export default config;
