import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import { FileUploadProgress, FileUploadProgress as FileUploadProgressType } from '@/components/FileUploadProgress';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  FolderLock,
  Folder,
  FileText,
  Plus,
  Upload,
  Trash2,
  ArrowLeft,
  ChevronRight,
  Download,
  MoreVertical,
  FolderPlus,
  Eye,
  Edit2,
  FileSignature,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

interface DocumentActivity {
  user_name: string;
  action: string;
  created_at: string;
}

interface DocumentItem {
  id: string;
  name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
  updated_by: string | null;
  last_updated_at: string | null;
  updated_by_profile?: {
    email: string;
    full_name: string | null;
  };
  recent_activities?: DocumentActivity[];
}

interface VaultInfo {
  id: string;
  name: string;
  description: string | null;
}

export default function VaultDetail() {
  const { vaultId } = useParams<{ vaultId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderIndex, setFolderIndex] = useState<Record<string, { id: string; name: string; parent_id: string | null }>>({});
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgressType[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [isUploadingNDA, setIsUploadingNDA] = useState(false);
  const [isUploadingSellerNDA, setIsUploadingSellerNDA] = useState(false);
  const [isUploadingInvestorNDA, setIsUploadingInvestorNDA] = useState(false);
  const [sellerNdaTemplate, setSellerNdaTemplate] = useState<any>(null);
  const [investorNdaTemplate, setInvestorNdaTemplate] = useState<any>(null);
  const [renamingItem, setRenamingItem] = useState<{ type: 'folder' | 'document'; id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Audit module (admin-only)
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);
  const [isAuditExpanded, setIsAuditExpanded] = useState(true);
  const [auditJobId, setAuditJobId] = useState<string | null>(null);
  const [auditJob, setAuditJob] = useState<any>(null);
  const [auditIsRunning, setAuditIsRunning] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const isRestartingRef = useRef(false);

  // Build a folder index once per vault (avoids N+1 queries when building breadcrumbs)
  useEffect(() => {
    if (!vaultId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('vault_id', vaultId);
      if (cancelled) return;
      if (error) {
        console.warn('Failed to build folder index:', error);
        setFolderIndex({});
        return;
      }
      const idx: Record<string, { id: string; name: string; parent_id: string | null }> = {};
      (data || []).forEach((f) => {
        idx[f.id] = { id: f.id, name: f.name, parent_id: f.parent_id };
      });
      setFolderIndex(idx);
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultId]);

  const fetchVaultData = useCallback(async () => {
    if (!vaultId || !user) return;

    // Don't show loading spinner if we already have vault data (refresh scenario)
    const isRefresh = !!vault;
    if (!isRefresh) {
      setLoading(true);
    }

    try {
      // Step 1: Fetch vault name FIRST (fastest, needed for header)
      const vaultRes = await supabase.from('vaults').select('id, name, description').eq('id', vaultId).single();
      if (vaultRes.error) throw vaultRes.error;
      setVault(vaultRes.data);
      
      // CRITICAL: Stop blocking UI immediately after we have vault name
      setLoading(false);

      // Step 2: Fetch folders and documents in parallel (non-blocking now)
      const [foldersRes, docsRes] = await Promise.all([
        (() => {
          let q = supabase.from('folders').select('*').eq('vault_id', vaultId).order('name');
          q = currentFolderId === null ? q.is('parent_id', null) : q.eq('parent_id', currentFolderId);
          return q;
        })(),
        (() => {
          let q = supabase
            .from('documents')
            .select('id, name, file_path, file_size, file_type, created_at, updated_by, last_updated_at')
        .eq('vault_id', vaultId)
        .order('name');
          q = currentFolderId === null ? q.is('folder_id', null) : q.eq('folder_id', currentFolderId);
          return q;
        })(),
      ]);

      if (foldersRes.error) {
        console.error('Error fetching folders:', foldersRes.error);
        toast({
          title: 'Error loading folders',
          description: foldersRes.error.message || 'Failed to load folders. You may not have permission.',
          variant: 'destructive',
        });
        setFolders([]);
      } else {
        setFolders(foldersRes.data || []);
      }

      if (docsRes.error) {
        console.error('Error fetching documents:', docsRes.error);
        console.error('Error details:', JSON.stringify(docsRes.error, null, 2));
        toast({
          title: 'Error loading documents',
          description: docsRes.error.message || (docsRes.error as any).details || 'Failed to load documents. You may not have permission.',
          variant: 'destructive',
        });
        setDocuments([]);
      } else {
        // Set documents immediately (fast). We enrich with activity/profile data in the background.
        setDocuments(docsRes.data || []);
      }

      // Background tasks (non-blocking)
      // 1) NDA templates (only needed for the NDA section)
      supabase
        .from('nda_templates')
        .select('id, role_type, file_path, name, created_at')
        .eq('vault_id', vaultId)
        .then(({ data: ndaTemplates }) => {
          const sellerTemplate = ndaTemplates?.find((t: any) => t.role_type === 'seller');
          const investorTemplate = ndaTemplates?.find((t: any) => t.role_type === 'investor');
          setSellerNdaTemplate(sellerTemplate || null);
          setInvestorNdaTemplate(investorTemplate || null);
        })
        .catch((e) => console.warn('Failed to load NDA templates:', e));

      // 2) Log vault access (non-critical)
      (async () => {
        try {
          await supabase.rpc('log_activity', {
            p_vault_id: vaultId,
            p_action: 'view',
            p_resource_type: 'vault',
            p_document_id: null,
            p_folder_id: null,
            p_resource_name: vaultRes.data.name,
            p_metadata: null,
          });
        } catch (e) {
          console.warn('Error logging vault access:', e);
        }
      })();

      // 3) Enrich documents with updated_by profile + recent activity (expensive)
      // Do it asynchronously so the list renders immediately.
      const docsData = docsRes.data || [];
      if (docsData.length > 0) {
        // Limit enrichment on large folders; prevents huge activity_logs queries
        const MAX_ENRICH_DOCS = 60;
        const docsForEnrichment = docsData.slice(0, MAX_ENRICH_DOCS);
        const updatedByIds = [...new Set(docsForEnrichment.map((d: any) => d.updated_by).filter(Boolean))] as string[];
        const docIds = docsForEnrichment.map((d: any) => d.id);

        setTimeout(async () => {
          try {
        let profilesMap = new Map();
        if (updatedByIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', updatedByIds);
              profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);
        }
        
        const { data: activities } = await supabase
          .from('activity_logs')
          .select('document_id, action, created_at, user_id')
          .in('document_id', docIds)
          .in('action', ['view', 'edit'])
              .order('created_at', { ascending: false })
              .limit(300);

            const activityUserIds = [...new Set(activities?.map((a) => a.user_id).filter(Boolean) || [])] as string[];
        let activityProfilesMap = new Map();
        if (activityUserIds.length > 0) {
          const { data: activityProfiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', activityUserIds);
              activityProfilesMap = new Map(activityProfiles?.map((p) => [p.id, p]) || []);
        }

        const activitiesByDoc = new Map<string, { lastView?: any; lastEdit?: any }>();
            activities?.forEach((activity) => {
          if (!activitiesByDoc.has(activity.document_id)) {
            activitiesByDoc.set(activity.document_id, {});
          }
          const docActivities = activitiesByDoc.get(activity.document_id)!;
          const profile = activityProfilesMap.get(activity.user_id);
          const activityData = {
            user_name: profile?.full_name || profile?.email || 'Unknown',
            action: activity.action,
            created_at: activity.created_at,
          };
          
          if (activity.action === 'view' && !docActivities.lastView) {
            docActivities.lastView = activityData;
          } else if (activity.action === 'edit' && !docActivities.lastEdit) {
            docActivities.lastEdit = activityData;
          }
        });
        
            const enriched = docsData.map((doc: any) => {
          const docActivities = activitiesByDoc.get(doc.id);
          const recentActivities: DocumentActivity[] = [];
          if (docActivities?.lastView && docActivities.lastView.created_at !== docActivities?.lastEdit?.created_at) {
            recentActivities.push(docActivities.lastView);
          }
          if (docActivities?.lastEdit) {
            recentActivities.push(docActivities.lastEdit);
          }
          
          return {
            ...doc,
            updated_by_profile: doc.updated_by ? profilesMap.get(doc.updated_by) : undefined,
                recent_activities: recentActivities.slice(0, 2),
          };
        });
        
            setDocuments(enriched);
          } catch (e) {
            console.warn('Document enrichment failed (non-blocking):', e);
          }
        }, 0);
      }

    } catch (error: any) {
      console.error('Error fetching vault data:', error);
      console.error('Error stack:', error?.stack);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load vault data',
        variant: 'destructive',
      });
    } finally {
      // fetchVaultData might already have setLoading(false) earlier; keep as a safe fallback.
      setLoading(false);
    }
  }, [vaultId, currentFolderId, toast]);

  useEffect(() => {
    fetchVaultData();
  }, [fetchVaultData]);

  useEffect(() => {
    // Build breadcrumbs
    const buildBreadcrumbs = async () => {
      if (!vault) return;
      
      const crumbs: { id: string | null; name: string }[] = [{ id: null, name: vault.name }];
      
      if (currentFolderId) {
        // Fast path: use folderIndex (no network)
        let folderId: string | null = currentFolderId;
        const folderPath: { id: string; name: string }[] = [];
        const seen = new Set<string>();
        while (folderId && !seen.has(folderId)) {
          seen.add(folderId);
          const folder = folderIndex[folderId];
          if (!folder) break;
            folderPath.unshift({ id: folder.id, name: folder.name });
            folderId = folder.parent_id;
          }
        crumbs.push(...folderPath);
      }
      
      setBreadcrumbs(crumbs);
    };
    
    buildBreadcrumbs();
  }, [vault, currentFolderId, folderIndex]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !vaultId || !user) return;

    try {
      const { data: folder, error } = await supabase
        .from('folders')
        .insert({
          vault_id: vaultId,
          parent_id: currentFolderId,
          name: newFolderName,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Log folder creation
      if (folder) {
        try {
          await supabase.rpc('log_activity', {
            p_vault_id: vaultId,
            p_action: 'create_folder',
            p_resource_type: 'folder',
            p_document_id: null,
            p_folder_id: folder.id,
            p_resource_name: newFolderName,
            p_metadata: null,
          });
        } catch (logError) {
          console.error('Error logging folder creation:', logError);
        }
      }

      toast({
        title: 'Folder created',
        description: `${newFolderName} has been created`,
      });

      setNewFolderName('');
      setIsCreateFolderOpen(false);
      fetchVaultData();
    } catch (error: any) {
      console.error('Error creating folder:', error);
      toast({
        title: 'Error creating folder',
        description: error?.message || 'Failed to create folder. You may need edit permissions.',
        variant: 'destructive',
      });
    }
  };

  const uploadFileWithProgress = async (
    file: File,
    filePath: string,
    uploadId: string,
    vaultId: string,
    folderId: string | null
  ): Promise<{ success: boolean; error?: any }> => {
    return new Promise(async (resolve) => {
      try {
        // Check if file needs compression (for Free Plan 50MB limit)
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB
        let fileToUpload = file;
        let isCompressed = false;
        let originalFileName = file.name;

        // Update progress to show compression status
        if (file.size > MAX_SIZE) {
          setUploadProgress(prev => 
            prev.map(upload => 
              upload.id === uploadId 
                ? { ...upload, progress: 5, error: undefined }
                : upload
            )
          );

          try {
            // Lazy import compression utility to avoid module load errors
            const { compressFileIfNeeded, formatFileSize: formatFileSizeUtil } = await import('@/utils/fileCompression');
            const compressionResult = await compressFileIfNeeded(file, MAX_SIZE);
            fileToUpload = compressionResult.compressedFile;
            isCompressed = compressionResult.needsCompression;
            
            if (isCompressed) {
              // Update progress to show compression completed
              setUploadProgress(prev => 
                prev.map(upload => 
                  upload.id === uploadId 
                    ? { ...upload, progress: 10 }
                    : upload
                )
              );
              
              toast({
                title: 'File compressed',
                description: `${file.name} compressed from ${formatFileSizeUtil(file.size)} to ${formatFileSizeUtil(compressionResult.compressedSize)} (${(compressionResult.compressionRatio * 100).toFixed(1)}% of original)`,
              });
            }
          } catch (compressionError: any) {
            // If compression failed and file is still too large, try splitting
            if (file.size > MAX_SIZE) {
              try {
                const { splitFile: splitFileUtil, formatFileSize: formatFileSizeUtil } = await import('@/utils/fileSplitter');
                const splitResult = await splitFileUtil(file, MAX_SIZE - (2 * 1024 * 1024)); // Leave 2MB buffer
                
                // Update progress to show splitting
                setUploadProgress(prev => 
                  prev.map(upload => 
                    upload.id === uploadId 
                      ? { ...upload, progress: 10, error: undefined }
                      : upload
                  )
                );

                toast({
                  title: 'File split into chunks',
                  description: `${file.name} has been split into ${splitResult.chunks.length} chunks for upload. They will be reassembled on download.`,
                });
        
                // Upload all chunks
                const chunkUploadPromises = splitResult.chunks.map(async (chunk, chunkIndex) => {
                  const chunkFilePath = `${filePath}.part${chunk.chunkNumber}of${chunk.totalChunks}`;
                  const chunkFile = new File([chunk.data], chunk.fileName, { type: file.type });
                  
                  const { error: chunkUploadError } = await supabase.storage
          .from('documents')
                    .upload(chunkFilePath, chunkFile, {
                      cacheControl: '3600',
                      upsert: false,
                    });

                  if (chunkUploadError) throw chunkUploadError;

                  // Update progress for this chunk
                  const chunkProgress = 10 + ((chunkIndex + 1) / splitResult.chunks.length) * 80;
                  setUploadProgress(prev => 
                    prev.map(upload => 
                      upload.id === uploadId 
                        ? { ...upload, progress: chunkProgress }
                        : upload
                    )
                  );
                });

                await Promise.all(chunkUploadPromises);

                // Create a metadata document record
                const displayName = `${originalFileName} (split into ${splitResult.chunks.length} parts)`;
                
                const { data: newDoc, error: docError } = await supabase
                  .from('documents')
                  .insert({
                    vault_id: vaultId,
                    folder_id: folderId,
                    name: displayName,
                    file_path: filePath + '.metadata', // Store metadata path
                    file_size: file.size, // Original file size
                    file_type: file.type,
                    uploaded_by: user!.id,
                  })
                  .select()
                  .single();

                if (docError) throw docError;

                // Store chunk metadata in activity log
                if (newDoc) {
                  try {
                    await supabase.rpc('log_activity', {
                      p_vault_id: vaultId,
                      p_action: 'upload',
                      p_resource_type: 'document',
                      p_document_id: newDoc.id,
                      p_folder_id: folderId,
                      p_resource_name: displayName,
                      p_metadata: JSON.stringify({ 
                        split: true, 
                        totalChunks: splitResult.chunks.length,
                        chunkSize: splitResult.chunkSize,
                        originalSize: file.size,
                        chunkPaths: splitResult.chunks.map(c => `${filePath}.part${c.chunkNumber}of${c.totalChunks}`)
                      }),
                    });
                  } catch (logError) {
                    console.error('Error logging upload:', logError);
                  }
                }

                setUploadProgress(prev => 
                  prev.map(upload => 
                    upload.id === uploadId 
                      ? { ...upload, progress: 100, status: 'success' as const }
                      : upload
                  )
                );

                resolve({ success: true });
                return;
              } catch (splitError: any) {
                setUploadProgress(prev => 
                  prev.map(upload => 
                    upload.id === uploadId 
                      ? { ...upload, status: 'error' as const, error: splitError?.message || 'Failed to split file. Please upgrade to Supabase Pro Plan for large file support.' }
                      : upload
                  )
                );
                resolve({ success: false, error: splitError });
                return;
              }
            }

            setUploadProgress(prev => 
              prev.map(upload => 
                upload.id === uploadId 
                  ? { ...upload, status: 'error' as const, error: compressionError?.message || 'Compression failed. File too large. Please upgrade to Supabase Pro Plan.' }
                  : upload
              )
            );
            resolve({ success: false, error: compressionError });
            return;
          }
        }

        // For large files, Supabase automatically handles chunking
        // We'll use a progress simulation that's reasonably accurate
        let progressInterval: NodeJS.Timeout;
        let currentProgress = isCompressed ? 10 : 0;
        
        // Start progress simulation
        const startProgress = () => {
          progressInterval = setInterval(() => {
            // Simulate progress - slower for larger files
            const increment = fileToUpload.size > 100 * 1024 * 1024 ? 2 : 5; // 2% for files > 100MB, 5% for smaller
            currentProgress = Math.min(currentProgress + increment, 85); // Cap at 85% until upload completes
            
            setUploadProgress(prev => 
              prev.map(upload => 
                upload.id === uploadId 
                  ? { ...upload, progress: currentProgress }
                  : upload
              )
            );
          }, fileToUpload.size > 100 * 1024 * 1024 ? 500 : 200); // Update every 500ms for large files, 200ms for smaller
        };

        startProgress();

        // Perform the actual upload
        supabase.storage
          .from('documents')
          .upload(filePath, fileToUpload, {
            cacheControl: '3600',
            upsert: false,
          })
        .then(async ({ error: uploadError }) => {
          clearInterval(progressInterval);

          if (uploadError) {
            setUploadProgress(prev => 
              prev.map(upload => 
                upload.id === uploadId 
                  ? { ...upload, status: 'error' as const, error: uploadError.message || 'Upload failed' }
                  : upload
              )
            );
            resolve({ success: false, error: uploadError });
            return;
          }

          // Update to 90% while creating document record
          setUploadProgress(prev => 
            prev.map(upload => 
              upload.id === uploadId 
                ? { ...upload, progress: 90 }
                : upload
            )
          );

          try {
            // Store metadata about compression in the document name
            // We'll store the original filename in metadata or as a prefix
            const displayName = isCompressed 
              ? originalFileName + ' (compressed)'
              : originalFileName;

        // Create document record
        const { data: newDoc, error: docError } = await supabase
          .from('documents')
          .insert({
            vault_id: vaultId,
                folder_id: folderId,
                name: displayName, // Store original name with compression indicator
            file_path: filePath,
                file_size: file.size, // Store original file size
                file_type: file.type, // Store original file type
                uploaded_by: user!.id,
          })
          .select()
          .single();

        if (docError) throw docError;

        // Log upload activity
        if (newDoc) {
          try {
            await supabase.rpc('log_activity', {
              p_vault_id: vaultId,
              p_action: 'upload',
              p_resource_type: 'document',
              p_document_id: newDoc.id,
                  p_folder_id: folderId,
                  p_resource_name: displayName,
                  p_metadata: isCompressed ? JSON.stringify({ compressed: true, originalSize: file.size }) : null,
            });
          } catch (logError) {
            console.error('Error logging upload:', logError);
          }
        }

            // Mark as complete
            setUploadProgress(prev => 
              prev.map(upload => 
                upload.id === uploadId 
                  ? { ...upload, progress: 100, status: 'success' as const }
                  : upload
              )
            );

            resolve({ success: true });
          } catch (error: any) {
            setUploadProgress(prev => 
              prev.map(upload => 
                upload.id === uploadId 
                  ? { ...upload, status: 'error' as const, error: error?.message || 'Failed to create document record' }
                  : upload
              )
            );
            resolve({ success: false, error });
          }
        })
        .catch((error: any) => {
          clearInterval(progressInterval);
          setUploadProgress(prev => 
            prev.map(upload => 
              upload.id === uploadId 
                ? { ...upload, status: 'error' as const, error: error?.message || 'Upload failed' }
                : upload
            )
          );
          resolve({ success: false, error });
        });
      } catch (error: any) {
        setUploadProgress(prev => 
          prev.map(upload => 
            upload.id === uploadId 
              ? { ...upload, status: 'error' as const, error: error?.message || 'Upload failed' }
              : upload
          )
        );
        resolve({ success: false, error });
      }
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !vaultId || !user) return;

    setIsUploading(true);

    // Initialize upload progress for all files
    const initialUploads: FileUploadProgressType[] = Array.from(files).map((file, index) => ({
      id: `${Date.now()}_${index}_${file.name}`,
      file,
      progress: 0,
      status: 'uploading' as const,
    }));
    setUploadProgress(initialUploads);

    try {
      // Upload files in parallel with progress tracking
      const uploadPromises = Array.from(files).map(async (file, index) => {
        const uploadId = initialUploads[index].id;
        const filePath = `${user.id}/${vaultId}/${Date.now()}_${index}_${file.name}`;
        
        return await uploadFileWithProgress(
          file,
          filePath,
          uploadId,
          vaultId,
          currentFolderId
        );
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;

      if (successCount > 0) {
      toast({
        title: 'Upload complete',
          description: `${successCount} file(s) uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      });
      fetchVaultData();
      }

      if (errorCount > 0 && successCount === 0) {
        toast({
          title: 'Upload failed',
          description: `Failed to upload ${errorCount} file(s). Please check the errors and retry.`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error uploading files:', error);
      toast({
        title: 'Upload failed',
        description: error?.message || 'Failed to upload files. You may need upload permissions.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      event.target.value = '';
      // Clear progress after 5 seconds if all successful
      setTimeout(() => {
        setUploadProgress(prev => {
          const allSuccess = prev.every(u => u.status === 'success');
          return allSuccess ? [] : prev;
        });
      }, 5000);
    }
  };

  const handleRemoveUpload = (id: string) => {
    setUploadProgress(prev => prev.filter(upload => upload.id !== id));
  };

  const handleRetryUpload = async (id: string) => {
    const upload = uploadProgress.find(u => u.id === id);
    if (!upload || !vaultId || !user) return;

    // Reset to uploading
    setUploadProgress(prev => 
      prev.map(u => 
        u.id === id 
          ? { ...u, progress: 0, status: 'uploading' as const, error: undefined }
          : u
      )
    );

    const filePath = `${user.id}/${vaultId}/${Date.now()}_${upload.file.name}`;
    const result = await uploadFileWithProgress(
      upload.file,
      filePath,
      id,
      vaultId,
      currentFolderId
    );

    if (result.success) {
      toast({
        title: 'Upload complete',
        description: `${upload.file.name} uploaded successfully`,
      });
      fetchVaultData();
    }
  };

  const handleNDATemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>, roleType: 'seller' | 'investor') => {
    const file = event.target.files?.[0];
    if (!file || !vaultId || !user) return;

    // Only allow Word documents and PDFs
    if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc') && !file.name.endsWith('.pdf')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a Word document (.docx or .doc) or PDF (.pdf)',
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }

    if (roleType === 'seller') {
      setIsUploadingSellerNDA(true);
    } else {
      setIsUploadingInvestorNDA(true);
    }

    try {
      const filePath = `nda_templates/${vaultId}/${roleType}/${Date.now()}_${file.name}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        });

      if (uploadError) throw uploadError;

      // Delete existing template for this role if any
      const existingTemplate = roleType === 'seller' ? sellerNdaTemplate : investorNdaTemplate;
      if (existingTemplate) {
        await supabase.storage.from('documents').remove([existingTemplate.file_path]);
        await supabase.from('nda_templates').delete().eq('id', existingTemplate.id);
      }

      // Create or update NDA template record
      const { error: templateError } = await supabase
        .from('nda_templates')
        .insert({
          vault_id: vaultId,
          role_type: roleType,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
          uploaded_by: user.id,
        });

      if (templateError) throw templateError;

      toast({
        title: `${roleType === 'seller' ? 'Seller' : 'Investor'} NDA Template Uploaded`,
        description: `The ${roleType === 'seller' ? 'Seller' : 'Investor'} NDA template has been uploaded successfully. ${roleType === 'seller' ? 'Sellers' : 'Investors'} will need to sign it before accessing this dataroom.`,
      });

      fetchVaultData();
    } catch (error: any) {
      console.error('Error uploading NDA template:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload NDA template',
        variant: 'destructive',
      });
    } finally {
      if (roleType === 'seller') {
        setIsUploadingSellerNDA(false);
      } else {
        setIsUploadingInvestorNDA(false);
      }
      event.target.value = '';
    }
  };

  const handleRename = async () => {
    if (!renamingItem || !renameValue.trim() || !vaultId || !user) return;

    try {
      if (renamingItem.type === 'folder') {
        const { error } = await supabase
          .from('folders')
          .update({ name: renameValue.trim() })
          .eq('id', renamingItem.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('documents')
          .update({ name: renameValue.trim() })
          .eq('id', renamingItem.id);

        if (error) throw error;
      }

      toast({
        title: 'Renamed successfully',
        description: `${renamingItem.type === 'folder' ? 'Folder' : 'File'} has been renamed.`,
      });

      setRenamingItem(null);
      setRenameValue('');
      fetchVaultData();
    } catch (error: any) {
      console.error('Error renaming:', error);
      toast({
        title: 'Rename failed',
        description: error.message || 'Failed to rename',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteNDATemplate = async (roleType: 'seller' | 'investor') => {
    const template = roleType === 'seller' ? sellerNdaTemplate : investorNdaTemplate;
    const roleName = roleType === 'seller' ? 'Seller' : 'Investor';
    
    if (!template || !confirm(`Delete ${roleName} NDA template? ${roleName}s will no longer be required to sign an NDA for this dataroom.`)) return;

    try {
      await supabase.storage.from('documents').remove([template.file_path]);
      await supabase.from('nda_templates').delete().eq('id', template.id);
      
      toast({
        title: `${roleName} NDA Template Deleted`,
        description: `The ${roleName} NDA template has been removed.`,
      });

      if (roleType === 'seller') {
        setSellerNdaTemplate(null);
      } else {
        setInvestorNdaTemplate(null);
      }
      fetchVaultData();
    } catch (error: any) {
      console.error('Error deleting NDA template:', error);
      toast({
        title: 'Delete failed',
        description: error.message || 'Failed to delete NDA template',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (!confirm(`Delete "${folderName}" and all its contents?`)) return;
    if (!vaultId || !user) return;

    try {
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;

      // Log folder deletion
      try {
        await supabase.rpc('log_activity', {
          p_vault_id: vaultId,
          p_action: 'delete',
          p_resource_type: 'folder',
          p_document_id: null,
          p_folder_id: folderId,
          p_resource_name: folderName,
          p_metadata: null,
        });
      } catch (logError) {
        console.error('Error logging folder deletion:', logError);
      }

      toast({
        title: 'Folder deleted',
        description: `${folderName} has been deleted`,
      });

      fetchVaultData();
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete folder',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteDocument = async (docId: string, docName: string, filePath: string) => {
    if (!confirm(`Delete "${docName}"?`)) return;
    if (!vaultId || !user) return;

    try {
      // Delete from storage
      await supabase.storage.from('documents').remove([filePath]);

      // Delete record
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;

      // Log document deletion
      try {
        await supabase.rpc('log_activity', {
          p_vault_id: vaultId,
          p_action: 'delete',
          p_resource_type: 'document',
          p_document_id: docId,
          p_folder_id: null,
          p_resource_name: docName,
          p_metadata: null,
        });
      } catch (logError) {
        console.error('Error logging document deletion:', logError);
      }

      toast({
        title: 'Document deleted',
        description: `${docName} has been deleted`,
      });

      fetchVaultData();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async (filePath: string, fileName: string, docId?: string) => {
    if (!vaultId || !user) return;

    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath);

      if (error) throw error;

      // Add watermark to downloaded file
      console.log('Downloading file:', fileName, 'Type:', data.type, 'Size:', data.size);
      try {
        const { addWatermarkToFile } = await import('@/utils/watermark');
        const watermarkedBlob = await addWatermarkToFile(data, fileName);
        console.log('Watermarking completed. Original size:', data.size, 'Watermarked size:', watermarkedBlob.size);
        
        const url = URL.createObjectURL(watermarkedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
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
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      }

      // Log download activity
      if (docId) {
        try {
          await supabase.rpc('log_activity', {
            p_vault_id: vaultId,
            p_action: 'download',
            p_resource_type: 'document',
            p_document_id: docId,
            p_folder_id: null,
            p_resource_name: fileName,
            p_metadata: null,
          });
        } catch (logError) {
          console.error('Error logging download:', logError);
        }
      }

      toast({
        title: 'Download started',
        description: `${fileName} is being downloaded`,
      });
    } catch (error: any) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Download failed',
        description: error?.message || 'Failed to download file',
        variant: 'destructive',
      });
    }
  };

  const estimateAuditRemainingSeconds = useCallback((job: any) => {
    try {
      // Prefer server-calculated ETA if available (more accurate)
      if (typeof job?.estimated_remaining_seconds === 'number' && job.estimated_remaining_seconds >= 0) {
        return job.estimated_remaining_seconds;
      }
      
      // Fallback to client-side calculation
      if (!job?.started_at) return null;
      const total = Number(job?.total_files ?? 0);
      const processed = Number(job?.processed_files ?? 0);
      if (!total || processed <= 0) return null;
      const startedAt = new Date(job.started_at).getTime();
      const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
      const avgPerFile = elapsedSec / processed;
      const remaining = Math.max(0, Math.round((total - processed) * avgPerFile));
      return remaining;
    } catch {
      return null;
    }
  }, []);

  const formatDuration = useCallback((seconds: number | null) => {
    if (seconds == null || !Number.isFinite(seconds)) return '—';
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${ss}s`;
    return `${ss}s`;
  }, []);

  const startAudit = useCallback(async () => {
    if (!vaultId) return;
    setAuditError(null);
    setAuditIsRunning(true);
    setAuditJob(null);
    setAuditJobId(null);

    try {
      console.log('Starting audit for vault:', vaultId);
      console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
      console.log('Function name: audit-vault');
      
                // Refresh session to ensure we have a fresh token
                const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
                if (!currentSession || sessionError) {
                    throw new Error('No active session. Please log in again.');
                }

                // Explicitly refresh the token to ensure it's valid
                const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
                const session = refreshedSession || currentSession;
                
                if (refreshError) {
                    console.warn('Token refresh failed, using current session:', refreshError);
                }

                // Ensure we have a valid access token
                if (!session?.access_token) {
                    throw new Error('No access token in session. Please log in again.');
                }

                console.log('Session verified, user:', session.user.email);
                console.log('Token expiry:', session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'unknown');
                console.log('Token (first 30 chars):', session.access_token.substring(0, 30) + '...');
                
                // Verify token is not expired
                const now = Math.floor(Date.now() / 1000);
                if (session.expires_at && session.expires_at < now) {
                    throw new Error(`Token expired. Expires: ${new Date(session.expires_at * 1000).toISOString()}, Now: ${new Date().toISOString()}`);
                }
                
                // Verify token format (should be a JWT with 3 parts)
                const tokenParts = session.access_token.split('.');
                if (tokenParts.length !== 3) {
                    throw new Error(`Invalid token format. Expected 3 parts, got ${tokenParts.length}`);
                }
                console.log('Token format verified: 3 parts');

                // Use Supabase client's built-in function invocation (handles auth automatically)
                // This is more reliable than manual fetch
                const { data, error } = await supabase.functions.invoke('audit-vault', {
                    body: { action: 'start', vaultId },
                });
      
                console.log('Function response:', { data, error });
                
                if (error) {
                    console.error('Edge Function error:', error);
                    console.error('Error details:', JSON.stringify(error, null, 2));
                    console.error('Error name:', error?.name);
                    console.error('Error message:', error?.message);
                    console.error('Error context:', error?.context);
                    
                    // If it's a 401, the token might be invalid
                    if (error?.message?.includes('401') || error?.message?.includes('Invalid JWT')) {
                        console.error('=== AUTHENTICATION ERROR ===');
                        console.error('Token might be invalid or expired');
                        console.error('Current session expiry:', session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'unknown');
                    }
        
        // If Supabase client invoke fails, try manual fetch as fallback
        console.log('Trying manual fetch as fallback...');
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const functionUrl = `${supabaseUrl}/functions/v1/audit-vault`;
        
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
          },
          body: JSON.stringify({ action: 'start', vaultId }),
        });
        
        const responseText = await response.text();
        console.log(`Manual fetch HTTP ${response.status} response:`, responseText);
        
        if (!response.ok) {
          let errorMessage = 'Unknown error';
          try {
            const errorBody = JSON.parse(responseText);
            errorMessage = errorBody.error || errorBody.message || errorMessage;
          } catch {
            errorMessage = responseText || errorMessage;
          }
          throw new Error(`Edge Function error (${response.status}): ${errorMessage}`);
        }
        
        const result = { data: JSON.parse(responseText), error: null };
        const { data: finalData } = result;
        
        if (!finalData?.jobId) {
          throw new Error('Audit start failed (no jobId returned)');
        }
        
        // Clear any previous errors since we succeeded
        setAuditError(null);
        setAuditJobId(finalData.jobId);
        localStorage.setItem(`nidhi:auditJobId:${vaultId}`, finalData.jobId);
        
        // Kick off first run
        const runResponse = await fetch(`${supabaseUrl}/functions/v1/audit-vault`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
          },
          body: JSON.stringify({ action: 'run', jobId: finalData.jobId, maxFiles: 2 }),
        });
        
        if (!runResponse.ok) {
          const runErrorText = await runResponse.text();
          throw new Error(`Run failed (${runResponse.status}): ${runErrorText}`);
        }
        
        const runData = await runResponse.json();
        setAuditJob(runData?.job ?? null);
        setAuditIsRunning(false);
        return;
      }
      
      // Success path from Supabase client invoke
      if (!data?.jobId) {
        console.error('No jobId in response:', data);
        throw new Error('Audit start failed (no jobId returned)');
      }

      // Clear any previous errors since we succeeded
      setAuditError(null);
      setAuditJobId(data.jobId);
      localStorage.setItem(`nidhi:auditJobId:${vaultId}`, data.jobId);

      // Kick off first run immediately
      const runRes = await supabase.functions.invoke('audit-vault', {
        body: { action: 'run', jobId: data.jobId, maxFiles: 2 },
      });
      
      if (runRes.error) throw runRes.error;
      setAuditJob(runRes.data?.job ?? null);
      setAuditIsRunning(false);
    } catch (e: any) {
      console.error('Failed to start audit:', e);
      const errorMsg = e?.message || e?.error || 'Failed to start audit';
      const helpfulMsg = errorMsg.includes('Failed to send') 
        ? 'Edge Function not accessible. Please ensure it is deployed: `supabase functions deploy audit-vault`'
        : errorMsg;
      setAuditError(helpfulMsg);
      setAuditIsRunning(false);
    }
  }, [vaultId]);

  const stopAndRestartAudit = useCallback(async () => {
    if (!vaultId || isRestartingRef.current) return;
    
    isRestartingRef.current = true;
    setAuditIsRunning(true);
    
    // Capture current job ID before clearing (for toast message)
    const hadExistingJob = !!auditJobId;
    const jobIdToCancel = auditJobId;
    
    try {
      // Cancel current job if it exists
      if (jobIdToCancel) {
        try {
          await supabase.functions.invoke('audit-vault', {
            body: { action: 'cancel', jobId: jobIdToCancel },
          });
        } catch (e) {
          console.warn('Failed to cancel previous job:', e);
          // Continue anyway to start a new audit
        }
      }

      // Clear current state completely
      setAuditJobId(null);
      setAuditJob(null);
      setAuditError(null);
      localStorage.removeItem(`nidhi:auditJobId:${vaultId}`);

      // Wait for cancellation to complete and state to clear (only if we had a job to cancel)
      if (jobIdToCancel) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Start a new audit
      await startAudit();
      
      toast({
        title: hadExistingJob ? 'Audit Restarted' : 'Audit Started',
        description: hadExistingJob 
          ? 'The previous audit has been cancelled and a new audit has been started.'
          : 'A new audit has been started.',
      });
    } catch (e: any) {
      console.error('Failed to stop and restart audit:', e);
      toast({
        title: 'Error',
        description: e?.message || 'Failed to restart audit. Please try again.',
        variant: 'destructive',
      });
    } finally {
      isRestartingRef.current = false;
      setAuditIsRunning(false);
    }
  }, [vaultId, auditJobId, startAudit, toast]);

  const loadAuditState = useCallback(async () => {
    if (!vaultId || isRestartingRef.current) return; // Don't load state during restart
    setAuditError(null);

    // Prefer persisted job id for this vault
    const persistedJobId = localStorage.getItem(`nidhi:auditJobId:${vaultId}`);
    if (persistedJobId) {
      setAuditJobId(persistedJobId);
      try {
        const { data, error } = await supabase.functions.invoke('audit-vault', {
          body: { action: 'status', jobId: persistedJobId },
        });
        if (error) throw error;
        if (data?.job) {
          // Skip cancelled jobs - clear state instead
          if (data.job.status === 'cancelled') {
            setAuditJobId(null);
            setAuditJob(null);
            localStorage.removeItem(`nidhi:auditJobId:${vaultId}`);
            return;
          }
          setAuditJob(data.job);
          return;
        }
      } catch (e: any) {
        // If status fails (job deleted), fall through to DB lookup
        console.warn('Audit status check failed, will try DB lookup:', e?.message || e);
      }
    }

    // Fallback: load latest audit job for this vault from DB (admin-only via RLS)
    // Exclude cancelled jobs - they should not be reloaded
    try {
      const { data: latestJob, error: latestErr } = await supabase
        .from('audit_jobs')
        .select('*')
        .eq('vault_id', vaultId)
        .neq('status', 'cancelled') // Exclude cancelled jobs
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr) throw latestErr;
      if (latestJob?.id) {
        // Skip cancelled jobs - don't load them
        if (latestJob.status === 'cancelled') {
          setAuditJobId(null);
          setAuditJob(null);
          localStorage.removeItem(`nidhi:auditJobId:${vaultId}`);
          return;
        }
        setAuditJobId(latestJob.id);
        setAuditJob(latestJob);
        localStorage.setItem(`nidhi:auditJobId:${vaultId}`, latestJob.id);
      }
    } catch (e: any) {
      console.warn('Failed to load latest audit job:', e?.message || e);
    }
  }, [vaultId]);

  const runAuditBatch = useCallback(async () => {
    if (!auditJobId) return;
    if (auditIsRunning) return;
    
    setAuditIsRunning(true);
    
    try {
      // Retry logic for transient network errors
      const maxRetries = 3;
      let lastError: any = null;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Wait before retry (exponential backoff: 0s, 1s, 2s)
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
        
        // Try Supabase client invoke first
        const { data, error } = await supabase.functions.invoke('audit-vault', {
          body: { action: 'run', jobId: auditJobId, maxFiles: 2 },
        });
        
        if (error) {
          // Check if it's a transient network error
          const errorMsg = error?.message || String(error);
          const isTransientError = 
            errorMsg.includes('Failed to send') ||
            errorMsg.includes('Failed to fetch') ||
            errorMsg.includes('NetworkError') ||
            errorMsg.includes('Network request failed') ||
            errorMsg.includes('fetch');
          
          if (isTransientError && attempt < maxRetries) {
            // Don't log transient errors, just retry silently
            lastError = error;
            continue;
          }
          
          // If Supabase client fails with non-transient error, try manual fetch as fallback
          if (!isTransientError) {
            console.warn('Supabase invoke failed, trying manual fetch:', error);
          }
          
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            if (isTransientError && attempt < maxRetries) {
              lastError = error;
              continue;
            }
            throw error;
          }
          
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const response = await fetch(`${supabaseUrl}/functions/v1/audit-vault`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
            },
            body: JSON.stringify({ action: 'run', jobId: auditJobId, maxFiles: 2 }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            const httpErrorMsg = `Batch failed (${response.status}): ${errorText}`;
            
            // If it's a 5xx error (server error), it might be transient
            if (response.status >= 500 && response.status < 600 && attempt < maxRetries) {
              lastError = new Error(httpErrorMsg);
              continue;
            }
            
            throw new Error(httpErrorMsg);
          }
          
          const fallbackData = await response.json();
          setAuditJob(fallbackData?.job ?? null);
          // Clear error on success
          setAuditError(null);
          return; // Success, exit retry loop
        } else {
          setAuditJob(data?.job ?? null);
          // Clear error on success
          setAuditError(null);
          return; // Success, exit retry loop
        }
      } catch (e: any) {
        lastError = e;
        const errorMsg = e?.message || String(e);
        
        // Check if it's a transient network error
        const isTransientError = 
          errorMsg.includes('Failed to fetch') ||
          errorMsg.includes('Failed to send') ||
          errorMsg.includes('NetworkError') ||
          errorMsg.includes('Network request failed') ||
          errorMsg.includes('fetch') ||
          errorMsg.includes('TypeError');
        
        // If it's a transient error and we have retries left, continue
        if (isTransientError && attempt < maxRetries) {
          // Don't log or show transient errors, just retry silently
          continue;
        }
        
        // If we've exhausted retries or it's not a transient error, handle it
        if (attempt === maxRetries || !isTransientError) {
          // Only log/show non-transient errors or persistent transient errors
          if (!isTransientError) {
            console.error('Audit batch failed (non-transient):', e);
          } else {
            console.warn('Audit batch failed after retries (transient):', e);
          }
          
          // Only set error if it's not a transient network issue and job is still running
          if (!isTransientError && auditJob?.status !== 'completed' && auditJob?.status !== 'failed') {
            setAuditError(errorMsg);
          }
          break; // Exit retry loop
        }
      }
    }
    
    // If we got here after all retries failed, it's a persistent issue
    // But don't show error if it's transient - the next auto-poll will retry
    if (lastError) {
      const errorMsg = lastError?.message || String(lastError);
      const isTransientError = 
        errorMsg.includes('Failed to fetch') ||
        errorMsg.includes('Failed to send') ||
        errorMsg.includes('NetworkError') ||
        errorMsg.includes('Network request failed');
      
      // Only show persistent errors, not transient ones
      if (!isTransientError && auditJob?.status !== 'completed' && auditJob?.status !== 'failed') {
        setAuditError(errorMsg);
      }
    }
    } finally {
      setAuditIsRunning(false);
    }
  }, [auditJobId, auditIsRunning, auditJob?.status]);

  // Load existing audit job state when vault changes (so re-opening doesn't restart)
  useEffect(() => {
    loadAuditState();
  }, [loadAuditState]);

  // Auto-run batches in the background while the vault page is open (dialog can be closed/minimized)
  useEffect(() => {
    if (!auditJobId) return;
    if (auditJob?.status === 'completed' || auditJob?.status === 'failed' || auditJob?.status === 'cancelled') return;
    if (isRestartingRef.current) return; // Don't auto-run during restart

    const t = setInterval(() => {
      // Avoid overlapping runs and don't run during restart
      if (!auditIsRunning && !isRestartingRef.current) {
        runAuditBatch();
      }
    }, 4000);

    return () => clearInterval(t);
  }, [auditJobId, auditJob?.status, auditIsRunning, runAuditBatch]);

  // Refresh status when dialog is opened (to show the exact stage immediately)
  useEffect(() => {
    if (!isAuditDialogOpen) return;
    loadAuditState();
  }, [isAuditDialogOpen, loadAuditState]);

  const downloadAuditReport = useCallback(async () => {
    const md = auditJob?.report_markdown;
    if (!md || !reportContentRef.current) return;

    try {
      toast({
        title: 'Generating PDF...',
        description: 'Please wait while the report is being converted to PDF.',
      });

      // Wait a bit for any rendering to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get the rendered HTML content from ReactMarkdown
      const sourceElement = reportContentRef.current;
      const renderedHTML = sourceElement.innerHTML;
      
      if (!renderedHTML || renderedHTML.trim().length === 0) {
        throw new Error('Report content is empty. Please ensure the report is fully loaded.');
      }

      // Create a temporary container with proper styling for PDF (off-screen, not visible)
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = '210mm'; // A4 width
      tempDiv.style.padding = '20mm';
      tempDiv.style.backgroundColor = '#ffffff';
      tempDiv.style.fontFamily = 'Arial, Helvetica, sans-serif';
      tempDiv.style.fontSize = '12pt';
      tempDiv.style.lineHeight = '1.6';
      tempDiv.style.color = '#000000';
      tempDiv.style.overflow = 'auto';
      
      // Create inner container with prose styles applied inline
      const innerDiv = document.createElement('div');
      innerDiv.innerHTML = renderedHTML;
      
      // Apply prose-like styles inline to ensure they're captured
      innerDiv.style.maxWidth = '100%';
      innerDiv.style.color = '#000000';
      
      // Style headings
      const headings = innerDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((h) => {
        (h as HTMLElement).style.fontWeight = 'bold';
        (h as HTMLElement).style.color = '#000000';
        (h as HTMLElement).style.marginTop = '1em';
        (h as HTMLElement).style.marginBottom = '0.5em';
      });
      
      // Style paragraphs
      const paragraphs = innerDiv.querySelectorAll('p');
      paragraphs.forEach((p) => {
        (p as HTMLElement).style.marginBottom = '1em';
        (p as HTMLElement).style.color = '#000000';
      });
      
      // Style lists
      const lists = innerDiv.querySelectorAll('ul, ol');
      lists.forEach((list) => {
        (list as HTMLElement).style.marginLeft = '1.5em';
        (list as HTMLElement).style.marginBottom = '1em';
        (list as HTMLElement).style.color = '#000000';
      });
      
      // Style list items
      const listItems = innerDiv.querySelectorAll('li');
      listItems.forEach((li) => {
        (li as HTMLElement).style.marginBottom = '0.5em';
        (li as HTMLElement).style.color = '#000000';
      });
      
      // Style strong/bold
      const strongs = innerDiv.querySelectorAll('strong');
      strongs.forEach((s) => {
        (s as HTMLElement).style.fontWeight = 'bold';
        (s as HTMLElement).style.color = '#000000';
      });
      
      // Style code blocks
      const codeBlocks = innerDiv.querySelectorAll('pre, code');
      codeBlocks.forEach((code) => {
        (code as HTMLElement).style.backgroundColor = '#f5f5f5';
        (code as HTMLElement).style.padding = '0.2em 0.4em';
        (code as HTMLElement).style.borderRadius = '3px';
        (code as HTMLElement).style.fontFamily = 'monospace';
      });
      
      tempDiv.appendChild(innerDiv);
      document.body.appendChild(tempDiv);

      // Wait for styles to apply and layout to calculate
      await new Promise(resolve => setTimeout(resolve, 300));

      // Force a reflow to ensure layout is calculated
      void tempDiv.offsetHeight;

      // Capture as canvas with better quality
      // html2canvas can capture off-screen elements
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: tempDiv.scrollWidth,
        height: tempDiv.scrollHeight,
      });

      // Clean up temporary element
      document.body.removeChild(tempDiv);

      // Calculate PDF dimensions
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const pageMargin = 10; // 10mm margin on all sides
      const usablePageHeight = pageHeight - (2 * pageMargin); // Usable height per page
      const usablePageWidth = imgWidth - (2 * pageMargin); // Usable width per page
      
      // Calculate image dimensions in PDF units
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Split image across multiple pages properly
      const imgDataUrl = canvas.toDataURL('image/png');
      let sourceY = 0; // Source Y position in canvas pixels
      let remainingHeight = canvas.height;
      
      while (remainingHeight > 0) {
        // Calculate how much of the image fits on this page
        const sourceHeight = Math.min(
          remainingHeight,
          (usablePageHeight / imgHeight) * canvas.height
        );
        
        // Create a temporary canvas for this page's portion
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;
        const pageCtx = pageCanvas.getContext('2d');
        
        if (!pageCtx) {
          throw new Error('Failed to create canvas context');
        }
        
        // Draw only the portion of the image for this page
        pageCtx.drawImage(
          canvas,
          0, sourceY, canvas.width, sourceHeight, // Source rectangle
          0, 0, canvas.width, sourceHeight // Destination rectangle
        );
        
        // Add to PDF
        const pageImgDataUrl = pageCanvas.toDataURL('image/png');
        // Calculate height maintaining aspect ratio
        // The pageCanvas has width canvas.width and height sourceHeight
        // We want to fit it to usablePageWidth width, so height = (sourceHeight / canvas.width) * usablePageWidth
        // But we also need to account for the overall scale: imgHeight / canvas.height
        // So: pageImgHeight = (sourceHeight / canvas.height) * imgHeight * (usablePageWidth / imgWidth)
        const pageImgHeight = (sourceHeight / canvas.height) * imgHeight * (usablePageWidth / imgWidth);
        
        pdf.addImage(
          pageImgDataUrl,
          'PNG',
          pageMargin,
          pageMargin,
          usablePageWidth,
          pageImgHeight
        );
        
        // Move to next page if there's more content
        sourceY += sourceHeight;
        remainingHeight -= sourceHeight;
        
        if (remainingHeight > 0) {
          pdf.addPage();
        }
      }

      // Get PDF as blob
      const pdfBlob = pdf.output('blob');
      
      // Add watermark to PDF
      const { addWatermarkToFile } = await import('@/utils/watermark');
      const watermarkedBlob = await addWatermarkToFile(pdfBlob, 'audit_report.pdf');

      // Download watermarked PDF
      const fileName = `audit_report_${vaultId}_${auditJob?.id || 'job'}.pdf`;
      const url = URL.createObjectURL(watermarkedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'PDF Generated',
        description: 'The audit report has been downloaded as PDF with watermark.',
      });
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Error generating PDF',
        description: error?.message || 'Failed to generate PDF. Please try again.',
        variant: 'destructive',
      });
    }
  }, [auditJob, vaultId, toast]);

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Show loading spinner ONLY if we don't have vault data yet (first load)
  // On refresh, if we have vault data, show it immediately even if folders/docs are still loading
  if (loading && !vault) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted/30 rounded w-1/3" />
          <div className="h-64 bg-muted/30 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!vault && vaultId) {
    return (
      <DashboardLayout>
        <div className="text-center py-16">
          <FolderLock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="font-display text-2xl text-foreground mb-2">Vault Not Found</h2>
          <p className="text-muted-foreground mb-6">
            This vault doesn't exist or you don't have access to it.
          </p>
          <Link to="/admin/vaults">
            <Button variant="gold">Back to Datarooms</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/admin/vaults">
              <Button variant="ghost" size="icon" className="flex-shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl text-foreground truncate">{vault.name}</h1>
              {vault.description && (
                <p className="text-sm sm:text-base text-muted-foreground truncate">{vault.description}</p>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Dialog open={isAuditDialogOpen} onOpenChange={setIsAuditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="gold" size="sm" className="text-xs sm:text-sm">
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Audit Documents
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <div className="flex items-center justify-between gap-3">
                    <DialogTitle className="font-display text-xl">Audit Documents</DialogTitle>
                    <Collapsible open={isAuditExpanded} onOpenChange={setIsAuditExpanded}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm">
                          {isAuditExpanded ? 'Collapse' : 'Expand'}
                        </Button>
                      </CollapsibleTrigger>
                    </Collapsible>
                  </div>
                </DialogHeader>

                <div className="space-y-4 py-2 flex-1 min-h-0">
                  <div className="rounded-lg border border-gold/10 p-3 bg-muted/10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">
                          This runs an evidence-cited forensic audit. It will only report red flags backed by extracted text/quotes. Batches run automatically every few seconds while processing.
                        </p>
                        {auditError && (
                          <p className="text-sm text-destructive mt-2">{auditError}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="gold"
                          size="sm"
                          onClick={startAudit}
                          disabled={auditIsRunning || (auditJob?.status === 'running' || auditJob?.status === 'queued')}
                        >
                          {auditJob?.status === 'running' || auditJob?.status === 'queued' ? 'Audit Running' : 'Start Audit'}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={stopAndRestartAudit}
                          disabled={auditIsRunning || isRestartingRef.current}
                        >
                          Stop & Restart
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadAuditReport}
                          disabled={!auditJob?.report_markdown}
                        >
                          Download Report
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Status: <span className="text-foreground">{auditJob?.status || (auditJobId ? 'running' : 'not started')}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Files: <span className="text-foreground">{auditJob?.processed_files ?? 0}/{auditJob?.total_files ?? 0}</span>
                          {" · "}
                          ETA: <span className="text-foreground">{formatDuration(estimateAuditRemainingSeconds(auditJob))}</span>
                        </span>
                      </div>
                      <Progress value={Number(auditJob?.progress ?? 0)} className="h-2" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{auditJob?.current_step || '—'}</span>
                        <span>{Math.round(Number(auditJob?.progress ?? 0))}%</span>
                      </div>
                    </div>
                  </div>

                  <Collapsible open={isAuditExpanded} onOpenChange={setIsAuditExpanded}>
                    <CollapsibleContent>
                      <div className="rounded-lg border border-gold/10 overflow-hidden flex-1 min-h-0">
                        <div className="px-3 py-2 border-b border-gold/10 bg-muted/5">
                          <p className="text-sm font-medium text-foreground">Report Preview</p>
                          <p className="text-xs text-muted-foreground">Available after completion. Download for sharing.</p>
                        </div>
                        <ScrollArea className="h-[40vh] p-3">
                          {auditJob?.report_markdown ? (
                            <div 
                              ref={reportContentRef}
                              className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-ul:text-foreground/90 prose-ol:text-foreground/90 prose-li:text-foreground/90 prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground"
                            >
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {auditJob.report_markdown}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Report not generated yet.</p>
                          )}
                        </ScrollArea>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                  <FolderPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">New Folder</span>
                  <span className="sm:hidden">Folder</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-gold/20">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl">Create New Folder</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <Input
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="bg-input border-gold/20"
                  />
                  <Button variant="gold" className="w-full" onClick={handleCreateFolder}>
                    Create Folder
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <label>
              <Button variant="gold" disabled={isUploading} asChild size="sm" className="text-xs sm:text-sm">
                <span>
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{isUploading ? 'Uploading...' : 'Upload Files'}</span>
                  <span className="sm:hidden">{isUploading ? '...' : 'Upload'}</span>
                </span>
              </Button>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>
            
            {/* NDA Template Upload - Separate for Seller and Investor */}
            <div className="flex flex-col gap-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                NDA Templates
              </div>
              
              {/* Seller NDA Template */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground min-w-[80px]">Seller:</span>
                {sellerNdaTemplate ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-gold/20 flex-1">
                    <FileSignature className="w-4 h-4 text-gold" />
                    <span className="text-sm text-foreground flex-1 truncate">{sellerNdaTemplate.file_name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDeleteNDATemplate('seller')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex-1">
                    <Button variant="outline" disabled={isUploadingSellerNDA} asChild className="w-full">
                      <span>
                        <FileSignature className="w-4 h-4 mr-2" />
                        {isUploadingSellerNDA ? 'Uploading...' : 'Upload Seller NDA'}
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept=".docx,.doc,.pdf"
                      className="hidden"
                      onChange={(e) => handleNDATemplateUpload(e, 'seller')}
                      disabled={isUploadingSellerNDA}
                    />
                  </label>
                )}
              </div>

              {/* Investor NDA Template */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground min-w-[80px]">Investor:</span>
                {investorNdaTemplate ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-gold/20 flex-1">
                    <FileSignature className="w-4 h-4 text-gold" />
                    <span className="text-sm text-foreground flex-1 truncate">{investorNdaTemplate.file_name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleDeleteNDATemplate('investor')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex-1">
                    <Button variant="outline" disabled={isUploadingInvestorNDA} asChild className="w-full">
                      <span>
                        <FileSignature className="w-4 h-4 mr-2" />
                        {isUploadingInvestorNDA ? 'Uploading...' : 'Upload Investor NDA'}
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept=".docx,.doc,.pdf"
                      className="hidden"
                      onChange={(e) => handleNDATemplateUpload(e, 'investor')}
                      disabled={isUploadingInvestorNDA}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {uploadProgress.length > 0 && (
          <div className="mb-4 sm:mb-6">
            <FileUploadProgress
              uploads={uploadProgress}
              onRemove={handleRemoveUpload}
              onRetry={handleRetryUpload}
            />
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 sm:gap-2 mb-4 sm:mb-6 text-xs sm:text-sm overflow-x-auto pb-2">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id ?? 'root'} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {index > 0 && <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />}
              <button
                onClick={() => setCurrentFolderId(crumb.id)}
                className={`hover:text-gold transition-colors truncate max-w-[120px] sm:max-w-none ${
                  index === breadcrumbs.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="surface-elevated border border-gold/10 rounded-xl p-3 sm:p-6">
          {folders.length === 0 && documents.length === 0 ? (
            <div className="text-center py-8 sm:py-16">
              <FolderLock className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-lg sm:text-xl text-foreground mb-2">Empty Folder</h2>
              <p className="text-sm sm:text-base text-muted-foreground mb-6">
                Upload files or create folders to get started
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Folders */}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 sm:p-4 rounded-lg hover:bg-muted/30 transition-colors group"
                >
                  <button
                    onClick={() => {
                      setCurrentFolderId(folder.id);
                    }}
                    className="flex items-center gap-4 flex-1 text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                      <Folder className="w-5 h-5 text-gold" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{folder.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(folder.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenamingItem({ type: 'folder', id: folder.id, currentName: folder.name });
                          setRenameValue(folder.name);
                        }}
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteFolder(folder.id, folder.name)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}

              {/* Documents */}
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 sm:p-4 rounded-lg hover:bg-muted/30 transition-colors group"
                >
                  <button
                    onClick={() => {
                      setSelectedDocumentId(doc.id);
                      setIsDocumentModalOpen(true);
                    }}
                    className="flex items-center gap-4 flex-1 text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground mb-1">{doc.name}</p>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-medium">{formatFileSize(doc.file_size)}</span>
                          <span className="text-muted-foreground/50">•</span>
                          <span>{new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        {doc.recent_activities && doc.recent_activities.length > 0 && (
                          <div className="flex items-center gap-3 text-xs">
                            {doc.recent_activities.map((activity, idx) => {
                              const date = new Date(activity.created_at);
                              const timeStr = date.toLocaleString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              });
                              const isEdit = activity.action === 'edit';
                              return (
                                <span key={idx} className="flex items-center gap-1.5 text-muted-foreground/90">
                                  {isEdit ? (
                                    <Edit2 className="w-3 h-3 text-gold/80" />
                                  ) : (
                                    <Eye className="w-3 h-3 text-blue-400/80" />
                                  )}
                                  <span className="font-medium text-foreground/90">{activity.user_name}</span>
                                  <span className="text-muted-foreground/70">{isEdit ? 'edited' : 'viewed'}</span>
                                  <span className="text-muted-foreground/60">{timeStr}</span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDocumentId(doc.id);
                        setIsDocumentModalOpen(true);
                      }}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(doc.file_path, doc.name, doc.id);
                      }}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setSelectedDocumentId(doc.id);
                          setIsDocumentModalOpen(true);
                        }}>
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(doc.file_path, doc.name, doc.id)}>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setRenamingItem({ type: 'document', id: doc.id, currentName: doc.name });
                            setRenameValue(doc.name);
                          }}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteDocument(doc.id, doc.name, doc.file_path)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        documentId={selectedDocumentId}
        open={isDocumentModalOpen}
        onClose={() => {
          setIsDocumentModalOpen(false);
          setSelectedDocumentId(null);
        }}
      />

      {/* Rename Dialog */}
      <Dialog open={renamingItem !== null} onOpenChange={(open) => {
        if (!open) {
          setRenamingItem(null);
          setRenameValue('');
        }
      }}>
        <DialogContent className="bg-card border-gold/20">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              Rename {renamingItem?.type === 'folder' ? 'Folder' : 'File'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              placeholder={`Enter new ${renamingItem?.type === 'folder' ? 'folder' : 'file'} name`}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="bg-input border-gold/20"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename();
                }
              }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setRenamingItem(null);
                  setRenameValue('');
                }}
              >
                Cancel
              </Button>
              <Button variant="gold" onClick={handleRename} disabled={!renameValue.trim()}>
                Rename
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
