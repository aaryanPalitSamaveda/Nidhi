import { useEffect, useState, useCallback } from 'react';
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

  const fetchVaultData = useCallback(async () => {
    if (!vaultId || !user) return;

    try {
      // Fetch vault info
      const { data: vaultData, error: vaultError } = await supabase
        .from('vaults')
        .select('id, name, description')
        .eq('id', vaultId)
        .single();

      if (vaultError) throw vaultError;
      setVault(vaultData);

      // Fetch NDA templates for both seller and investor
      const { data: ndaTemplates } = await supabase
        .from('nda_templates')
        .select('*')
        .eq('vault_id', vaultId);
      
      if (ndaTemplates) {
        const sellerTemplate = ndaTemplates.find(t => t.role_type === 'seller');
        const investorTemplate = ndaTemplates.find(t => t.role_type === 'investor');
        setSellerNdaTemplate(sellerTemplate || null);
        setInvestorNdaTemplate(investorTemplate || null);
      } else {
        setSellerNdaTemplate(null);
        setInvestorNdaTemplate(null);
      }

      // Log vault access
      try {
        await supabase.rpc('log_activity', {
          p_vault_id: vaultId,
          p_action: 'view',
          p_resource_type: 'vault',
          p_document_id: null,
          p_folder_id: null,
          p_resource_name: vaultData.name,
          p_metadata: null,
        });
      } catch (logError) {
        // Don't show error, logging is not critical
        console.error('Error logging vault access:', logError);
      }

      // Fetch folders in current directory
      let foldersQuery = supabase
        .from('folders')
        .select('*')
        .eq('vault_id', vaultId)
        .order('name');
      
      if (currentFolderId === null) {
        foldersQuery = foldersQuery.is('parent_id', null);
      } else {
        foldersQuery = foldersQuery.eq('parent_id', currentFolderId);
      }
      
      const { data: foldersData, error: foldersError } = await foldersQuery;

      if (foldersError) {
        console.error('Error fetching folders:', foldersError);
        toast({
          title: 'Error loading folders',
          description: foldersError.message || 'Failed to load folders. You may not have permission.',
          variant: 'destructive',
        });
      }
      setFolders(foldersData || []);

      // Fetch documents in current directory
      let docsQuery = supabase
        .from('documents')
        .select('id, name, file_path, file_size, file_type, created_at, updated_by, last_updated_at')
        .eq('vault_id', vaultId)
        .order('name');
      
      if (currentFolderId === null) {
        docsQuery = docsQuery.is('folder_id', null);
      } else {
        docsQuery = docsQuery.eq('folder_id', currentFolderId);
      }
      
      const { data: docsData, error: docsError } = await docsQuery;

      // Fetch updated_by profiles and recent activities for documents
      if (docsData) {
        const updatedByIds = [...new Set(docsData.map(d => d.updated_by).filter(Boolean))] as string[];
        const docIds = docsData.map(d => d.id);
        
        // Fetch profiles
        let profilesMap = new Map();
        if (updatedByIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', updatedByIds);
          profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
        }
        
        // Fetch recent activities (last view and last edit) for each document
        const { data: activities } = await supabase
          .from('activity_logs')
          .select('document_id, action, created_at, user_id')
          .in('document_id', docIds)
          .in('action', ['view', 'edit'])
          .order('created_at', { ascending: false });

        // Get user profiles for activities
        const activityUserIds = [...new Set(activities?.map(a => a.user_id).filter(Boolean) || [])] as string[];
        let activityProfilesMap = new Map();
        if (activityUserIds.length > 0) {
          const { data: activityProfiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', activityUserIds);
          activityProfilesMap = new Map(activityProfiles?.map(p => [p.id, p]) || []);
        }

        // Group activities by document and get most recent view and edit
        const activitiesByDoc = new Map<string, { lastView?: any; lastEdit?: any }>();
        activities?.forEach(activity => {
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
        
        // Combine documents with profiles and activities
        const docsWithData = docsData.map(doc => {
          const docActivities = activitiesByDoc.get(doc.id);
          const recentActivities: DocumentActivity[] = [];
          
          // Always show view first, then edit
          if (docActivities?.lastView && docActivities.lastView.created_at !== docActivities?.lastEdit?.created_at) {
            recentActivities.push(docActivities.lastView);
          }
          if (docActivities?.lastEdit) {
            recentActivities.push(docActivities.lastEdit);
          }
          
          return {
            ...doc,
            updated_by_profile: doc.updated_by ? profilesMap.get(doc.updated_by) : undefined,
            recent_activities: recentActivities.slice(0, 2), // Show max 2 activities
          };
        });
        
        setDocuments(docsWithData);
      }

      if (docsError) {
        console.error('Error fetching documents:', docsError);
        console.error('Error details:', JSON.stringify(docsError, null, 2));
        toast({
          title: 'Error loading documents',
          description: docsError.message || docsError.details || 'Failed to load documents. You may not have permission.',
          variant: 'destructive',
        });
        setDocuments([]);
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
        let folderId: string | null = currentFolderId;
        const folderPath: { id: string; name: string }[] = [];
        
        while (folderId) {
          const { data: folder, error: folderError } = await supabase
            .from('folders')
            .select('id, name, parent_id')
            .eq('id', folderId)
            .single();
          
          if (folderError) {
            console.error('Error fetching folder for breadcrumbs:', folderError);
            break;
          }
          
          if (folder) {
            folderPath.unshift({ id: folder.id, name: folder.name });
            folderId = folder.parent_id;
          } else {
            break;
          }
        }
        
        crumbs.push(...folderPath);
      }
      
      setBreadcrumbs(crumbs);
    };
    
    buildBreadcrumbs();
  }, [vault, currentFolderId]);

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

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted/30 rounded w-1/3" />
          <div className="h-64 bg-muted/30 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!vault) {
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
