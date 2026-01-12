-- Quick fix: Manually assign admin role to Aaryan
-- Run this in Supabase SQL Editor

-- First, let's find the user ID
DO $$
DECLARE
  user_id_var UUID;
BEGIN
  -- Find user by email
  SELECT id INTO user_id_var
  FROM auth.users
  WHERE email = 'aaryan@samavedacapital.com';
  
  IF user_id_var IS NOT NULL THEN
    -- Delete any existing role first (in case it's 'client')
    DELETE FROM public.user_roles WHERE user_id = user_id_var;
    
    -- Insert admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_id_var, 'admin');
    
    RAISE NOTICE '✓ Admin role assigned to user: % (ID: %)', 'aaryan@samavedacapital.com', user_id_var;
  ELSE
    RAISE NOTICE '✗ User aaryan@samavedacapital.com not found in auth.users';
  END IF;
END $$;

-- Verify the role was set
SELECT 
  u.email,
  ur.role,
  ur.created_at as role_assigned_at
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email = 'aaryan@samavedacapital.com';




