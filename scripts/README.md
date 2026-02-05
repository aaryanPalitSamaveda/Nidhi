# Setup Admin Users

This script creates three admin users in your Supabase project:

1. **Aaryan Palit**: aaryan@samavedacapital.com
2. **Vineeth Ganji**: vineeth@samavedacapital.com  
3. **Srinal Erakula**: srinal@samavedacaptal.com

All users will have the password: `SamavedaCapital1!`

## Prerequisites

You need your Supabase **Service Role Key** to run this script. This key has admin privileges and can bypass Row Level Security.

**⚠️ WARNING**: Never commit your service role key to version control or expose it in client-side code!

## How to Get Your Service Role Key

1. Go to your Supabase Dashboard
2. Navigate to **Settings** > **API**
3. Copy the **service_role** key (not the anon/public key)

## Running the Script

### Option 1: Using npm script

```bash
SUPABASE_URL=your_project_url SUPABASE_SERVICE_ROLE_KEY=your_service_role_key npm run setup-admins
```

### Option 2: Direct node command

```bash
SUPABASE_URL=your_project_url SUPABASE_SERVICE_ROLE_KEY=your_service_role_key node scripts/setup-admins.js
```

### Option 3: Using environment variables file

Create a `.env` file in the project root (make sure it's in `.gitignore`):

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Then run:
```bash
node scripts/setup-admins.js
```

## What the Script Does

1. **Creates users** (if they don't exist) in Supabase Auth
2. **Updates passwords** to `SamavedaCapital1!`
3. **Creates/updates profiles** with full names
4. **Sets admin roles** in the `user_roles` table
5. **Auto-confirms emails** so users can log in immediately

## Alternative: Using Supabase SQL Editor

If you prefer to set up users manually:

1. Create the users through Supabase Dashboard > Authentication > Users
2. Run the SQL migration: `supabase/migrations/20250108000000_setup_admin_users.sql`

This will assign admin roles to the users if they exist.

## Troubleshooting

- **"User not found"**: The user must be created in Supabase Auth first
- **"Permission denied"**: Make sure you're using the service_role key, not the anon key
- **"Email already exists"**: The script will update existing users and set their admin role



