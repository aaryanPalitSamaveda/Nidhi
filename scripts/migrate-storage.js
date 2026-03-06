/**
 * Migrate Supabase Storage from OLD project to NEW project.
 * Loads from .env - ensure OLD_*, NEW_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY (new) are set.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const OLD_URL = process.env.OLD_SUPABASE_URL || 'https://iqwqgamoiuejsauisfvf.supabase.co';
const OLD_KEY = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error('Required in .env: OLD_SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (new project)');
  process.exit(1);
}
if (NEW_KEY === 'REPLACE_WITH_NEW_SERVICE_ROLE_KEY' || !NEW_KEY.startsWith('eyJ') && !NEW_KEY.startsWith('sb_secret_')) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY must be the actual key from your NEW project.');
  console.error('\n1. Open: https://supabase.com/dashboard/project/unyiuyzhteeuoyujqpbf/settings/api');
  console.error('2. Under "Legacy API Keys" or "API Keys", copy the service_role / secret key');
  console.error('3. In .env replace REPLACE_WITH_NEW_SERVICE_ROLE_KEY with that value');
  console.error('\nUse the Legacy service_role key (JWT format starting with eyJ) if the new sb_secret_ format fails.');
  process.exit(1);
}

const oldSupabase = createClient(OLD_URL, OLD_KEY);
const newSupabase = createClient(NEW_URL, NEW_KEY);
const BUCKET = 'documents';

async function listAllPaths(supabase, path = '') {
  const { data, error } = await supabase.storage.from(BUCKET).list(path, { limit: 1000 });
  if (error) {
    console.error(`List error at ${path}:`, error.message);
    return [];
  }
  const paths = [];
  for (const item of data || []) {
    if (item.name === '.emptyFolderPlaceholder') continue;
    const fullPath = path ? `${path}/${item.name}` : item.name;
    if (item.id) {
      paths.push(fullPath);
    } else {
      paths.push(...(await listAllPaths(supabase, fullPath)));
    }
  }
  return paths;
}

async function migrateStorage() {
  console.log('Listing files from old project...');
  const allPaths = await listAllPaths(oldSupabase);
  console.log(`Found ${allPaths.length} files to migrate\n`);

  for (let i = 0; i < allPaths.length; i++) {
    const path = allPaths[i];
    try {
      const { data: blob, error: dlErr } = await oldSupabase.storage.from(BUCKET).download(path);
      if (dlErr || !blob) {
        console.error(`  Download failed: ${path}`, dlErr?.message);
        continue;
      }
      const { error: upErr } = await newSupabase.storage.from(BUCKET).upload(path, blob, { upsert: true });
      if (upErr) {
        console.error(`  Upload failed: ${path}`, upErr.message);
      } else {
        console.log(`  [${i + 1}/${allPaths.length}] ${path}`);
      }
    } catch (e) {
      console.error(`  Error ${path}:`, e.message);
    }
  }
  console.log('\nStorage migration complete.');
}

migrateStorage().catch((e) => {
  console.error(e);
  process.exit(1);
});
