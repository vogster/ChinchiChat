CREATE TABLE "e2ee_user_keys" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"public_key" varchar(44) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "e2ee_devices" ADD COLUMN "user_signature" varchar(88);--> statement-breakpoint
ALTER TABLE "e2ee_user_keys" ADD CONSTRAINT "e2ee_user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;