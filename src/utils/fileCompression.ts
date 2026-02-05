/**
 * File compression utility for temporary workaround to upload files > 50MB
 * This compresses files before upload to fit within Supabase Free Plan's 50MB limit
 * 
 * NOTE: This is a temporary solution. Upgrade to Supabase Pro Plan for proper large file support.
 */

export interface CompressionResult {
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  needsCompression: boolean;
}

/**
 * Compresses a file if it's larger than the size limit
 * @param file - The file to compress
 * @param maxSizeBytes - Maximum allowed size (default: 50MB for Free Plan)
 * @returns CompressionResult with compressed file or original if compression not needed
 */
export async function compressFileIfNeeded(
  file: File,
  maxSizeBytes: number = 50 * 1024 * 1024 // 50MB default
): Promise<CompressionResult> {
  // If file is already under limit, no compression needed
  if (file.size <= maxSizeBytes) {
    return {
      compressedFile: file,
      originalSize: file.size,
      compressedSize: file.size,
      compressionRatio: 1,
      needsCompression: false,
    };
  }

  // Check if file type can be compressed effectively
  const compressibleTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/pdf', // PDFs can sometimes be compressed further
    'image/', // Images can be compressed (though many are already compressed)
    'application/vnd.openxmlformats-officedocument', // Office docs
    'application/msword',
  ];

  const canCompress = compressibleTypes.some(type => file.type.includes(type)) || 
                      file.name.endsWith('.txt') ||
                      file.name.endsWith('.csv') ||
                      file.name.endsWith('.json') ||
                      file.name.endsWith('.xml') ||
                      file.name.endsWith('.doc') ||
                      file.name.endsWith('.docx') ||
                      file.name.endsWith('.xls') ||
                      file.name.endsWith('.xlsx') ||
                      file.name.endsWith('.ppt') ||
                      file.name.endsWith('.pptx');

  if (!canCompress) {
    // For non-compressible files (videos, already-compressed files), we'll try zip compression
    return await compressToZip(file, maxSizeBytes);
  }

  // Try to compress the file
  try {
    // For text-based files, read and compress
    if (file.type.startsWith('text/') || 
        file.type === 'application/json' || 
        file.type === 'application/xml' ||
        file.type === 'application/javascript') {
      return await compressTextFile(file, maxSizeBytes);
    }

    // For images, try to compress
    if (file.type.startsWith('image/')) {
      return await compressImage(file, maxSizeBytes);
    }

    // For PDFs and Office docs, use zip compression
    return await compressToZip(file, maxSizeBytes);
  } catch (error) {
    console.error('Compression failed, trying zip fallback:', error);
    return await compressToZip(file, maxSizeBytes);
  }
}

/**
 * Compresses text-based files
 */
async function compressTextFile(file: File, maxSizeBytes: number): Promise<CompressionResult> {
  const text = await file.text();
  
  // Use CompressionStream API if available (modern browsers)
  if ('CompressionStream' in window) {
    try {
      const stream = new CompressionStream('gzip');
      const blob = new Blob([text]);
      const compressedStream = blob.stream().pipeThrough(stream);
      const compressedBlob = await new Response(compressedStream).blob();
      
      // Check if compression helped
      if (compressedBlob.size < file.size && compressedBlob.size <= maxSizeBytes) {
        const compressedFile = new File(
          [compressedBlob],
          file.name + '.gz',
          { type: 'application/gzip' }
        );
        
        return {
          compressedFile,
          originalSize: file.size,
          compressedSize: compressedBlob.size,
          compressionRatio: compressedBlob.size / file.size,
          needsCompression: true,
        };
      }
    } catch (error) {
      console.warn('CompressionStream failed, using zip fallback:', error);
    }
  }
  
  // Fallback to zip compression
  return await compressToZip(file, maxSizeBytes);
}

/**
 * Compresses images by reducing quality/size
 */
