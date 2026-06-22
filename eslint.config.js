import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Surfacing unused symbols early keeps the code honest; allow `_`-prefixed args.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // We deliberately use typed errors; forbid throwing bare strings/objects.
      '@typescript-eslint/only-throw-error': 'off',
      'no-throw-literal': 'error',
    },
  },
  // Prettier last so formatting never fights lint rules.
  prettier,
);
