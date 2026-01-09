-- Verify NDA access for aditya.kumar.ext@larsentoubro.com
-- Run this to check if the user should have access

-- 1. Check user's role
SELECT 
  'User Role' as check_type,
  ur.role,
  au.email,
  au.id as user_id
FROM auth.users au
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
WHERE au.email = 'aditya.kumar.ext@larsentoubro.com';

-- 2. Check vault permissions (explicit)
SELECT 
  'Explicit Vault Permissions' as check_type,
  vp.vault_id,
  v.name as vault_name,
  vp.can_view,
  vp.user_id
FROM public.vault_permissions vp
JOIN public.vaults v ON v.id = vp.vault_id
JOIN auth.users au ON au.id = vp.user_id
WHERE au.email = 'aditya.kumar.ext@larsentoubro.com';

-- 3. Check domain-based access (via vault_permissions)
SELECT 
  'Domain-based via Vault Permissions' as check_type,
  vp.vault_id,
  v.name as vault_name,
  public.get_email_domain(au.email) as assigned_user_domain,
  public.get_email_domain(cu.email) as current_user_domain,
  au.email as assigned_user_email,
  cu.email as current_user_email
FROM public.vault_permissions vp
JOIN auth.users au ON au.id = vp.user_id
CROSS JOIN auth.users cu
WHERE cu.email = 'aditya.kumar.ext@larsentoubro.com'
  AND vp.can_view = true
  AND public.get_email_domain(au.email) = public.get_email_domain(cu.email)
  AND public.get_email_domain(au.email) IS NOT NULL
  AND public.get_email_domain(au.email) != '';

-- 4. Check NDA templates
SELECT 
  'NDA Templates' as check_type,
  nt.id,
  nt.vault_id,
  v.name as vault_name,
  nt.role_type,
  nt.file_path,
  nt.file_name
FROM public.nda_templates nt
JOIN public.vaults v ON v.id = nt.vault_id
WHERE nt.role_type = 'investor';

-- 5. Check if user can access specific NDA template file
-- Replace the file_path with the actual path from error message
SELECT 
  'NDA Access Check' as check_type,
  nt.id,
  nt.vault_id,
  v.name as vault_name,
  nt.role_type,
  nt.file_path,
  -- Check explicit permission
  EXISTS (
    SELECT 1 FROM public.vault_permissions vp
    WHERE vp.vault_id = nt.vault_id
      AND vp.user_id = (SELECT id FROM auth.users WHERE email = 'aditya.kumar.ext@larsentoubro.com')
      AND vp.can_view = true
  ) as has_explicit_permission,
  -- Check domain-based via vault_permissions
  EXISTS (
    SELECT 1 
    FROM public.vault_permissions vp
    JOIN auth.users au ON au.id = vp.user_id
    JOIN auth.users cu ON cu.id = (SELECT id FROM auth.users WHERE email = 'aditya.kumar.ext@larsentoubro.com')
    WHERE vp.vault_id = nt.vault_id
      AND vp.can_view = true
      AND public.get_email_domain(au.email) = public.get_email_domain(cu.email)
      AND public.get_email_domain(au.email) IS NOT NULL
      AND public.get_email_domain(au.email) != ''
  ) as has_domain_access_via_permissions,
  -- Check domain-based via vault client
  EXISTS (
    SELECT 1 
    FROM public.vaults v2
    JOIN auth.users au ON au.id = v2.client_id
    JOIN auth.users cu ON cu.id = (SELECT id FROM auth.users WHERE email = 'aditya.kumar.ext@larsentoubro.com')
    WHERE v2.id = nt.vault_id
      AND v2.client_id IS NOT NULL
      AND public.get_email_domain(au.email) = public.get_email_domain(cu.email)
      AND public.get_email_domain(au.email) IS NOT NULL
      AND public.get_email_domain(au.email) != ''
  ) as has_domain_access_via_client
FROM public.nda_templates nt
JOIN public.vaults v ON v.id = nt.vault_id
WHERE nt.role_type = 'investor'
  AND nt.file_path LIKE '%1767964395521_Samaveda_Capital_NDA_Investor_Template.docx%';

