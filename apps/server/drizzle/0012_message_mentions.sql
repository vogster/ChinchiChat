ALTER TABLE "messages" ADD COLUMN "mention_user_ids" bigint[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "mention_role_ids" bigint[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "mention_everyone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "messages_mentions_idx" ON "messages" USING btree ("channel_id","id") WHERE "messages"."mention_everyone" or cardinality("messages"."mention_user_ids") > 0 or cardinality("messages"."mention_role_ids") > 0;