-- Add role_type to nda_templates to support separate templates for Seller and Investor
-- This allows one template per role per vault

-- Add role_type column
ALTER TABLE public.nda_templates
ADD COLUMN IF NOT EXISTS role_type app_role NOT NULL DEFAULT 'seller';

-- Update unique constraint to allow one template per role per vault
ALTER TABLE public.nda_templates
DROP CONSTRAINT IF EXISTS nda_templates_vault_id_key;

-- Create new unique constraint: one template per vault per role
ALTER TABLE public.nda_templates
ADD CONSTRAINT nda_templates_vault_id_role_type_key UNIQUE (vault_id, role_type);

-- Update RLS policies to support both seller and investor
DROP POLICY IF EXISTS "Sellers can view NDA templates" ON public.nda_templates;

-- Sellers can view seller NDA templates
CREATE POLICY "Sellers can view seller NDA templates"
  ON public.nda_templates
  FOR SELECT
  USING (
    role_type = 'seller'
    AND EXISTS (
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

-- Investors can view investor NDA templates
CREATE POLICY "Investors can view investor NDA templates"
  ON public.nda_templates
  FOR SELECT
  USING (
    role_type = 'investor'
    AND EXISTS (
      SELECT 1 
      FROM public.vaults v
      JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'investor'
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

-- Update NDA signatures to support both roles
DROP POLICY IF EXISTS "Sellers can view and create their signatures" ON public.nda_signatures;

-- Sellers can view and create their signatures
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

-- Investors can view and create their signatures
CREATE POLICY "Investors can view and create their signatures"
  ON public.nda_signatures
  FOR ALL
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'investor'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'investor'
    )
  );

