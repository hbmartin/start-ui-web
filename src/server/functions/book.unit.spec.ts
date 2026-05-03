import { describe, expect, it } from 'vitest';

import { handlers } from '@/server/functions/book.handlers.server';
import {
  createAuthenticatedContext,
  mockDb,
  mockUser,
  mockUserHasPermission,
} from '@/server/functions/test-utils';

const now = new Date();

const mockGenre = {
  id: 'genre-1',
  name: 'Fiction',
  color: '#ff0000',
  createdAt: now,
  updatedAt: now,
};

const mockBookFromDb = {
  id: 'book-1',
  title: 'Test Book',
  author: 'Test Author',
  genre: mockGenre,
  genreId: 'genre-1',
  publisher: 'Test Publisher',
  coverId: null,
  createdAt: now,
  updatedAt: now,
};

const defaultGetAllInput = { limit: 20, searchTerm: '' };

describe('book handlers', () => {
  describe('getAll', () => {
    it('should return paginated books with total count', async () => {
      mockDb.book.count.mockResolvedValue(1);
      mockDb.book.findMany.mockResolvedValue([mockBookFromDb]);

      const result = await handlers.getAll(
        createAuthenticatedContext(),
        defaultGetAllInput
      );

      expect(result).toEqual({
        items: [mockBookFromDb],
        nextCursor: undefined,
        total: 1,
      });
    });

    it('should return nextCursor when there are more items than limit', async () => {
      const booksFromDb = Array.from({ length: 4 }, (_, i) => ({
        ...mockBookFromDb,
        id: `book-${i + 1}`,
      }));
      mockDb.book.count.mockResolvedValue(10);
      mockDb.book.findMany.mockResolvedValue(booksFromDb);

      const result = await handlers.getAll(createAuthenticatedContext(), {
        ...defaultGetAllInput,
        limit: 3,
      });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBe('book-4');
      expect(result.total).toBe(10);
    });

    it('should not return nextCursor when items fit within limit', async () => {
      mockDb.book.count.mockResolvedValue(1);
      mockDb.book.findMany.mockResolvedValue([mockBookFromDb]);

      const result = await handlers.getAll(createAuthenticatedContext(), {
        ...defaultGetAllInput,
        limit: 5,
      });

      expect(result.nextCursor).toBeUndefined();
    });

    it('should require book read permission', async () => {
      mockDb.book.count.mockResolvedValue(0);
      mockDb.book.findMany.mockResolvedValue([]);

      await handlers.getAll(createAuthenticatedContext(), defaultGetAllInput);

      expect(mockUserHasPermission).toHaveBeenCalledWith({
        body: {
          userId: mockUser.id,
          permissions: { book: ['read'] },
        },
      });
    });

    it('should throw FORBIDDEN when user lacks permission', async () => {
      mockUserHasPermission.mockResolvedValue({
        success: false,
        error: false,
      });

      await expect(
        handlers.getAll(createAuthenticatedContext(), defaultGetAllInput)
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('getById', () => {
    it('should return a book when found', async () => {
      mockDb.book.findUnique.mockResolvedValue(mockBookFromDb);

      const result = await handlers.getById(createAuthenticatedContext(), {
        id: 'book-1',
      });

      expect(result).toEqual(mockBookFromDb);
    });

    it('should throw NOT_FOUND when book does not exist', async () => {
      mockDb.book.findUnique.mockResolvedValue(null);

      await expect(
        handlers.getById(createAuthenticatedContext(), { id: 'nonexistent' })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should require book read permission', async () => {
      mockDb.book.findUnique.mockResolvedValue(mockBookFromDb);

      await handlers.getById(createAuthenticatedContext(), { id: 'book-1' });

      expect(mockUserHasPermission).toHaveBeenCalledWith({
        body: {
          userId: mockUser.id,
          permissions: { book: ['read'] },
        },
      });
    });

    it('should throw FORBIDDEN when user lacks permission', async () => {
      mockUserHasPermission.mockResolvedValue({
        success: false,
        error: false,
      });

      await expect(
        handlers.getById(createAuthenticatedContext(), { id: 'book-1' })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('create', () => {
    const createInput = {
      title: 'New Book',
      author: 'New Author',
      genreId: 'genre-1',
      publisher: 'Publisher',
      coverId: null,
    };

    it('should create a book and return it', async () => {
      const createdBookFromDb = {
        ...mockBookFromDb,
        ...createInput,
        id: 'new-book-1',
      };
      mockDb.book.create.mockResolvedValue(createdBookFromDb);

      const result = await handlers.create(
        createAuthenticatedContext(),
        createInput
      );

      expect(result).toEqual(createdBookFromDb);
    });

    it('should require book create permission', async () => {
      mockDb.book.create.mockResolvedValue({
        ...mockBookFromDb,
        ...createInput,
      });

      await handlers.create(createAuthenticatedContext(), createInput);

      expect(mockUserHasPermission).toHaveBeenCalledWith({
        body: {
          userId: mockUser.id,
          permissions: { book: ['create'] },
        },
      });
    });

    it('should throw FORBIDDEN when user lacks permission', async () => {
      mockUserHasPermission.mockResolvedValue({
        success: false,
        error: false,
      });

      await expect(
        handlers.create(createAuthenticatedContext(), createInput)
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('updateById', () => {
    const updateInput = {
      id: 'book-1',
      title: 'Updated Title',
      author: 'Updated Author',
      genreId: 'genre-1',
      publisher: 'Updated Publisher',
      coverId: 'cover-1',
    };

    it('should update a book and return it', async () => {
      const updatedBookFromDb = { ...mockBookFromDb, ...updateInput };
      mockDb.book.update.mockResolvedValue(updatedBookFromDb);

      const result = await handlers.updateById(
        createAuthenticatedContext(),
        updateInput
      );

      expect(result).toEqual(updatedBookFromDb);
    });

    it('should require book update permission', async () => {
      mockDb.book.update.mockResolvedValue({
        ...mockBookFromDb,
        ...updateInput,
      });

      await handlers.updateById(createAuthenticatedContext(), updateInput);

      expect(mockUserHasPermission).toHaveBeenCalledWith({
        body: {
          userId: mockUser.id,
          permissions: { book: ['update'] },
        },
      });
    });

    it('should throw FORBIDDEN when user lacks permission', async () => {
      mockUserHasPermission.mockResolvedValue({
        success: false,
        error: false,
      });

      await expect(
        handlers.updateById(createAuthenticatedContext(), updateInput)
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('deleteById', () => {
    it('should delete a book successfully', async () => {
      mockDb.book.delete.mockResolvedValue(mockBookFromDb);

      await expect(
        handlers.deleteById(createAuthenticatedContext(), { id: 'book-1' })
      ).resolves.toBeUndefined();
    });

    it('should require book delete permission', async () => {
      mockDb.book.delete.mockResolvedValue(mockBookFromDb);

      await handlers.deleteById(createAuthenticatedContext(), { id: 'book-1' });

      expect(mockUserHasPermission).toHaveBeenCalledWith({
        body: {
          userId: mockUser.id,
          permissions: { book: ['delete'] },
        },
      });
    });

    it('should throw FORBIDDEN when user lacks permission', async () => {
      mockUserHasPermission.mockResolvedValue({
        success: false,
        error: false,
      });

      await expect(
        handlers.deleteById(createAuthenticatedContext(), { id: 'book-1' })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
