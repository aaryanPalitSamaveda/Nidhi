-- Add NDA functionality for Sellers
-- This migration adds NDA signing workflow for sellers
-- Note: Roles are handled in UPDATE_ROLES_TO_SELLER_INVESTOR.sql

-- 3. Create NDA templates table (one template per dataroom)
CREATE TABLE IF NOT EXISTS public.nda_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, -- Path to the NDA template document in storage
  file_name TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(vault_id) -- One template per dataroom
);

-- 4. Create NDA signatures table (one signature per seller per dataroom)
CREATE TABLE IF NOT EXISTS public.nda_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.nda_templates(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('signed', 'declined')),
  signature_name TEXT NOT NULL, -- Name in handwriting font
  signature_company TEXT NOT NULL, -- Company name in normal font
  signed_document_path TEXT, -- Path to the signed NDA document (if signed)
  signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(vault_id, user_id) -- One signature per seller per dataroom
);

-- 5. Enable RLS on new tables
ALTER TABLE public.nda_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nda_signatures ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for nda_templates
-- Admins and vault creators can view/manage templates
CREATE POLICY "Admins can manage NDA templates"
  ON public.nda_templates
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Vault creators can manage NDA templates"
  ON public.nda_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = vault_id AND v.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = vault_id AND v.created_by = auth.uid()
    )
  );

-- Sellers can view templates for datarooms they have access to
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

-- 7. RLS Policies for nda_signatures
-- Admins can view all signatures
CREATE POLICY "Admins can view all NDA signatures"
  ON public.nda_signatures
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Vault creators can view signatures for their datarooms
CREATE POLICY "Vault creators can view NDA signatures"
  ON public.nda_signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vaults v
      WHERE v.id = vault_id AND v.created_by = auth.uid()
    )
  );

-- Sellers can view and create their own signatures
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

-- 8. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_nda_templates_vault_id ON public.nda_templates(vault_id);
CREATE INDEX IF NOT EXISTS idx_nda_signatures_vault_id ON public.nda_signatures(vault_id);
CREATE INDEX IF NOT EXISTS idx_nda_signatures_user_id ON public.nda_signatures(user_id);

