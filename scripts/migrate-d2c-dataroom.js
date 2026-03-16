/**
 * Migrate D2C Apparels dataroom from OLD Supabase (iqwqgamoiuejsauisfvf) to NEW (unyiuyzhteeuoyujqpbf).
 * - Finds D2C vault in OLD DB (or reconstructs from storage if deleted)
 * - Copies vault, folders, documents, nda_templates, vault_permissions
 * - Copies storage files from OLD to NEW
 *
 * Requires: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run: node scripts/migrate-d2c-dataroom.js
 * If vault insert fails (FK), run scripts/migrate-d2c-dataroom-manual.sql first, then: node scripts/migrate-d2c-dataroom.js --vault-exists
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'node:crypto';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const OLD_URL = process.env.OLD_SUPABASE_URL || 'https://iqwqgamoiuejsauisfvf.supabase.co';
const OLD_KEY = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
const NEW_URL = process.env.VITE_SUPABASE_URL;
const NEW_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'documents';

if (!OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error('Required in .env: OLD_SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const SKIP_VAULT_INSERT = process.argv.includes('--vault-exists');
const oldSupabase = createClient(OLD_URL, OLD_KEY);
const newSupabase = createClient(NEW_URL, NEW_KEY);

/** Map old user UUID -> new user UUID */
const userMap = new Map();

function mapUser(oldId) {
  if (!oldId) return null;
  return userMap.get(oldId) ?? null;
}

async function buildUserMap() {
  const { data: oldUsers } = await oldSupabase.auth.admin.listUsers({ perPage: 1000 });
  const { data: { users: newUsers } } = await newSupabase.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map((newUsers || []).map((u) => [u.email?.toLowerCase(), u.id]));
  for (const u of oldUsers?.users || []) {
    const match = byEmail.get(u.email?.toLowerCase());
    if (match) userMap.set(u.id, match);
  }
  console.log(`User map: ${userMap.size} users\n`);
}

async function listAllFilePaths(supabase, prefix = '') {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) {
    console.error(`List error at ${prefix}:`, error.message);
    return [];
  }
  const paths = [];
  for (const item of data || []) {
    if (item.name === '.emptyFolderPlaceholder') continue;
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) {
      paths.push(fullPath);
    } else {
      paths.push(...(await listAllFilePaths(supabase, fullPath)));
    }
  }
  return paths;
}

async function findD2CVaultInOldDb() {
  const { data, error } = await oldSupabase
    .from('vaults')
    .select('*')
    .or('name.ilike.%D2C%,name.ilike.%d2c%,name.ilike.%apparels%,name.ilike.%apparel%')
    .limit(10);
  if (error) {
    console.warn('Could not query old vaults:', error.message);
    return null;
  }
  const match = (data || []).find((v) =>
    /d2c|apparels?/i.test(v.name)
  );
  return match || data?.[0] || null;
}

async function findD2CPathsInOldStorage() {
  const allPaths = await listAllFilePaths(oldSupabase);
  const d2cMatch = allPaths.filter(
    (p) =>
      p.toLowerCase().includes('d2c') ||
      p.toLowerCase().includes('apparels') ||
      p.toLowerCase().includes('apparel') ||
      p.toLowerCase().includes('intimate')
  );
  if (d2cMatch.length === 0) {
    return [];
  }
  const prefixes = new Set();
  for (const p of d2cMatch) {
    const parts = p.split('/');
    if (parts.length >= 2) {
      if (p.startsWith('nda_templates/')) {
        prefixes.add('nda_templates/' + parts[1]);
      } else {
        prefixes.add(parts[0] + '/' + parts[1]);
      }
    }
  }
  return allPaths.filter((p) => {
    for (const prefix of prefixes) {
      if (p === prefix || p.startsWith(prefix + '/')) return true;
    }
    return false;
  });
}

async function getFirstAdminId() {
  const { data: profiles } = await newSupabase.from('profiles').select('id').limit(10);
  const profileIds = new Set((profiles || []).map((p) => p.id));
  const { data: roleData } = await newSupabase.from('user_roles').select('user_id').eq('role', 'admin');
  const adminId = (roleData || []).map((r) => r.user_id).find((id) => profileIds.has(id));
  if (adminId) return adminId;
  return profiles?.[0]?.id || null;
}

