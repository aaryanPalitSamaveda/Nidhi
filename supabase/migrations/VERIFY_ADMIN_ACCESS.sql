-- Verify admin access works correctly
-- Run this to check if your user has admin role and can access folders
-- Note: This uses auth.uid() which works when you're authenticated in Supabase Dashboard

-- Check your admin role
SELECT 
  ur.role,
  p.email,
  p.full_name,
  auth.uid() as current_user_id
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.user_id = auth.uid()
  AND ur.role = 'admin';

-- Test has_vault_access function for current user (must be authenticated)
SELECT 
  auth.uid() as user_id,
  public.has_role(auth.uid(), 'admin'::public.app_role) as is_admin,
  v.id as vault_id,
  v.name as vault_name,
  public.has_vault_access(auth.uid(), v.id) as has_access
FROM public.vaults v
LIMIT 5;

-- List all vaults (should work for admins via RLS)
SELECT id, name, client_id, created_by, created_at
FROM public.vaults
ORDER BY created_at DESC;

-- List all folders with vault info (should work for admins via has_vault_access)
SELECT 
  f.id, 
  f.name, 
  f.vault_id, 
  f.parent_id,
  f.created_at,
  v.name as vault_name
FROM public.folders f
JOIN public.vaults v ON v.id = f.vault_id
ORDER BY v.name, f.name;

