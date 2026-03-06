-- ============================================================================
-- FULL SCHEMA FOR NEW SUPABASE PROJECT
-- Run this in: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/sql
-- Creates all tables, enums, functions, triggers, RLS, storage policies.
-- After running, use: npm run migrate-database (to copy data from old project)
-- ============================================================================

-- 1. ENUMS (all values at once - ALTER ADD VALUE cannot be used in same transaction)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'client', 'seller', 'investor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_file_status AS ENUM ('pending', 'processing', 'done', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. CORE TABLES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  company_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'investor',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS public.vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vault_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT true,
  can_edit BOOLEAN DEFAULT false,
  can_upload BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vault_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. NDA TABLES
CREATE TABLE IF NOT EXISTS public.nda_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  role_type public.app_role NOT NULL DEFAULT 'seller',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vault_id, role_type)
);

CREATE TABLE IF NOT EXISTS public.nda_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.nda_templates(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('signed', 'declined')),
  signature_name TEXT NOT NULL,
  signature_company TEXT NOT NULL,
  signed_document_path TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vault_id, user_id)
);

-- 4. AUDIT TABLES
CREATE TABLE IF NOT EXISTS public.audit_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.audit_job_status NOT NULL DEFAULT 'queued',
  progress NUMERIC NOT NULL DEFAULT 0,
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_remaining_seconds INTEGER,
  report_markdown TEXT,
  report_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_job_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.audit_jobs(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  status public.audit_file_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  facts_json JSONB,
  evidence_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.auditor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  vault_id UUID REFERENCES public.vaults(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id UUID REFERENCES public.vaults(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_name TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS audit_jobs_vault_id_idx ON public.audit_jobs(vault_id);
CREATE INDEX IF NOT EXISTS audit_jobs_status_idx ON public.audit_jobs(status);
CREATE INDEX IF NOT EXISTS audit_job_files_job_id_idx ON public.audit_job_files(job_id);
CREATE INDEX IF NOT EXISTS audit_job_files_vault_id_idx ON public.audit_job_files(vault_id);
CREATE INDEX IF NOT EXISTS auditor_sessions_created_at_idx ON public.auditor_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS auditor_sessions_vault_id_idx ON public.auditor_sessions(vault_id);
CREATE INDEX IF NOT EXISTS idx_nda_templates_vault_id ON public.nda_templates(vault_id);
CREATE INDEX IF NOT EXISTS idx_nda_signatures_vault_id ON public.nda_signatures(vault_id);
CREATE INDEX IF NOT EXISTS idx_nda_signatures_user_id ON public.nda_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_vault_id ON public.activity_logs(vault_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- 7. FUNCTIONS
CREATE OR REPLACE FUNCTION public.get_email_domain(email_address TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT LOWER(SPLIT_PART(email_address, '@', 2)) $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_vault_access(_user_id UUID, _vault_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE user_email TEXT; user_domain TEXT;
BEGIN
  IF public.has_role(_user_id, 'admin') THEN RETURN TRUE; END IF;
  IF EXISTS (SELECT 1 FROM public.vaults WHERE id = _vault_id AND (client_id = _user_id OR created_by = _user_id)) THEN RETURN TRUE; END IF;
  IF EXISTS (SELECT 1 FROM public.vault_permissions WHERE user_id = _user_id AND vault_id = _vault_id AND can_view = true) THEN RETURN TRUE; END IF;
  SELECT email INTO user_email FROM auth.users WHERE id = _user_id;
  IF user_email IS NULL THEN RETURN FALSE; END IF;
  user_domain := public.get_email_domain(user_email);
  IF EXISTS (SELECT 1 FROM public.vault_permissions vp JOIN auth.users au ON au.id = vp.user_id WHERE vp.vault_id = _vault_id AND vp.can_view = true AND public.get_email_domain(au.email) = user_domain) THEN RETURN TRUE; END IF;
  IF EXISTS (SELECT 1 FROM public.vaults v JOIN auth.users au ON au.id = v.client_id WHERE v.id = _vault_id AND public.get_email_domain(au.email) = user_domain) THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name) VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', '')) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.update_document_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.last_updated_at = NOW(); IF NEW.updated_by IS NULL THEN NEW.updated_by = auth.uid(); END IF; RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.log_activity(p_vault_id UUID, p_action TEXT, p_resource_type TEXT, p_document_id UUID DEFAULT NULL, p_folder_id UUID DEFAULT NULL, p_resource_name TEXT DEFAULT NULL, p_metadata JSONB DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (user_id, vault_id, document_id, folder_id, action, resource_type, resource_name, metadata)
  VALUES (auth.uid(), p_vault_id, p_document_id, p_folder_id, p_action, p_resource_type, p_resource_name, p_metadata)
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;

-- 8. TRIGGERS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_vaults_updated_at ON public.vaults;
CREATE TRIGGER update_vaults_updated_at BEFORE UPDATE ON public.vaults FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_folders_updated_at ON public.folders;
CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_update_document_timestamp ON public.documents;
CREATE TRIGGER trigger_update_document_timestamp BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_document_timestamp();
DROP TRIGGER IF EXISTS set_audit_jobs_updated_at ON public.audit_jobs;
CREATE TRIGGER set_audit_jobs_updated_at BEFORE UPDATE ON public.audit_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_audit_job_files_updated_at ON public.audit_job_files;
CREATE TRIGGER set_audit_job_files_updated_at BEFORE UPDATE ON public.audit_job_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_auditor_sessions_updated_at ON public.auditor_sessions;
CREATE TRIGGER set_auditor_sessions_updated_at BEFORE UPDATE ON public.auditor_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. ENABLE RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nda_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nda_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_job_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 10. RLS POLICIES (core - see migrations for full set)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view vaults they have access to" ON public.vaults;
CREATE POLICY "Users can view vaults they have access to" ON public.vaults FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR client_id = auth.uid() OR created_by = auth.uid() OR public.has_vault_access(auth.uid(), id));
DROP POLICY IF EXISTS "Admins can create vaults" ON public.vaults;
CREATE POLICY "Admins can create vaults" ON public.vaults FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update vaults" ON public.vaults;
CREATE POLICY "Admins can update vaults" ON public.vaults FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can delete vaults" ON public.vaults;
CREATE POLICY "Admins can delete vaults" ON public.vaults FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view their own permissions" ON public.vault_permissions;
CREATE POLICY "Users can view their own permissions" ON public.vault_permissions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can manage all permissions" ON public.vault_permissions;
CREATE POLICY "Admins can manage all permissions" ON public.vault_permissions FOR ALL USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view folders in accessible vaults" ON public.folders;
CREATE POLICY "Users can view folders in accessible vaults" ON public.folders FOR SELECT USING (public.has_vault_access(auth.uid(), vault_id));
DROP POLICY IF EXISTS "Users with edit access can create folders" ON public.folders;
CREATE POLICY "Users with edit access can create folders" ON public.folders FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vault_permissions WHERE vault_id = folders.vault_id AND user_id = auth.uid() AND can_edit = true));
DROP POLICY IF EXISTS "Users with edit access can update folders" ON public.folders;
CREATE POLICY "Users with edit access can update folders" ON public.folders FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vault_permissions WHERE vault_id = folders.vault_id AND user_id = auth.uid() AND can_edit = true));
DROP POLICY IF EXISTS "Users with delete access can delete folders" ON public.folders;
CREATE POLICY "Users with delete access can delete folders" ON public.folders FOR DELETE USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vault_permissions WHERE vault_id = folders.vault_id AND user_id = auth.uid() AND can_delete = true));

