-- Test if the storage policy would allow access
-- This simulates what the storage policy checks

-- First, let's verify the user can see the NDA template in the table (RLS check)
SELECT 
  'RLS Check - Can user SELECT from nda_templates?' as test,
  COUNT(*) as count
FROM public.nda_templates nt
WHERE nt.vault_id = '7d4cf5f6-bf5e-4b91-96f0-0a13f0785593'
  AND nt.role_type = 'investor'
  AND nt.file_path = 'nda_templates/7d4cf5f6-bf5e-4b91-96f0-0a13f0785593/investor/1767964395521_Samaveda_Capital_NDA_Investor_Template.docx';

-- Now test the storage policy logic directly
-- This simulates what happens when auth.uid() = the user's ID
DO $$
DECLARE
  test_user_id UUID;
  test_file_path TEXT := 'nda_templates/7d4cf5f6-bf5e-4b91-96f0-0a13f0785593/investor/1767964395521_Samaveda_Capital_NDA_Investor_Template.docx';
  has_access BOOLEAN := false;
BEGIN
  -- Get the user ID
  SELECT id INTO test_user_id
  FROM auth.users
  WHERE email = 'aditya.kumar.ext@larsentoubro.com';
  
  -- Test if the storage policy conditions would match
  -- Check explicit permission path
  SELECT EXISTS (
    SELECT 1 FROM public.nda_templates nt
    JOIN public.vaults v ON v.id = nt.vault_id
    WHERE nt.file_path = test_file_path
      AND EXISTS (
        SELECT 1 FROM public.vault_permissions vp
        WHERE vp.vault_id = v.id
          AND vp.user_id = test_user_id
          AND vp.can_view = true
      )
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = test_user_id AND ur.role = nt.role_type
      )
  ) INTO has_access;
  
  RAISE NOTICE 'Storage policy would allow access: %', has_access;
END $$;

