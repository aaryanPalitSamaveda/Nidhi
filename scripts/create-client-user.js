/**
 * Script to create a client user in Supabase Auth
 * Usage: node scripts/create-client-user.js <email> <password> <fullName>
 * 
 * Example: node scripts/create-client-user.js aaryanpalit@gmail.com "Password123!" "Aaryan Palit"
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

async function createClientUser(email, password, fullName) {
  try {
    console.log(`\n📧 Creating user: ${email}`);
    
    // Check if user already exists
    const { data: existingUsers, error: checkError } = await supabaseAdmin.auth.admin.listUsers();
    if (checkError) {
      console.error('Error checking existing users:', checkError);
      return;
    }
    
    const existingUser = existingUsers.users.find(u => u.email === email);
    
    if (existingUser) {
      console.log(`⚠️  User already exists in auth.users`);
      console.log(`   User ID: ${existingUser.id}`);
      console.log(`   Email confirmed: ${existingUser.email_confirmed_at ? 'Yes' : 'No'}`);
      
      // Update password if provided
      if (password) {
        console.log(`\n🔑 Updating password...`);
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          { password }
        );
        
        if (updateError) {
          console.error('❌ Error updating password:', updateError);
          return;
        }
        console.log('✅ Password updated successfully');
      }
      
      // Confirm email if not confirmed
      if (!existingUser.email_confirmed_at) {
        console.log(`\n📬 Confirming email...`);
        const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          { email_confirm: true }
        );
        
        if (confirmError) {
          console.error('❌ Error confirming email:', confirmError);
        } else {
          console.log('✅ Email confirmed');
        }
      } else {
        console.log('✅ Email already confirmed');
      }
      
      // Update profile
      console.log(`\n👤 Updating profile...`);
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: existingUser.id,
          email: email,
          full_name: fullName || null,
        });
      
      if (profileError) {
        console.error('❌ Error updating profile:', profileError);
      } else {
        console.log('✅ Profile updated');
      }
      
      // Ensure client role exists
      console.log(`\n🔐 Checking role...`);
      const { error: roleCheckError } = await supabaseAdmin
        .from('user_roles')
        .select('*')
        .eq('user_id', existingUser.id)
        .maybeSingle();
      
      if (roleCheckError && roleCheckError.code !== 'PGRST116') {
        console.error('❌ Error checking role:', roleCheckError);
      } else {
        // Delete existing role and insert client role
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', existingUser.id);
        
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: existingUser.id,
            role: 'client',
          });
        
        if (roleError) {
          console.error('❌ Error setting role:', roleError);
        } else {
          console.log('✅ Role set to client');
        }
      }
      
      console.log(`\n✅ User setup complete!`);
      console.log(`   Email: ${email}`);
      console.log(`   User ID: ${existingUser.id}`);
      console.log(`   Password: ${password ? 'Updated' : 'Not changed'}`);
      console.log(`   You can now login with this account.\n`);
      
      return;
    }
    
    // Create new user
    console.log(`\n👤 Creating new user in auth...`);
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName || '',
      },
    });
    
    if (createError) {
      console.error('❌ Error creating user:', createError);
      return;
    }
    
    console.log('✅ User created in auth');
    console.log(`   User ID: ${newUser.user.id}`);
    
    // Create profile
    console.log(`\n👤 Creating profile...`);
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newUser.user.id,
        email: email,
        full_name: fullName || null,
      });
    
    if (profileError) {
      console.error('❌ Error creating profile:', profileError);
    } else {
      console.log('✅ Profile created');
    }
    
    // Set role to client
    console.log(`\n🔐 Setting role to client...`);
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: newUser.user.id,
        role: 'client',
      });
    
    if (roleError) {
      console.error('❌ Error setting role:', roleError);
    } else {
      console.log('✅ Role set to client');
    }
    
    console.log(`\n✅ User created successfully!`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Full Name: ${fullName || 'Not set'}`);
    console.log(`   You can now login with this account.\n`);
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Get command line arguments
const [, , email, password, fullName] = process.argv;

if (!email) {
  console.error('Usage: node scripts/create-client-user.js <email> <password> [fullName]');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/create-client-user.js aaryanpalit@gmail.com "Password123!" "Aaryan Palit"');
  process.exit(1);
}

if (!password) {
  console.error('❌ Error: Password is required');
  console.error('Usage: node scripts/create-client-user.js <email> <password> [fullName]');
  process.exit(1);
}

createClientUser(email, password, fullName);

