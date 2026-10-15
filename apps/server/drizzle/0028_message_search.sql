-- Full-text search over message text. The `russian` configuration stems Russian words and
-- sends Latin ones to the English stemmer (with English stop words), so one vector serves
-- both languages. Kept out of the Drizzle schema on purpose: rows never need to carry the
-- vector, only the search query reads it (see message.repository.ts `search`).
-- Adding a stored column rewrites the table: on a big instance this migration takes a while.
ALTER TABLE "messages" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('russian', "content")) STORED;--> statement-breakpoint
CREATE INDEX "messages_search_idx" ON "messages" USING gin ("search_vector");--> statement-breakpoint
-- "Messages from someone" without scanning every message of the server.
CREATE INDEX "messages_author_id_idx" ON "messages" ("author_id", "id" DESC);
