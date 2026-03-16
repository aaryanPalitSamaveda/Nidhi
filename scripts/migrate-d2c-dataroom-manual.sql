-- =============================================================================
-- MANUAL: Create D2C vault in NEW project (run in Supabase SQL Editor)
-- Run this in: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/sql
-- =============================================================================

-- DIAGNOSTIC: If D2C vault shows but is empty, check for duplicate vaults:
-- SELECT v.id, v.name, (SELECT COUNT(*) FROM folders f WHERE f.vault_id = v.id) AS folders, (SELECT COUNT(*) FROM documents d WHERE d.vault_id = v.id) AS docs FROM vaults v WHERE v.name ILIKE '%D2C%';

-- FIX: D2C vault not showing in Admin → Vaults?
-- The Vaults page hides vaults that have auditor_sessions. Remove them so D2C appears:
DELETE FROM public.auditor_sessions WHERE vault_id = 'c9f09380-7010-476b-8c9c-df9f4f74d9ff';

-- If you have an EMPTY duplicate vault (created via UI), delete it and keep the migrated one:
-- DELETE FROM public.vaults WHERE name = 'D2C Men Apparel Brand' AND id != 'c9f09380-7010-476b-8c9c-df9f4f74d9ff';

-- Create vault (if not exists):
INSERT INTO public.vaults (id, name, description, client_id, created_by, created_at, updated_at)
VALUES (
  'c9f09380-7010-476b-8c9c-df9f4f74d9ff',
  'D2C Men Apparel Brand',
  NULL,
  NULL,
  (SELECT id FROM auth.users LIMIT 1),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = EXCLUDED.updated_at;
