-- Auto-confirm all new users on signup
-- This trigger automatically sets email_confirmed_at when a user is created
-- This allows all users (both admin-created and self-signed-up) to sign in immediately

CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Auto-confirm email for all new users
  -- This ensures users can sign in immediately without email confirmation
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_confirm_user_email_trigger ON auth.users;

-- Create trigger that runs AFTER a user is inserted
CREATE TRIGGER auto_confirm_user_email_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_user_email();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.auto_confirm_user_email() TO postgres, anon, authenticated, service_role;

