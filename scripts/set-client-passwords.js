/**
 * Set temp password for all CLIENT users (users assigned as client_id to vaults).
 * Password: SamavedaCapital#Client1234
 * Run once to update existing clients. New clients get this password automatically.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIENT_TEMP_PASSWORD = 'SamavedaCapital#Client1234';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Required: VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Get all user IDs that are client_id on any vault
  const { data: vaults, error: vaultErr } = await supabase
    .from('vaults')
    .select('client_id')
    .not('client_id', 'is', null);

  if (vaultErr) {
    console.error('Error fetching vaults:', vaultErr.message);
    process.exit(1);
  }

  const clientIds = [...new Set((vaults || []).map((v) => v.client_id).filter(Boolean))];
  if (!clientIds.length) {
    console.log('No clients found (no vaults with client_id assigned).');
    return;
  }

  console.log(`Found ${clientIds.length} client(s). Setting password to ${CLIENT_TEMP_PASSWORD}...\n`);

  let updated = 0;
  for (const userId of clientIds) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: CLIENT_TEMP_PASSWORD,
    });
    if (error) {
      console.error(`  Error for ${userId}:`, error.message);
    } else {
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).single();
      console.log(`  ${profile?.email || userId}: password set`);
      updated++;
    }
  }

  console.log(`\nDone. Updated ${updated} client(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
