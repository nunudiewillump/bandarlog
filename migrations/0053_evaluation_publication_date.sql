ALTER TABLE public.group_evaluations ADD COLUMN published_at timestamptz;
--> statement-breakpoint
ALTER TABLE public.group_evaluations ALTER COLUMN published_at SET DEFAULT clock_timestamp();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 53 $$;
