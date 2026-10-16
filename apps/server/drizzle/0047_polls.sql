CREATE TABLE "poll_answers" (
	"message_id" bigint NOT NULL,
	"answer_id" smallint NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "poll_answers_message_id_answer_id_pk" PRIMARY KEY("message_id","answer_id")
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"message_id" bigint NOT NULL,
	"answer_id" smallint NOT NULL,
	"user_id" bigint NOT NULL,
	CONSTRAINT "poll_votes_message_id_user_id_answer_id_pk" PRIMARY KEY("message_id","user_id","answer_id")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"message_id" bigint PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"multiple" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_message_id_polls_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."polls"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_message_id_polls_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."polls"("message_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;