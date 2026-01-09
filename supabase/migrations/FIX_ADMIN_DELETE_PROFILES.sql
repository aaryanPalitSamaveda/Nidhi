-- Fix: Allow admins to delete profiles and all related data
-- Currently missing RLS DELETE policy for profiles

-- Add DELETE policy for admins on profiles
DROP POLICY IF EXISTS "Admins can delete all profiles" ON public.profiles;

CREATE POLICY "Admins can delete all profiles"
  ON public.profiles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Also ensure admins can delete from vault_permissions, user_roles, etc.
-- (These should already have admin policies, but let's verify)

-- Add DELETE policy for admins on vault_permissions (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'vault_permissions' 
    AND policyname = 'Admins can delete vault permissions'
  ) THEN
    CREATE POLICY "Admins can delete vault permissions"
      ON public.vault_permissions FOR DELETE
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

