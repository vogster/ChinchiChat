CREATE TYPE "public"."registration_mode" AS ENUM('open', 'invite', 'closed');--> statement-breakpoint
CREATE TABLE "instance_invites" (
	"code" varchar(32) PRIMARY KEY NOT NULL,
	"created_by" bigint,
	"uses" integer DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"registration_mode" "registration_mode",
	"max_guilds_per_user" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_invites" ADD CONSTRAINT "instance_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Existing instances: the earliest account runs the instance, as a new one would.
UPDATE "users" SET "is_admin" = true WHERE "id" = (SELECT min("id") FROM "users");
