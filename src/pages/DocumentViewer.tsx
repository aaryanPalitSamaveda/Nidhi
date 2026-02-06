import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  X,
  Download,
  Save,
  Edit2,
  Eye,
  FileText,
  Image as ImageIcon,
  File,
  Loader2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

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

type FileType = 'pdf' | 'docx' | 'doc' | 'ppt' | 'pptx' | 'image' | 'text' | 'other';

export default function DocumentViewer() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Store return URL from location state (passed when navigating to document)
  const [returnUrl, setReturnUrl] = useState<string>('/dashboard');
  
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
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (documentId) {
      fetchDocument();
    }
    return () => {
      // Cleanup blob URLs
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [documentId]);

  // Initialize editor content when entering edit mode
  useEffect(() => {
    if (isEditing && editorRef.current && htmlContent && fileType === 'docx') {
      editorRef.current.innerHTML = htmlContent;
    }
  }, [isEditing, fileType]);

  useEffect(() => {
    // Auto-save every 3 seconds when editing DOCX
    if (isEditing && hasUnsavedChanges && fileType === 'docx' && htmlContent !== originalHtmlContent) {
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
  }, [htmlContent, isEditing, hasUnsavedChanges, fileType]);

  const detectFileType = (fileName: string, mimeType: string | null): FileType => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    
    if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
    if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (ext === 'doc' || mimeType === 'application/msword') return 'doc';
    if (ext === 'ppt' || mimeType === 'application/vnd.ms-powerpoint') return 'ppt';
    if (ext === 'pptx' || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
    if (mimeType?.startsWith('image/')) return 'image';
    if (['txt', 'md', 'json', 'html', 'css', 'js', 'ts', 'xml'].includes(ext) || mimeType?.startsWith('text/')) return 'text';
    
    return 'other';
  };

  const fetchDocument = async () => {
    if (!documentId || !user) return;

    try {
      // Get return URL from location state, or determine from document
      const stateReturnUrl = (location.state as any)?.returnUrl;
      if (stateReturnUrl) {
        setReturnUrl(stateReturnUrl);
      }

      // Fetch document info
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;
      setDocument(docData);
      
      // If no return URL in state, try to determine from document vault
      if (!stateReturnUrl && docData.vault_id) {
        // Check if user is admin to determine correct path
        const isAdmin = await checkAdminRole();
        setReturnUrl(isAdmin ? `/admin/vaults/${docData.vault_id}` : `/vault/${docData.vault_id}`);
      }

      const detectedType = detectFileType(docData.name, docData.file_type);
      setFileType(detectedType);

      // Fetch updated_by profile if exists
      if (docData.updated_by) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', docData.updated_by)
          .single();
        
        if (profileData) {
          setDocument(prev => prev ? { ...prev, updated_by_profile: profileData } : null);
        }
      }

      // Check edit permissions
      const { data: permissions } = await supabase
        .from('vault_permissions')
        .select('can_edit')
        .eq('vault_id', docData.vault_id)
        .eq('user_id', user.id)
        .single();

      const { data: vault } = await supabase
        .from('vaults')
        .select('client_id, created_by')
        .eq('id', docData.vault_id)
        .single();

      const hasEditPermission = 
        permissions?.can_edit || 
        vault?.client_id === user.id ||
        vault?.created_by === user.id ||
        await checkAdminRole();

      setCanEdit(hasEditPermission || false);

      // Log document view
      await logActivity(docData.vault_id, documentId, 'view', 'document', docData.name);

      // Load document content
      await loadDocumentContent(docData, detectedType);
    } catch (error: any) {
      console.error('Error fetching document:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load document',
        variant: 'destructive',
      });
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  const checkAdminRole = async () => {
    if (!user) return false;
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();
    return !!data;
  };

  const loadDocumentContent = async (doc: DocumentInfo, type: FileType) => {
    try {
      // Get file from storage
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.file_path);

      if (error) throw error;

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
        // PPT - get signed URL for Office Online viewer
        const { data: signedUrlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 3600); // 1 hour expiry
        
        if (signedUrlData?.signedUrl) {
          // Use Office Online viewer with signed URL
          const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrlData.signedUrl)}`;
          setBlobUrl(viewerUrl);
        } else {
          // Fallback to blob URL
          const url = URL.createObjectURL(data);
          setBlobUrl(url);
        }
      } else if (type === 'image') {
        // Image - use blob URL
        const url = URL.createObjectURL(data);
        setBlobUrl(url);
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
      toast({
        title: 'Error',
        description: 'Failed to load document content',
        variant: 'destructive',
      });
    }
  };

  const convertHtmlToDocx = async (html: string): Promise<Blob> => {
    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Extract text content and create paragraphs
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
          // Check for bold/italic
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

    // If no paragraphs, create one from all text
    if (paragraphs.length === 0) {
      const allText = tempDiv.textContent?.trim() || ' ';
      paragraphs.push(new Paragraph({ text: allText }));
    }

    // Create DOCX document
    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    });

    // Generate blob
    const blob = await Packer.toBlob(doc);
    return blob;
  };

  const logActivity = async (
    vaultId: string,
    documentId: string | null,
    action: string,
    resourceType: string,
    resourceName?: string
  ) => {
    try {
      await supabase.rpc('log_activity', {
        p_vault_id: vaultId,
        p_action: action,
        p_resource_type: resourceType,
        p_document_id: documentId || null,
        p_folder_id: null,
        p_resource_name: resourceName || null,
        p_metadata: null,
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const handleAutoSave = async () => {
    if (!document || !user || !canEdit || !isEditing || fileType !== 'docx') return;
    if (htmlContent === originalHtmlContent) return;

    setIsSaving(true);
    try {
      // Convert HTML back to DOCX
      const docxBlob = await convertHtmlToDocx(htmlContent);
      
      // Upload updated DOCX to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .update(document.file_path, docxBlob, {
          upsert: true,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

      if (uploadError) throw uploadError;

      // Update document metadata
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          updated_by: user.id,
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      if (updateError) throw updateError;

      // Fetch updated document with profile
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
          .single();

        if (profileData) {
          setDocument(prev => prev ? { ...prev, updated_by_profile: profileData, last_updated_at: updatedDoc.last_updated_at } : null);
        }
      }

      setOriginalHtmlContent(htmlContent);
      setHasUnsavedChanges(false);

      // Log edit activity
      await logActivity(document.vault_id, document.id, 'edit', 'document', document.name);

      toast({
        title: 'Auto-saved',
        description: 'Your changes have been saved',
      });
    } catch (error: any) {
      console.error('Error auto-saving:', error);
      toast({
        title: 'Save failed',
        description: error?.message || 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSave = async () => {
    await handleAutoSave();
  };

  const handleEdit = () => {
    if (!canEdit || (fileType !== 'docx' && fileType !== 'doc')) return;
    setIsEditing(true);
    setHasUnsavedChanges(false);
  };

  const handleCancelEdit = () => {
    setHtmlContent(originalHtmlContent);
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
        const a = document.createElement('a');
        a.href = url;
        a.download = document.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (watermarkError) {
        console.error('Watermarking failed, downloading original file:', watermarkError);
        // If watermarking fails, download original file
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = document.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      }

      // Log download activity
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
    if (hasUnsavedChanges && htmlContent !== originalHtmlContent) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        // Navigate back to the vault/folder they came from
        navigate(returnUrl);
      }
    } else {
      // Navigate back to the vault/folder they came from
      navigate(returnUrl);
    }
  };

  // For PPT files, we'll provide a download option since Office Online requires public URLs
  // In production, you could generate a signed URL from Supabase storage

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
        </div>
      </DashboardLayout>
    );
  }

  if (!document) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-display text-2xl text-foreground mb-2">Document Not Found</h2>
            <Button variant="gold" onClick={() => navigate(-1)}>Go Back</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card/50 backdrop-blur-sm">
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
              <h1 className="font-display text-2xl text-foreground truncate">{document.name}</h1>
              {document.last_updated_at && document.updated_by_profile && (
                <p className="text-sm text-muted-foreground mt-1">
                  Last updated by {document.updated_by_profile.full_name || document.updated_by_profile.email} on{' '}
                  {new Date(document.last_updated_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {isSaving && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </div>
            )}
            {hasUnsavedChanges && (
              <Alert className="py-2 px-3">
                <AlertDescription className="text-xs">Unsaved changes</AlertDescription>
              </Alert>
            )}
            {canEdit && (fileType === 'docx' || fileType === 'doc') && (
              <>
                {isEditing ? (
                  <>
                    <Button variant="outline" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                    <Button 
                      variant="gold" 
                      onClick={handleManualSave} 
                      disabled={isSaving || !hasUnsavedChanges}
                      className={hasUnsavedChanges ? 'glow-gold' : ''}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
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
              Download
            </Button>
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
            <div className="h-full p-6 bg-white">
              <div
                ref={editorRef}
                contentEditable
                onInput={handleContentChange}
                suppressContentEditableWarning
                className="w-full h-full p-8 bg-white rounded-sm border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 prose prose-sm max-w-none overflow-auto"
                style={{ minHeight: '100%', color: '#1a1a1a' }}
              />
            </div>
          ) : (fileType === 'docx' || fileType === 'doc') && !isEditing ? (
            <div className="h-full p-6 bg-white">
              <div
                dangerouslySetInnerHTML={{ __html: htmlContent }}
                className="w-full h-full p-8 bg-white rounded-sm border border-border prose prose-sm max-w-none overflow-auto"
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
                  PowerPoint presentations cannot be previewed directly. Please download the file to view it in Microsoft PowerPoint or another compatible application.
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
          ) : fileType === 'text' ? (
            <div className="p-6">
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
      </div>
    </DashboardLayout>
  );
}
