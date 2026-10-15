ALTER TYPE "public"."channel_type" ADD VALUE 'thread';--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "thread_starter_id" bigint;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "message_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_thread_starter_id_unique" UNIQUE("thread_starter_id");