DROP POLICY IF EXISTS "Users can view documents in accessible vaults" ON public.documents;
CREATE POLICY "Users can view documents in accessible vaults" ON public.documents FOR SELECT USING (public.has_vault_access(auth.uid(), vault_id));
DROP POLICY IF EXISTS "Users with upload access can create documents" ON public.documents;
CREATE POLICY "Users with upload access can create documents" ON public.documents FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vault_permissions WHERE vault_id = documents.vault_id AND user_id = auth.uid() AND can_upload = true));
DROP POLICY IF EXISTS "Users with edit access can update documents" ON public.documents;
CREATE POLICY "Users with edit access can update documents" ON public.documents FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vault_permissions WHERE vault_id = documents.vault_id AND user_id = auth.uid() AND can_edit = true));
DROP POLICY IF EXISTS "Users with delete access can delete documents" ON public.documents;
CREATE POLICY "Users with delete access can delete documents" ON public.documents FOR DELETE USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.vault_permissions WHERE vault_id = documents.vault_id AND user_id = auth.uid() AND can_delete = true));

-- NDA, audit, auditor_sessions, activity_logs policies
DROP POLICY IF EXISTS "Admins can manage NDA templates" ON public.nda_templates;
CREATE POLICY "Admins can manage NDA templates" ON public.nda_templates FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Vault creators can manage NDA templates" ON public.nda_templates;
CREATE POLICY "Vault creators can manage NDA templates" ON public.nda_templates FOR ALL USING (EXISTS (SELECT 1 FROM public.vaults v WHERE v.id = vault_id AND v.created_by = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.vaults v WHERE v.id = vault_id AND v.created_by = auth.uid()));
DROP POLICY IF EXISTS "Sellers can view NDA templates" ON public.nda_templates;
CREATE POLICY "Sellers can view NDA templates" ON public.nda_templates FOR SELECT USING (EXISTS (SELECT 1 FROM public.vaults v JOIN public.user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'seller' WHERE v.id = vault_id AND (v.client_id = auth.uid() OR EXISTS (SELECT 1 FROM public.vault_permissions vp WHERE vp.vault_id = v.id AND vp.user_id = auth.uid() AND vp.can_view = true))));

