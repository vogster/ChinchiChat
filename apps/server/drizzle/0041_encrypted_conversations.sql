CREATE TYPE "public"."e2ee_handshake_kind" AS ENUM('commit', 'welcome');--> statement-breakpoint
CREATE TABLE "e2ee_devices" (
	"id" bigint PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"name" varchar(64) NOT NULL,
	"signature_public_key" varchar(44) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "e2ee_groups" (
	"channel_id" bigint PRIMARY KEY NOT NULL,
	"epoch" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "e2ee_handshakes" (
	"id" bigint PRIMARY KEY NOT NULL,
	"channel_id" bigint NOT NULL,
	"kind" "e2ee_handshake_kind" NOT NULL,
	"epoch" bigint NOT NULL,
	"sender_device_id" bigint NOT NULL,
	"target_device_id" bigint,
	"key_package_id" bigint,
	"payload" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "e2ee_key_packages" (
	"id" bigint PRIMARY KEY NOT NULL,
	"device_id" bigint NOT NULL,
	"package" text NOT NULL,
	"last_resort" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "encrypted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ciphertext" text;--> statement-breakpoint
ALTER TABLE "e2ee_devices" ADD CONSTRAINT "e2ee_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e2ee_groups" ADD CONSTRAINT "e2ee_groups_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e2ee_handshakes" ADD CONSTRAINT "e2ee_handshakes_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e2ee_key_packages" ADD CONSTRAINT "e2ee_key_packages_device_id_e2ee_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."e2ee_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "e2ee_devices_user_id_idx" ON "e2ee_devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "e2ee_devices_signature_key_idx" ON "e2ee_devices" USING btree ("signature_public_key");--> statement-breakpoint
CREATE INDEX "e2ee_handshakes_channel_id_idx" ON "e2ee_handshakes" USING btree ("channel_id","id");--> statement-breakpoint
CREATE INDEX "e2ee_key_packages_device_id_idx" ON "e2ee_key_packages" USING btree ("device_id","last_resort");