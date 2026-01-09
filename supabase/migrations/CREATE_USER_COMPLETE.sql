-- Complete user creation function that handles everything
-- This function is called AFTER signUp() creates the user in auth.users
-- Client should wait 3-4 seconds before calling this to ensure user is committed
-- It updates profile, assigns role, and confirms email

CREATE OR REPLACE FUNCTION public.complete_user_setup(
  user_id_to_setup UUID,
  user_email TEXT,
  user_full_name TEXT DEFAULT NULL,
  user_company_name TEXT DEFAULT NULL,
  user_phone TEXT DEFAULT NULL,
  user_role app_role DEFAULT 'investor'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result JSON;
  profile_updated BOOLEAN := false;
  role_assigned BOOLEAN := false;
  email_confirmed BOOLEAN := false;
BEGIN
  -- Check if the caller is an admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can complete user setup';
  END IF;

  -- Don't check if user exists - we just created it, it will exist
  -- The function will handle any timing issues with the INSERT/UPDATE operations

  -- 1. Upsert profile (handle case where trigger already created it)
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, company_name, phone)
    VALUES (user_id_to_setup, user_email, user_full_name, user_company_name, user_phone)
    ON CONFLICT (id) DO UPDATE
    SET
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
      company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      updated_at = NOW();
    profile_updated := true;
  EXCEPTION WHEN OTHERS THEN
    profile_updated := false;
    -- Store error details
    result := json_build_object('error', SQLERRM, 'step', 'profile', 'error_code', SQLSTATE);
  END;

  -- 2. Assign role
  BEGIN
    DELETE FROM public.user_roles WHERE user_id = user_id_to_setup;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_id_to_setup, user_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    role_assigned := true;
  EXCEPTION WHEN OTHERS THEN
    role_assigned := false;
    -- Store error details
    IF result IS NULL THEN
      result := json_build_object('error', SQLERRM, 'step', 'role', 'error_code', SQLSTATE);
    END IF;
  END;

  -- 3. Confirm email
  BEGIN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = user_id_to_setup;
    email_confirmed := true;
  EXCEPTION WHEN OTHERS THEN
    email_confirmed := false;
  END;

  -- Return result (include error details if any step failed)
  RETURN json_build_object(
    'success', profile_updated AND role_assigned,
    'profile_updated', profile_updated,
    'role_assigned', role_assigned,
    'email_confirmed', email_confirmed,
    'error', CASE WHEN result IS NOT NULL THEN result->>'error' ELSE NULL END,
    'error_step', CASE WHEN result IS NOT NULL THEN result->>'step' ELSE NULL END
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.complete_user_setup(UUID, TEXT, TEXT, TEXT, TEXT, app_role) TO authenticated;

