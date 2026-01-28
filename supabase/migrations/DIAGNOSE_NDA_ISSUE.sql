-- Diagnostic query to check why users aren't getting NDAs
-- Run this in Supabase SQL Editor to check the status

-- Check if users exist and have roles
SELECT 
  u.email,
  u.id as user_id,
  ur.role,
  CASE 
    WHEN ur.role IS NULL THEN '❌ NO ROLE ASSIGNED'
    ELSE '✓ Role: ' || ur.role::text
  END as role_status
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email IN ('pallavi@finfirst.club', 'nd@finfirst.club')
ORDER BY u.email;

-- Check if users have vault permissions
SELECT 
  u.email,
  v.name as vault_name,
  vp.can_view,
  vp.can_edit,
  vp.can_upload,
  vp.can_delete,
  CASE 
    WHEN vp.id IS NULL THEN '❌ NO VAULT PERMISSION'
    ELSE '✓ Has vault permission'
  END as permission_status
FROM auth.users u
CROSS JOIN public.vaults v
LEFT JOIN public.vault_permissions vp ON vp.user_id = u.id AND vp.vault_id = v.id
WHERE u.email IN ('pallavi@finfirst.club', 'nd@finfirst.club')
ORDER BY u.email, v.name;

-- Check if NDA templates exist for investor role
SELECT 
  v.name as vault_name,
  nt.role_type,
  nt.file_name,
  CASE 
    WHEN nt.id IS NULL THEN '❌ NO NDA TEMPLATE'
    ELSE '✓ NDA Template exists'
  END as nda_status
FROM public.vaults v
LEFT JOIN public.nda_templates nt ON nt.vault_id = v.id AND nt.role_type = 'investor'
ORDER BY v.name;

-- Test get_user_role_for_vault function for these users
SELECT 
  u.email,
  v.name as vault_name,
  public.get_user_role_for_vault(u.id, v.id) as vault_role,
  CASE 
    WHEN public.get_user_role_for_vault(u.id, v.id) IS NULL THEN '❌ NO ROLE FOR VAULT'
    WHEN public.get_user_role_for_vault(u.id, v.id) = 'investor' THEN '✓ Investor role'
    WHEN public.get_user_role_for_vault(u.id, v.id) = 'seller' THEN '✓ Seller role'
    ELSE '⚠️ Role: ' || public.get_user_role_for_vault(u.id, v.id)::text
  END as role_status
FROM auth.users u
CROSS JOIN public.vaults v
WHERE u.email IN ('pallavi@finfirst.club', 'nd@finfirst.club')
ORDER BY u.email, v.name;

-- Check domain-based role inheritance
SELECT 
  u1.email as user_email,
  u2.email as domain_mate_email,
  ur.role as domain_mate_role,
  v.name as vault_name,
  vp.vault_id,
  CASE 
    WHEN ur.role IS NOT NULL AND vp.id IS NOT NULL THEN '✓ Can inherit ' || ur.role::text || ' role'
    ELSE '❌ Cannot inherit (no role or no vault permission)'
  END as inheritance_status
FROM auth.users u1
JOIN auth.users u2 ON public.get_email_domain(u1.email) = public.get_email_domain(u2.email) AND u1.id != u2.id
LEFT JOIN public.user_roles ur ON ur.user_id = u2.id
LEFT JOIN public.vault_permissions vp ON vp.user_id = u2.id
LEFT JOIN public.vaults v ON v.id = vp.vault_id
WHERE u1.email IN ('pallavi@finfirst.club', 'nd@finfirst.club')
ORDER BY u1.email, u2.email;
