-- Add domain-based access to datarooms
-- If a user with a specific email domain (e.g., @larsentoubro.com) has access to a vault,
-- then ALL users with the same email domain automatically get access

-- Helper function to extract email domain
CREATE OR REPLACE FUNCTION public.get_email_domain(email_address TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LOWER(SPLIT_PART(email_address, '@', 2))
$$;

-- Update has_vault_access function to include domain-based access
CREATE OR REPLACE FUNCTION public.has_vault_access(_user_id UUID, _vault_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  user_email TEXT;
  user_domain TEXT;
BEGIN
  -- Check admin role first (fastest check)
  IF public.has_role(_user_id, 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Check direct vault assignment (client_id or created_by)
  IF EXISTS (
    SELECT 1
    FROM public.vaults
    WHERE id = _vault_id
      AND (client_id = _user_id OR created_by = _user_id)
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check direct permissions
  IF EXISTS (
    SELECT 1
    FROM public.vault_permissions
    WHERE user_id = _user_id
      AND vault_id = _vault_id
      AND can_view = true
  ) THEN
    RETURN TRUE;
  END IF;

  -- Check domain-based access
  -- Get user's email domain
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = _user_id;

  IF user_email IS NULL THEN
    RETURN FALSE;
  END IF;

  user_domain := public.get_email_domain(user_email);

  -- Check if any user with the same domain has access to this vault
  IF EXISTS (
    SELECT 1
    FROM public.vault_permissions vp
    JOIN auth.users au ON au.id = vp.user_id
    WHERE vp.vault_id = _vault_id
      AND vp.can_view = true
      AND public.get_email_domain(au.email) = user_domain
  ) THEN
    RETURN TRUE;
  END IF;

  -- Also check if vault client has the same domain
  IF EXISTS (
    SELECT 1
    FROM public.vaults v
    JOIN auth.users au ON au.id = v.client_id
    WHERE v.id = _vault_id
      AND public.get_email_domain(au.email) = user_domain
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.has_vault_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_domain(TEXT) TO authenticated;

