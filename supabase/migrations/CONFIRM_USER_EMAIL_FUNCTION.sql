-- Function to confirm user email - allows admins to auto-confirm users they create
-- This function runs with SECURITY DEFINER so it can update auth.users directly

-- Drop the function if it exists (in case return type changed)
DROP FUNCTION IF EXISTS public.confirm_user_email(UUID);

CREATE FUNCTION public.confirm_user_email(
  target_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  admin_check BOOLEAN;
  user_exists BOOLEAN;
BEGIN
  -- Check if the caller is an admin
  SELECT public.has_role(auth.uid(), 'admin') INTO admin_check;
  IF NOT admin_check THEN
    RAISE EXCEPTION 'Only admins can confirm user emails';
  END IF;

  -- Verify user exists
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = target_user_id) INTO user_exists;
  IF NOT user_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User does not exist'
    );
  END IF;

  -- Update user to confirm email
  -- Note: confirmed_at is a generated column, so we only update email_confirmed_at
  UPDATE auth.users
  SET 
    email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = target_user_id;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_user_email(UUID) TO authenticated;

