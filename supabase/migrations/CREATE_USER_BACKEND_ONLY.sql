-- Create user profile setup function for instant setup after Admin API user creation
-- This function is called AFTER the user is created via Admin API
-- Since Admin API creates users synchronously, there's no timing issue

-- Actually, let me create a better solution:
-- A function that the frontend can call AFTER using Admin API to create user
-- This will be instant since user already exists

CREATE OR REPLACE FUNCTION public.setup_user_profile_instant(
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
  profile_created BOOLEAN := false;
  role_assigned BOOLEAN := false;
  admin_check BOOLEAN;
  retry_count INTEGER := 0;
  max_retries INTEGER := 10; -- Increased retries for foreign key constraint
  user_exists BOOLEAN := false;
BEGIN
  -- Check if the caller is an admin
  SELECT public.has_role(auth.uid(), 'admin') INTO admin_check;
  IF NOT admin_check THEN
    RAISE EXCEPTION 'Only admins can setup user profiles';
  END IF;

  -- Wait for user to be visible in auth.users (backend handles the delay)
  -- Retry up to 10 times with increasing delays
  WHILE retry_count < max_retries AND NOT user_exists LOOP
    BEGIN
      -- Check if user exists in auth.users
      SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = user_id_to_setup) INTO user_exists;
      
      IF NOT user_exists THEN
        retry_count := retry_count + 1;
        IF retry_count < max_retries THEN
          -- Exponential backoff: 100ms, 200ms, 400ms, etc. (max 5 seconds total)
          PERFORM pg_sleep(LEAST(0.1 * POWER(2, retry_count - 1), 1.0));
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      retry_count := retry_count + 1;
      IF retry_count < max_retries THEN
        PERFORM pg_sleep(LEAST(0.1 * POWER(2, retry_count - 1), 1.0));
      END IF;
    END;
  END LOOP;

  -- If user still doesn't exist after retries, return error
  IF NOT user_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User does not exist in auth.users after retries. Please try again.',
      'error_step', 'user_verification'
    );
  END IF;

  -- 1. Create/update profile with retry logic for foreign key constraint
  retry_count := 0;
  WHILE retry_count < max_retries AND NOT profile_created LOOP
    BEGIN
      INSERT INTO public.profiles (id, email, full_name, company_name, phone)
      VALUES (user_id_to_setup, user_email, user_full_name, user_company_name, user_phone)
      ON CONFLICT (id) DO UPDATE
      SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
        phone = COALESCE(EXCLUDED.phone, profiles.phone),
        updated_at = NOW();
      profile_created := true;
    EXCEPTION WHEN OTHERS THEN
      -- Check if it's a foreign key constraint violation (error code 23503)
      IF SQLSTATE = '23503' THEN
        -- Foreign key constraint violation - user might not be fully committed yet
        retry_count := retry_count + 1;
        IF retry_count < max_retries THEN
          PERFORM pg_sleep(LEAST(0.1 * POWER(2, retry_count - 1), 1.0));
        END IF;
      ELSE
        -- Non-foreign key error, exit loop and raise
        RAISE;
      END IF;
    END;
  END LOOP;

  -- 2. Assign role (this should always work since user exists now)
  BEGIN
    DELETE FROM public.user_roles WHERE user_id = user_id_to_setup;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_id_to_setup, user_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    role_assigned := true;
  EXCEPTION WHEN OTHERS THEN
    role_assigned := false;
  END;

  -- Return result
  IF profile_created AND role_assigned THEN
    RETURN json_build_object(
      'success', true,
      'profile_created', profile_created,
      'role_assigned', role_assigned,
      'user_id', user_id_to_setup
    );
  ELSE
    RETURN json_build_object(
      'success', false,
      'profile_created', profile_created,
      'role_assigned', role_assigned,
      'error', CASE 
        WHEN NOT profile_created THEN 'Failed to create profile after retries'
        WHEN NOT role_assigned THEN 'Failed to assign role'
        ELSE 'Unknown error'
      END
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_user_profile_instant(UUID, TEXT, TEXT, TEXT, TEXT, app_role) TO authenticated;

