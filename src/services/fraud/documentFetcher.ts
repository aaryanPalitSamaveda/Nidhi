// src/services/fraud/documentFetcher.ts

import { supabase } from '@/integrations/supabase/client';

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

    console.log(`Found ${documents.length} documents, downloading...`);

    // Download each file
    const files: DocumentFile[] = [];
    for (const doc of documents) {
      try {
        const fileContent = await downloadFileContent(doc.file_path);
        files.push({
          name: doc.name,
          path: doc.file_path,
          size: doc.file_size || 0,
          type: doc.file_type || 'unknown',
          lastModified: doc.created_at,
          content: fileContent,
        });
        console.log(`✓ Downloaded: ${doc.name}`);
      } catch (err) {
        console.warn(`✗ Failed to download ${doc.name}:`, err);
      }
    }

    console.log(`Successfully downloaded ${files.length} files`);
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