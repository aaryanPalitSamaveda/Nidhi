-- Quick test: Check what role xyz gets for the Industrial Automation vault
SELECT 
  public.get_user_role_for_vault(
    (SELECT id FROM auth.users WHERE email = 'xyz@larsentoubro.com' LIMIT 1),
    '7d4cf5f6-bf5e-4b91-96f0-0a13f0785593'::uuid
  ) AS xyz_inherited_role;

