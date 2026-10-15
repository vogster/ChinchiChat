CREATE TABLE "pending_timeouts" (
	"guild_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"until" timestamp with time zone NOT NULL,
	CONSTRAINT "pending_timeouts_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "pending_timeouts" ADD CONSTRAINT "pending_timeouts_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_timeouts" ADD CONSTRAINT "pending_timeouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;