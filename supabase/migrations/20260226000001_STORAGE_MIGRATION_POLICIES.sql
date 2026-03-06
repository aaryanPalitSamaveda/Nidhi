-- Allow service role and authenticated users to upload to documents bucket (for migration and app)
-- Run this in the NEW project's SQL Editor: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/sql

-- Drop restrictive policies if they exist
DROP POLICY IF EXISTS "Allow service role full access to documents" ON storage.objects;

-- Allow service_role full access (for migration script and backend)
CREATE POLICY "Allow service role full access to documents"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');
