/**
 * Nidhi Supabase Migration - Run all migration steps.
 * Prerequisites:
 * 1. Add SUPABASE_SERVICE_ROLE_KEY (new project) to .env - get from https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/settings/api
 * 2. For database: use Supabase Dashboard "Restore to new project" OR run pg_dump commands below
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const NEW_REF = 'unyiuyzhteeuoyujqpbf';
const OLD_REF = 'iqwqgamoiuejsauisfvf';

console.log('=== Nidhi Supabase Migration ===\n');

// Step 1: Check service role key
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey || serviceKey === 'REPLACE_WITH_NEW_SERVICE_ROLE_KEY') {
  console.error('ERROR: Add SUPABASE_SERVICE_ROLE_KEY (new project) to .env');
  console.error('Get it from: https://supabase.com/dashboard/project/' + NEW_REF + '/settings/api\n');
  process.exit(1);
}

// Step 2: Database migration instructions
console.log('STEP 1: DATABASE MIGRATION');
console.log('--------------------------');
console.log('Option A: If OLD project has backups → Dashboard → Database → Backups → Restore to New Project');
console.log('Option B: Manual pg_dump (need DB passwords from both projects):');
console.log('');
console.log('  # Export from OLD (get password: old project → Settings → Database)');
console.log(`  pg_dump "postgresql://postgres.[OLD_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres" --no-owner --no-acl -f backup.sql`);
console.log('');
console.log('  # Import to NEW (run in new project SQL Editor or via psql)');
console.log(`  psql "[NEW_CONNECTION_STRING]" -f backup.sql`);
console.log('');
console.log('  Or: New project → SQL Editor → paste backup.sql content → Run');
console.log('');

// Step 3: Run storage migration
console.log('STEP 2: STORAGE MIGRATION');
console.log('-------------------------');
try {
  execSync('node scripts/migrate-storage.js', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
} catch (e) {
  console.error('Storage migration failed.');
  process.exit(1);
}

console.log('\n=== Migration complete ===');
console.log('Next: Deploy Edge Functions (requires Supabase CLI linked to new project):');
console.log('  supabase link --project-ref ' + NEW_REF);
console.log('  supabase secrets set OPENAI_API_KEY=sk-xxx');
console.log('  supabase secrets set FRAUD_BACKEND_URL=https://nidhi-backends.onrender.com');
console.log('  supabase functions deploy auditor-public --no-verify-jwt');
console.log('  supabase functions deploy audit-vault --no-verify-jwt');
console.log('');
console.log('Enable Anonymous auth: New project → Authentication → Providers → Anonymous');
