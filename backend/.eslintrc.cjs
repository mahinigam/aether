module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist/**', 'node_modules/**', 'coverage/**', 'tests/**'],
};
