-- Verification script to check if activity logs are set up correctly
-- Run this AFTER running ADD_DOCUMENT_ACTIVITY_LOGS.sql

-- 1. Check if columns exist on documents table
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'documents' 
  AND column_name IN ('updated_by', 'last_updated_at');

-- 2. Check if activity_logs table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_name = 'activity_logs'
) AS activity_logs_table_exists;

-- 3. Check if log_activity function exists
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'log_activity';

-- 4. Check if trigger exists on documents table
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'documents'
  AND trigger_name = 'trigger_update_document_timestamp';

-- 5. Check RLS policies on activity_logs
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'activity_logs';

-- 6. Test the log_activity function (will only work if you're authenticated)
-- SELECT public.log_activity(
--   '00000000-0000-0000-0000-000000000000'::uuid, -- dummy vault_id
--   NULL, -- document_id
--   NULL, -- folder_id
--   'test', -- action
--   'vault', -- resource_type
--   'Test Vault', -- resource_name
--   NULL -- metadata
-- ) AS test_log_id;



