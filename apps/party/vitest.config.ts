import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@squad/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
