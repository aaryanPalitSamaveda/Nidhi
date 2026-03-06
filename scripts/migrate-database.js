/**
 * Migrate database DATA from OLD Supabase project to NEW project.
 * Run FULL_SCHEMA_FOR_NEW_PROJECT.sql in the new project FIRST.
 * Requires OLD_* and NEW service role keys in .env.
 * Admins get password SamavedaCapital1!; others get random (use Forgot password).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const OLD_URL = process.env.OLD_SUPABASE_URL || 'https://iqwqgamoiuejsauisfvf.supabase.co';
const OLD_KEY = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = 'SamavedaCapital1!';

if (!OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error('Required in .env: OLD_SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const oldSupabase = createClient(OLD_URL, OLD_KEY);
const newSupabase = createClient(NEW_URL, NEW_KEY);

/** Map old user UUID -> new user UUID */
const userMap = new Map();

function mapUser(oldId) {
  if (!oldId) return null;
  return userMap.get(oldId) ?? oldId;
}

async function getAdminUserIds() {
  const { data, error } = await oldSupabase.from('user_roles').select('user_id').eq('role', 'admin');
  if (error) {
    console.warn('Could not fetch admin roles:', error.message);
    return new Set();
  }
  return new Set((data || []).map((r) => r.user_id));
}

async function migrateUsers() {
  const adminIds = await getAdminUserIds();
  console.log(`Found ${adminIds.size} admin(s) in old project\n`);
  console.log('Migrating auth users...');
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data: { users }, error } = await oldSupabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      console.error('List users error:', error.message);
      return;
    }
    if (!users?.length) break;
    for (const u of users) {
      const isAdmin = adminIds.has(u.id);
      const password = isAdmin ? ADMIN_PASSWORD : randomUUID() + 'A1!';
      const { data: newUser, error: createErr } = await newSupabase.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true,
        user_metadata: u.user_metadata || {},
      });
      if (createErr) {
        const existing = await newSupabase.auth.admin.listUsers();
        const match = existing.data?.users?.find(x => x.email === u.email);
        if (match) {
          userMap.set(u.id, match.id);
          console.log('  User exists:', u.email);
        } else {
          console.error('  Create failed:', u.email, createErr.message);
        }
      } else {
        userMap.set(u.id, newUser.user.id);
        console.log(`  Migrated: ${u.email}${isAdmin ? ' (admin)' : ''}`);
      }
    }
    hasMore = users.length === 100;
    page++;
  }
  console.log(`User map: ${userMap.size} users\n`);
}

async function copyTable(name, transform = (r) => r) {
  const { data, error } = await oldSupabase.from(name).select('*');
  if (error) {
    console.error(`  ${name}: list error`, error.message);
    return 0;
  }
  if (!data?.length) {
    console.log(`  ${name}: 0 rows (skip)`);
    return 0;
  }
  const rows = data.map(transform).filter(Boolean);
  if (!rows.length) return 0;
  const { error: insErr } = await newSupabase.from(name).upsert(rows, { onConflict: 'id' });
  if (insErr) {
    console.error(`  ${name}: insert error`, insErr.message);
    return 0;
  }
  console.log(`  ${name}: ${rows.length} rows`);
  return rows.length;
}

async function migrateData() {
  console.log('Migrating profiles (update existing from trigger)...');
  const { data: profiles } = await oldSupabase.from('profiles').select('*');
  if (profiles?.length) {
    for (const p of profiles) {
      const newId = mapUser(p.id);
      if (!newId) continue;
      await newSupabase.from('profiles').upsert({
        id: newId,
        email: p.email,
        full_name: p.full_name,
        company_name: p.company_name,
        phone: p.phone,
      }, { onConflict: 'id' });
    }
    console.log(`  profiles: ${profiles.length} rows\n`);
  }

  console.log('Migrating user_roles...');
  await copyTable('user_roles', (r) => ({ ...r, user_id: mapUser(r.user_id) }));

  console.log('Migrating vaults...');
  await copyTable('vaults', (r) => ({
    ...r,
    client_id: mapUser(r.client_id),
    created_by: mapUser(r.created_by),
  }));

  console.log('Migrating vault_permissions...');
  await copyTable('vault_permissions', (r) => ({
    ...r,
    user_id: mapUser(r.user_id),
  }));

  console.log('Migrating folders...');
  await copyTable('folders', (r) => ({
    ...r,
    created_by: mapUser(r.created_by),
  }));

  console.log('Migrating documents...');
  await copyTable('documents', (r) => ({
    ...r,
    uploaded_by: mapUser(r.uploaded_by),
    updated_by: mapUser(r.updated_by),
  }));

  console.log('Migrating nda_templates...');
  await copyTable('nda_templates', (r) => ({
    ...r,
    uploaded_by: mapUser(r.uploaded_by),
  }));

  console.log('Migrating nda_signatures...');
  await copyTable('nda_signatures', (r) => ({
    ...r,
    user_id: mapUser(r.user_id),
  }));

  console.log('Migrating audit_jobs...');
  await copyTable('audit_jobs', (r) => ({
    ...r,
    created_by: mapUser(r.created_by),
  }));

  console.log('Migrating audit_job_files...');
  await copyTable('audit_job_files');

  console.log('Migrating auditor_sessions...');
  await copyTable('auditor_sessions');

  console.log('Migrating activity_logs...');
  await copyTable('activity_logs', (r) => ({
    ...r,
    user_id: mapUser(r.user_id),
  }));

  // Optional tables (may not exist)
  try {
    await copyTable('cim_reports', (r) => ({
      ...r,
      ...(r.user_id && { user_id: mapUser(r.user_id) }),
    }));
  } catch (_) {}
  try {
    await copyTable('fraud_analysis_reports', (r) => ({
      ...r,
      ...(r.user_id && { user_id: mapUser(r.user_id) }),
    }));
  } catch (_) {}
}

async function main() {
  console.log('=== Database migration: OLD -> NEW ===\n');
  await migrateUsers();
  await migrateData();
  console.log('\nDatabase migration complete.');
  console.log('Admins: password is SamavedaCapital1!');
  console.log('Others: use "Forgot password" to reset.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
