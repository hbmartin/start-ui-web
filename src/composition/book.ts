import { type BookRepository, createBookUseCases } from '@/modules/book';
import { BookRepositoryDrizzle } from '@/modules/book/infrastructure/drizzle/book-repository-drizzle';

import { getKernel, type Kernel } from './kernel';
import { createCachedFactory } from './shared/singleton';

export type BookOverrides = {
  kernel?: Kernel;
  bookRepository?: BookRepository;
};

const factory = createCachedFactory((overrides?: BookOverrides) => {
  const kernel = overrides?.kernel ?? getKernel();
  return createBookUseCases({
    bookRepository:
      overrides?.bookRepository ?? new BookRepositoryDrizzle(kernel.db),
    permissionChecker: kernel.permissionChecker,
    logger: kernel.logger,
  });
});

export const getBookUseCases = factory.get;

/** Test-only. */
export const __resetBookComposition = factory.reset;
