-- Function to create a user with profile and role (admin-only)
-- This function handles the entire user creation process in a single transaction
-- to avoid foreign key constraint timing issues

CREATE OR REPLACE FUNCTION public.create_user_with_role(
  user_email TEXT,
  user_password TEXT,
  user_full_name TEXT DEFAULT NULL,
  user_company_name TEXT DEFAULT NULL,
  user_phone TEXT DEFAULT NULL,
  user_role app_role DEFAULT 'investor'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Check if the caller is an admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can create users';
  END IF;

  -- Create user in auth.users using admin API
  -- Note: We cannot directly insert into auth.users from a function
  -- This function will be called AFTER the user is created via signUp
  -- It will handle profile creation and role assignment
  
  -- For now, this is a placeholder - we'll still use signUp client-side
  -- but this function ensures proper ordering of operations
  RAISE EXCEPTION 'This function should not be called directly. Use the client signUp flow.';
END;
$$;

-- Instead, let's create a helper function that ensures the profile and role are set correctly
-- This can be called after signUp completes
-- Note: Client should wait 2-3 seconds after signUp before calling this function
CREATE OR REPLACE FUNCTION public.setup_new_user_profile(
  user_id_to_setup UUID,
  user_full_name TEXT DEFAULT NULL,
  user_company_name TEXT DEFAULT NULL,
  user_phone TEXT DEFAULT NULL,
  user_role app_role DEFAULT 'investor'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if the caller is an admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can set up user profiles';
  END IF;

  -- Check if user exists (client should wait before calling this)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = user_id_to_setup) THEN
    RAISE EXCEPTION 'User does not exist in auth.users. Please wait a moment and try again.';
  END IF;

  -- Upsert profile
  INSERT INTO public.profiles (id, email, full_name, company_name, phone)
  SELECT 
    user_id_to_setup,
    email,
    COALESCE(user_full_name, full_name, ''),
    COALESCE(user_company_name, company_name, NULL),
    COALESCE(user_phone, phone, NULL)
  FROM auth.users
  WHERE id = user_id_to_setup
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    updated_at = NOW();

  -- Delete existing roles for this user
  DELETE FROM public.user_roles WHERE user_id = user_id_to_setup;

  -- Insert new role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (user_id_to_setup, user_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Confirm email
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = user_id_to_setup;

  RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users (RLS ensures only admins can use it)
GRANT EXECUTE ON FUNCTION public.setup_new_user_profile(UUID, TEXT, TEXT, TEXT, app_role) TO authenticated;

