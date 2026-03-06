/**
 * Set password for ADMIN users only in the NEW project to SamavedaCapital1!
 * Run once after migration if admins were created with random passwords.
 * Requires SUPABASE_SERVICE_ROLE_KEY (new project) in .env
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const NEW_URL = process.env.NEW_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = 'SamavedaCapital1!';

if (!NEW_URL || !NEW_KEY) {
  console.error('Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(NEW_URL, NEW_KEY);

async function main() {
  const { data: adminRoles, error: rolesErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');
  if (rolesErr) {
    console.error('Error fetching admin roles:', rolesErr.message);
    process.exit(1);
  }
  const adminIds = new Set((adminRoles || []).map((r) => r.user_id));
  if (!adminIds.size) {
    console.log('No admins found in user_roles.');
    return;
  }
  console.log(`Found ${adminIds.size} admin(s). Setting password to SamavedaCapital1!...\n`);
  let page = 1;
  let total = 0;
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      console.error('Error listing users:', error.message);
      process.exit(1);
    }
    if (!users?.length) break;
    for (const u of users) {
      if (!adminIds.has(u.id)) continue;
      const { error: updateErr } = await supabase.auth.admin.updateUserById(u.id, { password: ADMIN_PASSWORD });
      if (updateErr) {
        console.error(`  ${u.email}:`, updateErr.message);
      } else {
        console.log(`  ${u.email}: password set`);
        total++;
      }
    }
    if (users.length < 100) break;
    page++;
  }
  console.log(`\nDone. Updated ${total} admin(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
