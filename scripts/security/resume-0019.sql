-- Re-enable the signed boundary after an emergency rollback; no journal manipulation.
BEGIN;
DO $$ DECLARE t record; BEGIN
FOR t IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='group_isolation' LOOP
EXECUTE format('ALTER POLICY group_isolation ON public.%I USING(group_id=(SELECT bandarlog_api.current_group())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()))',t.tablename);
EXECUTE format('ALTER TABLE public.%I ALTER COLUMN group_id SET DEFAULT nullif(current_setting(''bandarlog.group_id'',true),'''')',t.tablename);
END LOOP;
END $$;
COMMIT;
