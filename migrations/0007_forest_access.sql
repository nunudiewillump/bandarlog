ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users" SET "onboarding_completed_at" = now();
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "renewed_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "absolute_expires_at" timestamp with time zone DEFAULT (now() + interval '90 days') NOT NULL;
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
 "email" text PRIMARY KEY NOT NULL,
 "id" text NOT NULL,
 "verifier" text NOT NULL,
 "expires" timestamp with time zone NOT NULL,
 "attempts" integer DEFAULT 0 NOT NULL,
 "requested_at" timestamp with time zone NOT NULL,
 "window_started_at" timestamp with time zone NOT NULL,
 "requests" integer DEFAULT 0 NOT NULL,
 "consumed_at" timestamp with time zone,
 "google_link_id" text,
 CONSTRAINT "auth_challenges_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "google_identities" (
 "subject" text PRIMARY KEY NOT NULL,
 "user_id" text NOT NULL CONSTRAINT "google_identities_user_id_users_id_fk" REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE TABLE "google_states" (
 "id" text PRIMARY KEY NOT NULL,
 "browser" text NOT NULL,
 "nonce" text NOT NULL,
 "verifier" text NOT NULL,
 "expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_links" (
 "id" text PRIMARY KEY NOT NULL,
 "subject" text NOT NULL,
 "email" text NOT NULL,
 "expires" timestamp with time zone NOT NULL
);
