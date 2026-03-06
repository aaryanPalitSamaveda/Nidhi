// src/services/fraud/documentFetcher.ts

import { supabase } from '@/integrations/supabase/client';

export interface DocumentFile {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: string;
  content?: ArrayBuffer | Uint8Array | string; // string = base64 (used when prefetched via backend)
}

/**
 * Fetches documents via the fraud backend (service role, bypasses storage RLS).
 * Use this in the Auditor when VITE_FRAUD_BACKEND_URL is set.
 * Returns null if the backend URL is not configured.
 */
export async function fetchDocumentsViaAuditor(sessionId: string): Promise<DocumentFile[] | null> {
  const url = import.meta.env.VITE_FRAUD_BACKEND_URL;
  if (!url) return null;

  const api = `${String(url).replace(/\/$/, '')}/api/auditor`;
  const { data: { user } } = await supabase.auth.getUser();
  try {
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetch-documents', sessionId, ...(user?.id && { userId: user.id }) }),
    });
    const data = (await res.json().catch(() => ({}))) as { documents?: Array<{ fileName: string; fileType: string; content: string }>; error?: string };
    if (!res.ok) {
      if (res.status === 404) {
        console.warn('[fetchDocumentsViaAuditor] Backend 404 (check VITE_FRAUD_BACKEND_URL), falling back to client-side');
        return null;
      }
      throw new Error(data.error || `Request failed: ${res.status}`);
    }
    const docs = data.documents ?? [];
    return docs.map((d) => ({
      name: d.fileName,
      path: '',
      size: 0,
      type: d.fileType || 'application/octet-stream',
      lastModified: '',
      content: d.content,
    }));
  } catch (e) {
    // Propagate backend errors (500, etc) so user sees real message; only 404 returns null above
    throw e;
  }
}

export async function fetchAllFilesFromVault(vaultId: string): Promise<DocumentFile[]> {
  try {
    if (!vaultId?.trim()) {
      throw new Error('Vault ID is required to fetch documents');
    }
    console.log(`Fetching all documents from vault: ${vaultId}`);

    // Ensure user is authenticated (RLS requires auth.uid())
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('No auth session - RLS may block document access:', sessionError?.message);
      throw new Error('You must be logged in to fetch documents. Please sign in and try again.');
    }
    // Refresh session if expired (helps avoid stale token issues)
    if (session?.user && session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (refreshed) session = refreshed;
    }

    // Fetch all documents metadata (includes docs in all folders)
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, name, file_path, file_size, file_type, created_at')
      .eq('vault_id', vaultId);

    if (error) {
      console.error('Documents query error:', error.code, error.message, error.details);
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    if (!documents || documents.length === 0) {
      console.log('No documents found in vault (query returned 0 rows)');
      return [];
    }

    console.log(`Found ${documents.length} documents, downloading in parallel...`);

    // Download all files in parallel for faster fetching
    const results = await Promise.allSettled(
      documents.map(async (doc) => {
        const fileContent = await downloadFileContent(doc.file_path);
        return {
          name: doc.name,
          path: doc.file_path,
          size: doc.file_size || 0,
          type: doc.file_type || 'unknown',
          lastModified: doc.created_at,
          content: fileContent,
        };
      })
    );

    const files: DocumentFile[] = [];
    const failed: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        files.push(result.value);
      } else {
        const name = documents[i]?.name ?? 'unknown';
        failed.push(name);
        console.warn(`✗ Failed to download ${name}:`, result.reason);
      }
    });

    // If we found documents in DB but all downloads failed, throw helpful error
    if (documents.length > 0 && files.length === 0) {
      throw new Error(
        `Found ${documents.length} document(s) in vault but failed to download all. ` +
        `Storage may be blocking access. Failed: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '...' : ''}`
      );
    }

    console.log(`Successfully downloaded ${files.length}/${documents.length} files`);
    return files;
  } catch (error) {
    console.error('Error fetching files from vault:', error);
    throw error;
  }
}

export async function downloadFileContent(filePath: string): Promise<ArrayBuffer> {
  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    // Convert Blob to ArrayBuffer
    return await data.arrayBuffer();
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

export async function listFoldersInVault(vaultId: string): Promise<string[]> {
  try {
    const { data: folders, error } = await supabase
      .from('folders')
      .select('name')
      .eq('vault_id', vaultId);

    if (error) {
      throw new Error(`Failed to fetch folders: ${error.message}`);
    }

    return folders?.map((f: any) => f.name) || [];
  } catch (error) {
    console.error('Error fetching folders:', error);
    throw error;
  }
}