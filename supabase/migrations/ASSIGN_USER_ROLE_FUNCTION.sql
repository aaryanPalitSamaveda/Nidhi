-- Function to assign user role - handles foreign key constraint issues
-- This function runs with SECURITY DEFINER so it can see the user immediately
-- even if there are transaction isolation issues

CREATE OR REPLACE FUNCTION public.assign_user_role(
  target_user_id UUID,
  target_role app_role
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  admin_check BOOLEAN;
  retry_count INTEGER := 0;
  max_retries INTEGER := 30; -- Increased retries (30 * 0.2s = 6s max wait initially)
BEGIN
  -- Check if the caller is an admin
  SELECT public.has_role(auth.uid(), 'admin') INTO admin_check;
  IF NOT admin_check THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;

  -- Delete existing roles first (ignore errors if none exist)
  DELETE FROM public.user_roles WHERE user_id = target_user_id;

  -- Insert new role with retry logic for foreign key constraint
  -- Don't check if user exists - just try to insert and retry on foreign key errors
  -- This is more reliable because we're actually testing the constraint
  retry_count := 0;
  WHILE retry_count < max_retries LOOP
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (target_user_id, target_role)
      ON CONFLICT (user_id, role) DO NOTHING;
      
      -- Success! Return immediately
      RETURN json_build_object('success', true);
    EXCEPTION WHEN OTHERS THEN
      IF SQLSTATE = '23503' THEN
        -- Foreign key constraint violation - user not visible yet
        retry_count := retry_count + 1;
        IF retry_count < max_retries THEN
          -- Exponential backoff: 200ms, 400ms, 800ms, etc. (max 3 seconds)
          -- This gives plenty of time for the user to be committed
          PERFORM pg_sleep(LEAST(0.2 * POWER(2, retry_count - 1), 3.0));
        ELSE
          -- After all retries, return error
          RETURN json_build_object(
            'success', false,
            'error', 'User not found in auth.users after retries. The user may not be fully committed yet.'
          );
        END IF;
      ELSE
        -- Other error (not foreign key) - return immediately
        RETURN json_build_object(
          'success', false,
          'error', SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
        );
      END IF;
    END;
  END LOOP;

  -- Should never reach here, but just in case
  RETURN json_build_object('success', false, 'error', 'Failed after all retries');
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_user_role(UUID, app_role) TO authenticated;

