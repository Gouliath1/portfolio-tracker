const nextJest = require('next/jest')

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
  // Point to the Next.js web app inside the monorepo
  dir: './apps/web',
})

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Test patterns
  testMatch: [
    '<rootDir>/__tests__/**/*.(test|spec).(js|jsx|ts|tsx)',
    '<rootDir>/apps/web/src/**/__tests__/**/*.(test|spec).(js|jsx|ts|tsx)',
    '<rootDir>/apps/web/src/**/*.(test|spec).(js|jsx|ts|tsx)',
    '<rootDir>/packages/**/*.(test|spec).(js|jsx|ts|tsx)'
  ],
  
  // Module name mapping for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/apps/web/src/$1',
    '^@/components/(.*)$': '<rootDir>/apps/web/src/components/$1',
    '^@/utils/(.*)$': '<rootDir>/apps/web/src/utils/$1',
    '^@/data/(.*)$': '<rootDir>/apps/web/src/data/$1',
    '^@portfolio/types$': '<rootDir>/packages/types/src/index.ts',
    '^@portfolio/types/(.*)$': '<rootDir>/packages/types/src/$1',
    '^@portfolio/server$': '<rootDir>/packages/server/src/index.ts',
    '^@portfolio/server/(.*)$': '<rootDir>/packages/server/src/$1',
    '^@portfolio/core$': '<rootDir>/packages/core/src/index.ts',
    '^@portfolio/core/(.*)$': '<rootDir>/packages/core/src/$1',
    '^@portfolio/utils$': '<rootDir>/packages/utils/src/projectPaths.ts',
    '^@portfolio/utils/(.*)$': '<rootDir>/packages/utils/src/$1',
  },
  
  // Coverage configuration
  collectCoverageFrom: [
    'apps/web/src/**/*.{js,jsx,ts,tsx}',
    'packages/**/*.{js,jsx,ts,tsx}',
    '!apps/web/src/**/*.d.ts',
    '!apps/web/src/**/index.ts',
    '!apps/web/src/app/**/*.tsx', // Exclude Next.js app directory pages
    '!apps/web/src/**/*.stories.{js,jsx,ts,tsx}',
    '!apps/web/src/**/*.config.{js,jsx,ts,tsx}',
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  // Test environment options
  testEnvironmentOptions: {
    customExportConditions: [''],
  },
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config)
