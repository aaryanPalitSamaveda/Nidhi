-- Debug query to test role inheritance
-- Replace 'xyz@larsentoubro.com' with the actual email you're testing
-- Replace the vault_id with the actual vault ID

-- Test 1: Check if function finds role for domain user
SELECT 
  public.get_user_role_for_vault(
    (SELECT id FROM auth.users WHERE email = 'xyz@larsentoubro.com' LIMIT 1),
    '7d4cf5f6-bf5e-4b91-96f0-0a13f0785593'::uuid  -- Replace with actual vault_id
  ) AS xyz_role;

-- Test 2: Check aditya's role
SELECT 
  ur.role AS aditya_role,
  au.email AS aditya_email
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
WHERE au.email = 'aditya.kumar.ext@larsentoubro.com'
LIMIT 1;

-- Test 3: Check if aditya has vault permission
SELECT 
  vp.vault_id,
  vp.user_id,
  vp.can_view,
  au.email
FROM public.vault_permissions vp
JOIN auth.users au ON au.id = vp.user_id
WHERE au.email = 'aditya.kumar.ext@larsentoubro.com'
  AND vp.vault_id = '7d4cf5f6-bf5e-4b91-96f0-0a13f0785593'::uuid;  -- Replace with actual vault_id

-- Test 4: Check domain matching
SELECT 
  public.get_email_domain('xyz@larsentoubro.com') AS xyz_domain,
  public.get_email_domain('aditya.kumar.ext@larsentoubro.com') AS aditya_domain,
  public.get_email_domain('xyz@larsentoubro.com') = public.get_email_domain('aditya.kumar.ext@larsentoubro.com') AS domains_match;

-- Test 5: Find all users with same domain who have roles and vault access
SELECT 
  ur.role,
  au.email,
  vp.vault_id,
  vp.can_view
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
LEFT JOIN public.vault_permissions vp ON vp.user_id = ur.user_id
WHERE public.get_email_domain(au.email) = public.get_email_domain('xyz@larsentoubro.com')
  AND vp.vault_id = '7d4cf5f6-bf5e-4b91-96f0-0a13f0785593'::uuid  -- Replace with actual vault_id
  AND vp.can_view = true;

