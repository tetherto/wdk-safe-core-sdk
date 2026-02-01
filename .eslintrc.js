module.exports = {
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  ignorePatterns: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  extends: [
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    'plugin:prettier/recommended' // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
  ],
  parserOptions: {
    ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module' // Allows for the use of imports
  },
  rules: {
    '@typescript-eslint/no-explicit-any': ['warn'], // any returns linter error by default.
    '@typescript-eslint/no-unused-vars': ['error', { 
      'argsIgnorePattern': '^_',
      'caughtErrorsIgnorePattern': '^_|^error$|^err$|^e$'
    }],
    '@typescript-eslint/no-unused-expressions': ['error', {
      'allowShortCircuit': true,
      'allowTernary': true,
      'allowTaggedTemplates': true
    }]
  },
  overrides: [
    {
      files: ['**/tests/**/*.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-unused-expressions': 'off' // Allow chai assertions
      }
    },
    {
      files: ['packages/types-kit/**/*.ts'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off' // Types-kit uses variables for type inference only
      }
    }
  ]
}
