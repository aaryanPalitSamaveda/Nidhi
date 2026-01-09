// Component to render signature on document
// This will be used to add signature to NDA document

export function renderSignatureToDocument(
  htmlContent: string,
  signatureName: string,
  signatureCompany: string
): string {
  // Find the signature placeholder or add it at the end
  const signatureHTML = `
    <div style="margin-top: 60px; padding-top: 20px; border-top: 2px solid #d4af37;">
      <div style="margin-bottom: 10px;">
        <span style="font-family: 'Kalam', 'Comic Sans MS', cursive; font-size: 24px; color: #d4af37;">
          ${signatureName}
        </span>
      </div>
      <div>
        <span style="font-family: 'Arial', sans-serif; font-size: 16px; color: #333;">
          ${signatureCompany}
        </span>
      </div>
      <div style="margin-top: 10px; font-size: 12px; color: #666;">
        Date: ${new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}
      </div>
    </div>
  `;

  // Try to find signature placeholder
  if (htmlContent.includes('[SIGNATURE]') || htmlContent.includes('{SIGNATURE}')) {
    return htmlContent.replace(/\[SIGNATURE\]|\{SIGNATURE\}/gi, signatureHTML);
  }

  // Otherwise append at the end before closing body tag
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', signatureHTML + '</body>');
  }

  // If no body tag, append at the end
  return htmlContent + signatureHTML;
}


