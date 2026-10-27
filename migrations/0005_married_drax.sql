ALTER TABLE "commissions" ADD COLUMN "artwork_key" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "artwork_theme" text DEFAULT 'scout' NOT NULL;
--> statement-breakpoint
UPDATE projects SET artwork_theme='christmas' WHERE lower(name) ~ '(invierno|navidad|christmas)';
