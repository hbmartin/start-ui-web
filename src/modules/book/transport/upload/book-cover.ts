import { RejectUpload, route } from '@better-upload/server';

import i18n from '@/lib/i18n';

import { getAuthUseCases } from '@/composition/auth';
import { bookCoverAcceptedFileTypes } from '@/modules/book/presentation';

export const bookCover = route({
  fileTypes: bookCoverAcceptedFileTypes,
  maxFileSize: 1024 * 1024 * 100, // 100Mb
  onBeforeUpload: async ({ req, file }) => {
    const auth = getAuthUseCases();
    const session = await auth.getCurrentSession({ headers: req.headers });
    if (!session?.user) {
      throw new RejectUpload(
        i18n.t('book:manager.uploadErrors.NOT_AUTHENTICATED')
      );
    }

    const canUpdateBookCover = await auth.checkPermission({
      userId: session.user.id,
      permissions: { book: ['create', 'update'] },
      headers: req.headers,
    });

    if (!canUpdateBookCover) {
      throw new RejectUpload(i18n.t('book:manager.uploadErrors.UNAUTHORIZED'));
    }

    // normalize file extension from detected mimetype (file.type)
    const fileExtension = file.type.split('/').at(-1) as string;
    return {
      // I think it is a good idea to create a random file id
      // This allow us to invalidate cache (because the id will always be random)
      // and it also prevent the user to upload a file with the same name (aka. objectKey), but different file content
      objectInfo: {
        key: `books/${crypto.randomUUID()}.${fileExtension}`,
      },
    };
  },
});
