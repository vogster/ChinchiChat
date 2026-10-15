CREATE TABLE "bot_commands" (
	"id" bigint PRIMARY KEY NOT NULL,
	"bot_id" bigint NOT NULL,
	"name" varchar(32) NOT NULL,
	"description" varchar(100) NOT NULL,
	"options" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"bot_id" bigint NOT NULL,
	"command_name" varchar(32) NOT NULL,
	"guild_id" bigint NOT NULL,
	"channel_id" bigint NOT NULL,
	"user_id" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "interaction_name" varchar(32);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "interaction_user_id" bigint;--> statement-breakpoint
ALTER TABLE "bot_commands" ADD CONSTRAINT "bot_commands_bot_id_users_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_bot_id_users_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bot_commands_bot_name_idx" ON "bot_commands" USING btree ("bot_id","name");--> statement-breakpoint
CREATE INDEX "interactions_expires_idx" ON "interactions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_interaction_user_id_users_id_fk" FOREIGN KEY ("interaction_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;