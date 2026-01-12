-- Enable Large File Uploads (2GB - 10GB support)
-- 
-- IMPORTANT: File size limits MUST be configured in the Supabase Dashboard:
-- 1. Go to Storage > Buckets > documents
-- 2. Click on Settings
-- 3. Increase the "Global file size limit" to at least 10GB (10737418240 bytes)
-- 4. Save the changes
--
-- ⚠️ PLAN REQUIREMENT:
-- - Free Plan: Fixed 50MB limit (cannot be changed)
-- - Pro Plan: Configurable limit up to 500GB
--
-- To upload files larger than 50MB (up to 2GB-10GB), you MUST upgrade to Pro Plan.
-- After upgrading, set the "Global file size limit" to at least 10GB (10737418240 bytes)
-- For files up to 2GB, set it to at least 2147483648 bytes (2GB)
--
-- NOTE: Storage bucket settings cannot be modified via SQL migrations.
-- You MUST configure the file size limit in the Supabase Dashboard (Storage > Settings).

-- Ensure storage policies allow large file uploads
-- The existing policies should already allow this, but we'll verify they exist

-- Verify upload policy exists (this is safe to run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can upload documents to accessible vaults'
  ) THEN
    RAISE NOTICE 'Upload policy does not exist. It should be created by other migrations.';
  END IF;
END $$;

-- This migration serves as documentation that file size limits need to be
-- configured in the Supabase Dashboard, not via SQL.
