-- STEP 2: Update defaults and migrate data
-- Run this AFTER UPDATE_ROLES_TO_SELLER_INVESTOR_STEP1.sql
-- This step can be run in the same session as STEP 1, but must be after STEP 1 completes

-- Update default role for user_roles table
ALTER TABLE public.user_roles 
ALTER COLUMN role SET DEFAULT 'investor'::app_role;

-- Migrate existing 'client' roles to 'investor'
UPDATE public.user_roles 
SET role = 'investor'::app_role 
WHERE role = 'client'::app_role;

-- Remove client_type column from profiles (no longer needed)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS client_type;

-- Update RLS policies that check for client_type to check for role instead
-- Update NDA template policies (only if NDA tables exist)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nda_templates') THEN
    DROP POLICY IF EXISTS "Sellers can view NDA templates" ON public.nda_templates;
    
    CREATE POLICY "Sellers can view NDA templates"
      ON public.nda_templates
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 
          FROM public.vaults v
          JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'seller'
          WHERE v.id = vault_id
            AND (
              v.client_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.vault_permissions vp
                WHERE vp.vault_id = v.id
                  AND vp.user_id = auth.uid()
                  AND vp.can_view = true
              )
            )
        )
      );
  END IF;
END $$;

-- Update NDA signature policies (only if NDA tables exist)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nda_signatures') THEN
    DROP POLICY IF EXISTS "Sellers can view and create their signatures" ON public.nda_signatures;
    
    CREATE POLICY "Sellers can view and create their signatures"
      ON public.nda_signatures
      FOR ALL
      USING (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role = 'seller'
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role = 'seller'
        )
      );
  END IF;
END $$;


