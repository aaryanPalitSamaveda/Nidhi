import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import NDAOverlay from '@/components/NDAOverlay';
import { FileUploadProgress, FileUploadProgress as FileUploadProgressType } from '@/components/FileUploadProgress';
import {
  FolderLock,
  Folder,
  FileText,
  Upload,
  Trash2,
  ChevronRight,
  Download,
  MoreVertical,
  FolderPlus,
  ArrowUpRight,
  Eye,
  Edit2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface VaultWithPermission {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  permissions: {
    can_view: boolean;
    can_edit: boolean;
    can_upload: boolean;
    can_delete: boolean;
  };
}

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

export default function ClientVault() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { vaultId: urlVaultId } = useParams<{ vaultId?: string }>();
  
  const [vaults, setVaults] = useState<VaultWithPermission[]>([]);
  const [selectedVault, setSelectedVault] = useState<VaultWithPermission | null>(null);
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
  const [ndaStatus, setNdaStatus] = useState<'checking' | 'signed' | 'unsigned' | 'not_required' | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [effectiveRole, setEffectiveRole] = useState<'seller' | 'investor' | 'admin' | 'client' | null>(null);

  useEffect(() => {
    fetchVaults();
    fetchUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;
    try {
      // Get user role instead of client_type
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      if (!error && data) {
        setUserProfile({ role: data.role });
      } else {
        // If no role found, default to 'investor' (matches getUserRole behavior)
        // This ensures domain-based users can see NDAs if they have access
        setUserProfile({ role: 'investor' });
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
      // Default to 'investor' on error to allow access
      setUserProfile({ role: 'investor' });
    }
  };

  // Check NDA status when vault is selected
  useEffect(() => {
    if (!selectedVault || !user) return;
    
    // Reset effective role when vault changes
    setEffectiveRole(null);
    // Check NDA status (will determine effective role with domain inheritance)
    checkNDAStatus();
  }, [selectedVault, user, userProfile]);

  const checkNDAStatus = async () => {
    if (!selectedVault || !user) return;
    
    setNdaStatus('checking');
    
    try {
      // Get user's role for this vault (with domain inheritance)
      // If aditya@larsentoubro.com is assigned as "Investor", all @larsentoubro.com users get "Investor" role
      const { data: vaultRole, error: roleError } = await supabase.rpc('get_user_role_for_vault', {
        p_user_id: user.id,
        p_vault_id: selectedVault.id,
      });

      if (roleError) {
        console.error('Error getting vault role:', roleError);
      }

      // If no role found (including domain-based), fall back to explicit role
      const role = vaultRole || userProfile?.role;
      setEffectiveRole(role);
      
      console.log('NDA Check - Vault Role:', vaultRole, 'User Profile Role:', userProfile?.role, 'Effective Role:', role);
      
      // Only check for seller and investor roles
      if (!role || (role !== 'seller' && role !== 'investor')) {
        console.log('NDA not required - role is:', role);
        setNdaStatus('not_required');
        return;
      }
      
      // Check if NDA template exists for this role
      const { data: template } = await supabase
        .from('nda_templates')
        .select('id')
        .eq('vault_id', selectedVault.id)
        .eq('role_type', role) // Use effective role (with domain inheritance)
        .single();

      if (!template) {
        // No NDA template for this role, allow access
        setNdaStatus('not_required');
        return;
      }

      // Check if signature exists
      const { data: signature } = await supabase
        .from('nda_signatures')
        .select('status')
        .eq('vault_id', selectedVault.id)
        .eq('user_id', user.id)
        .single();

      if (signature) {
        if (signature.status === 'signed') {
          setNdaStatus('signed');
        } else {
          setNdaStatus('unsigned');
        }
      } else {
        setNdaStatus('unsigned');
      }
    } catch (error) {
      console.error('Error checking NDA status:', error);
      setNdaStatus('not_required'); // On error, allow access (fail open)
    }
  };

  // Auto-select vault from URL parameter
  useEffect(() => {
    if (urlVaultId && vaults.length > 0) {
      const vault = vaults.find(v => v.id === urlVaultId);
      if (vault) {
        setSelectedVault(vault);
      }
    } else if (!urlVaultId && vaults.length > 0 && !selectedVault) {
      // Auto-select first vault if no URL parameter
      setSelectedVault(vaults[0]);
    }
  }, [urlVaultId, vaults, selectedVault]);

  // Refresh vault contents periodically to show latest activity
  // Only fetch if NDA is signed or not required
  useEffect(() => {
    if (!selectedVault || ndaStatus !== 'signed' && ndaStatus !== 'not_required') return;
    
    const interval = setInterval(() => {
      fetchVaultContents({ enrich: false });
    }, 30000); // Refresh every 30 seconds (lighter refresh)
    
    return () => clearInterval(interval);
  }, [selectedVault, currentFolderId, ndaStatus]);

  // Fetch vault contents when NDA status is resolved
  useEffect(() => {
    if (selectedVault && (ndaStatus === 'signed' || ndaStatus === 'not_required')) {
      fetchVaultContents();
    }
  }, [selectedVault, ndaStatus]);

  const fetchVaults = useCallback(async () => {
    if (!user) return;

    try {
      // Query vaults directly - RLS will filter based on has_vault_access() which includes domain-based access
      // This will return vaults where:
      // 1. User has explicit permissions
      // 2. User is the client_id
      // 3. User has domain-based access (same email domain as someone with access)
      const [vaultsResult, permissionsResult] = await Promise.all([
        supabase
          .from('vaults')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('vault_permissions')
          .select('vault_id, can_view, can_edit, can_upload, can_delete')
          .eq('user_id', user.id)
      ]);

      if (vaultsResult.error) throw vaultsResult.error;

      const vaultsData = vaultsResult.data || [];
      const permissions = permissionsResult.data || [];

      const vaultsWithPermissions: VaultWithPermission[] = vaultsData.map(vault => {
        const perm = permissions?.find(p => p.vault_id === vault.id);
        const isClient = vault.client_id === user.id;
        
        // If user has explicit vault_permissions, use those (they override client_id defaults)
        // Otherwise, if user is the client_id, give full access except delete (admin controls that)
        // Otherwise, if user has domain-based access (vault appears due to RLS), give view-only access by default
        if (perm) {
          // User has explicit permissions assigned via "Manage Access"
          return {
            ...vault,
            permissions: {
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              can_upload: perm.can_upload,
              can_delete: perm.can_delete,
            },
          };
        } else if (isClient) {
          // User is the client_id of the vault - give full access
          return {
            ...vault,
            permissions: {
              can_view: true,
              can_edit: true,
              can_upload: true,
              can_delete: true, // Client_id should have full control
            },
          };
        } else {
          // User has domain-based access (vault appears due to RLS has_vault_access)
          // Give view-only access by default - they can see but need explicit permissions for edit/upload/delete
          return {
            ...vault,
            permissions: {
              can_view: true, // Domain-based access grants view
              can_edit: false, // Need explicit permission for edit
              can_upload: false, // Need explicit permission for upload
              can_delete: false, // Need explicit permission for delete
            },
          };
        }
      });

      setVaults(vaultsWithPermissions);
    } catch (error) {
      console.error('Error fetching vaults:', error);
      toast({
        title: 'Error',
        description: 'Failed to load datarooms',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  // Build a folder index once per selected vault (avoids N+1 queries for breadcrumbs)
  useEffect(() => {
    if (!selectedVault) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('vault_id', selectedVault.id);
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
  }, [selectedVault?.id]);

  const fetchVaultContents = useCallback(async (opts?: { enrich?: boolean }) => {
    if (!selectedVault || !user) return;
    const enrich = opts?.enrich ?? true;

    try {
      // Fetch folders + documents in parallel (fast)
      const [foldersRes, docsRes] = await Promise.all([
        (() => {
          let q = supabase.from('folders').select('*').eq('vault_id', selectedVault.id).order('name');
          q = currentFolderId === null ? q.is('parent_id', null) : q.eq('parent_id', currentFolderId);
          return q;
        })(),
        (() => {
          let q = supabase
            .from('documents')
            .select('id, name, file_path, file_size, file_type, created_at, updated_by, last_updated_at')
            .eq('vault_id', selectedVault.id)
            .order('name');
          q = currentFolderId === null ? q.is('folder_id', null) : q.eq('folder_id', currentFolderId);
          return q;
        })(),
      ]);

      if (foldersRes.error) {
        console.error('Error fetching folders:', foldersRes.error);
        toast({
          title: 'Error loading folders',
          description: foldersRes.error.message || 'Failed to load folders',
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
        // Set basic docs immediately (fast)
        const docsData = docsRes.data || [];
        setDocuments(
          docsData.map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            file_path: doc.file_path,
            file_size: doc.file_size ? Number(doc.file_size) : null,
            file_type: doc.file_type || null,
            created_at: doc.created_at,
            updated_by: doc.updated_by || null,
            last_updated_at: doc.last_updated_at || null,
          })),
        );

        // Non-blocking: log access
        supabase
          .rpc('log_activity', {
            p_vault_id: selectedVault.id,
            p_action: 'view',
            p_resource_type: 'vault',
            p_document_id: null,
            p_folder_id: null,
            p_resource_name: selectedVault.name,
            p_metadata: null,
          })
          .catch((e) => console.warn('Error logging vault access:', e));

        // Optional enrichment (profiles + recent activity) in background
        if (enrich && docsData.length > 0) {
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

              const activityUserIds = [...new Set([...(activities?.map((a) => a.user_id).filter(Boolean) || []), ...updatedByIds])] as string[];
              let activityProfilesMap = new Map();
              if (activityUserIds.length > 0) {
                const { data: activityProfiles } = await supabase
                  .from('profiles')
                  .select('id, email, full_name')
                  .in('id', activityUserIds);
                activityProfilesMap = new Map(activityProfiles?.map((p) => [p.id, p]) || []);
                activityProfilesMap.forEach((v, k) => profilesMap.set(k, v));
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
                  id: doc.id,
                  name: doc.name,
                  file_path: doc.file_path,
                  file_size: doc.file_size ? Number(doc.file_size) : null,
                  file_type: doc.file_type || null,
                  created_at: doc.created_at,
                  updated_by: doc.updated_by || null,
                  last_updated_at: doc.last_updated_at || null,
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
      }
    } catch (error: any) {
      console.error('Error fetching vault contents:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load vault contents',
        variant: 'destructive',
      });
    }
  }, [selectedVault, currentFolderId, toast]);

  useEffect(() => {
    if (selectedVault) {
      fetchVaultContents();
    }
  }, [fetchVaultContents, selectedVault]);

  useEffect(() => {
    // Build breadcrumbs
    const buildBreadcrumbs = async () => {
      if (!selectedVault) return;
      
      const crumbs: { id: string | null; name: string }[] = [{ id: null, name: selectedVault.name }];
      
      if (currentFolderId) {
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
  }, [selectedVault, currentFolderId, folderIndex]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !selectedVault || !user) return;

    try {
      const { data: folder, error } = await supabase
        .from('folders')
        .insert({
          vault_id: selectedVault.id,
          parent_id: currentFolderId,
          name: newFolderName,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Folder creation error:', error);
        throw error;
      }

      // Log folder creation
      if (folder) {
        try {
          await supabase.rpc('log_activity', {
            p_vault_id: selectedVault.id,
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
      fetchVaultContents();
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
    if (!files || files.length === 0 || !selectedVault || !user) return;

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
        const filePath = `${user.id}/${selectedVault.id}/${Date.now()}_${index}_${file.name}`;
        
        return await uploadFileWithProgress(
          file,
          filePath,
          uploadId,
          selectedVault.id,
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
      fetchVaultContents();
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
    if (!upload || !selectedVault || !user) return;

    // Reset to uploading
    setUploadProgress(prev => 
      prev.map(u => 
        u.id === id 
          ? { ...u, progress: 0, status: 'uploading' as const, error: undefined }
          : u
      )
    );

    const filePath = `${user.id}/${selectedVault.id}/${Date.now()}_${upload.file.name}`;
    const result = await uploadFileWithProgress(
      upload.file,
      filePath,
      id,
      selectedVault.id,
      currentFolderId
    );

    if (result.success) {
      toast({
        title: 'Upload complete',
        description: `${upload.file.name} uploaded successfully`,
      });
      fetchVaultContents();
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (!confirm(`Delete "${folderName}" and all its contents?`)) return;
    if (!selectedVault || !user) return;

    try {
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;

      // Log folder deletion
      try {
        await supabase.rpc('log_activity', {
          p_vault_id: selectedVault.id,
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

      toast({ title: 'Folder deleted' });
      fetchVaultContents();
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
    if (!selectedVault) return;

    try {
      await supabase.storage.from('documents').remove([filePath]);
      await supabase.from('documents').delete().eq('id', docId);

      // Log document deletion
      try {
        await supabase.rpc('log_activity', {
          p_vault_id: selectedVault.id,
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

      toast({ title: 'Document deleted' });
      fetchVaultContents();
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
    if (!selectedVault) return;

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
            p_vault_id: selectedVault.id,
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

  // Vault list view
  if (!selectedVault) {
    return (
      <DashboardLayout>
        <div className="animate-fade-in">
          <div className="mb-8">
            <h1 className="font-display text-4xl text-foreground mb-2">My Datarooms</h1>
            <p className="text-muted-foreground">
              Access your secure datarooms
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="h-48 bg-muted/30 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : vaults.length === 0 ? (
            <div className="text-center py-16 surface-elevated border border-gold/10 rounded-xl">
              <FolderLock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-2xl text-foreground mb-2">No Datarooms Available</h2>
              <p className="text-muted-foreground">
                You don't have access to any datarooms yet. Please contact your administrator.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {vaults.map((vault) => (
                <button
                  key={vault.id}
                  onClick={() => {
                    setSelectedVault(vault);
                    setCurrentFolderId(null);
                    navigate(`/vault/${vault.id}`);
                  }}
                  className="text-left group surface-elevated border border-gold/10 rounded-xl p-4 sm:p-6 hover:border-gold/30 transition-all duration-300 hover:shadow-gold"
                >
                  <div className="w-12 h-12 rounded-lg bg-gold/10 flex items-center justify-center mb-4">
                    <FolderLock className="w-6 h-6 text-gold" />
                  </div>

                  <h3 className="font-display text-lg sm:text-xl text-foreground mb-2">{vault.name}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4 line-clamp-2">
                    {vault.description || 'No description'}
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-gold/10">
                    <span className="text-xs text-muted-foreground">
                      Created {new Date(vault.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-gold flex items-center text-sm">
                      Open <ArrowUpRight className="w-4 h-4 ml-1" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  const handleNDAAgree = async (signatureName: string, signatureCompany: string) => {
    if (!selectedVault || !user) return;

    try {
      // Fetch NDA template for user's role
      if (!userProfile) {
        throw new Error('User profile not found');
      }

      // Use effective role (with domain inheritance) instead of userProfile.role
      const roleToUse = effectiveRole || userProfile.role;
      
      const { data: template, error: templateError } = await supabase
        .from('nda_templates')
        .select('*')
        .eq('vault_id', selectedVault.id)
        .eq('role_type', roleToUse)
        .single();

      if (templateError) {
        console.error('Template error details:', {
          code: templateError.code,
          message: templateError.message,
          details: templateError.details,
          hint: templateError.hint
        });
        throw new Error(`Failed to fetch NDA template: ${templateError.message || 'Template not found'}`);
      }

      if (!template) {
        throw new Error(`NDA template not found for ${roleToUse} role`);
      }

      // Save signature record (signed document can be generated later if needed)
      // For now, we just store the signature metadata
      // Use upsert to handle case where signature already exists
      const { error: signatureError } = await supabase
        .from('nda_signatures')
        .upsert({
          vault_id: selectedVault.id,
          user_id: user.id,
          template_id: template.id,
          status: 'signed',
          signature_name: signatureName,
          signature_company: signatureCompany,
          signed_document_path: null, // Can be populated later if needed
        }, {
          onConflict: 'vault_id,user_id',
          ignoreDuplicates: false
        });

      if (signatureError) {
        console.error('Signature error details:', {
          code: signatureError.code,
          message: signatureError.message,
          details: signatureError.details,
          hint: signatureError.hint
        });
        throw signatureError;
      }

      toast({
        title: 'NDA Signed',
        description: 'You have successfully signed the NDA. You can now access the dataroom.',
      });

      setNdaStatus('signed');
      fetchVaultContents();
    } catch (error: any) {
      console.error('Error signing NDA:', error);
      const errorMessage = error?.message || error?.error?.message || JSON.stringify(error) || 'Failed to sign NDA. Please try again.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleNDADecline = () => {
    if (!selectedVault || !user) return;

    // Save declined status
    supabase
      .from('nda_templates')
      .select('id')
      .eq('vault_id', selectedVault.id)
      .single()
      .then(({ data: template }) => {
        if (template) {
          return supabase
            .from('nda_signatures')
            .insert({
              vault_id: selectedVault.id,
              user_id: user.id,
              template_id: template.id,
              status: 'declined',
              signature_name: '',
              signature_company: '',
            });
        }
      })
      .catch(console.error);

    toast({
      title: 'NDA Declined',
      description: 'You have declined to sign the NDA. Redirecting to dashboard...',
    });

    // Redirect to dashboard
    setTimeout(() => {
      navigate('/dashboard');
    }, 1500);
  };

  // Show NDA overlay if unsigned
  // Use effective role (with domain inheritance) - if aditya is Investor, all domain users get Investor NDA
  const roleForNDA = effectiveRole || userProfile?.role;
  if (ndaStatus === 'unsigned' && selectedVault && roleForNDA && (roleForNDA === 'seller' || roleForNDA === 'investor')) {
    return (
      <DashboardLayout>
        <NDAOverlay
          vaultId={selectedVault.id}
          roleType={roleForNDA as 'seller' | 'investor'}
          onAgree={handleNDAAgree}
          onDecline={handleNDADecline}
        />
      </DashboardLayout>
    );
  }

  // Show loading if checking NDA
  if (ndaStatus === 'checking' && selectedVault) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Checking access requirements...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Vault contents view
  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => {
              setSelectedVault(null);
              setCurrentFolderId(null);
            }} className="flex-shrink-0">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </Button>
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl text-foreground truncate">{selectedVault.name}</h1>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {selectedVault.permissions.can_edit && (
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
            )}
            
            {selectedVault.permissions.can_upload && (
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
            )}
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
              <p className="text-sm sm:text-base text-muted-foreground">
                {selectedVault.permissions.can_upload 
                  ? 'Upload files or create folders to get started'
                  : 'No files have been uploaded yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
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
                  {selectedVault.permissions.can_delete && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDeleteFolder(folder.id, folder.name)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Folder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}

              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/30 transition-colors group"
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
                    {selectedVault.permissions.can_delete && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDownload(doc.file_path, doc.name, doc.id)}>
                            <Download className="w-4 h-4 mr-2" />
                            Download
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
                    )}
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
    </DashboardLayout>
  );
}
