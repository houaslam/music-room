import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/contracts/*.contract.ts'],
    fileParallelism: false,
  },
});
