/**
 * Script to confirm user emails in Supabase Auth
 * Usage: node scripts/confirm-user-emails.js <email1> <email2> ...
 * 
 * Example: node scripts/confirm-user-emails.js aaryanpalit@gmail.com ayush@samavedacapital.com
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  try {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length > 1) {
        const key = parts[0].trim();
        const valueParts = parts.slice(1);
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key.trim()] = value.trim();
        }
      }
    });
  } catch (error) {
    console.log('Note: .env file not found, using environment variables');
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  console.error('You can set them as environment variables or in a .env file');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function confirmUserEmail(email) {
  try {
    console.log(`\n📧 Processing: ${email}`);
    
    // List all users to find by email
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error(`  ❌ Error listing users: ${listError.message}`);
      return false;
    }
    
    const user = users.users.find(u => u.email === email);
    
    if (!user) {
      console.error(`  ❌ User not found in auth.users`);
      return false;
    }
    
    console.log(`  ✓ Found user: ${user.id}`);
    console.log(`  Current email confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
    
    if (user.email_confirmed_at) {
      console.log(`  ✅ Email already confirmed`);
      return true;
    }
    
    // Confirm email
    console.log(`  🔐 Confirming email...`);
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { 
        email_confirm: true 
      }
    );
    
    if (updateError) {
      console.error(`  ❌ Error confirming email: ${updateError.message}`);
      return false;
    }
    
    console.log(`  ✅ Email confirmed successfully!`);
    console.log(`  User can now login with email: ${email}`);
    return true;
    
  } catch (error) {
    console.error(`  ❌ Unexpected error: ${error.message}`);
    return false;
  }
}

// Get emails from command line arguments
const emails = process.argv.slice(2);

if (emails.length === 0) {
  console.error('Usage: node scripts/confirm-user-emails.js <email1> <email2> ...');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/confirm-user-emails.js aaryanpalit@gmail.com ayush@samavedacapital.com');
  process.exit(1);
}

console.log('🚀 Confirming user emails...\n');

let successCount = 0;
for (const email of emails) {
  const success = await confirmUserEmail(email);
  if (success) successCount++;
}

console.log(`\n✅ Completed! ${successCount}/${emails.length} emails confirmed.`);
console.log('\nUsers can now login with their passwords.\n');



