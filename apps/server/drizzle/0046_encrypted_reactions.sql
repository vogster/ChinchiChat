CREATE TABLE "encrypted_reactions" (
	"message_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"version" bigint NOT NULL,
	"ciphertext" text NOT NULL,
	CONSTRAINT "encrypted_reactions_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "encrypted_reactions" ADD CONSTRAINT "encrypted_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_reactions" ADD CONSTRAINT "encrypted_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;