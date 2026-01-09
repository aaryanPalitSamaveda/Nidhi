/**
 * Script to create admin users in Supabase
 * 
 * Run this script with: node scripts/setup-admins.js
 * 
 * You'll need to set these environment variables:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key (for admin access)
 * 
 * Get your service role key from: Supabase Dashboard > Settings > API > service_role key
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file manually
function loadEnv() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const envPath = join(__dirname, '..', '.env');
    const envFile = readFileSync(envPath, 'utf-8');
    
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key.trim()] = value.trim();
        }
      }
    });
  } catch (error) {
    // .env file not found, try to use existing env vars
    console.log('Note: .env file not found, using environment variables');
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  console.error('You can set them as environment variables or in a .env file');
  console.error('\nLooking for variables:');
  console.error(`  SUPABASE_URL: ${SUPABASE_URL ? '✓ Found' : '✗ Missing'}`);
  console.error(`  SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY ? '✓ Found' : '✗ Missing'}`);
  console.error('\nAvailable env vars starting with SUPABASE:');
  Object.keys(process.env)
    .filter(key => key.includes('SUPABASE'))
    .forEach(key => console.error(`  ${key}: ${process.env[key]?.substring(0, 20)}...`));
  process.exit(1);
}

// Create admin client with service role key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const adminUsers = [
  {
    email: 'aaryan@samavedacapital.com',
    password: 'SamavedaCapital1!',
    fullName: 'Aaryan Palit'
  },
  {
    email: 'vineeth@samavedacapital.com',
    password: 'SamavedaCapital1!',
    fullName: 'Vineeth Ganji'
  },
  {
    email: 'srinal@samavedacaptal.com', // Note: keeping the typo as provided
    password: 'SamavedaCapital1!',
    fullName: 'Srinal Erakula'
  }
];

async function setupAdmins() {
  console.log('Setting up admin users...\n');

  for (const userData of adminUsers) {
    try {
      console.log(`Processing: ${userData.email}`);

      // Check if user already exists
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        console.error(`Error listing users: ${listError.message}`);
        continue;
      }

      const existingUser = existingUsers.users.find(u => u.email === userData.email);
      let userId;

      if (existingUser) {
        console.log(`  User already exists, updating...`);
        userId = existingUser.id;

        // Update password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          {
            password: userData.password,
            user_metadata: {
              full_name: userData.fullName
            }
          }
        );

        if (updateError) {
          console.error(`  Error updating user: ${updateError.message}`);
          continue;
        }
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: userData.email,
          password: userData.password,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            full_name: userData.fullName
          }
        });

        if (createError) {
          console.error(`  Error creating user: ${createError.message}`);
          continue;
        }

        userId = newUser.user.id;
        console.log(`  User created successfully`);
      }

      // Ensure profile exists
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error(`  Error checking profile: ${profileError.message}`);
      }

      if (!profile) {
        const { error: insertProfileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: userId,
            email: userData.email,
            full_name: userData.fullName
          });

        if (insertProfileError) {
          console.error(`  Error creating profile: ${insertProfileError.message}`);
        } else {
          console.log(`  Profile created`);
        }
      } else {
        // Update profile with full name
        const { error: updateProfileError } = await supabaseAdmin
          .from('profiles')
          .update({
            full_name: userData.fullName,
            email: userData.email
          })
          .eq('id', userId);

        if (updateProfileError) {
          console.error(`  Error updating profile: ${updateProfileError.message}`);
        } else {
          console.log(`  Profile updated`);
        }
      }

      // Set admin role
      const { data: existingRole } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existingRole) {
        const { error: updateRoleError } = await supabaseAdmin
          .from('user_roles')
          .update({ role: 'admin' })
          .eq('user_id', userId);

        if (updateRoleError) {
          console.error(`  Error updating role: ${updateRoleError.message}`);
        } else {
          console.log(`  Role updated to admin`);
        }
      } else {
        const { error: insertRoleError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: userId,
            role: 'admin'
          });

        if (insertRoleError) {
          console.error(`  Error creating role: ${insertRoleError.message}`);
        } else {
          console.log(`  Admin role assigned`);
        }
      }

      console.log(`✓ ${userData.email} is now an admin\n`);

    } catch (error) {
      console.error(`Error processing ${userData.email}:`, error.message);
      console.log('');
    }
  }

  console.log('Done!');
}

setupAdmins().catch(console.error);

