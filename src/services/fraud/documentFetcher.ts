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
 * Fetches documents via fraud backend or auditor-public Edge Function (service role, bypasses storage RLS).
 * Same approach as forensic audit: backend fetches from storage, not client.
 */
export async function fetchDocumentsViaAuditor(sessionId: string): Promise<DocumentFile[] | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const body = { action: 'fetch-documents', sessionId, ...(user?.id && { userId: user.id }) };

  // 1. Try fraud backend when explicitly enabled
  const url = import.meta.env.VITE_FRAUD_BACKEND_URL;
  if (url && import.meta.env.VITE_USE_FRAUD_BACKEND === 'true') {
    const api = `${String(url).replace(/\/$/, '')}/api/auditor`;
    try {
      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { documents?: Array<{ fileName: string; fileType: string; content: string }>; error?: string };
      if (!res.ok) {
        if (res.status === 404) {
          console.warn('[fetchDocumentsViaAuditor] Backend 404, falling back to Edge Function');
          // fall through to Edge Function
        } else {
          throw new Error(data.error || `Request failed: ${res.status}`);
        }
      } else {
        const docs = data.documents ?? [];
        return docs.map((d) => ({
          name: d.fileName,
          path: '',
          size: 0,
          type: d.fileType || 'application/octet-stream',
          lastModified: '',
          content: d.content,
        }));
      }
    } catch (e) {
      console.warn('[fetchDocumentsViaAuditor] Backend failed, trying Edge Function:', e);
      // fall through to Edge Function
    }
  }

  // 2. Use auditor-public Edge Function (same as forensic audit - service role bypasses storage RLS)
  try {
    const { data, error } = await supabase.functions.invoke('auditor-public', { body });
    if (error) throw new Error(error.message || 'Edge Function failed');
    const docs = (data as { documents?: Array<{ fileName: string; fileType: string; content: string }> })?.documents ?? [];
    return docs.map((d) => ({
      name: d.fileName,
      path: '',
      size: 0,
      type: d.fileType || 'application/octet-stream',
      lastModified: '',
      content: d.content,
    }));
  } catch (e) {
    console.error('[fetchDocumentsViaAuditor] Edge Function failed:', e);
    throw e;
  }
}

export async function fetchAllFilesFromVault(vaultId: string): Promise<DocumentFile[]> {
  try {
    if (!vaultId?.trim()) {
      throw new Error('Vault ID is required to fetch documents');
    }
    console.log(`Fetching all documents from vault: ${vaultId}`);

    // Ensure user is authenticated
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('No auth session:', sessionError?.message);
      throw new Error('You must be logged in to fetch documents. Please sign in and try again.');
    }
    // Refresh session if expired
    if (session?.user && session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (refreshed) session = refreshed;
    }

    const body = { action: 'fetch-documents-by-vault', vaultId };

    // Use Edge Function (service role bypasses storage RLS)
    const { data, error } = await supabase.functions.invoke('auditor-public', { body });
    if (error) {
      const msg = (data as { error?: string })?.error || error.message || 'Edge Function failed';
      throw new Error(msg);
    }
    const docs = (data as { documents?: Array<{ fileName: string; fileType: string; content: string }> })?.documents ?? [];
    console.log(`Fetched ${docs.length} documents via Edge Function (service role)`);
    return docs.map((d) => ({
      name: d.fileName,
      path: '',
      size: 0,
      type: d.fileType || 'application/octet-stream',
      lastModified: '',
      content: d.content,
    }));
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