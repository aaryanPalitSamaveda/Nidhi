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
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [ndaStatus, setNdaStatus] = useState<'checking' | 'signed' | 'unsigned' | 'not_required' | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

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
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

  // Check NDA status when vault is selected
  useEffect(() => {
    if (!selectedVault || !user || !userProfile) return;
    
    // Check NDA for both sellers and investors
    if (userProfile.role === 'seller' || userProfile.role === 'investor') {
      checkNDAStatus();
    } else {
      setNdaStatus('not_required');
    }
  }, [selectedVault, user, userProfile]);

  const checkNDAStatus = async () => {
    if (!selectedVault || !user || !userProfile) return;
    
    // Only check for seller and investor roles
    if (userProfile.role !== 'seller' && userProfile.role !== 'investor') {
      setNdaStatus('not_required');
      return;
    }
    
    setNdaStatus('checking');
    
    try {
      // Check if NDA template exists for this role
      const { data: template } = await supabase
        .from('nda_templates')
        .select('id')
        .eq('vault_id', selectedVault.id)
        .eq('role_type', userProfile.role)
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
      fetchVaultContents();
    }, 10000); // Refresh every 10 seconds
    
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

  const fetchVaultContents = useCallback(async () => {
    if (!selectedVault || !user) return;

    try {
      // Log vault access
      try {
        await supabase.rpc('log_activity', {
          p_vault_id: selectedVault.id,
          p_action: 'view',
          p_resource_type: 'vault',
          p_document_id: null,
          p_folder_id: null,
          p_resource_name: selectedVault.name,
          p_metadata: null,
        });
      } catch (logError) {
        console.error('Error logging vault access:', logError);
      }
      // Fetch folders
      let foldersQuery = supabase
        .from('folders')
        .select('*')
        .eq('vault_id', selectedVault.id)
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
          description: foldersError.message || 'Failed to load folders',
          variant: 'destructive',
        });
      }

      setFolders(foldersData || []);

      // Fetch documents
      let docsQuery = supabase
        .from('documents')
        .select('id, name, file_path, file_size, file_type, created_at, updated_by, last_updated_at')
        .eq('vault_id', selectedVault.id)
        .order('name');
      
      if (currentFolderId === null) {
        docsQuery = docsQuery.is('folder_id', null);
      } else {
        docsQuery = docsQuery.eq('folder_id', currentFolderId);
      }
      
      const { data: docsData, error: docsError } = await docsQuery;

      if (docsError) {
        console.error('Error fetching documents:', docsError);
        console.error('Error details:', JSON.stringify(docsError, null, 2));
        toast({
          title: 'Error loading documents',
          description: docsError.message || docsError.details || 'Failed to load documents. You may not have permission.',
          variant: 'destructive',
        });
        setDocuments([]);
      } else if (docsData) {
        // Fetch updated_by profiles
        const updatedByIds = [...new Set(docsData.map(d => d.updated_by).filter(Boolean))] as string[];
        const docIds = docsData.map(d => d.id);
        let profilesMap = new Map();
        
        if (updatedByIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', updatedByIds);

          profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
        }
        
        // Fetch recent activities in parallel with profile fetch for better performance
        const [activitiesResult] = await Promise.allSettled([
          supabase
            .from('activity_logs')
            .select('document_id, action, created_at, user_id')
            .in('document_id', docIds)
            .in('action', ['view', 'edit'])
            .order('created_at', { ascending: false })
            .limit(100) // Limit to recent activities for performance
        ]);

        const activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value.data : null;

        // Get user profiles for activities (merge with existing updatedByIds)
        const activityUserIds = [...new Set([
          ...(activities?.map(a => a.user_id).filter(Boolean) || []),
          ...updatedByIds
        ])] as string[];
        let activityProfilesMap = new Map();
        if (activityUserIds.length > 0) {
          const { data: activityProfiles } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', activityUserIds);
          activityProfilesMap = new Map(activityProfiles?.map(p => [p.id, p]) || []);
          // Also update profilesMap
          activityProfilesMap.forEach((v, k) => profilesMap.set(k, v));
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
        
        // Validate and set documents with profiles and activities
        const validDocs = docsData.map((doc: any) => {
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
            id: doc.id,
            name: doc.name,
            file_path: doc.file_path,
            file_size: doc.file_size ? Number(doc.file_size) : null,
            file_type: doc.file_type || null,
            created_at: doc.created_at,
            updated_by: doc.updated_by || null,
            last_updated_at: doc.last_updated_at || null,
            updated_by_profile: doc.updated_by ? profilesMap.get(doc.updated_by) : undefined,
            recent_activities: recentActivities.slice(0, 2), // Show max 2 activities
          };
        });
        setDocuments(validDocs);
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
        
        while (folderId) {
          const { data: folder } = await supabase
            .from('folders')
            .select('id, name, parent_id')
            .eq('id', folderId)
            .single();
          
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
  }, [selectedVault, currentFolderId]);

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedVault || !user) return;

    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        const filePath = `${user.id}/${selectedVault.id}/${Date.now()}_${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: newDoc, error: docError } = await supabase
          .from('documents')
          .insert({
            vault_id: selectedVault.id,
            folder_id: currentFolderId,
            name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type,
            uploaded_by: user.id,
          })
          .select()
          .single();

        if (docError) throw docError;

        // Log upload activity
        if (newDoc) {
          try {
            await supabase.rpc('log_activity', {
              p_vault_id: selectedVault.id,
              p_action: 'upload',
              p_resource_type: 'document',
              p_document_id: newDoc.id,
              p_folder_id: currentFolderId,
              p_resource_name: file.name,
              p_metadata: null,
            });
          } catch (logError) {
            console.error('Error logging upload:', logError);
          }
        }
      }

      toast({
        title: 'Upload complete',
        description: `${files.length} file(s) uploaded successfully`,
      });

      fetchVaultContents();
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

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

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
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

      const { data: template, error: templateError } = await supabase
        .from('nda_templates')
        .select('*')
        .eq('vault_id', selectedVault.id)
        .eq('role_type', userProfile.role)
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
        throw new Error(`NDA template not found for ${userProfile.role} role`);
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
  if (ndaStatus === 'unsigned' && selectedVault && userProfile && (userProfile.role === 'seller' || userProfile.role === 'investor')) {
    return (
      <DashboardLayout>
        <NDAOverlay
          vaultId={selectedVault.id}
          roleType={userProfile.role as 'seller' | 'investor'}
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
