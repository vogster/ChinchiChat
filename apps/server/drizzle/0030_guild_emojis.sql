CREATE TABLE "guild_emojis" (
	"id" bigint PRIMARY KEY NOT NULL,
	"guild_id" bigint NOT NULL,
	"name" varchar(32) NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_emojis" ADD CONSTRAINT "guild_emojis_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_emojis" ADD CONSTRAINT "guild_emojis_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guild_emojis_guild_name_idx" ON "guild_emojis" USING btree ("guild_id",lower("name"));--> statement-breakpoint
CREATE INDEX "guild_emojis_guild_idx" ON "guild_emojis" USING btree ("guild_id");