DROP POLICY IF EXISTS "Admins can view all NDA signatures" ON public.nda_signatures;
CREATE POLICY "Admins can view all NDA signatures" ON public.nda_signatures FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Vault creators can view NDA signatures" ON public.nda_signatures;
CREATE POLICY "Vault creators can view NDA signatures" ON public.nda_signatures FOR SELECT USING (EXISTS (SELECT 1 FROM public.vaults v WHERE v.id = vault_id AND v.created_by = auth.uid()));
DROP POLICY IF EXISTS "Sellers can view and create their signatures" ON public.nda_signatures;
CREATE POLICY "Sellers can view and create their signatures" ON public.nda_signatures FOR ALL USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'seller')) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'seller'));

DROP POLICY IF EXISTS "Admins can view audit jobs" ON public.audit_jobs;
CREATE POLICY "Admins can view audit jobs" ON public.audit_jobs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can create audit jobs" ON public.audit_jobs;
CREATE POLICY "Admins can create audit jobs" ON public.audit_jobs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update audit jobs" ON public.audit_jobs;
CREATE POLICY "Admins can update audit jobs" ON public.audit_jobs FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can delete audit jobs" ON public.audit_jobs;
CREATE POLICY "Admins can delete audit jobs" ON public.audit_jobs FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view audit job files" ON public.audit_job_files;
CREATE POLICY "Admins can view audit job files" ON public.audit_job_files FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can create audit job files" ON public.audit_job_files;
CREATE POLICY "Admins can create audit job files" ON public.audit_job_files FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update audit job files" ON public.audit_job_files;
CREATE POLICY "Admins can update audit job files" ON public.audit_job_files FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can delete audit job files" ON public.audit_job_files;
CREATE POLICY "Admins can delete audit job files" ON public.audit_job_files FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view auditor sessions" ON public.auditor_sessions;
CREATE POLICY "Admins can view auditor sessions" ON public.auditor_sessions FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can insert auditor sessions" ON public.auditor_sessions;
CREATE POLICY "Admins can insert auditor sessions" ON public.auditor_sessions FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can update auditor sessions" ON public.auditor_sessions;
CREATE POLICY "Admins can update auditor sessions" ON public.auditor_sessions FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins can delete auditor sessions" ON public.auditor_sessions;
CREATE POLICY "Admins can delete auditor sessions" ON public.auditor_sessions FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view their own activity logs" ON public.activity_logs;
CREATE POLICY "Users can view their own activity logs" ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can view all activity logs" ON public.activity_logs;
CREATE POLICY "Admins can view all activity logs" ON public.activity_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can log their own activities" ON public.activity_logs;
CREATE POLICY "Users can log their own activities" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 11. STORAGE
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow service role full access to documents" ON storage.objects;
CREATE POLICY "Allow service role full access to documents" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');

-- Grant execute
GRANT EXECUTE ON FUNCTION public.has_vault_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_domain(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity(UUID, TEXT, TEXT, UUID, UUID, TEXT, JSONB) TO authenticated;
