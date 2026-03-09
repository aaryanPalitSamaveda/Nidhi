import { fetchAllFilesFromVault } from '../fraud/documentFetcher';
import type { DocumentFile } from '../fraud/documentFetcher';
import type { TeaserReport } from './types';

export async function runTeaserGeneration(
  vaultId: string,
  vaultName: string,
  userId: string,
  abortSignal?: AbortSignal,
  prefetchedDocuments?: DocumentFile[]
): Promise<TeaserReport> {
  try {
    console.log(`Starting Teaser Generation for vault: ${vaultId} (${vaultName})`);

    if (abortSignal?.aborted) {
      throw new Error('Teaser generation was cancelled');
    }

    console.log('Step 1: Fetching documents from vault...');
    const files = prefetchedDocuments ?? await fetchAllFilesFromVault(vaultId);
    console.log(`Found ${files.length} documents`);

    if (files.length === 0) {
      throw new Error(
        'No documents found in vault for teaser generation. ' +
        'Ensure you are logged in, have access to this dataroom, and that documents exist (check the Documents tab).'
      );
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
      let msg = `Teaser API failed: ${statusInfo} ${errorText}`.trim();
      if (teaserResponse.status === 404) {
        msg += '. The teaser backend may not be deployed or may be waking up (Render cold start). Try again in 30–60 seconds.';
      } else if (teaserResponse.status === 500 && errorText.includes('CLAUDE_API_KEY')) {
        msg += '. Set CLAUDE_API_KEY in the teaser backend environment (e.g. Render dashboard).';
      }
      throw new Error(msg);
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
