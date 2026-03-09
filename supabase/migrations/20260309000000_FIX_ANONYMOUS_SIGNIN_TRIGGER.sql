-- Fix 500 on anonymous sign-in: handle_new_user fails because anonymous users have email=NULL
-- but profiles.email is NOT NULL. Skip profile creation for anonymous users.
-- See: https://github.com/supabase/supabase-js/issues/999

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip anonymous users: they have no email, profiles.email is NOT NULL
  IF NEW.email IS NULL OR (NEW.raw_user_meta_data->>'provider') = 'anonymous' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  RETURN NEW;
END;
$$;
