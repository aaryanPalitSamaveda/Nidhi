/**
 * Set passwords for ALL users in Supabase Auth:
 * - @samavedacapital.com (and common typos: samavedacaptial.com, samavedacaptal.com) → SamavedaCapital1!
 * - Everyone else → SamavedaCapital#Client1234
 *
 * Run: npm run set-all-passwords
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = 'SamavedaCapital1!';
const CLIENT_PASSWORD = 'SamavedaCapital#Client1234';

// Domains that get admin password (case-insensitive)
const ADMIN_DOMAINS = [
  '@samavedacapital.com',
  '@samavedacaptial.com',  // common typo
  '@samavedacaptal.com',   // from codebase
];

function isAdminEmail(email) {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1] || '';
  return ADMIN_DOMAINS.some((d) => domain === d.slice(1));
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Required: VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('Fetching all users...\n');

  let page = 1;
  let admins = 0;
  let clients = 0;

  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      console.error('Error listing users:', error.message);
      process.exit(1);
    }

    if (!users?.length) break;

    for (const u of users) {
      const email = u.email || '';
      const isAdmin = isAdminEmail(email);
      const password = isAdmin ? ADMIN_PASSWORD : CLIENT_PASSWORD;

      const { error: updateErr } = await supabase.auth.admin.updateUserById(u.id, {
        password,
      });

      if (updateErr) {
        console.error(`  ${email}: FAILED - ${updateErr.message}`);
      } else {
        const label = isAdmin ? 'ADMIN' : 'CLIENT';
        console.log(`  ${email} [${label}]: password set`);
        if (isAdmin) admins++;
        else clients++;
      }
    }

    if (users.length < 100) break;
    page++;
  }

  console.log(`\nDone. Updated ${admins} admin(s), ${clients} client(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