async function compressImage(file: File, maxSizeBytes: number): Promise<CompressionResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        let quality = 0.9;
        
        // Calculate target dimensions to get under size limit
        const maxDimension = Math.max(width, height);
        const targetMaxDimension = 2000; // Start with reasonable max dimension
        
        if (maxDimension > targetMaxDimension) {
          const ratio = targetMaxDimension / maxDimension;
          width = width * ratio;
          height = height * ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(compressToZip(file, maxSizeBytes));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Try different quality levels
        const tryCompress = (q: number): void => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(compressToZip(file, maxSizeBytes));
                return;
              }
              
              if (blob.size <= maxSizeBytes || q <= 0.1) {
                const compressedFile = new File(
                  [blob],
                  file.name.replace(/\.[^/.]+$/, '') + '.jpg',
                  { type: 'image/jpeg' }
                );
                
                resolve({
                  compressedFile,
                  originalSize: file.size,
                  compressedSize: blob.size,
                  compressionRatio: blob.size / file.size,
                  needsCompression: true,
                });
              } else {
                tryCompress(q - 0.1);
              }
            },
            'image/jpeg',
            q
          );
        };
        
        tryCompress(quality);
      };
      
      img.onerror = () => {
        resolve(compressToZip(file, maxSizeBytes));
      };
      
      if (e.target?.result) {
        img.src = e.target.result as string;
      }
    };
    
    reader.onerror = () => {
      resolve(compressToZip(file, maxSizeBytes));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses file to ZIP format (works for any file type)
 */
async function compressToZip(file: File, maxSizeBytes: number): Promise<CompressionResult> {
  // Use JSZip if available, otherwise use native CompressionStream
  try {
    // Dynamic import of JSZip with error handling
    let JSZip;
    try {
      const jszipModule = await import('jszip');
      JSZip = jszipModule.default || jszipModule;
    } catch (importError) {
      console.warn('JSZip import failed, trying native compression:', importError);
      throw new Error('JSZip not available');
    }
    
    if (!JSZip) {
      throw new Error('JSZip not available');
    }
    
    const zip = new JSZip();
    
    zip.file(file.name, file);
    
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }, // Maximum compression
    });
    
    // If zip is still too large, we can't compress further
    if (zipBlob.size > maxSizeBytes) {
      throw new Error(`File cannot be compressed below ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB limit. Original: ${(file.size / (1024 * 1024)).toFixed(1)}MB, Compressed: ${(zipBlob.size / (1024 * 1024)).toFixed(1)}MB. Please upgrade to Supabase Pro Plan.`);
    }
    
    const compressedFile = new File(
      [zipBlob],
      file.name + '.zip',
      { type: 'application/zip' }
    );
    
    return {
      compressedFile,
      originalSize: file.size,
      compressedSize: zipBlob.size,
      compressionRatio: zipBlob.size / file.size,
      needsCompression: true,
    };
  } catch (error: any) {
    // If JSZip is not available or fails, try native compression
    if ('CompressionStream' in window) {
      try {
        const stream = new CompressionStream('gzip');
        const compressedStream = file.stream().pipeThrough(stream);
        const compressedBlob = await new Response(compressedStream).blob();
        
        // Check if native compression helped
        if (compressedBlob.size > maxSizeBytes) {
          throw new Error(`File cannot be compressed below ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB limit. Please upgrade to Supabase Pro Plan.`);
        }
        
        const compressedFile = new File(
          [compressedBlob],
          file.name + '.gz',
          { type: 'application/gzip' }
        );
        
        return {
          compressedFile,
          originalSize: file.size,
          compressedSize: compressedBlob.size,
          compressionRatio: compressedBlob.size / file.size,
          needsCompression: true,
        };
      } catch (nativeError: any) {
        console.error('Native compression also failed:', nativeError);
        throw new Error(error?.message || nativeError?.message || 'Unable to compress file. Please upgrade to Supabase Pro Plan for large file support.');
      }
    }
    
    throw new Error(error?.message || 'Compression not available. Please upgrade to Supabase Pro Plan.');
  }
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
