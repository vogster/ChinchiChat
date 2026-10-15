CREATE TYPE "public"."dm_policy" AS ENUM('servers', 'friends');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dm_policy" "dm_policy" DEFAULT 'servers' NOT NULL;