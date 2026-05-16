import type { Config } from 'jest';

const config: Config = {
  displayName: 'api-integration',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@fairplay/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@fairplay/shared-utils$': '<rootDir>/../../libs/shared-utils/src/index.ts',
  },
};

export default config;
