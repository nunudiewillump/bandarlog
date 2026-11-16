-- Historical project references did not previously have a foreign key. NOT VALID
-- preserves existing data while enforcing the composite boundary on new writes.
-- Maintenance must report and review any historical orphans before VALIDATE.
ALTER TABLE public.projects ADD CONSTRAINT projects_parent_group_fk
 FOREIGN KEY(group_id,parent_id) REFERENCES public.projects(group_id,id) NOT VALID;
