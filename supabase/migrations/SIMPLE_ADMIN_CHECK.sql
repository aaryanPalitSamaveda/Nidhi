-- Simple check: Get your user ID and admin status
-- This will show all admin users - find your email to verify you're an admin

SELECT 
  p.email,
  p.full_name,
  ur.role,
  au.id as user_id
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin';

-- After you find your user ID above, test access manually like this:
-- SELECT public.has_role('YOUR_ACTUAL_USER_ID_HERE', 'admin');
-- SELECT * FROM public.folders LIMIT 10;
-- SELECT * FROM public.vaults LIMIT 10;



