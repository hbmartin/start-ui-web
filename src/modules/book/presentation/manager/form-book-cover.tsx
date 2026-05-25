import { useQuery } from '@tanstack/react-query';

import { useAppFormContext, useAppFormState } from '@/platform/components/form';
import { useCurrentScopeKey } from '@/modules/auth/client';
import { BookCover } from '@/modules/book/presentation/book-cover';
import { FormFieldsBook } from '@/modules/book/presentation/schema';
import { genreQueries } from '@/modules/genre/client';

export const FormBookCover = () => {
  const form = useAppFormContext<FormFieldsBook>();
  const scopeKey = useCurrentScopeKey();
  const genresQuery = useQuery(genreQueries.getAllList({ scopeKey }));
  const title = useAppFormState(form, (state) => state.values.title);
  const author = useAppFormState(form, (state) => state.values.author);
  const genreId = useAppFormState(form, (state) => state.values.genreId);
  const coverId = useAppFormState(form, (state) => state.values.coverId);

  const genre = genresQuery.data?.items.find((item) => item.id === genreId);

  return (
    <BookCover
      book={{
        title,
        author,
        genre,
        coverId,
      }}
    />
  );
};
