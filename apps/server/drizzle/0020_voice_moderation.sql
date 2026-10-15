ALTER TABLE "guild_members" ADD COLUMN "voice_mute" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_members" ADD COLUMN "voice_deaf" boolean DEFAULT false NOT NULL;