ALTER TABLE public.group_evaluation_assignments
  ADD COLUMN section_ids text[]
  CHECK (section_ids IS NULL OR cardinality(section_ids) BETWEEN 1 AND 12);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 55 $$;
