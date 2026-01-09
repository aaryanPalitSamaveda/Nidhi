-- Update role system to use Admin, Seller, Investor instead of Admin, Client
-- This migration updates the enum and migrates existing data
-- NOTE: ALTER TYPE ADD VALUE commits immediately, so each one is its own transaction

-- 1. Add 'seller' to enum (if it doesn't already exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'seller' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE app_role ADD VALUE 'seller';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If it already exists, ignore the error
  NULL;
END $$;

-- 2. Add 'investor' to enum (if it doesn't already exist)
-- This runs in a separate transaction after 'seller' is committed
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'investor' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE app_role ADD VALUE 'investor';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If it already exists, ignore the error
  NULL;
END $$;

-- 3. Now we can safely update defaults and migrate data
-- (The enum values are committed from steps 1 and 2)

-- Update default role for user_roles table
ALTER TABLE public.user_roles 
ALTER COLUMN role SET DEFAULT 'investor'::app_role;

-- Migrate existing 'client' roles to 'investor'
-- This will only update rows where role = 'client'
UPDATE public.user_roles 
SET role = 'investor'::app_role 
WHERE role = 'client'::app_role;

-- 3. Remove client_type column from profiles (no longer needed)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS client_type;

-- 4. Update RLS policies that check for client_type to check for role instead
-- Update NDA template policies
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

-- Update NDA signature policies
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

