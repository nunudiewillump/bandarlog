ALTER TABLE "notifications" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "platform_mail" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_mail" ADD COLUMN "provider_message_id" text;