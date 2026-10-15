ALTER TABLE "users" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bot_owner_id" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bot_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_bot_owner_id_users_id_fk" FOREIGN KEY ("bot_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;