-- Fix user creation foreign key constraint issue
-- This migration fixes the trigger and function to handle timing issues properly

-- 1. Fix the handle_new_user trigger function to use ON CONFLICT
-- This prevents errors if the profile already exists or if there are timing issues
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Use ON CONFLICT to handle cases where profile might already exist
  -- or if there are timing issues with the foreign key constraint
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL)
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If there's still an error (e.g., foreign key constraint), 
  -- log it but don't fail the user creation
  -- The complete_user_setup function will handle creating the profile
  RAISE WARNING 'Could not create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 2. Update complete_user_setup to be more robust
-- Add retry logic and better error handling for foreign key constraints
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
  retry_count INTEGER := 0;
  max_retries INTEGER := 5; -- Increased retries for profile insert
  user_exists BOOLEAN := false;
BEGIN
  -- Check if the caller is an admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can complete user setup';
  END IF;

  -- Try to verify the user exists, but don't fail if we can't see it yet
  -- The user might have just been created and not be visible in this transaction yet
  -- We'll attempt the profile insert anyway - if the user truly doesn't exist,
  -- the foreign key constraint will catch it
  BEGIN
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = user_id_to_setup) INTO user_exists;
  EXCEPTION WHEN OTHERS THEN
    -- If we can't check, assume user exists and proceed
    -- The foreign key constraint will catch it if it doesn't
    user_exists := true;
  END;

  -- 1. Upsert profile (handle case where trigger already created it)
  -- Retry logic for foreign key constraint issues (user might not be visible yet)
  BEGIN
    -- Try to insert/update profile with retries
    WHILE retry_count < max_retries AND NOT profile_updated LOOP
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
        profile_updated := true;
      EXCEPTION WHEN OTHERS THEN
        -- Check if it's a foreign key violation (error code 23503)
        IF SQLSTATE = '23503' THEN
          -- User might not be visible yet, wait and retry
          retry_count := retry_count + 1;
          IF retry_count < max_retries THEN
            PERFORM pg_sleep(1.0); -- Wait 1 second before retrying
          ELSE
            -- Store error details after all retries failed
            profile_updated := false;
            result := json_build_object(
              'error', SQLERRM, 
              'step', 'profile', 
              'error_code', SQLSTATE,
              'error_detail', 'Foreign key constraint violation - user may not be fully committed yet. Please try again in a moment.'
            );
          END IF;
        ELSE
          -- Other errors - store and exit
          profile_updated := false;
          result := json_build_object(
            'error', SQLERRM, 
            'step', 'profile', 
            'error_code', SQLSTATE
          );
          EXIT;
        END IF;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    profile_updated := false;
    -- Store error details
    IF result IS NULL THEN
      result := json_build_object(
        'error', SQLERRM, 
        'step', 'profile', 
        'error_code', SQLSTATE
      );
    END IF;
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
    'error_step', CASE WHEN result IS NOT NULL THEN result->>'step' ELSE NULL END,
    'error_detail', CASE WHEN result IS NOT NULL THEN result->>'error_detail' ELSE NULL END
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.complete_user_setup(UUID, TEXT, TEXT, TEXT, TEXT, app_role) TO authenticated;

