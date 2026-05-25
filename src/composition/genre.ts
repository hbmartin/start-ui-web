import { createGenreUseCases, type GenreRepository } from '@/modules/genre';
import { GenreRepositoryDrizzle } from '@/modules/genre/infrastructure/drizzle/genre-repository-drizzle';

import { getKernel, type Kernel } from './kernel';
import { createCachedFactory } from './shared/singleton';

export type GenreOverrides = {
  kernel?: Kernel;
  genreRepository?: GenreRepository;
};

const factory = createCachedFactory((overrides?: GenreOverrides) => {
  const kernel = overrides?.kernel ?? getKernel();
  return createGenreUseCases({
    genreRepository:
      overrides?.genreRepository ?? new GenreRepositoryDrizzle(kernel.db),
    permissionChecker: kernel.permissionChecker,
    logger: kernel.logger,
  });
});

export const getGenreUseCases = factory.get;

/** Test-only. */
export const __resetGenreComposition = factory.reset;
