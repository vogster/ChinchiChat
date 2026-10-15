ALTER TABLE "channels" ADD COLUMN "announcement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "source_channel_id" bigint;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_source_channel_id_channels_id_fk" FOREIGN KEY ("source_channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhooks_source_channel_idx" ON "webhooks" USING btree ("source_channel_id");