async function migrateFromDb(vault) {
  const vaultId = vault.id;
  let createdBy = mapUser(vault.created_by);
  if (!createdBy) {
    createdBy = await getFirstAdminId();
    console.warn('Could not map created_by. Using first admin:', createdBy);
  }
  if (!createdBy) {
    const firstMapped = [...userMap.values()][0];
    if (firstMapped) {
      createdBy = firstMapped;
      console.warn('Using first migrated user as created_by:', createdBy);
    }
  }
  if (!createdBy) {
    console.error('No admin or user found in new project. Cannot create vault.');
    return null;
  }
  if (!SKIP_VAULT_INSERT) {
    const vaultRow = {
      id: vault.id,
      name: vault.name,
      description: vault.description || null,
      client_id: mapUser(vault.client_id) || null,
      created_by: createdBy,
      created_at: vault.created_at,
      updated_at: vault.updated_at,
    };
    let vaultErr = (await newSupabase.from('vaults').insert(vaultRow)).error;
    if (vaultErr?.code === '23505') {
      vaultErr = (await newSupabase.from('vaults').update({
        name: vaultRow.name,
        description: vaultRow.description,
        client_id: vaultRow.client_id,
        created_by: vaultRow.created_by,
        updated_at: vaultRow.updated_at,
      }).eq('id', vault.id)).error;
    }
    if (vaultErr) {
      if (vaultErr.message?.includes('vaults_created_by_fkey')) {
        console.error('\n  FK error: created_by user may not exist in auth.users.');
        console.error('  Run scripts/migrate-d2c-dataroom-manual.sql in Supabase SQL Editor first.');
        console.error('  Then re-run: node scripts/migrate-d2c-dataroom.js --vault-exists\n');
      } else {
        console.error('Vault insert/update failed:', vaultErr.message);
        console.error('created_by used:', createdBy);
      }
      return null;
    }
    console.log('  Vault inserted:', vault.name);
  } else {
    console.log('  Skipping vault insert (--vault-exists)');
  }

  const { data: folders } = await oldSupabase.from('folders').select('*').eq('vault_id', vaultId);
  const sorted = (folders || []).sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
  let foldersOk = 0;
  let foldersErr = 0;
  for (const f of sorted) {
    f.vault_id = vaultId;
    f.created_by = mapUser(f.created_by) || createdBy;
    const { error } = await newSupabase.from('folders').upsert(f, { onConflict: 'id' });
    if (error) {
      foldersErr++;
      if (foldersErr <= 2) console.warn('  Folder upsert error:', f.name, error.message);
    } else foldersOk++;
  }
  console.log('  Folders:', foldersOk, 'ok', foldersErr ? `, ${foldersErr} failed` : '');

  const { data: docs } = await oldSupabase.from('documents').select('*').eq('vault_id', vaultId);
  let docsOk = 0;
  let docsErr = 0;
  for (const d of docs || []) {
    d.vault_id = vaultId;
    d.uploaded_by = mapUser(d.uploaded_by) || createdBy;
    d.updated_by = mapUser(d.updated_by) || null;
    const { error } = await newSupabase.from('documents').upsert(d, { onConflict: 'id' });
    if (error) {
      docsErr++;
      if (docsErr <= 2) console.warn('  Document upsert error:', d.name, error.message);
    } else docsOk++;
  }
  console.log('  Documents:', docsOk, 'ok', docsErr ? `, ${docsErr} failed` : '');

  const { data: ndaTemplates } = await oldSupabase.from('nda_templates').select('*').eq('vault_id', vaultId);
  for (const n of ndaTemplates || []) {
    n.vault_id = vaultId;
    n.uploaded_by = mapUser(n.uploaded_by) || createdBy;
    await newSupabase.from('nda_templates').upsert(n, { onConflict: 'id' });
  }
  console.log('  NDA templates:', (ndaTemplates || []).length);

  const { data: perms } = await oldSupabase.from('vault_permissions').select('*').eq('vault_id', vaultId);
  for (const p of perms || []) {
    const newUserId = mapUser(p.user_id);
    if (newUserId) {
      p.vault_id = vaultId;
      p.user_id = newUserId;
      await newSupabase.from('vault_permissions').upsert(p, { onConflict: 'id' });
    }
  }
  console.log('  Vault permissions:', (perms || []).length);

  const filePaths = [
    ...(docs || []).map((d) => d.file_path),
    ...(ndaTemplates || []).map((n) => n.file_path),
  ].filter(Boolean);
  return { vaultId, filePaths };
}

