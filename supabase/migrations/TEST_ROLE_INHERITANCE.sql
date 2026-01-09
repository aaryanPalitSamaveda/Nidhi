-- Test role inheritance - automatically finds vault ID
-- This will test if xyz@larsentoubro.com gets the same role as aditya.kumar.ext@larsentoubro.com

-- Test 1: Find all vaults that aditya has access to
SELECT 
  v.id AS vault_id,
  v.name AS vault_name,
  ur.role AS aditya_role,
  au.email AS aditya_email
FROM public.vaults v
JOIN public.vault_permissions vp ON vp.vault_id = v.id
JOIN auth.users au ON au.id = vp.user_id
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
WHERE au.email = 'aditya.kumar.ext@larsentoubro.com'
  AND vp.can_view = true;

-- Test 2: For each vault aditya has, check what role xyz would get
SELECT 
  v.id AS vault_id,
  v.name AS vault_name,
  ur_aditya.role AS aditya_role,
  public.get_user_role_for_vault(
    (SELECT id FROM auth.users WHERE email = 'xyz@larsentoubro.com' LIMIT 1),
    v.id
  ) AS xyz_inherited_role
FROM public.vaults v
JOIN public.vault_permissions vp ON vp.vault_id = v.id
JOIN auth.users au_aditya ON au_aditya.id = vp.user_id
LEFT JOIN public.user_roles ur_aditya ON ur_aditya.user_id = au_aditya.id
WHERE au_aditya.email = 'aditya.kumar.ext@larsentoubro.com'
  AND vp.can_view = true;

-- Test 3: Check domain matching
SELECT 
  'xyz@larsentoubro.com' AS email1,
  'aditya.kumar.ext@larsentoubro.com' AS email2,
  public.get_email_domain('xyz@larsentoubro.com') AS domain1,
  public.get_email_domain('aditya.kumar.ext@larsentoubro.com') AS domain2,
  public.get_email_domain('xyz@larsentoubro.com') = public.get_email_domain('aditya.kumar.ext@larsentoubro.com') AS domains_match;

-- Test 4: Check if aditya has a role and vault permissions
SELECT 
  ur.role,
  au.email,
  vp.vault_id,
  v.name AS vault_name,
  vp.can_view
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
JOIN public.vault_permissions vp ON vp.user_id = ur.user_id
JOIN public.vaults v ON v.id = vp.vault_id
WHERE au.email = 'aditya.kumar.ext@larsentoubro.com'
  AND vp.can_view = true;

