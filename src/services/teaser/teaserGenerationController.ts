import { fetchAllFilesFromVault } from '../fraud/documentFetcher';
import type { TeaserReport } from './types';

export async function runTeaserGeneration(
  vaultId: string,
  vaultName: string,
  userId: string,
  abortSignal?: AbortSignal
): Promise<TeaserReport> {
  try {
    console.log(`Starting Teaser Generation for vault: ${vaultId} (${vaultName})`);

    if (abortSignal?.aborted) {
      throw new Error('Teaser generation was cancelled');
    }

    console.log('Step 1: Fetching documents from vault...');
    const files = await fetchAllFilesFromVault(vaultId);
    console.log(`Found ${files.length} documents`);

    if (files.length === 0) {
      throw new Error('No documents found in vault for teaser generation');
    }

    if (abortSignal?.aborted) {
      throw new Error('Teaser generation was cancelled');
    }

    const documentData = await Promise.all(
      files.map(async (file) => {
        if (abortSignal?.aborted) {
          throw new Error('Teaser generation was cancelled');
        }

        let base64Content = '';

        if (typeof file.content === 'string') {
          base64Content = file.content;
        } else if (file.content instanceof Blob) {
          base64Content = await blobToBase64(file.content);
        } else if (file.content instanceof ArrayBuffer || file.content instanceof Uint8Array) {
          base64Content = arrayBufferToBase64(file.content);
        }

        return {
          fileName: file.name,
          fileType: file.type,
          content: base64Content,
        };
      })
    );

    if (abortSignal?.aborted) {
      throw new Error('Teaser generation was cancelled');
    }

    console.log('Step 2: Sending documents to teaser backend...');

    const teaserBackendUrl = import.meta.env.VITE_TEASER_BACKEND_URL || 'http://localhost:3004';
    const teaserResponse = await fetch(`${teaserBackendUrl.replace(/\/$/, '')}/api/teaser-generation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: documentData,
        vaultId,
        vaultName,
        userId,
      }),
      signal: abortSignal,
    });

    if (!teaserResponse.ok) {
      const errorText = await teaserResponse.text().catch(() => '');
      const statusInfo = teaserResponse.status ? `HTTP ${teaserResponse.status}` : 'HTTP error';
      throw new Error(`Teaser API failed: ${statusInfo} ${errorText}`.trim());
    }

    const { teaserReport, filesAnalyzed } = await teaserResponse.json();

    console.log('Step 3: Teaser generation completed');

    const report: TeaserReport = {
      reportId: `teaser_${Date.now()}`,
      vaultId,
      vaultName,
      createdBy: userId,
      timestamp: new Date().toISOString(),
      teaserReport: teaserReport,
      filesAnalyzed: filesAnalyzed || files.length,
      status: 'completed',
    };

    return report;
  } catch (error) {
    console.error('Error in teaser generation:', error);
    throw error;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function getFormattedTeaser(report: TeaserReport): string {
  return report.teaserReport;
}
