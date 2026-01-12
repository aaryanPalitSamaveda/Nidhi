# Complete Database Migration Guide

This document contains everything you need to migrate the entire Nidhi Vault database architecture to a new Supabase project or separate database.

## 📋 Table of Contents
1. [Overview](#overview)
2. [Database Architecture](#database-architecture)
3. [Migration Files](#migration-files)
4. [Edge Functions](#edge-functions)
5. [Storage Configuration](#storage-configuration)
6. [Migration Steps](#migration-steps)

## 🎯 Overview

This project uses **Supabase** as the backend, which includes:
- **PostgreSQL Database** with Row Level Security (RLS)
- **Supabase Auth** for user authentication
- **Supabase Storage** for document file storage
- **Database Functions** for role-based access control
- **Triggers** for automatic profile creation and timestamp updates

**No Edge Functions** are currently deployed in this project.

## 📊 Database Architecture

### Enums
- `app_role`: `'admin' | 'client'`

### Tables

#### 1. `profiles`
User profile information linked to Supabase Auth users.

```sql
- id (UUID, PRIMARY KEY, REFERENCES auth.users)
- email (TEXT, NOT NULL)
- full_name (TEXT)
- company_name (TEXT)
- phone (TEXT)
- created_at (TIMESTAMP WITH TIME ZONE)
- updated_at (TIMESTAMP WITH TIME ZONE)
```

#### 2. `user_roles`
Role assignment table for access control.

```sql
- id (UUID, PRIMARY KEY)
- user_id (UUID, NOT NULL, REFERENCES auth.users)
- role (app_role, NOT NULL, DEFAULT 'client')
- created_at (TIMESTAMP WITH TIME ZONE)
- UNIQUE(user_id, role)
```

#### 3. `vaults`
Business vaults/datarooms for organizing documents.

```sql
- id (UUID, PRIMARY KEY)
- name (TEXT, NOT NULL)
- description (TEXT)
- client_id (UUID, REFERENCES auth.users)
- created_by (UUID, NOT NULL, REFERENCES auth.users)
- created_at (TIMESTAMP WITH TIME ZONE)
- updated_at (TIMESTAMP WITH TIME ZONE)
```

#### 4. `vault_permissions`
Granular access control for vaults.

```sql
- id (UUID, PRIMARY KEY)
- vault_id (UUID, NOT NULL, REFERENCES vaults)
- user_id (UUID, NOT NULL, REFERENCES auth.users)
- can_view (BOOLEAN, DEFAULT true)
- can_edit (BOOLEAN, DEFAULT false)
- can_upload (BOOLEAN, DEFAULT false)
- can_delete (BOOLEAN, DEFAULT false)
- created_at (TIMESTAMP WITH TIME ZONE)
- UNIQUE(vault_id, user_id)
```

#### 5. `folders`
Nested folder structure within vaults.

```sql
- id (UUID, PRIMARY KEY)
- vault_id (UUID, NOT NULL, REFERENCES vaults)
- parent_id (UUID, REFERENCES folders)
- name (TEXT, NOT NULL)
- created_by (UUID, NOT NULL, REFERENCES auth.users)
- created_at (TIMESTAMP WITH TIME ZONE)
- updated_at (TIMESTAMP WITH TIME ZONE)
```

#### 6. `documents`
Document metadata for files stored in Supabase Storage.

```sql
- id (UUID, PRIMARY KEY)
- vault_id (UUID, NOT NULL, REFERENCES vaults)
- folder_id (UUID, REFERENCES folders)
- name (TEXT, NOT NULL)
- file_path (TEXT, NOT NULL)
- file_size (BIGINT)
- file_type (TEXT)
- uploaded_by (UUID, NOT NULL, REFERENCES auth.users)
- created_at (TIMESTAMP WITH TIME ZONE)
- updated_at (TIMESTAMP WITH TIME ZONE)
```

### Database Functions

#### 1. `has_role(_user_id UUID, _role app_role)`
Returns boolean indicating if user has a specific role.
- **Type**: STABLE, SECURITY DEFINER
- **Purpose**: Role checking for RLS policies

#### 2. `has_vault_access(_user_id UUID, _vault_id UUID)`
Returns boolean indicating if user has access to a vault.
- **Type**: STABLE, SECURITY DEFINER
- **Purpose**: Access control for vault-based resources
- **Logic**: Checks vault_permissions, vault ownership, or admin role

#### 3. `handle_new_user()`
Trigger function that creates a profile when a new auth user is created.
- **Type**: TRIGGER FUNCTION
- **Trigger**: AFTER INSERT ON auth.users

#### 4. `update_updated_at_column()`
Trigger function that updates the `updated_at` timestamp.
- **Type**: TRIGGER FUNCTION
- **Triggers**: 
  - BEFORE UPDATE ON profiles
  - BEFORE UPDATE ON vaults
  - BEFORE UPDATE ON folders
  - BEFORE UPDATE ON documents

### Row Level Security (RLS) Policies

All tables have RLS enabled with comprehensive policies:

- **profiles**: Users can view/update own profile, admins can view/update all
- **user_roles**: Users can view own roles, admins can manage all roles
- **vaults**: Users can view accessible vaults, admins can manage all
- **vault_permissions**: Users can view own permissions, admins can manage all
- **folders**: Access based on vault permissions or admin role
- **documents**: Access based on vault permissions or admin role

## 📁 Migration Files

### Core Migration
**File**: `supabase/migrations/20260107181847_ba5013c3-1276-4507-89aa-94eb57199dea.sql`

This is the **main migration file** that contains:
- ✅ All table definitions
- ✅ All RLS policies
- ✅ All database functions
- ✅ All triggers
- ✅ Storage bucket creation
- ✅ Storage policies

**This single file contains the complete database schema!**

### Function Fix Migration
**File**: `supabase/migrations/20260107181857_97341a5a-7f39-4e62-957d-dc8389c73525.sql`

Fixes the search path for `update_updated_at_column` function.

### Admin Users Migration (Optional)
**File**: `supabase/migrations/20250108000000_setup_admin_users.sql`

Sets up admin roles for specific users (optional, data migration).

## 🚀 Edge Functions

**Status**: ❌ No edge functions are currently defined in this project.

All business logic is handled:
- Client-side (React application)
- Database functions (PostgreSQL)
- Row Level Security policies

## 💾 Storage Configuration

### Storage Bucket
- **Name**: `documents`
- **Public**: `false` (private bucket)
- **Purpose**: Store document files uploaded by users

### Storage Policies

1. **View Documents**: Users can view documents they have access to (via vault permissions or admin role)
2. **Upload Documents**: Users with upload access or admins can upload to the documents bucket
3. **Delete Documents**: Only admins can delete documents

## 🔄 Migration Steps

### Option 1: Using Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Link to your new project**:
   ```bash
   supabase link --project-ref your-new-project-ref
   ```

3. **Run migrations**:
   ```bash
   supabase db push
   ```

### Option 2: Manual SQL Execution

1. **Open Supabase Dashboard** → SQL Editor

2. **Run migrations in order**:
   ```sql
   -- Run: 20260107181847_ba5013c3-1276-4507-89aa-94eb57199dea.sql
   -- This contains the complete schema
   
   -- Then run: 20260107181857_97341a5a-7f39-4e62-957d-dc8389c73525.sql
   -- This fixes the function
   ```

3. **Verify storage bucket**:
   - Go to Storage → Buckets
   - Ensure `documents` bucket exists (it should be created by the migration)
   - If not, manually create it with:
     - Name: `documents`
     - Public: `false`

### Option 3: Complete SQL Export

I can provide a single consolidated SQL file that combines all migrations. Would you like me to create that?

## 🔐 Authentication Setup

1. **Configure Supabase Auth**:
   - Email authentication should be enabled by default
   - Configure email templates if needed
   - Set up any additional auth providers if required

2. **Environment Variables** (Frontend):
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   ```

## ✅ Post-Migration Checklist

- [ ] All tables created successfully
- [ ] All RLS policies are active
- [ ] All functions are created
- [ ] All triggers are working
- [ ] Storage bucket `documents` exists
- [ ] Storage policies are active
- [ ] Test user signup creates profile automatically
- [ ] Test admin role assignment
- [ ] Test vault creation and permissions
- [ ] Test document upload/download

## 📝 Notes

- **No data migration needed**: The migrations only create the schema, not data
- **Users**: You'll need to recreate users in the new project or migrate auth.users table if needed
- **Files**: You'll need to migrate the storage bucket contents separately if needed
- **RLS is critical**: All security depends on Row Level Security policies being correctly applied

## 🆘 Troubleshooting

### If storage bucket is missing:
```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false);
```

### If triggers aren't firing:
Check that the trigger functions are created before the triggers.

### If RLS policies aren't working:
Verify that RLS is enabled on all tables and policies are created correctly.

## 📚 Additional Resources

- Supabase Documentation: https://supabase.com/docs
- PostgreSQL Row Level Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Supabase Storage: https://supabase.com/docs/guides/storage




