import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  X,
  Download,
  Save,
  Edit2,
  FileText,
  File,
  Loader2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import ExcelJS from 'exceljs';

interface DocumentInfo {
  id: string;
  name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  vault_id: string;
  created_at: string;
  updated_by: string | null;
  last_updated_at: string | null;
  updated_by_profile?: {
    email: string;
    full_name: string | null;
  };
}

type FileType = 'pdf' | 'docx' | 'doc' | 'ppt' | 'pptx' | 'image' | 'text' | 'excel' | 'csv' | 'other';

interface DocumentViewerModalProps {
  documentId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function DocumentViewerModal({ documentId, open, onClose }: DocumentViewerModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string>('');
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [fileType, setFileType] = useState<FileType>('other');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalHtmlContent, setOriginalHtmlContent] = useState<string>('');
  const [canEdit, setCanEdit] = useState(false);
  const [autoSaveMessage, setAutoSaveMessage] = useState<string>('');
  const [showSaveSuccessDialog, setShowSaveSuccessDialog] = useState(false);
  const [excelData, setExcelData] = useState<{ workbook: ExcelJS.Workbook | null; currentSheet: string; sheetData: string[][] }>({
    workbook: null,
    currentSheet: '',
    sheetData: [],
  });
  const [originalExcelData, setOriginalExcelData] = useState<any[][]>([]);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Poll for document updates to show latest activity (reduced frequency for performance)
  useEffect(() => {
    if (!open || !documentId) return;
    
    const interval = setInterval(async () => {
      if (document) {
        try {
          const { data: docData } = await supabase
            .from('documents')
            .select('updated_by, last_updated_at')
            .eq('id', documentId)
            .single();
          
          if (docData && (docData.updated_by !== document.updated_by || docData.last_updated_at !== document.last_updated_at)) {
            // Fetch updated document and profile in parallel
            const [updatedDocResult, profileResult] = await Promise.allSettled([
              supabase
                .from('documents')
                .select('*')
                .eq('id', documentId)
                .single(),
              docData.updated_by ? supabase
                .from('profiles')
                .select('email, full_name')
                .eq('id', docData.updated_by)
                .maybeSingle() : Promise.resolve({ data: null })
            ]);
            
            const updatedDoc = updatedDocResult.status === 'fulfilled' ? updatedDocResult.value.data : null;
            const profileData = profileResult.status === 'fulfilled' && profileResult.value.data;
            
            if (updatedDoc) {
              setDocument(prev => prev ? { 
                ...prev, 
                ...updatedDoc, 
                updated_by_profile: profileData || prev.updated_by_profile 
              } : null);
            }
          }
        } catch (error) {
          console.error('Error polling document updates:', error);
        }
      }
    }, 10000); // Poll every 10 seconds (reduced from 5 for better performance)
    
    return () => clearInterval(interval);
  }, [open, documentId, document]);

