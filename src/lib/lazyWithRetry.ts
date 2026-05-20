import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isStaleChunkLoadError, recoverFromStaleChunks } from './appCache';

type ModuleWithDefault<T extends ComponentType<unknown>> = { default: T };

/**
 * React.lazy con recupero automatico se il chunk è obsoleto (cache PWA / deploy).
 * Gli asset restano relativi all'origine corrente (base: '/').
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<ModuleWithDefault<T>>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isStaleChunkLoadError(err)) {
        await recoverFromStaleChunks();
        await new Promise(() => {});
      }
      throw err;
    }
  });
}