async function migrateFromStorageOnly(filePaths) {
  const { data: admins } = await newSupabase.from('user_roles').select('user_id').eq('role', 'admin').limit(1);
  const creatorId = admins?.[0]?.user_id;
  if (!creatorId) {
    console.error('No admin found in new project. Cannot create vault.');
    return null;
  }

  const vaultId = randomUUID();
  const vault = {
    id: vaultId,
    name: 'D2C Apparels',
    description: 'Migrated from previous Supabase project',
    client_id: null,
    created_by: creatorId,
  };
  const { error: vaultErr } = await newSupabase.from('vaults').insert(vault);
  if (vaultErr) {
    console.error('Vault insert failed:', vaultErr.message);
    return null;
  }
  console.log('  Vault created:', vault.name);

  const docPaths = filePaths.filter((p) => !p.startsWith('nda_templates/'));
  const ndaPaths = filePaths.filter((p) => p.startsWith('nda_templates/'));

  for (const filePath of docPaths) {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    const doc = {
      vault_id: vaultId,
      folder_id: null,
      name: fileName.replace(/^\d+_\d+_/, '').replace(/^\d+_/, ''),
      file_path: filePath,
      file_size: null,
      file_type: null,
      uploaded_by: creatorId,
    };
    await newSupabase.from('documents').insert(doc);
  }
  console.log('  Documents:', docPaths.length);

  const ndaByRole = new Map();
  for (const filePath of ndaPaths) {
    const parts = filePath.split('/');
    const roleType = parts[2] || 'seller';
    if (!ndaByRole.has(roleType)) ndaByRole.set(roleType, filePath);
  }
  for (const [roleType, filePath] of ndaByRole) {
    const fileName = filePath.split('/').pop();
    const nda = {
      vault_id: vaultId,
      role_type: roleType,
      file_path: filePath,
      file_name: (fileName || '').replace(/^\d+_/, ''),
      file_size: null,
      file_type: null,
      uploaded_by: creatorId,
    };
    await newSupabase.from('nda_templates').upsert(nda, { onConflict: 'vault_id,role_type' });
  }
  console.log('  NDA templates:', ndaByRole.size);

  return { vaultId, filePaths };
}

async function copyStorageFiles(filePaths) {
  const toCopy = filePaths.filter((p) => !p.endsWith('.metadata') && !p.includes('.part'));
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  for (let i = 0; i < toCopy.length; i++) {
    const path = toCopy[i];
    try {
      const { data: existing } = await newSupabase.storage.from(BUCKET).download(path);
      if (existing && existing.size > 0) {
        skipped++;
        if ((i + 1) % 50 === 0) console.log(`  [${i + 1}/${toCopy.length}] (${skipped} already in NEW)`);
        continue;
      }
      const { data: blob, error: dlErr } = await oldSupabase.storage.from(BUCKET).download(path);
      if (dlErr || !blob) {
        console.warn(`  Download failed: ${path}`, dlErr?.message);
        failed++;
        continue;
      }
      const { error: upErr } = await newSupabase.storage.from(BUCKET).upload(path, blob, { upsert: true });
      if (upErr) {
        console.warn(`  Upload failed: ${path}`, upErr.message);
        failed++;
      } else {
        copied++;
        console.log(`  [${i + 1}/${toCopy.length}] copied: ${path}`);
      }
    } catch (e) {
      console.warn(`  Error ${path}:`, e.message);
      failed++;
    }
  }
  console.log(`\nStorage: ${copied} copied, ${skipped} already in NEW, ${failed} failed`);
}

async function main() {
  console.log('=== D2C Apparels Dataroom Migration ===\n\n');

  await buildUserMap();

  let result = null;

  const vault = await findD2CVaultInOldDb();
  if (vault) {
    console.log('Found D2C vault in OLD DB:', vault.name, '(id:', vault.id, ')\n');
    const { data: existing } = await newSupabase.from('vaults').select('id').eq('id', vault.id).single();
    if (existing) {
      console.log('Vault already exists in NEW project. Migrating folders, documents, NDA, storage...\n');
    }
    result = await migrateFromDb(vault);
  }

  if (!result) {
    console.log('D2C vault not in OLD DB. Searching OLD storage for D2C-related paths...\n');
    const paths = await findD2CPathsInOldStorage();
    if (paths.length === 0) {
      console.error('No D2C-related files found in OLD storage. Cannot migrate.');
      process.exit(1);
    }
    console.log(`Found ${paths.length} files in OLD storage\n`);
    result = await migrateFromStorageOnly([...new Set(paths)]);
  }

  if (!result) {
    console.error('Migration failed.');
    process.exit(1);
  }

  const { filePaths } = result;
  if (filePaths?.length > 0) {
    console.log('\nCopying storage files from OLD to NEW...');
    await copyStorageFiles(filePaths);
  } else {
    console.log('\nNo file paths to copy.');
  }

  console.log('\n=== D2C Apparels migration complete ===');
  console.log('Vault ID:', result.vaultId);
  console.log('Check in Admin → Vaults for "D2C Apparels"');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
