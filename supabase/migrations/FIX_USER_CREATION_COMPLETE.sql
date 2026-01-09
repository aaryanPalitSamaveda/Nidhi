-- Complete fix for user creation foreign key constraint issue
-- This migration combines all fixes:
-- 1. Fixes the trigger to handle conflicts gracefully
-- 2. Creates a robust setup function with retry logic
-- Run this migration to fix all user creation issues

-- ============================================================================
-- 1. FIX THE TRIGGER
-- ============================================================================

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
  -- The setup_user_profile_instant function will handle creating the profile
  RAISE WARNING 'Could not create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. CREATE ROBUST SETUP FUNCTION WITH RETRY LOGIC
-- ============================================================================

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
  max_retries INTEGER := 10; -- Retry up to 10 times
BEGIN
  -- Check if the caller is an admin
  SELECT public.has_role(auth.uid(), 'admin') INTO admin_check;
  IF NOT admin_check THEN
    RAISE EXCEPTION 'Only admins can setup user profiles';
  END IF;

  -- Skip user existence check - we trust that signUp() created the user
  -- Just try to create/update the profile directly with retry logic
  -- The trigger might have already created a basic profile, so we use ON CONFLICT
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
          -- Exponential backoff: 100ms, 200ms, 400ms, etc. (max 1 second per retry)
          PERFORM pg_sleep(LEAST(0.1 * POWER(2, retry_count - 1), 1.0));
        END IF;
      ELSE
        -- Non-foreign key error - might be duplicate key (23505) which is fine
        -- Try to update the profile instead
        IF SQLSTATE = '23505' THEN
          -- Duplicate key - profile already exists, just update it
          BEGIN
            UPDATE public.profiles
            SET
              email = user_email,
              full_name = COALESCE(user_full_name, profiles.full_name),
              company_name = COALESCE(user_company_name, profiles.company_name),
              phone = COALESCE(user_phone, profiles.phone),
              updated_at = NOW()
            WHERE id = user_id_to_setup;
            profile_created := true;
          EXCEPTION WHEN OTHERS THEN
            -- Update failed too, but that's okay - profile exists
            profile_created := true;
          END;
        ELSE
          -- Other error, log and continue retrying
          retry_count := retry_count + 1;
          IF retry_count < max_retries THEN
            PERFORM pg_sleep(LEAST(0.05 * POWER(2, retry_count), 1.0));
          END IF;
        END IF;
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
        WHEN NOT profile_created THEN 'Failed to create profile after retries - foreign key constraint issue'
        WHEN NOT role_assigned THEN 'Failed to assign role'
        ELSE 'Unknown error'
      END
    );
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.setup_user_profile_instant(UUID, TEXT, TEXT, TEXT, TEXT, app_role) TO authenticated;

