-- Fix: Clients (vault client_id or role=client) not seeing/signing NDA
-- Root cause: get_user_role_for_vault only used user_roles; vault client_id and viewers
-- with role 'client' never got seller/investor, so NDA overlay never showed.
--
-- Run in Supabase SQL Editor if not using migrations.

CREATE OR REPLACE FUNCTION public.get_user_role_for_vault(
  p_user_id UUID,
  p_vault_id UUID
) RETURNS app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role app_role;
  v_user_email TEXT;
  v_user_domain TEXT;
BEGIN
  -- 1. Vault-specific: If user is client_id of this vault, they are the "seller" (company sharing)
  IF EXISTS (
    SELECT 1 FROM public.vaults
    WHERE id = p_vault_id AND client_id = p_user_id
  ) THEN
    RETURN 'seller'::app_role;
  END IF;

  -- 2. Vault-specific: If user has vault_permissions (viewer), they are "investor"
  --    Use this before user_roles so explicit vault access gets correct NDA type
  IF EXISTS (
    SELECT 1 FROM public.vault_permissions
    WHERE vault_id = p_vault_id AND user_id = p_user_id AND can_view = true
  ) THEN
    -- Check user_roles for this viewer - if they have seller/investor, use it
    SELECT ur.role INTO v_role
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role IN ('seller'::app_role, 'investor'::app_role)
    LIMIT 1;
    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;
    -- Default viewer to investor
    RETURN 'investor'::app_role;
  END IF;

  -- 3. User has explicit role in user_roles
  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    -- Map 'client' to 'investor' for NDA purposes (clients viewing datarooms need investor NDA)
    IF v_role = 'client'::app_role THEN
      RETURN 'investor'::app_role;
    END IF;
    RETURN v_role;
  END IF;

  -- 4. Domain-based: find role of any user with same domain who has vault access
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN NULL;
  END IF;

  v_user_domain := public.get_email_domain(v_user_email);

  -- Same domain + vault_permissions
  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  JOIN public.vault_permissions vp ON vp.user_id = ur.user_id
  WHERE public.get_email_domain(au.email) = v_user_domain
    AND vp.vault_id = p_vault_id
    AND vp.can_view = true
  ORDER BY ur.created_at DESC
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    IF v_role = 'client'::app_role THEN
      RETURN 'investor'::app_role;
    END IF;
    RETURN v_role;
  END IF;

  -- Same domain + vault client
  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  JOIN public.vaults v ON v.client_id = au.id
  WHERE public.get_email_domain(au.email) = v_user_domain
    AND v.id = p_vault_id
  ORDER BY ur.created_at DESC
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    IF v_role = 'client'::app_role THEN
      RETURN 'seller'::app_role;  -- Domain mate is vault client → seller
    END IF;
    RETURN v_role;
  END IF;

  -- Domain-based access but no role found - default to investor for viewers
  IF EXISTS (
    SELECT 1 FROM public.vault_permissions vp
    JOIN auth.users au ON au.id = vp.user_id
    WHERE vp.vault_id = p_vault_id
      AND vp.can_view = true
      AND public.get_email_domain(au.email) = v_user_domain
  ) THEN
    RETURN 'investor'::app_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vaults v
    JOIN auth.users au ON au.id = v.client_id
    WHERE v.id = p_vault_id
      AND public.get_email_domain(au.email) = v_user_domain
  ) THEN
    RETURN 'seller'::app_role;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_role_for_vault(UUID, UUID) TO authenticated;
