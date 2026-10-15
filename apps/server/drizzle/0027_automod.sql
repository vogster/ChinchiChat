ALTER TYPE "public"."audit_log_action" ADD VALUE 'automod_update';--> statement-breakpoint
ALTER TYPE "public"."audit_log_action" ADD VALUE 'automod_block';--> statement-breakpoint
CREATE TABLE "guild_automod" (
	"guild_id" bigint PRIMARY KEY NOT NULL,
	"blocked_words" text[] DEFAULT '{}' NOT NULL,
	"anti_spam" boolean DEFAULT false NOT NULL,
	"max_mentions" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_automod" ADD CONSTRAINT "guild_automod_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;