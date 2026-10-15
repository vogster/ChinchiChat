ALTER TABLE "channels" ADD COLUMN "rate_limit_per_user" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "nsfw" boolean DEFAULT false NOT NULL;