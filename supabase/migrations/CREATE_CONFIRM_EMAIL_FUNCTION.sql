-- Function to confirm user email (can only be called by admins)
-- This allows admins to auto-confirm emails when creating users

CREATE OR REPLACE FUNCTION public.confirm_user_email(user_id_to_confirm UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Check if the caller is an admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can confirm user emails';
  END IF;

  -- Update the user's email_confirmed_at
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = user_id_to_confirm;

  -- Return true if user was found and updated
  RETURN FOUND;
END;
$$;

-- Grant execute permission to authenticated users (RLS will ensure only admins can use it)
GRANT EXECUTE ON FUNCTION public.confirm_user_email(UUID) TO authenticated;



