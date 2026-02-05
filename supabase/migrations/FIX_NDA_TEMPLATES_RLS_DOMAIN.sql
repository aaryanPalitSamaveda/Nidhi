-- Fix NDA templates RLS to support domain-based role inheritance
-- Domain users (like xyz@larsentoubro.com) don't have explicit user_roles entry
-- They inherit role through get_user_role_for_vault function

-- Drop existing NDA template policies
DROP POLICY IF EXISTS "Sellers can view seller NDA templates" ON public.nda_templates;
DROP POLICY IF EXISTS "Investors can view investor NDA templates" ON public.nda_templates;

-- Sellers can view seller NDA templates (with domain inheritance)
CREATE POLICY "Sellers can view seller NDA templates"
  ON public.nda_templates
  FOR SELECT
  USING (
    role_type = 'seller'
    AND public.has_vault_access(auth.uid(), vault_id)
    AND public.get_user_role_for_vault(auth.uid(), vault_id) = 'seller'
  );

-- Investors can view investor NDA templates (with domain inheritance)
CREATE POLICY "Investors can view investor NDA templates"
  ON public.nda_templates
  FOR SELECT
  USING (
    role_type = 'investor'
    AND public.has_vault_access(auth.uid(), vault_id)
    AND public.get_user_role_for_vault(auth.uid(), vault_id) = 'investor'
  );

-- Admins can view all NDA templates
CREATE POLICY "Admins can view all NDA templates"
  ON public.nda_templates
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Update NDA signatures policies to support domain inheritance
DROP POLICY IF EXISTS "Sellers can view and create their signatures" ON public.nda_signatures;
DROP POLICY IF EXISTS "Investors can view and create their signatures" ON public.nda_signatures;

-- Sellers can view and create their signatures (with domain inheritance)
CREATE POLICY "Sellers can view and create their signatures"
  ON public.nda_signatures
  FOR ALL
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.nda_templates nt
      WHERE nt.id = template_id
        AND nt.role_type = 'seller'
        AND public.get_user_role_for_vault(auth.uid(), nt.vault_id) = 'seller'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.nda_templates nt
      WHERE nt.id = template_id
        AND nt.role_type = 'seller'
        AND public.get_user_role_for_vault(auth.uid(), nt.vault_id) = 'seller'
    )
  );

-- Investors can view and create their signatures (with domain inheritance)
CREATE POLICY "Investors can view and create their signatures"
  ON public.nda_signatures
  FOR ALL
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.nda_templates nt
      WHERE nt.id = template_id
        AND nt.role_type = 'investor'
        AND public.get_user_role_for_vault(auth.uid(), nt.vault_id) = 'investor'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.nda_templates nt
      WHERE nt.id = template_id
        AND nt.role_type = 'investor'
        AND public.get_user_role_for_vault(auth.uid(), nt.vault_id) = 'investor'
    )
  );

