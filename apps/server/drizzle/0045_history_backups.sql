CREATE TABLE "e2ee_backup_entries" (
	"user_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"channel_id" bigint NOT NULL,
	"payload" text NOT NULL,
	CONSTRAINT "e2ee_backup_entries_user_id_message_id_pk" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "e2ee_key_backups" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"user_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "e2ee_backup_entries" ADD CONSTRAINT "e2ee_backup_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e2ee_backup_entries" ADD CONSTRAINT "e2ee_backup_entries_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e2ee_key_backups" ADD CONSTRAINT "e2ee_key_backups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "e2ee_backup_entries_channel_idx" ON "e2ee_backup_entries" USING btree ("user_id","channel_id","message_id");