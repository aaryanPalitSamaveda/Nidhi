import { fetchAllFilesFromVault } from '../fraud/documentFetcher';
import { CIMReport } from './types';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function runCIMGeneration(
  vaultId: string,
  vaultName: string,
  userId: string
): Promise<CIMReport> {
  try {
    console.log(`Starting CIM Generation for vault: ${vaultId} (${vaultName})`);

    console.log('Step 1: Fetching documents from vault...');
    const files = await fetchAllFilesFromVault(vaultId);
    console.log(`Found ${files.length} documents`);

    if (files.length === 0) {
      throw new Error('No documents found in vault for CIM generation');
    }

    // FIX: Convert files to base64 without using Buffer (which doesn't exist in browsers)
    const documentData = await Promise.all(
      files.map(async (file) => {
        let base64Content = '';

        // If content is already a string, assume it's base64
        if (typeof file.content === 'string') {
          base64Content = file.content;
        }
        // If content is a Blob or File object
        else if (file.content instanceof Blob) {
          base64Content = await blobToBase64(file.content);
        }
        // If content is an ArrayBuffer or Uint8Array
        else if (file.content instanceof ArrayBuffer || file.content instanceof Uint8Array) {
          base64Content = arrayBufferToBase64(file.content);
        }

        return {
          fileName: file.name,
          fileType: file.type,
          content: base64Content,
        };
      })
    );

    console.log('Step 2: Sending documents to CIM backend for generation...');

    const cimResponse = await fetch('http://localhost:3003/api/cim-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: documentData,
        vaultId,
        vaultName,
        userId,
      }),
    });

    if (!cimResponse.ok) {
      throw new Error(`CIM API failed: ${cimResponse.statusText}`);
    }

    const { cimReport, filesAnalyzed } = await cimResponse.json();

    console.log('Step 3: CIM generation completed');

    const report: CIMReport = {
      reportId: `cim_${Date.now()}`,
      vaultId,
      vaultName,
      createdBy: userId,
      timestamp: new Date().toISOString(),
      cimReport: cimReport,
      filesAnalyzed: filesAnalyzed || files.length,
      status: 'completed',
    };

    console.log('Step 4: Saving CIM report to database...');
    try {
      await supabase.from('cim_reports').insert({
        vault_id: vaultId,
        vault_name: vaultName,
        created_by: userId,
        report_content: cimReport,
        files_analyzed: report.filesAnalyzed,
        status: 'completed',
        created_at: new Date().toISOString(),
      });
      console.log('CIM report saved to database');
    } catch (dbError) {
      console.warn('Could not save to database (table may not exist):', dbError);
    }

    return report;
  } catch (error) {
    console.error('Error in CIM generation:', error);
    throw error;
  }
}

// HELPER: Convert Blob to Base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Extract base64 part (remove data:...;base64, prefix)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// HELPER: Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function getFormattedCIM(report: CIMReport): string {
  return report.cimReport;
}

export async function downloadCIMReport(
  report: CIMReport,
  format: 'pdf' | 'word'
): Promise<void> {
  try {
    if (format === 'pdf') {
      console.log('PDF download initiated');
    } else if (format === 'word') {
      console.log('Word download initiated');
    }
  } catch (error) {
    console.error('Error downloading report:', error);
    throw error;
  }
}

export async function retrieveCIMHistory(vaultId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('cim_reports')
      .select('*')
      .eq('vault_id', vaultId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not retrieve CIM history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error retrieving CIM history:', error);
    return [];
  }
}