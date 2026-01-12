-- Create RPC function to delete users completely (including auth.users)
-- This function can only be called by admins via RLS

CREATE OR REPLACE FUNCTION public.delete_user_completely(user_id_to_delete UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  -- Delete from auth.users using admin API (this requires service role)
  -- Since we can't directly delete from auth.users in a function without service role,
  -- we'll delete all related data and leave auth.users for manual deletion or use Supabase Admin API
  
  -- Delete vault permissions
  DELETE FROM public.vault_permissions WHERE user_id = user_id_to_delete;
  
  -- Delete user roles
  DELETE FROM public.user_roles WHERE user_id = user_id_to_delete;
  
  -- Delete NDA signatures
  DELETE FROM public.nda_signatures WHERE user_id = user_id_to_delete;
  
  -- Delete documents uploaded by user (or update uploaded_by to null)
  UPDATE public.documents SET uploaded_by = NULL WHERE uploaded_by = user_id_to_delete;
  
  -- Delete folders created by user
  DELETE FROM public.folders WHERE created_by = user_id_to_delete;
  
  -- Update vaults - set client_id to NULL if this user was the client
  UPDATE public.vaults SET client_id = NULL WHERE client_id = user_id_to_delete;
  
  -- Delete NDA templates uploaded by user
  DELETE FROM public.nda_templates WHERE uploaded_by = user_id_to_delete;
  
  -- Finally, delete the profile (this will be handled by cascade, but explicit is clearer)
  DELETE FROM public.profiles WHERE id = user_id_to_delete;
  
  -- Note: auth.users deletion must be done via Supabase Admin API or manually
  -- This function removes all related data, but the auth.users record will remain
  -- until manually deleted from Supabase Dashboard or via Admin API
  
END;
$$;

-- Grant execute permission to authenticated users (RLS will restrict to admins)
GRANT EXECUTE ON FUNCTION public.delete_user_completely(UUID) TO authenticated;



