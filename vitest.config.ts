import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig(async (env) => {
  const viteConfigResolved = typeof viteConfig === 'function' ? viteConfig(env as any) : viteConfig;
  return mergeConfig(
    viteConfigResolved,
    defineConfig({
      test: {
        environment: 'jsdom',
        globals: true,
      },
    })
  );
});
