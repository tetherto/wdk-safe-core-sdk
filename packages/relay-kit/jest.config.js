const config = {
  roots: ['<rootDir>/src'],
  verbose: true,
  transform: {
    '^.+\\.ts?$': 'ts-jest'
  },
  moduleNameMapper: {
    '^@wdk-safe-global/protocol-kit/tests/(.*)$': '<rootDir>/../protocol-kit/tests/$1',
    '^@wdk-safe-global/relay-kit/test-utils$': '<rootDir>/test-utils',
    '^@wdk-safe-global/relay-kit/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 20000
}

module.exports = config
