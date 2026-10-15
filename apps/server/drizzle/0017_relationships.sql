CREATE TYPE "public"."relationship_type" AS ENUM('friend', 'pending_out', 'pending_in', 'blocked');--> statement-breakpoint
CREATE TABLE "relationships" (
	"user_id" bigint NOT NULL,
	"target_id" bigint NOT NULL,
	"type" "relationship_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationships_user_id_target_id_pk" PRIMARY KEY("user_id","target_id")
);
--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relationships_target_id_idx" ON "relationships" USING btree ("target_id");