-- Migration to set up admin users
-- Note: This migration sets admin roles, but users must be created first through Supabase Auth
-- Run the setup-admins.js script first to create the users, then this migration will ensure they have admin roles
-- OR manually create users through Supabase Auth UI and run this SQL

-- Set admin role for Aaryan Palit
DO $$
DECLARE
  user_id_var UUID;
BEGIN
  -- Find user by email
  SELECT id INTO user_id_var
  FROM auth.users
  WHERE email = 'aaryan@samavedacapital.com';
  
  IF user_id_var IS NOT NULL THEN
    -- Insert or update admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_id_var, 'admin')
    ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';
    
    RAISE NOTICE 'Admin role set for aaryan@samavedacapital.com';
  ELSE
    RAISE NOTICE 'User aaryan@samavedacapital.com not found. Please create user first.';
  END IF;
END $$;

-- Set admin role for Vineeth Ganji
DO $$
DECLARE
  user_id_var UUID;
BEGIN
  SELECT id INTO user_id_var
  FROM auth.users
  WHERE email = 'vineeth@samavedacapital.com';
  
  IF user_id_var IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_id_var, 'admin')
    ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';
    
    RAISE NOTICE 'Admin role set for vineeth@samavedacapital.com';
  ELSE
    RAISE NOTICE 'User vineeth@samavedacapital.com not found. Please create user first.';
  END IF;
END $$;

-- Set admin role for Srinal Erakula
-- Note: Using the email as provided (srinal@samavedacaptal.com)
DO $$
DECLARE
  user_id_var UUID;
BEGIN
  SELECT id INTO user_id_var
  FROM auth.users
  WHERE email = 'srinal@samavedacaptal.com';
  
  IF user_id_var IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_id_var, 'admin')
    ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';
    
    RAISE NOTICE 'Admin role set for srinal@samavedacaptal.com';
  ELSE
    RAISE NOTICE 'User srinal@samavedacaptal.com not found. Please create user first.';
  END IF;
END $$;



