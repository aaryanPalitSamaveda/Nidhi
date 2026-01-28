/**
 * Watermark utility for downloaded documents
 * Adds "Samaveda Capital" logo watermark to downloaded files
 */

// Load logo image once and cache it
let logoImageCache: HTMLImageElement | null = null;
let logoPngBytesCache: ArrayBuffer | null = null;
let circularLogoPngBytesCache: ArrayBuffer | null = null;

async function loadLogoImage(): Promise<HTMLImageElement> {
  if (logoImageCache) {
    return logoImageCache;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    // Import the logo asset - Vite handles image imports and returns URL string
    import('@/assets/samavedaWatermark.png')
      .then((logoModule) => {
        // Vite returns the image URL as default export (string)
        const logoUrl = logoModule.default;
        
        if (!logoUrl) {
          throw new Error('Logo URL not found in module');
        }
        
        img.src = logoUrl;
        img.onload = () => {
          logoImageCache = img;
          console.log('Logo image loaded successfully:', logoUrl);
          resolve(img);
        };
        img.onerror = (error) => {
          console.error('Failed to load logo image:', error);
          reject(error);
        };
      })
      .catch((error) => {
        console.error('Failed to import logo:', error);
        reject(error);
      });
  });
}

async function loadLogoPngBytes(): Promise<ArrayBuffer> {
  if (logoPngBytesCache) return logoPngBytesCache;

  const logoModule = await import('@/assets/samavedaWatermark.png');
  const logoUrl = logoModule.default;
  if (!logoUrl) throw new Error('Logo URL not found in module');

  const bytes = await fetch(logoUrl).then((res) => res.arrayBuffer());
  logoPngBytesCache = bytes;
  return bytes;
}

// Create a circular version of the watermark PNG (for PDFs)
async function loadCircularLogoPngBytes(): Promise<ArrayBuffer> {
  if (circularLogoPngBytesCache) return circularLogoPngBytesCache;

  const logoImg = await loadLogoImage();

  const size = Math.max(logoImg.width, logoImg.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback to original PNG bytes if canvas fails
    return await loadLogoPngBytes();
  }

  // Draw circular mask
  const radius = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Draw logo centered inside circle
  const scale = Math.min(size / logoImg.width, size / logoImg.height);
  const drawWidth = logoImg.width * scale;
  const drawHeight = logoImg.height * scale;
  const dx = (size - drawWidth) / 2;
  const dy = (size - drawHeight) / 2;
  ctx.drawImage(logoImg, dx, dy, drawWidth, drawHeight);
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  const bytes = await fetch(dataUrl).then((res) => res.arrayBuffer());
  circularLogoPngBytesCache = bytes;
  return bytes;
}

/**
 * Adds watermark to a file blob based on file type
 * @param fileBlob - The file blob to watermark
 * @param fileName - Original file name (for type detection)
 * @returns Watermarked file blob
 */
export async function addWatermarkToFile(
  fileBlob: Blob,
  fileName: string
): Promise<Blob> {
  const fileType = fileName.toLowerCase();
  
  // PDF files
  if (fileType.endsWith('.pdf')) {
    return await addWatermarkToPDF(fileBlob);
  }
  
  // Image files
  if (fileType.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/)) {
    return await addWatermarkToImage(fileBlob);
  }
  
  // For other file types, return as-is
  return fileBlob;
}

/**
 * Adds watermark to PDF using pdf-lib
 */
async function addWatermarkToPDF(fileBlob: Blob): Promise<Blob> {
  try {
    console.log('Adding logo watermark to PDF...');
    // Dynamic import to avoid loading if not needed
    const pdfLib = await import('pdf-lib');
    const { PDFDocument } = pdfLib;
    
    if (!PDFDocument) {
      console.error('pdf-lib import failed');
      return fileBlob;
    }
    
    const arrayBuffer = await fileBlob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // Embed the circular logo image
    const logoPngBytes = await loadCircularLogoPngBytes();
    const logoPdfImage = await pdfDoc.embedPng(logoPngBytes);
    
    const pages = pdfDoc.getPages();
    
    // Watermark settings
    const opacity = 0.16; // slightly stronger but still subtle
    const watermarkWidthRatio = 0.42; // a bit bigger (42% of page width)
    
    // Add watermark to each page
    pages.forEach((page, index) => {
      const { width, height } = page.getSize();

      // Scale watermark relative to page size (keeps it consistent across pages)
      const logoWidth = Math.max(120, Math.min(320, width * watermarkWidthRatio));
      const scaled = logoPdfImage.scale(logoWidth / logoPdfImage.width);
      const logoHeight = scaled.height;
      
      // Center the logo on the page
      const x = (width - logoWidth) / 2;
      const y = (height - logoHeight) / 2;
      
      // Draw centered logo watermark
      page.drawImage(logoPdfImage, {
        x,
        y,
        width: logoWidth,
        height: logoHeight,
        opacity: opacity,
      });
      
      console.log(`Logo watermark added to page ${index + 1} of ${pages.length}`);
    });
    
    const pdfBytes = await pdfDoc.save();
    console.log('PDF watermarking completed successfully. Size:', pdfBytes.length);
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (error: any) {
    console.error('Error adding watermark to PDF:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error message:', error?.message);
    // Return original file if watermarking fails
    return fileBlob;
  }
}

/**
 * Adds watermark to image using canvas
 */
async function addWatermarkToImage(fileBlob: Blob): Promise<Blob> {
  return new Promise(async (resolve) => {
    try {
      // Load logo image
      const logoImg = await loadLogoImage();
      
      const img = new Image();
      const url = URL.createObjectURL(fileBlob);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(fileBlob);
          return;
        }
        
        // Draw original image
        ctx.drawImage(img, 0, 0);
        
        // Use a circular logo mask
        const size = Math.min(canvas.width, canvas.height) * 0.35; // 35% of shorter side (a bit bigger)
        const radius = size / 2;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        ctx.save();
        ctx.globalAlpha = 0.16; // slightly stronger but still subtle

        // Create circular clipping region
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Draw logo scaled to fit inside the circle
        const scale = Math.min((size * 0.9) / logoImg.width, (size * 0.9) / logoImg.height);
        const drawWidth = logoImg.width * scale;
        const drawHeight = logoImg.height * scale;
        const dx = centerX - drawWidth / 2;
        const dy = centerY - drawHeight / 2;
        ctx.drawImage(logoImg, dx, dy, drawWidth, drawHeight);

        ctx.restore();
        
        // Convert to blob
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            console.log('Image watermarking completed successfully');
            resolve(blob);
          } else {
            resolve(fileBlob);
          }
        }, fileBlob.type || 'image/png');
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(fileBlob);
      };
      
      img.src = url;
    } catch (error) {
      console.error('Error adding watermark to image:', error);
      resolve(fileBlob);
    }
  });
}
