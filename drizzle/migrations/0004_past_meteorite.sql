WITH ranked_books AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY lower(trim("title")), lower(trim("author"))
			ORDER BY "createdAt" ASC, "id" ASC
		) AS duplicate_rank
	FROM "book"
)
DELETE FROM "book"
USING ranked_books
WHERE "book"."id" = ranked_books."id"
	AND ranked_books.duplicate_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "book_normalized_title_author_key" ON "book" USING btree (lower(trim("title")),lower(trim("author")));
