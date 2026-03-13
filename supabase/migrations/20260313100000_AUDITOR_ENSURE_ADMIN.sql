-- Ensure at least one admin exists for auditor-public Edge Function.
-- The function needs a user for created_by when creating vaults/folders/documents.
-- If we have users but no admins, promote the first user to admin.

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role = 'admin')
ORDER BY u.created_at ASC
LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;
