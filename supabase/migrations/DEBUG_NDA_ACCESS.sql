-- Debug query to check NDA access for a specific user
-- Replace 'USER_EMAIL_HERE' with the actual email (e.g., 'aditya.kumar.ext@larsentoubro.com')

-- Check user's role
SELECT 
  ur.role,
  au.email
FROM auth.users au
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
WHERE au.email = 'aditya.kumar.ext@larsentoubro.com';

-- Check if user has vault access (domain-based)
SELECT 
  v.id as vault_id,
  v.name as vault_name,
  public.has_vault_access(au.id, v.id) as has_access
FROM auth.users au
CROSS JOIN public.vaults v
WHERE au.email = 'aditya.kumar.ext@larsentoubro.com'
LIMIT 5;

-- Check NDA templates for vaults
SELECT 
  nt.id,
  nt.vault_id,
  nt.role_type,
  nt.file_path,
  v.name as vault_name
FROM public.nda_templates nt
JOIN public.vaults v ON v.id = nt.vault_id
LIMIT 10;

