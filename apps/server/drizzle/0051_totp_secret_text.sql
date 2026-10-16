ALTER TABLE "users" ALTER COLUMN "totp_secret" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "totp_pending_secret" SET DATA TYPE text;