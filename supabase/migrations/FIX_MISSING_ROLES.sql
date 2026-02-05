-- Fix: Assign investor roles to users who have vault permissions but no roles
-- This ensures users get NDAs when they have vault access

-- Step 1: Assign investor role to users who have vault permissions but no role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT vp.user_id, 'investor'::app_role
FROM public.vault_permissions vp
LEFT JOIN public.user_roles ur ON ur.user_id = vp.user_id
WHERE ur.id IS NULL  -- User has no role assigned
  AND vp.user_id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('pallavi@finfirst.club', 'nd@finfirst.club')
  )
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 2: Verify the fix
SELECT 
  u.email,
  ur.role,
  COUNT(vp.id) as vault_permissions_count,
  CASE 
    WHEN ur.role IS NULL THEN '❌ STILL NO ROLE'
    ELSE '✓ Role assigned: ' || ur.role::text
  END as status
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
LEFT JOIN public.vault_permissions vp ON vp.user_id = u.id
WHERE u.email IN ('pallavi@finfirst.club', 'nd@finfirst.club')
GROUP BY u.email, ur.role
ORDER BY u.email;
