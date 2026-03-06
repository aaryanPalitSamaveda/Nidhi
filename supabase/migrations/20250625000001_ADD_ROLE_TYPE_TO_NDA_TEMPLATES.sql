-- Add role_type to nda_templates (fixes 400 on select id,role_type)
-- Run in Supabase SQL Editor if nda_templates exists without role_type

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nda_templates' AND column_name = 'role_type'
  ) THEN
    ALTER TABLE public.nda_templates
    ADD COLUMN role_type public.app_role NOT NULL DEFAULT 'seller';
  END IF;
END $$;

-- Update unique constraint: one template per vault per role
ALTER TABLE public.nda_templates DROP CONSTRAINT IF EXISTS nda_templates_vault_id_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nda_templates_vault_id_role_type_key') THEN
    ALTER TABLE public.nda_templates ADD CONSTRAINT nda_templates_vault_id_role_type_key UNIQUE (vault_id, role_type);
  END IF;
END $$;
