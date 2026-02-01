const config = {
  roots: ['<rootDir>/src'],
  verbose: true,
  transform: {
    '^.+\\.ts?$': 'ts-jest'
  },
  moduleNameMapper: {
    '^@tetherto/wdk-safe-protocol-kit/tests/(.*)$': '<rootDir>/../protocol-kit/tests/$1',
    '^@tetherto/wdk-safe-relay-kit/test-utils$': '<rootDir>/test-utils',
    '^@tetherto/wdk-safe-relay-kit/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 20000
}

module.exports = config
