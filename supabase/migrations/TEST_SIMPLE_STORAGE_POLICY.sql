-- Temporary test: Create a very permissive policy for NDA templates to verify storage RLS works
-- This is just for testing - we'll replace it with the proper policy

-- Drop existing policy
DROP POLICY IF EXISTS "Test NDA access" ON storage.objects;

-- Create a simple test policy that should definitely work
CREATE POLICY "Test NDA access"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      -- Admins can view everything
      public.has_role(auth.uid(), 'admin')
      -- OR if it's an NDA template file and user has investor role
      OR (
        storage.objects.name LIKE 'nda_templates/%'
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role = 'investor'
        )
      )
    )
  );

-- After testing, if this works, we know the issue is with the complex policy logic
-- Then we can debug the complex policy step by step

