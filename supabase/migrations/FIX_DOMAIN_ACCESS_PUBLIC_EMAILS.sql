-- Fix: Disable domain-based access for public email domains (gmail.com, yahoo.com, etc.)
-- This prevents users like pareekbhagu@gmail.com from seeing vaults just because
-- another @gmail.com user has access. Domain-based access remains for corporate domains.
--
-- Public domains excluded: gmail.com, googlemail.com, yahoo.com, outlook.com, hotmail.com,
-- live.com, icloud.com, aol.com, protonmail.com, mail.com, zoho.com, yandex.com

CREATE OR REPLACE FUNCTION public.is_public_email_domain(domain_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT domain_text IN (
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
    'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.co.in',
    'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com',
    'proton.me', 'mail.com', 'zoho.com', 'yandex.com', 'rediffmail.com',
    'outlook.in', 'msn.com', 'ymail.com'
  );
$$;

-- Update has_vault_access: skip domain-based check for public email domains
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

  -- Check direct permissions (explicit vault_permissions)
  IF EXISTS (
    SELECT 1
    FROM public.vault_permissions
    WHERE user_id = _user_id
      AND vault_id = _vault_id
      AND can_view = true
  ) THEN
    RETURN TRUE;
  END IF;

  -- Domain-based access: ONLY for corporate domains (not gmail, yahoo, etc.)
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = _user_id;

  IF user_email IS NULL THEN
    RETURN FALSE;
  END IF;

  user_domain := public.get_email_domain(user_email);

  -- Skip domain-based access for public email providers
  IF public.is_public_email_domain(user_domain) THEN
    RETURN FALSE;
  END IF;

  -- Check if any user with the same corporate domain has access
  IF EXISTS (
    SELECT 1
    FROM public.vault_permissions vp
    JOIN auth.users au ON au.id = vp.user_id
    WHERE vp.vault_id = _vault_id
      AND vp.can_view = true
      AND public.get_email_domain(au.email) = user_domain
      AND NOT public.is_public_email_domain(public.get_email_domain(au.email))
  ) THEN
    RETURN TRUE;
  END IF;

  -- Also check if vault client has the same corporate domain
  IF EXISTS (
    SELECT 1
    FROM public.vaults v
    JOIN auth.users au ON au.id = v.client_id
    WHERE v.id = _vault_id
      AND v.client_id IS NOT NULL
      AND public.get_email_domain(au.email) = user_domain
      AND NOT public.is_public_email_domain(public.get_email_domain(au.email))
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_public_email_domain(TEXT) TO authenticated;
