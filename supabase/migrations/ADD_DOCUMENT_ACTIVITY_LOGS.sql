-- Add activity logging for document access and edits
-- Track all user interactions with vaults and documents

-- Add updated_by and last_updated_at to documents table
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE;

-- Create activity_logs table to track all user actions
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES public.vaults(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'view', 'edit', 'upload', 'delete', 'download', 'create_folder', etc.
  resource_type TEXT NOT NULL, -- 'document', 'folder', 'vault'
  resource_name TEXT,
  metadata JSONB, -- Additional data like file size, edit duration, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_vault_id ON public.activity_logs(vault_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_document_id ON public.activity_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- Enable RLS on activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own activity logs
CREATE POLICY "Users can view their own activity logs"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Admins can view all activity logs
CREATE POLICY "Admins can view all activity logs"
  ON public.activity_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Users can insert their own activity logs
CREATE POLICY "Users can log their own activities"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to log activity (can be called from client)
CREATE OR REPLACE FUNCTION public.log_activity(
  p_vault_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_document_id UUID DEFAULT NULL,
  p_folder_id UUID DEFAULT NULL,
  p_resource_name TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    user_id,
    vault_id,
    document_id,
    folder_id,
    action,
    resource_type,
    resource_name,
    metadata
  ) VALUES (
    auth.uid(),
    p_vault_id,
    p_document_id,
    p_folder_id,
    p_action,
    p_resource_type,
    p_resource_name,
    p_metadata
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;

-- Grant execute permission (updated signature)
GRANT EXECUTE ON FUNCTION public.log_activity(UUID, TEXT, TEXT, UUID, UUID, TEXT, JSONB) TO authenticated;

-- Update trigger to set last_updated_at when document is updated
CREATE OR REPLACE FUNCTION public.update_document_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_updated_at = NOW();
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_document_timestamp ON public.documents;
CREATE TRIGGER trigger_update_document_timestamp
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_document_timestamp();

