ALTER TABLE "attachments" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "preview_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "preview_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "preview_locked_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "attachments_preview_queue_idx" ON "attachments" USING btree ("id") WHERE "attachments"."preview_state" = 'pending' and "attachments"."message_id" is not null;