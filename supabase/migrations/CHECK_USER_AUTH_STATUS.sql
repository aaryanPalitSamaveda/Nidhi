-- Check if users exist in both auth.users and have profiles/roles
-- This will help diagnose why login fails

-- Check users in auth.users
SELECT 
  au.id as auth_user_id,
  au.email as auth_email,
  au.email_confirmed_at,
  au.created_at as auth_created_at,
  au.raw_user_meta_data
FROM auth.users au
WHERE au.email IN ('aaryanpalit@gmail.com', 'ayush@samavedacapital.com')
ORDER BY au.email;

-- Check users in profiles
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.created_at
FROM public.profiles p
WHERE p.email IN ('aaryanpalit@gmail.com', 'ayush@samavedacapital.com')
ORDER BY p.email;

-- Check users in user_roles
SELECT 
  ur.user_id,
  ur.role,
  p.email,
  p.full_name
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
WHERE p.email IN ('aaryanpalit@gmail.com', 'ayush@samavedacapital.com')
ORDER BY p.email;

-- Compare: Find profiles/roles without auth.users
SELECT 
  p.id,
  p.email,
  p.full_name,
  ur.role,
  CASE 
    WHEN au.id IS NULL THEN 'MISSING IN AUTH.USERS - CANNOT LOGIN'
    WHEN au.email_confirmed_at IS NULL THEN 'EMAIL NOT CONFIRMED - CHECK EMAIL'
    ELSE 'OK - CAN LOGIN'
  END as status
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
LEFT JOIN public.user_roles ur ON ur.user_id = p.id
WHERE p.email IN ('aaryanpalit@gmail.com', 'ayush@samavedacapital.com')
ORDER BY p.email;



