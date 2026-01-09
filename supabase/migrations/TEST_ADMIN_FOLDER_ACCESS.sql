-- Quick test to verify admin can access folders
-- Run this and check if it returns folders

-- This should return all folders for admins
-- Replace 'YOUR_USER_ID_HERE' with your actual user ID from auth.users
SELECT 
  f.*,
  v.name as vault_name,
  public.has_role('YOUR_USER_ID_HERE'::uuid, 'admin'::public.app_role) as user_is_admin,
  public.has_vault_access('YOUR_USER_ID_HERE'::uuid, f.vault_id) as user_has_access
FROM public.folders f
JOIN public.vaults v ON v.id = f.vault_id;

-- To get your user ID, run:
-- SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';



