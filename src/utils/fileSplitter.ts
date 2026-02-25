/**
 * File splitting utility for files that cannot be compressed below size limit
 * Splits large files into chunks that can be uploaded separately
 */

export interface FileChunk {
  chunkNumber: number;
  totalChunks: number;
  data: Blob;
  fileName: string;
  originalFileName: string;
  originalSize: number;
}

export interface SplitFileResult {
  chunks: FileChunk[];
  originalFileName: string;
  originalSize: number;
  chunkSize: number;
}

/**
 * Splits a file into chunks of specified size
 * @param file - The file to split
 * @param chunkSizeBytes - Size of each chunk in bytes (default: 45MB to leave room for metadata)
 * @returns Array of file chunks
 */
export async function splitFile(
  file: File,
  chunkSizeBytes: number = 45 * 1024 * 1024 // 45MB default (leaving 5MB buffer)
): Promise<SplitFileResult> {
  const totalChunks = Math.ceil(file.size / chunkSizeBytes);
  const chunks: FileChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSizeBytes;
    const end = Math.min(start + chunkSizeBytes, file.size);
    const chunkBlob = file.slice(start, end);

    chunks.push({
      chunkNumber: i + 1,
      totalChunks,
      data: chunkBlob,
      fileName: `${file.name}.part${i + 1}of${totalChunks}`,
      originalFileName: file.name,
      originalSize: file.size,
    });
  }

  return {
    chunks,
    originalFileName: file.name,
    originalSize: file.size,
    chunkSize: chunkSizeBytes,
  };
}

export { formatFileSize } from './format';
