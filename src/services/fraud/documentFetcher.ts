// src/services/fraud/documentFetcher.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface DocumentFile {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: string;
  content?: ArrayBuffer | Uint8Array;
}

export async function fetchAllFilesFromVault(vaultId: string): Promise<DocumentFile[]> {
  try {
    console.log(`Fetching all documents from vault: ${vaultId}`);

    // Fetch all documents metadata
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, name, file_path, file_size, file_type, created_at')
      .eq('vault_id', vaultId);

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    if (!documents || documents.length === 0) {
      console.log('No documents found in vault');
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
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        files.push(result.value);
      } else {
        console.warn(`✗ Failed to download ${documents[i]?.name}:`, result.reason);
      }
    });

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