  useEffect(() => {
    if (open && documentId) {
      fetchDocument();
    } else {
      // Reset state when modal closes
      setDocument(null);
      setContent('');
      setHtmlContent('');
      setBlobUrl('');
      setFileType('other');
      setIsEditing(false);
      setHasUnsavedChanges(false);
      setOriginalHtmlContent('');
      setCanEdit(false);
      setExcelData({ workbook: null, currentSheet: '', sheetData: [] });
      setOriginalExcelData([]);
      setAutoSaveMessage('');
      setShowSaveSuccessDialog(false);
    }
    return () => {
      // Cleanup blob URLs
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [open, documentId]);

  // Initialize editor content when entering edit mode (only once)
  const isInitializedRef = useRef(false);
  
  useEffect(() => {
    if (isEditing && editorRef.current && htmlContent && fileType === 'docx' && !isInitializedRef.current) {
      // Set content only once when entering edit mode
      editorRef.current.innerHTML = htmlContent;
      isInitializedRef.current = true;
      
      // Place cursor at the end of the content
      setTimeout(() => {
        if (editorRef.current) {
          const range = window.document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
          editorRef.current.focus();
        }
      }, 0);
    }
    
    // Reset initialization flag when exiting edit mode
    if (!isEditing) {
      isInitializedRef.current = false;
    }
  }, [isEditing, fileType, htmlContent]);

  useEffect(() => {
    // Auto-save every 3 seconds when editing DOCX or CSV
    const hasDocxChanges = fileType === 'docx' && htmlContent !== originalHtmlContent;
    const hasCsvChanges = fileType === 'csv' && 
      excelData.workbook && 
      JSON.stringify(excelData.sheetData) !== JSON.stringify(originalExcelData);
    
    if (isEditing && hasUnsavedChanges && (hasDocxChanges || hasCsvChanges)) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        handleAutoSave();
      }, 3000);

      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }
  }, [htmlContent, isEditing, hasUnsavedChanges, fileType, originalHtmlContent, excelData.sheetData, excelData.workbook, originalExcelData]);

  const detectFileType = (fileName: string, mimeType: string | null): FileType => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    
    if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
    if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (ext === 'doc' || mimeType === 'application/msword') return 'doc';
    if (ext === 'ppt' || mimeType === 'application/vnd.ms-powerpoint') return 'ppt';
    if (ext === 'pptx' || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
    if (['xlsx', 'xls'].includes(ext) || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimeType === 'application/vnd.ms-excel') return 'excel';
    if (ext === 'csv' || mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel') return 'csv';
    if (mimeType?.startsWith('image/')) return 'image';
    if (['txt', 'md', 'json', 'html', 'css', 'js', 'ts', 'xml'].includes(ext) || mimeType?.startsWith('text/')) return 'text';
    
    return 'other';
  };

  const fetchDocument = async () => {
    if (!documentId || !user) return;

    setLoading(true);
    try {
      // Fetch document info first, then fetch related data in parallel
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError || !docData) throw docError || new Error('Document not found');
      
      setDocument(docData);
      const detectedType = detectFileType(docData.name, docData.file_type);
      setFileType(detectedType);

      // Fetch profile, permissions, vault, and admin check in parallel for faster loading
      const [profileResult, permissionsResult, vaultResult, adminCheckResult] = await Promise.allSettled([
        docData.updated_by ? supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', docData.updated_by)
          .maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase
          .from('vault_permissions')
          .select('can_edit')
          .eq('vault_id', docData.vault_id)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('vaults')
          .select('client_id, created_by')
          .eq('id', docData.vault_id)
          .maybeSingle(),
        checkAdminRole()
      ]);

      const profileData = profileResult.status === 'fulfilled' && profileResult.value.data;
      const permissions = permissionsResult.status === 'fulfilled' ? permissionsResult.value.data : null;
      const vault = vaultResult.status === 'fulfilled' ? vaultResult.value.data : null;
      const isAdmin = adminCheckResult.status === 'fulfilled' ? adminCheckResult.value : false;

      if (profileData) {
        setDocument(prev => prev ? { ...prev, updated_by_profile: profileData } : null);
      }

      const hasEditPermission = 
        isAdmin ||
        permissions?.can_edit === true || 
        vault?.client_id === user.id ||
        vault?.created_by === user.id;

      setCanEdit(hasEditPermission || false);

      // Load document content and log activity in parallel
      await Promise.all([
        loadDocumentContent(docData, detectedType),
        logActivity(docData.vault_id, documentId, 'view', 'document', docData.name).catch(() => {}) // Don't block on logging
      ]);
    } catch (error: any) {
      console.error('Error fetching document:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load document',
        variant: 'destructive',
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const checkAdminRole = async () => {
    if (!user) return false;
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle(); // Use maybeSingle to avoid errors for non-admin users
      return !!data;
    } catch (error) {
      console.error('Error checking admin role:', error);
      return false;
    }
  };

  const loadDocumentContent = async (doc: DocumentInfo, type: FileType) => {
    try {
      // For PDFs and images, use signed URL instead of download for faster loading
      if (type === 'pdf' || type === 'image') {
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 7200); // 2 hours expiry
        
        if (!signedUrlError && signedUrlData?.signedUrl) {
          setBlobUrl(signedUrlData.signedUrl);
          return; // Early return for faster display
        }
      }
      
      // For other types, download the file
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (error) {
        console.error('Storage download error:', error);
        console.error('File path:', doc.file_path);
        console.error('Document:', doc);
        throw error;
      }

      if (!data) {
        throw new Error('No file data received from storage');
      }

      if (type === 'docx' || type === 'doc') {
        // Convert DOCX to HTML for viewing/editing
        const arrayBuffer = await data.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const html = result.value;
        setHtmlContent(html);
        setOriginalHtmlContent(html);
        // Also keep blob for download
        const url = URL.createObjectURL(data);
        setBlobUrl(url);
      } else if (type === 'pdf') {
        // PDF - use blob URL for iframe
        const url = URL.createObjectURL(data);
        setBlobUrl(url);
      } else if (type === 'ppt' || type === 'pptx') {
        // PPT - get signed URL for Office Online viewer (longer expiry)
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 86400); // 24 hours
        
        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error('Error creating signed URL for PPT:', signedUrlError);
          // Fallback: use blob URL directly (may not work with Office Online Viewer)
          const url = URL.createObjectURL(data);
          setBlobUrl(url);
        } else {
          const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrlData.signedUrl)}`;
          setBlobUrl(viewerUrl);
        }
      } else if (type === 'image') {
        // Image - use blob URL
        const url = URL.createObjectURL(data);
        setBlobUrl(url);
      } else if (type === 'excel' || type === 'csv') {
        // For Excel files, use Office Online Viewer for full fidelity (charts, images, formatting, etc.)
        // For CSV, parse and display as editable table
        if (type === 'csv') {
          const text = await data.text();
          const sheetData = parseCsvText(text);
          const workbook = new ExcelJS.Workbook();
          const sheetName = 'Sheet1';
          const worksheet = workbook.addWorksheet(sheetName);
          worksheet.addRows(sheetData);
          
          setExcelData({
            workbook,
            currentSheet: sheetName,
            sheetData: sheetData,
          });
          setOriginalExcelData(JSON.parse(JSON.stringify(sheetData)));
        } else {
          // Excel - get signed URL for Office Online Viewer (longer expiry for reliability)
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('documents')
            .createSignedUrl(doc.file_path, 86400); // 24 hours
          
          if (signedUrlError) {
            console.error('Error creating signed URL:', signedUrlError);
            // Fallback: use blob URL directly (may not work with Office Online Viewer)
            const url = URL.createObjectURL(data);
            setBlobUrl(url);
          } else if (signedUrlData?.signedUrl) {
            // Office Online Viewer requires a publicly accessible URL
            // The signed URL should work, but we need to ensure CORS is configured
            const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrlData.signedUrl)}`;
            setBlobUrl(viewerUrl);
            
            // Also parse for potential future editing capability
            try {
              const arrayBuffer = await data.arrayBuffer();
              const workbook = new ExcelJS.Workbook();
              await workbook.xlsx.load(arrayBuffer);
              const worksheet = workbook.worksheets[0];
              const sheetName = worksheet?.name || 'Sheet1';
              const sheetData = worksheet ? worksheetToSheetData(worksheet) : [['']];
              
              if (!worksheet) {
                workbook.addWorksheet(sheetName).addRows(sheetData);
              }
              
              setExcelData({
                workbook,
                currentSheet: sheetName,
                sheetData: sheetData,
              });
              setOriginalExcelData(JSON.parse(JSON.stringify(sheetData)));
            } catch (error) {
              console.warn('Could not parse Excel for editing:', error);
              // Viewer will still work even if parsing fails
            }
          } else {
            // Fallback to blob URL if signed URL creation fails
            const url = URL.createObjectURL(data);
            setBlobUrl(url);
          }
        }
      } else if (type === 'text') {
        // Text file - read as text
        const text = await data.text();
        setContent(text);
      } else {
        // Other - just store blob URL for download
        const url = URL.createObjectURL(data);
        setBlobUrl(url);
      }
    } catch (error: any) {
      console.error('Error loading document content:', error);
      console.error('Error details:', {
        message: error?.message,
        statusCode: error?.statusCode,
        error: error?.error,
        name: error?.name,
        document: doc.name,
        filePath: doc.file_path,
        fileType: type,
      });
      
      toast({
        title: 'Error loading document',
        description: error?.message || `Failed to load ${doc.name}. ${error?.statusCode === 403 ? 'You may not have permission to access this file.' : 'Please try again or contact support.'}`,
        variant: 'destructive',
      });
    }
  };

  const convertHtmlToDocx = async (html: string): Promise<Blob> => {
    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = html;

    const paragraphs: Paragraph[] = [];
    const nodes = Array.from(tempDiv.childNodes);

    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          paragraphs.push(new Paragraph({ text }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent?.trim();
        
        if (!text) return;

        if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
          const level = tagName === 'h1' ? HeadingLevel.HEADING_1 : 
                       tagName === 'h2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
          paragraphs.push(new Paragraph({ text, heading: level }));
        } else if (tagName === 'p' || tagName === 'div') {
          const bold = element.querySelector('strong, b');
          const italic = element.querySelector('em, i');
          paragraphs.push(new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: !!bold,
                italics: !!italic,
              }),
            ],
          }));
        } else {
          paragraphs.push(new Paragraph({ text }));
        }
      }
    });

    if (paragraphs.length === 0) {
      const allText = tempDiv.textContent?.trim() || ' ';
      paragraphs.push(new Paragraph({ text: allText }));
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    });

    const blob = await Packer.toBlob(doc);
    return blob;
  };

  const logActivity = async (
    vaultId: string,
    docId: string | null,
    action: string,
    resourceType: string,
    resourceName?: string
  ) => {
    try {
      await supabase.rpc('log_activity', {
        p_vault_id: vaultId,
        p_action: action,
        p_resource_type: resourceType,
        p_document_id: docId || null,
        p_folder_id: null,
        p_resource_name: resourceName || null,
        p_metadata: null,
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const parseCsvText = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          current += '"';
          i += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          row.push(current);
          current = '';
        } else if (char === '\n') {
          row.push(current);
          rows.push(row);
          row = [];
          current = '';
        } else if (char !== '\r') {
          current += char;
        }
      }
    }

    row.push(current);
    rows.push(row);

    if (rows.length > 1 && rows[rows.length - 1].every((cell) => cell === '') && text.endsWith('\n')) {
      rows.pop();
    }

    return rows.length ? rows : [['']];
  };

  const worksheetToSheetData = (worksheet: ExcelJS.Worksheet): string[][] => {
    const sheetData: string[][] = [];
    const maxColumns = Math.max(worksheet.actualColumnCount || 1, 1);

    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const rowData: string[] = [];
      for (let col = 1; col <= maxColumns; col += 1) {
        const cell = row.getCell(col);
        rowData.push(cell?.text ?? String(cell?.value ?? ''));
      }
      sheetData.push(rowData);
    });

    if (sheetData.length === 0) {
      sheetData.push(Array(maxColumns).fill(''));
    }

    return sheetData;
  };

  const applySheetDataToWorkbook = (workbook: ExcelJS.Workbook, sheetName: string, sheetData: string[][]) => {
    const targetName = sheetName || workbook.worksheets[0]?.name || 'Sheet1';
    let worksheet = workbook.getWorksheet(targetName);

    if (!worksheet) {
      worksheet = workbook.addWorksheet(targetName);
    }

    worksheet.spliceRows(1, worksheet.rowCount);
    const rowsToAdd = sheetData.length ? sheetData : [['']];
    worksheet.addRows(rowsToAdd);
  };

  const convertExcelDataToBlob = async (workbook: ExcelJS.Workbook, fileName: string): Promise<Blob> => {
    // Determine output type based on file extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    const buffer = ext === 'csv'
      ? await workbook.csv.writeBuffer()
      : await workbook.xlsx.writeBuffer();

    return new Blob([buffer], { 
      type: ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
  };

  const handleAutoSave = async () => {
    if (!document || !user || !canEdit || !isEditing) return;
    
    // Check for changes
    if (fileType === 'docx' || fileType === 'doc') {
      if (htmlContent === originalHtmlContent) return;
    } else if (fileType === 'csv') {
      const hasChanges = JSON.stringify(excelData.sheetData) !== JSON.stringify(originalExcelData);
      if (!hasChanges) return;
    } else {
      return;
    }

    setIsSaving(true);
    try {
      let fileBlob: Blob;
      let contentType: string;

      if (fileType === 'docx' || fileType === 'doc') {
        fileBlob = await convertHtmlToDocx(htmlContent);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (fileType === 'csv') {
        if (!excelData.workbook) {
          throw new Error('Workbook data not available');
        }
        // Ensure current sheet is saved to workbook before saving
        applySheetDataToWorkbook(excelData.workbook, excelData.currentSheet, excelData.sheetData);
        fileBlob = await convertExcelDataToBlob(excelData.workbook, document.name);
        contentType = 'text/csv';
      } else if (fileType === 'excel') {
        // For Excel files viewed in Office Online Viewer, download original
        // Editing Excel files with full fidelity is not supported via our viewer
        // Users should download, edit, and re-upload if needed
        const { data: fileData } = await supabase.storage
          .from('documents')
          .download(document.file_path);
        if (!fileData) throw new Error('File not found');
        fileBlob = fileData;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        return;
      }
      
      // Strategy: Always use DELETE + INSERT pattern for updates
      // This ensures RLS policies work correctly (upsert may not work well with RLS)
      let uploadError = null;
      
      // First, try to remove the existing file (if it exists)
      // This is needed because storage updates work via DELETE + INSERT
      console.log('Removing existing file before re-uploading...');
      console.log('File path:', document.file_path);
      console.log('User ID:', user.id);
      console.log('Can Edit:', canEdit);
      console.log('Document ID:', document.id);
      console.log('Vault ID:', document.vault_id);
      
      const { error: removeError } = await supabase.storage
        .from('documents')
        .remove([document.file_path]);
      
      // Ignore "not found" errors - file might not exist yet
      if (removeError && !removeError.message?.includes('not found') && removeError.message !== 'Object not found') {
        console.error('Cannot remove existing file for update:', {
          error: removeError,
          message: removeError.message,
          statusCode: removeError.statusCode,
          filePath: document.file_path,
          userId: user.id,
          documentId: document.id,
          vaultId: document.vault_id,
        });
        
        // Check if it's a permission error
        if (removeError.statusCode === 403 || removeError.message?.includes('permission') || removeError.message?.includes('policy')) {
          throw new Error(`Permission denied: Cannot delete this file. You don't have permission to update this file. Please ensure you have edit permissions for this dataroom.`);
        } else {
          throw new Error(`Cannot delete file: ${removeError.message}. Please try again.`);
        }
      }
      
      console.log('File removal successful (or file did not exist), uploading new version...');
      
      // Now upload the new file (INSERT operation)
      const uploadAttempt = await supabase.storage
        .from('documents')
        .upload(document.file_path, fileBlob, {
          contentType,
          // Don't use upsert - we already deleted the old file
        });
      
      uploadError = uploadAttempt.error;

      if (uploadError) {
        console.error('Final upload error:', {
          message: uploadError.message,
          statusCode: uploadError.statusCode,
          error: uploadError.error,
          filePath: document.file_path,
          contentType,
          fileSize: fileBlob.size,
          userId: user.id,
          documentId: document.id,
          vaultId: document.vault_id,
          canEdit: canEdit,
        });
        
        // Provide user-friendly error message
        let errorMessage = uploadError.message || 'Failed to save file';
        if (uploadError.statusCode === 403 || uploadError.message?.includes('permission') || uploadError.message?.includes('policy') || uploadError.message?.includes('row-level security')) {
          errorMessage = `Permission denied: ${uploadError.message || 'You may not have permission to upload/update this file. Please check your edit permissions for this dataroom.'}`;
        }
        throw new Error(errorMessage);
      }

      const { error: updateError } = await supabase
        .from('documents')
        .update({
          updated_by: user.id,
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      if (updateError) {
        console.error('Document update error details:', {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
          documentId: document.id,
          userId: user.id,
          vaultId: document.vault_id,
        });
        throw updateError;
      }

      const { data: updatedDoc } = await supabase
        .from('documents')
        .select('*')
        .eq('id', document.id)
        .single();

      if (updatedDoc?.updated_by) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', updatedDoc.updated_by)
          .maybeSingle(); // Use maybeSingle to gracefully handle RLS restrictions

        if (profileData) {
          setDocument(prev => prev ? { ...prev, updated_by_profile: profileData, last_updated_at: updatedDoc.last_updated_at } : null);
        }
      }

      if (fileType === 'docx' || fileType === 'doc') {
        setOriginalHtmlContent(htmlContent);
      } else if (fileType === 'csv') {
        if (excelData.workbook) {
          applySheetDataToWorkbook(excelData.workbook, excelData.currentSheet, excelData.sheetData);
        }
        setOriginalExcelData(JSON.parse(JSON.stringify(excelData.sheetData)));
      }
      setHasUnsavedChanges(false);

      await logActivity(document.vault_id, document.id, 'edit', 'document', document.name);

      // Show subtle auto-save message in top bar (no toast)
      setAutoSaveMessage('Document auto-saved');
      setTimeout(() => {
        setAutoSaveMessage('');
      }, 2000);
    } catch (error: any) {
      console.error('=== AUTO-SAVE ERROR ===');
      console.error('Error object:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      console.error('Error name:', error?.name);
      console.error('Full error details:', {
        message: error?.message,
        name: error?.name,
        cause: error?.cause,
        statusCode: error?.statusCode,
        error: error?.error,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      // Only show subtle error message for auto-save
      setAutoSaveMessage('Auto-save failed');
      setTimeout(() => {
        setAutoSaveMessage('');
      }, 3000);
      // Re-throw so manual save can catch it
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSave = async () => {
    console.log('=== MANUAL SAVE BUTTON CLICKED ===');
    console.log('Document exists:', !!document);
    console.log('User exists:', !!user);
    console.log('Can Edit:', canEdit);
    console.log('Is Editing:', isEditing);
    console.log('File Type:', fileType);
    
    if (!document || !user) {
      console.error('Missing required data:', { document: !!document, user: !!user });
      toast({
        title: 'Error',
        description: 'Missing document or user information',
        variant: 'destructive',
      });
      return;
    }
    
    if (!canEdit) {
      console.error('User does not have edit permission');
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to edit this document',
        variant: 'destructive',
      });
      return;
    }
    
    if (!isEditing && (fileType === 'docx' || fileType === 'doc' || fileType === 'csv')) {
      console.warn('Not in edit mode');
      setShowSaveSuccessDialog(true);
      setTimeout(() => {
        setShowSaveSuccessDialog(false);
      }, 2000);
      return;
    }
    
    // Check for changes
    const hasDocxChanges = fileType === 'docx' && htmlContent !== originalHtmlContent;
    const hasCsvChanges = fileType === 'csv' && 
      excelData.workbook && 
      JSON.stringify(excelData.sheetData) !== JSON.stringify(originalExcelData);
    
    console.log('Change detection:', { hasDocxChanges, hasCsvChanges });
    
    if (!hasDocxChanges && !hasCsvChanges) {
      console.log('No changes to save');
      setShowSaveSuccessDialog(true);
      setTimeout(() => {
        setShowSaveSuccessDialog(false);
      }, 2000);
      return;
    }
    
    console.log('Starting manual save process...');
    setIsSaving(true);
    try {
      console.log('Calling handleAutoSave...');
      await handleAutoSave();
      console.log('handleAutoSave completed successfully');
      // Show success dialog
      setShowSaveSuccessDialog(true);
      setTimeout(() => {
        setShowSaveSuccessDialog(false);
      }, 2000);
    } catch (error: any) {
      console.error('=== MANUAL SAVE ERROR ===');
      console.error('Error object:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      console.error('Error name:', error?.name);
      console.error('Error details:', {
        message: error?.message,
        name: error?.name,
        cause: error?.cause,
        statusCode: error?.statusCode,
        error: error?.error,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      
      const errorMessage = error?.message || 'Failed to save changes';
      console.error('Will show error toast with message:', errorMessage);
      
      toast({
        title: 'Save failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      console.log('Manual save finally block - setting isSaving to false');
      setIsSaving(false);
    }
  };

  const handleEdit = () => {
    if (!canEdit || (fileType !== 'docx' && fileType !== 'doc' && fileType !== 'csv')) return;
    setIsEditing(true);
    setHasUnsavedChanges(false);
  };

  const handleCancelEdit = () => {
    if (fileType === 'docx' || fileType === 'doc') {
      setHtmlContent(originalHtmlContent);
    } else if (fileType === 'csv') {
      setExcelData(prev => ({
        ...prev,
        sheetData: JSON.parse(JSON.stringify(originalExcelData)),
      }));
    }
    setIsEditing(false);
    setHasUnsavedChanges(false);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  };

  const handleContentChange = (e: React.FormEvent<HTMLDivElement>) => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      setHtmlContent(newContent);
      setHasUnsavedChanges(newContent !== originalHtmlContent);
      
      // Keep cursor position - the browser handles this automatically on input events
      // We just need to ensure we don't lose it
    }
  };

  const handleDownload = async () => {
    if (!document) return;

    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(document.file_path);

      if (error) throw error;

      // Add watermark to downloaded file
      console.log('Downloading file:', document.name, 'Type:', data.type, 'Size:', data.size);
      try {
        const { addWatermarkToFile } = await import('@/utils/watermark');
        const watermarkedBlob = await addWatermarkToFile(data, document.name);
        console.log('Watermarking completed. Original size:', data.size, 'Watermarked size:', watermarkedBlob.size);
        
        const url = URL.createObjectURL(watermarkedBlob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = document.name;
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (watermarkError) {
        console.error('Watermarking failed, downloading original file:', watermarkError);
        // If watermarking fails, download original file
        const url = URL.createObjectURL(data);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = document.name;
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      await logActivity(document.vault_id, document.id, 'download', 'document', document.name);

      toast({
        title: 'Download started',
        description: `${document.name} is being downloaded`,
      });
    } catch (error: any) {
      console.error('Error downloading:', error);
      toast({
        title: 'Download failed',
        description: error?.message || 'Failed to download document',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    const hasDocxChanges = fileType === 'docx' && htmlContent !== originalHtmlContent;
    const hasCsvChanges = fileType === 'csv' && 
      excelData.workbook &&
      JSON.stringify(excelData.sheetData) !== JSON.stringify(originalExcelData);
    
    if (hasUnsavedChanges && (hasDocxChanges || hasCsvChanges)) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        handleCancelEdit();
        onClose();
      }
    } else {
      handleCancelEdit();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleClose();
      }
    }}>
      <DialogContent className="max-w-none w-[95vw] h-[95vh] p-0 flex flex-col gap-0 rounded-lg [&>button]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Document Viewer</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-gold" />
          </div>
        ) : !document ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-2xl text-foreground mb-2">Document Not Found</h2>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0 relative">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="shrink-0"
                >
                  <X className="w-5 h-5" />
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h1 className="font-display text-2xl text-foreground truncate">{document.name}</h1>
                    {autoSaveMessage && (
                      <span className="text-xs text-muted-foreground font-light animate-fade-in">
                        {autoSaveMessage}
                      </span>
                    )}
                  </div>
                  {document.last_updated_at && document.updated_by_profile && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Last updated by {document.updated_by_profile.full_name || document.updated_by_profile.email} on{' '}
                      {new Date(document.last_updated_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                {isSaving && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="hidden sm:inline">Saving...</span>
                  </div>
                )}
                {hasUnsavedChanges && (
                  <Alert className="py-2 px-3 mr-2">
                    <AlertDescription className="text-xs">Unsaved changes</AlertDescription>
                  </Alert>
                )}
                <div className="flex items-center gap-2">
                  {canEdit && (fileType === 'docx' || fileType === 'doc' || fileType === 'csv') && (
                    <>
                      {isEditing ? (
                        <>
                          <Button variant="outline" onClick={handleCancelEdit}>
                            Cancel
                          </Button>
                          <Button 
                            variant="gold" 
                            onClick={handleManualSave} 
                            disabled={isSaving}
                            className={hasUnsavedChanges ? 'glow-gold' : ''}
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {isSaving ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" onClick={handleEdit}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      )}
                    </>
                  )}
                  <Button variant="outline" onClick={handleDownload}>
                    <Download className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Content Viewer */}
            <div className="flex-1 overflow-auto bg-muted/20">
              {fileType === 'pdf' && blobUrl ? (
                <div className="h-full w-full">
                  <iframe
                    src={blobUrl}
                    className="w-full h-full border-0"
                    title={document.name}
                  />
                </div>
              ) : (fileType === 'docx' || fileType === 'doc') && isEditing ? (
                <div className="h-full p-6 bg-white overflow-auto">
                  <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleContentChange}
                    suppressContentEditableWarning
                    className="w-full min-h-full p-8 bg-white rounded-sm border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 prose prose-sm max-w-none"
                    style={{ color: '#1a1a1a' }}
                  />
                </div>
              ) : (fileType === 'docx' || fileType === 'doc') && !isEditing ? (
                <div className="h-full p-6 bg-white overflow-auto">
                  <div
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                    className="w-full min-h-full p-8 bg-white rounded-sm border border-border prose prose-sm max-w-none"
                    style={{ color: '#1a1a1a' }}
                  />
                </div>
              ) : (fileType === 'ppt' || fileType === 'pptx') && blobUrl ? (
                <div className="h-full w-full">
                  <iframe
                    src={blobUrl.startsWith('http') ? blobUrl : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(blobUrl)}`}
                    className="w-full h-full border-0"
                    title={document.name}
                  />
                </div>
              ) : (fileType === 'ppt' || fileType === 'pptx') ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-display text-xl text-foreground mb-2">Presentation File</h3>
                    <p className="text-muted-foreground mb-6">
                      PowerPoint presentations cannot be previewed directly. Please download the file to view it.
                    </p>
                    <Button variant="gold" onClick={handleDownload} size="lg">
                      <Download className="w-5 h-5 mr-2" />
                      Download {document.name}
                    </Button>
                  </div>
                </div>
              ) : fileType === 'image' && blobUrl ? (
                <div className="flex items-center justify-center h-full p-8">
                  <img
                    src={blobUrl}
                    alt={document.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (fileType === 'excel') && blobUrl ? (
                // Excel files - use Office Online Viewer for full fidelity (charts, images, formatting, etc.)
                <div className="h-full w-full bg-white">
                  {blobUrl.startsWith('http') ? (
                    <iframe
                      src={blobUrl}
                      className="w-full h-full border-0"
                      title={document.name}
                      allow="fullscreen"
                      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center max-w-md">
                        <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                        <h3 className="font-display text-xl text-foreground mb-2">Excel File</h3>
                        <p className="text-muted-foreground mb-6">
                          For full viewing with charts, images, and formatting, please download the file and open it in Excel.
                        </p>
                        <Button variant="gold" onClick={handleDownload} size="lg">
                          <Download className="w-5 h-5 mr-2" />
                          Download {document.name}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (fileType === 'csv') && excelData.workbook && excelData.sheetData.length > 0 ? (
                // CSV files - display as editable table
                <div className="h-full overflow-auto bg-white">
                  <div className="overflow-auto">
                    <table className="border-collapse bg-white" style={{ minWidth: '100%' }}>
                      <tbody>
                        {excelData.sheetData.map((row, rowIndex) => {
                          const maxCols = Math.max(...excelData.sheetData.map(r => r.length), 1);
                          const normalizedRow = [...row];
                          // Fill row to match max columns
                          while (normalizedRow.length < maxCols) {
                            normalizedRow.push('');
                          }
                          
                          return (
                            <tr key={rowIndex} className="hover:bg-blue-50 transition-colors">
                              {normalizedRow.map((cell, cellIndex) => (
                                <td 
                                  key={cellIndex}
                                  className={`border border-gray-300 p-2 align-top bg-white text-gray-900 ${
                                    isEditing 
                                      ? 'focus-within:outline-2 focus-within:outline-blue-500 focus-within:outline focus-within:-outline-offset-1 focus-within:z-10 relative' 
                                      : ''
                                  }`}
                                  contentEditable={isEditing}
                                  suppressContentEditableWarning
                                  onBlur={(e) => {
                                    const newData = excelData.sheetData.map((r, idx) => 
                                      idx === rowIndex ? [...r] : [...r]
                                    );
                                    
                                    // Ensure row exists
                                    if (!newData[rowIndex]) {
                                      newData[rowIndex] = [];
                                    }
                                    
                                    // Ensure row is long enough
                                    while (newData[rowIndex].length <= cellIndex) {
                                      newData[rowIndex].push('');
                                    }
                                    
                                    newData[rowIndex][cellIndex] = e.currentTarget.textContent || '';
                                  
                                    // Normalize all rows to same length
                                    const newMaxCols = Math.max(...newData.map(r => r.length), 0);
                                    newData.forEach(r => {
                                      while (r.length < newMaxCols) {
                                        r.push('');
                                      }
                                    });
                                  
                                    setExcelData(prev => ({ 
                                      ...prev, 
                                      sheetData: newData,
                                    }));
                                    const hasChanges = JSON.stringify(newData) !== JSON.stringify(originalExcelData);
                                    setHasUnsavedChanges(hasChanges);
                                  }}
                                  style={{ 
                                    minWidth: '120px', 
                                    minHeight: '24px',
                                    fontSize: '13px',
                                    fontFamily: 'Arial, sans-serif'
                                  }}
                                >
                                  {cell?.toString() || (isEditing ? '' : '\u00A0')}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        {/* Add empty row at the end for editing */}
                        {isEditing && (
                          <tr className="hover:bg-blue-50">
                            {Array(Math.max(...excelData.sheetData.map(r => r.length), 1))
                              .fill(0)
                              .map((_, cellIndex) => (
                                <td 
                                  key={cellIndex}
                                  className="border border-gray-300 p-2 bg-white text-gray-900 focus-within:outline-2 focus-within:outline-blue-500 focus-within:outline focus-within:-outline-offset-1 focus-within:z-10 relative"
                                  contentEditable
                                  suppressContentEditableWarning
                                  onBlur={(e) => {
                                    const newData = [...excelData.sheetData];
                                    // Ensure new row has correct length
                                    const maxCols = Math.max(...excelData.sheetData.map(r => r.length), 0);
                                    const newRow = Array(maxCols).fill('');
                                    newRow[cellIndex] = e.currentTarget.textContent || '';
                                    newData.push(newRow);
                                    
                                    // Normalize all rows
                                    const newMaxCols = Math.max(...newData.map(r => r.length), 0);
                                    newData.forEach(r => {
                                      while (r.length < newMaxCols) {
                                        r.push('');
                                      }
                                    });
                                    
                                    setExcelData(prev => ({ 
                                      ...prev, 
                                      sheetData: newData,
                                    }));
                                    setHasUnsavedChanges(JSON.stringify(newData) !== JSON.stringify(originalExcelData));
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      // Move to next row
                                      const nextRow = excelData.sheetData.length;
                                      const maxCols = Math.max(...excelData.sheetData.map(r => r.length), 0);
                                      const newData = [...excelData.sheetData];
                                      if (!newData[nextRow]) {
                                        newData.push(Array(maxCols).fill(''));
                                        setExcelData(prev => ({ ...prev, sheetData: newData }));
                                      }
                                    }
                                  }}
                                  style={{ 
                                    minWidth: '120px', 
                                    minHeight: '24px',
                                    fontSize: '13px',
                                    fontFamily: 'Arial, sans-serif'
                                  }}
                                />
                              ))}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : fileType === 'text' ? (
                <div className="p-6 overflow-auto">
                  <pre className="whitespace-pre-wrap font-mono text-sm bg-background p-6 rounded-sm border border-border">
                    {content}
                  </pre>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <File className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">
                      This file type cannot be previewed. Please download to view.
                    </p>
                    <Button variant="gold" onClick={handleDownload}>
                      <Download className="w-4 h-4 mr-2" />
                      Download File
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
      
      {/* Save Success Dialog */}
      <Dialog open={showSaveSuccessDialog} onOpenChange={setShowSaveSuccessDialog}>
        <DialogContent className="bg-card border-gold/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-lg text-foreground text-center">
              Changes Updated and Saved
            </DialogTitle>
            <p className="text-sm text-muted-foreground text-center mt-2">
              Your changes have been successfully saved.
            </p>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

