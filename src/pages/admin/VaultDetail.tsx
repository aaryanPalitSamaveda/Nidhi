import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { runCIMGeneration } from '@/services/CIM/cimGenerationController';
import type { CIMReport } from '@/services/CIM/types';
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

function VaultDetailInner() {
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
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);
  const [isAuditExpanded, setIsAuditExpanded] = useState(true);
  const [auditJobId, setAuditJobId] = useState<string | null>(null);
  const [auditJob, setAuditJob] = useState<any>(null);
  const [auditIsRunning, setAuditIsRunning] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const isRestartingRef = useRef(false);
  const sanitizedReportMarkdown = useMemo(() => {
    const safeStringify = (input: unknown) => {
      try {
        const seen = new WeakSet();
        return JSON.stringify(
          input,
          (_key, value) => {
            if (typeof value === 'bigint') return value.toString();
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) return '[Circular]';
              seen.add(value);
            }
            return value;
          },
          2
        );
      } catch {
        return '';
      }
    };

    try {
      const raw = auditJob?.report_markdown;
      const md = typeof raw === 'string' ? raw : raw ? safeStringify(raw) : '';
      return md
        .replace(/^[=]{5,}\s*$/gm, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/non-hallucination policy.*$/gmi, '')
        .replace(/^```+$/gm, '')
        .replace(/^\*\*\s*([A-Z0-9][A-Z0-9\s:#\-]{6,})\s*\*\*$/gm, '$1')
        .replace(/^\*\*\s*(RED FLAG[^*]+)\s*\*\*$/gmi, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    } catch {
      return '';
    }
  }, [auditJob?.report_markdown]);
  const [isCimDialogOpen, setIsCimDialogOpen] = useState(false);
  const [cimReport, setCimReport] = useState<CIMReport | null>(null);
  const [cimIsRunning, setCimIsRunning] = useState(false);
  const [cimError, setCimError] = useState<string | null>(null);
  const [cimProgress, setCimProgress] = useState(0);
  const [cimEtaSeconds, setCimEtaSeconds] = useState<number | null>(null);
  const [cimRunId, setCimRunId] = useState<string | null>(null);
  const [isBuyerMappingOpen, setIsBuyerMappingOpen] = useState(false);
  const [buyerProgress, setBuyerProgress] = useState(0);
  const [buyerStatus, setBuyerStatus] = useState('Mapping Buyers/Investors for Dataroom');
  const buyerTimerRef = useRef<number | null>(null);
  const cimPreviewRef = useRef<HTMLDivElement>(null);
  const cimProgressTimerRef = useRef<number | null>(null);
  const cimStartedAtRef = useRef<number | null>(null);
  const cimAbortControllerRef = useRef<AbortController | null>(null);
  const cimHtml = useMemo(() => {
    const raw = cimReport?.cimReport;
    return typeof raw === 'string' ? raw : '';
  }, [cimReport?.cimReport]);
  const cimBackendUrl = useMemo(() => {
    const raw = import.meta.env.VITE_CIM_BACKEND_URL || 'http://localhost:3003';
    return raw.replace(/\/$/, '');
  }, []);

  const stopBuyerTimer = useCallback(() => {
    if (buyerTimerRef.current) {
      window.clearInterval(buyerTimerRef.current);
      buyerTimerRef.current = null;
    }
  }, []);

  const startBuyerMapping = useCallback(() => {
    stopBuyerTimer();
    setBuyerProgress(0);
    setBuyerStatus('Mapping Buyers/Investors for Dataroom');
    let current = 0;
    buyerTimerRef.current = window.setInterval(() => {
      current = Math.min(100, current + 5);
      setBuyerProgress(current);
      if (current >= 100) {
        stopBuyerTimer();
        setBuyerStatus('Completed');
        const url = `${window.location.origin}/assets/buyerMap.xlsx`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `buyerMap_${vault?.name || 'dataroom'}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }, 700);
  }, [stopBuyerTimer, vault?.name]);

  const loadLatestCim = useCallback(async () => {
    if (!vaultId) return;
    try {
      const { data, error } = await supabase
        .from('cim_reports')
        .select('id, vault_id, vault_name, created_by, created_at, report_content, files_analyzed')
        .eq('vault_id', vaultId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return;
      const reportContent = typeof data.report_content === 'string'
        ? data.report_content
        : data.report_content
        ? JSON.stringify(data.report_content, null, 2)
        : '';
      setCimReport({
        reportId: data.id || `cim_${Date.now()}`,
        vaultId: data.vault_id,
        vaultName: data.vault_name || vault?.name || 'Dataroom',
        createdBy: data.created_by || 'unknown',
        timestamp: data.created_at || new Date().toISOString(),
        cimReport: reportContent,
        filesAnalyzed: data.files_analyzed || 0,
        status: 'completed',
      });
    } catch {
      // Ignore load errors for now
    }
  }, [vaultId, vault?.name]);

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

  const estimateAuditRemainingSeconds = useCallback((job: any) => {
    try {
      if (typeof job?.estimated_remaining_seconds === 'number' && job.estimated_remaining_seconds >= 0) {
        return job.estimated_remaining_seconds;
      }
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
      const { data, error } = await supabase.functions.invoke('audit-vault', {
        body: { action: 'start', vaultId },
      });
      if (error) throw error;
      if (!data?.jobId) {
        throw new Error('Audit start failed (no jobId returned)');
      }

      setAuditJobId(data.jobId);
      localStorage.setItem(`nidhi:auditJobId:${vaultId}`, data.jobId);

      const runRes = await supabase.functions.invoke('audit-vault', {
        body: { action: 'run', jobId: data.jobId, maxFiles: 2 },
      });
      if (runRes.error) throw runRes.error;
      setAuditJob(runRes.data?.job ?? null);
    } catch (e: any) {
      const msg = e?.message || e?.error || 'Failed to start audit';
      setAuditError(msg);
    } finally {
      setAuditIsRunning(false);
    }
  }, [vaultId]);

  const runAuditBatch = useCallback(async () => {
    if (!auditJobId || auditIsRunning) return;
    setAuditIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('audit-vault', {
        body: { action: 'run', jobId: auditJobId, maxFiles: 2 },
      });
      if (error) throw error;
      setAuditJob(data?.job ?? null);
      setAuditError(null);
    } catch (e: any) {
      const msg = e?.message || e?.error || 'Audit batch failed';
      setAuditError(msg);
    } finally {
      setAuditIsRunning(false);
    }
  }, [auditJobId, auditIsRunning]);

  const loadAuditState = useCallback(async () => {
    if (!vaultId || isRestartingRef.current) return;
    setAuditError(null);

    const persistedJobId = localStorage.getItem(`nidhi:auditJobId:${vaultId}`);
    if (persistedJobId) {
      setAuditJobId(persistedJobId);
      try {
        const { data, error } = await supabase.functions.invoke('audit-vault', {
          body: { action: 'status', jobId: persistedJobId },
        });
        if (!error && data?.job) {
          if (data.job.status === 'cancelled') {
            setAuditJobId(null);
            setAuditJob(null);
            localStorage.removeItem(`nidhi:auditJobId:${vaultId}`);
            return;
          }
          setAuditJob(data.job);
          return;
        }
      } catch (e) {
        console.warn('Audit status check failed, will try DB lookup:', e);
      }
    }

    try {
      const { data: latestJob } = await supabase
        .from('audit_jobs')
        .select('*')
        .eq('vault_id', vaultId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestJob?.id) {
        setAuditJobId(latestJob.id);
        setAuditJob(latestJob);
        localStorage.setItem(`nidhi:auditJobId:${vaultId}`, latestJob.id);
      }
    } catch (e: any) {
      console.warn('Failed to load latest audit job:', e?.message || e);
    }
  }, [vaultId]);

  const stopAndRestartAudit = useCallback(async () => {
    if (!vaultId || isRestartingRef.current) return;
    isRestartingRef.current = true;
    setAuditIsRunning(true);

    const hadExistingJob = !!auditJobId;
    const jobIdToCancel = auditJobId;

    try {
      if (jobIdToCancel) {
        try {
          await supabase.functions.invoke('audit-vault', {
            body: { action: 'cancel', jobId: jobIdToCancel },
          });
        } catch (e) {
          console.warn('Failed to cancel previous job:', e);
        }
      }

      setAuditJobId(null);
      setAuditJob(null);
      setAuditError(null);
      localStorage.removeItem(`nidhi:auditJobId:${vaultId}`);

      if (jobIdToCancel) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await startAudit();

      toast({
        title: hadExistingJob ? 'Audit Restarted' : 'Audit Started',
        description: hadExistingJob
          ? 'The previous audit has been cancelled and a new audit has been started.'
          : 'A new audit has been started.',
      });
    } catch (e: any) {
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

  const downloadAuditReport = useCallback(async () => {
    const md = auditJob?.report_markdown;
    if (!md || !reportContentRef.current) return;

    try {
      toast({
        title: 'Generating PDF...',
        description: 'Please wait while the report is being converted to PDF.',
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      const sourceElement = reportContentRef.current;
      const renderedHTML = sourceElement.innerHTML;

      if (!renderedHTML || renderedHTML.trim().length === 0) {
        throw new Error('Report content is empty. Please ensure the report is fully loaded.');
      }

      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = '210mm';
      tempDiv.style.padding = '18mm';
      tempDiv.style.backgroundColor = '#ffffff';
      tempDiv.style.color = '#0f172a';
      tempDiv.style.fontFamily = 'Inter, Arial, Helvetica, sans-serif';
      tempDiv.style.fontSize = '11pt';
      tempDiv.style.lineHeight = '1.55';
      tempDiv.style.overflow = 'visible';

      const innerDiv = document.createElement('div');
      innerDiv.innerHTML = renderedHTML;
      innerDiv.style.maxWidth = '100%';
      innerDiv.style.color = '#0f172a';

      const headings = innerDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((h) => {
        const el = h as HTMLElement;
        el.style.fontWeight = '700';
        el.style.color = '#0f172a';
        el.style.marginTop = '18px';
        el.style.marginBottom = '8px';
      });

      innerDiv.querySelectorAll('h1').forEach((h) => {
        const el = h as HTMLElement;
        el.style.fontSize = '15pt';
        el.style.color = '#0f172a';
      });

      innerDiv.querySelectorAll('h2').forEach((h) => {
        const el = h as HTMLElement;
        el.style.fontSize = '12.5pt';
        el.style.color = '#1d4ed8';
        el.style.borderBottom = '1px solid #dbeafe';
        el.style.paddingBottom = '6px';
      });

      innerDiv.querySelectorAll('h3').forEach((h) => {
        const el = h as HTMLElement;
        el.style.fontSize = '11.5pt';
        el.style.color = '#0f766e';
      });

      innerDiv.querySelectorAll('h4').forEach((h) => {
        const el = h as HTMLElement;
        el.style.fontSize = '11pt';
        el.style.color = '#b45309';
        el.style.background = '#fff7ed';
        el.style.borderLeft = '4px solid #f59e0b';
        el.style.padding = '6px 10px';
        el.style.borderRadius = '6px';
      });

      innerDiv.querySelectorAll('p').forEach((p) => {
        const el = p as HTMLElement;
        el.style.marginBottom = '10px';
        el.style.color = '#0f172a';
      });

      innerDiv.querySelectorAll('ul, ol').forEach((list) => {
        const el = list as HTMLElement;
        el.style.marginLeft = '18px';
        el.style.marginBottom = '10px';
      });

      innerDiv.querySelectorAll('li').forEach((li) => {
        const el = li as HTMLElement;
        el.style.marginBottom = '6px';
      });

      innerDiv.querySelectorAll('strong').forEach((s) => {
        const el = s as HTMLElement;
        el.style.fontWeight = '700';
        el.style.color = '#0f172a';
      });

      innerDiv.querySelectorAll('pre, code').forEach((code) => {
        const el = code as HTMLElement;
        el.style.backgroundColor = '#f1f5f9';
        el.style.padding = '4px 6px';
        el.style.borderRadius = '4px';
        el.style.fontFamily = 'Menlo, Consolas, monospace';
        el.style.fontSize = '10pt';
      });

      innerDiv.querySelectorAll('hr').forEach((hr) => {
        const el = hr as HTMLElement;
        el.style.border = '0';
        el.style.height = '1px';
        el.style.background = '#e2e8f0';
        el.style.margin = '16px 0';
      });

      innerDiv.querySelectorAll('table').forEach((table) => {
        const el = table as HTMLElement;
        el.style.width = '100%';
        el.style.borderCollapse = 'collapse';
        el.style.margin = '12px 0';
      });

      innerDiv.querySelectorAll('th, td').forEach((cell) => {
        const el = cell as HTMLElement;
        el.style.border = '1px solid #e2e8f0';
        el.style.padding = '6px 8px';
        el.style.fontSize = '10.5pt';
      });

      innerDiv.querySelectorAll('th').forEach((cell) => {
        const el = cell as HTMLElement;
        el.style.backgroundColor = '#f1f5f9';
        el.style.color = '#334155';
        el.style.fontWeight = '600';
      });

      tempDiv.appendChild(innerDiv);
      document.body.appendChild(tempDiv);

      await new Promise(resolve => setTimeout(resolve, 200));
      void tempDiv.offsetHeight;

      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: tempDiv.scrollWidth,
        height: tempDiv.scrollHeight,
      });

      document.body.removeChild(tempDiv);

      const imgWidth = 210;
      const pageHeight = 297;
      const pageMargin = 10;
      const usablePageHeight = pageHeight - (2 * pageMargin);
      const usablePageWidth = imgWidth - (2 * pageMargin);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let sourceY = 0;
      let remainingHeight = canvas.height;

      while (remainingHeight > 0) {
        const sourceHeight = Math.min(
          remainingHeight,
          (usablePageHeight / imgHeight) * canvas.height
        );

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;
        const pageCtx = pageCanvas.getContext('2d');
        if (!pageCtx) {
          throw new Error('Failed to create canvas context');
        }

        pageCtx.drawImage(
          canvas,
          0, sourceY, canvas.width, sourceHeight,
          0, 0, canvas.width, sourceHeight
        );

        const pageImgDataUrl = pageCanvas.toDataURL('image/png');
        const pageImgHeight = (sourceHeight / canvas.height) * imgHeight * (usablePageWidth / imgWidth);

        pdf.addImage(
          pageImgDataUrl,
          'PNG',
          pageMargin,
          pageMargin,
          usablePageWidth,
          pageImgHeight
        );

        sourceY += sourceHeight;
        remainingHeight -= sourceHeight;
        if (remainingHeight > 0) {
          pdf.addPage();
        }
      }

      const pdfBlob = pdf.output('blob');
      const fileName = `audit_report_${vaultId}_${auditJob?.id || 'job'}.pdf`;
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'PDF Generated',
        description: 'The audit report has been downloaded as PDF.',
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

  const stopCimProgressTimer = useCallback(() => {
    if (cimProgressTimerRef.current) {
      window.clearInterval(cimProgressTimerRef.current);
      cimProgressTimerRef.current = null;
    }
  }, []);

  const pollCimStatus = useCallback(async () => {
    if (!vaultId) return;
    try {
      const res = await fetch(`${cimBackendUrl}/api/cim-status?vaultId=${encodeURIComponent(vaultId)}`);
      if (!res.ok) return;
      const status = await res.json();
      if (cimRunId && status?.runId && status.runId !== cimRunId) {
        return;
      }
      if (typeof status?.progress === 'number') {
        setCimProgress(Math.min(100, Math.max(0, status.progress)));
      }
      if (typeof status?.etaSeconds === 'number') {
        setCimEtaSeconds(status.etaSeconds);
      } else {
        setCimEtaSeconds(null);
      }
      if (status?.status === 'completed' || status?.status === 'failed') {
        stopCimProgressTimer();
      }
    } catch {
      // ignore polling failures
    }
  }, [vaultId, cimBackendUrl, stopCimProgressTimer, cimRunId]);

  const downloadCimPdf = useCallback(async (report: CIMReport) => {
    if (!cimPreviewRef.current) return;
    const html2pdf = (await import('html2pdf.js')).default;
    const element = cimPreviewRef.current;
    const safeName = (report.vaultName || 'CIM').replace(/\s+/g, '_');
    const options = {
      margin: 10,
      filename: `CIM_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff' },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
    };

    html2pdf().set(options).from(element).save();
  }, []);

  const startCimGeneration = useCallback(async () => {
    if (!vaultId || !vault || !user) return;
    setCimError(null);
    setCimIsRunning(true);
    const runId = `${Date.now()}`;
    setCimRunId(runId);
    setCimProgress(10);
    setCimEtaSeconds(null);
    cimStartedAtRef.current = Date.now();
    stopCimProgressTimer();
    cimProgressTimerRef.current = window.setInterval(pollCimStatus, 2000);
    pollCimStatus();

    try {
      cimAbortControllerRef.current = new AbortController();  // ✅ ADD THIS
      const report = await runCIMGeneration(vaultId, vault.name, user.id, cimAbortControllerRef.current.signal, runId);  // ✅ UPDATED
      setCimReport(report);
      setCimProgress(100);
      setCimEtaSeconds(null);
      stopCimProgressTimer();
      setTimeout(() => {
        downloadCimPdf(report);
      }, 300);
    } catch (e: any) {
      setCimError(e?.message || 'Failed to generate CIM');
      stopCimProgressTimer();
      setCimProgress(0);
      setCimEtaSeconds(null);
    } finally {
      setCimIsRunning(false);
    }
  }, [vaultId, vault, user, stopCimProgressTimer, downloadCimPdf, pollCimStatus]);
  const handleStopCim = useCallback(() => {
    if (cimAbortControllerRef.current) {
      console.log('Stopping CIM generation...');
      cimAbortControllerRef.current.abort();
      setCimIsRunning(false);
      setCimError('CIM generation was cancelled');
      setCimProgress(0);
      setCimEtaSeconds(null);
      stopCimProgressTimer();
    }
  }, [stopCimProgressTimer]);
  const regenerateCim = useCallback(async () => {
    setCimReport(null);
    await startCimGeneration();
  }, [startCimGeneration]);

  useEffect(() => {
    return () => {
      stopCimProgressTimer();
    };
  }, [stopCimProgressTimer]);

  useEffect(() => {
    if (!isCimDialogOpen) return;
    loadLatestCim();
  }, [isCimDialogOpen, loadLatestCim]);

  useEffect(() => {
    if (!isBuyerMappingOpen) return;
    startBuyerMapping();
    return () => stopBuyerTimer();
  }, [isBuyerMappingOpen, startBuyerMapping, stopBuyerTimer]);

  useEffect(() => {
    loadAuditState();
  }, [loadAuditState]);

  useEffect(() => {
    if (!auditJobId) return;
    if (auditJob?.status === 'completed' || auditJob?.status === 'failed' || auditJob?.status === 'cancelled') return;
    if (isRestartingRef.current) return;

    const t = setInterval(() => {
      if (!auditIsRunning && !isRestartingRef.current) {
        runAuditBatch();
      }
    }, 4000);

    return () => clearInterval(t);
  }, [auditJobId, auditJob?.status, auditIsRunning, runAuditBatch]);

  useEffect(() => {
    if (!isAuditDialogOpen) return;
    loadAuditState();
  }, [isAuditDialogOpen, loadAuditState]);

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
            <Dialog open={isAuditDialogOpen} onOpenChange={setIsAuditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="gold" size="sm" className="text-xs sm:text-sm">
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Audit Documents
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <DialogTitle className="font-display text-xl">Audit Documents</DialogTitle>
                    </div>
                    <Collapsible open={isAuditExpanded} onOpenChange={setIsAuditExpanded}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="mr-6">
                          {isAuditExpanded ? 'Collapse' : 'Expand'}
                        </Button>
                      </CollapsibleTrigger>
                    </Collapsible>
                  </div>
                </DialogHeader>

                <div className="space-y-4 py-2 flex-1 min-h-0 min-w-0 overflow-hidden">
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
                    <CollapsibleContent className="min-h-0 min-w-0">
                      <div className="rounded-lg border border-gold/10 overflow-hidden flex-1 min-h-0">
                        <div className="px-3 py-2 border-b border-gold/10 bg-muted/5">
                          <p className="text-sm font-medium text-foreground">Report Preview</p>
                          <p className="text-xs text-muted-foreground">Available after completion. Download for sharing.</p>
                        </div>
                        <ScrollArea className="h-[40vh] p-3 max-w-full overflow-hidden">
                          {auditJob?.report_markdown ? (
                            <div ref={reportContentRef} className="w-full max-w-full overflow-hidden">
                              <div className="w-full max-w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="text-xs uppercase tracking-widest text-slate-500">Forensic Audit Report</p>
                                      <p className="text-base font-semibold text-slate-900 truncate">
                                        {vault?.name ?? 'Dataroom'} · Report Preview
                                      </p>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      Status: <span className="text-slate-800">{auditJob?.status || 'completed'}</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                                      Files: {auditJob?.processed_files ?? 0}/{auditJob?.total_files ?? 0}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                                      Progress: {Math.round(Number(auditJob?.progress ?? 0))}%
                                    </span>
                                  </div>
                                </div>
                                <div className="p-4">
                                  <div className="prose prose-sm max-w-none break-words [overflow-wrap:anywhere] prose-headings:font-display prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h4:text-sm prose-h2:text-indigo-700 prose-h3:text-emerald-700 prose-h4:text-amber-700 prose-h4:bg-amber-50 prose-h4:border-l-4 prose-h4:border-amber-400 prose-h4:pl-3 prose-h4:py-1 prose-h4:rounded-md prose-p:text-slate-700 prose-strong:text-slate-900 prose-ul:text-slate-700 prose-ol:text-slate-700 prose-li:text-slate-700 prose-code:text-slate-700 prose-pre:bg-slate-50 prose-pre:text-slate-700 prose-pre:whitespace-pre-wrap prose-pre:overflow-x-auto prose-code:break-words prose-table:border prose-table:border-slate-200 prose-th:border prose-th:border-slate-200 prose-td:border prose-td:border-slate-200 prose-th:bg-slate-100 prose-th:text-slate-700 prose-th:font-semibold prose-thead:border-b prose-thead:border-slate-200">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {sanitizedReportMarkdown}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              </div>
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

            <Dialog open={isCimDialogOpen} onOpenChange={setIsCimDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Generate CIM
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <DialogTitle className="font-display text-xl">Generate CIM</DialogTitle>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4 py-2 flex-1 min-h-0 min-w-0 overflow-hidden">
                  <div className="rounded-lg border border-gold/10 p-3 bg-muted/10">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">
                          Generates a Confidential Information Memorandum using all documents in this dataroom.
                        </p>
                        {cimError && (
                          <p className="text-sm text-destructive mt-2">{cimError}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="gold"
                          size="sm"
                          onClick={startCimGeneration}
                          disabled={cimIsRunning}
                        >
                          {cimIsRunning ? 'Generating...' : 'Start'}
                        </Button>
                        {cimIsRunning && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleStopCim}
                            title="Click to stop the CIM generation"
                          >
                            ⏹️ Stop
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={regenerateCim}
                          disabled={cimIsRunning}
                        >
                          Regenerate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cimReport && downloadCimPdf(cimReport)}
                          disabled={!cimReport}
                        >
                          Download CIM
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Status: <span className="text-foreground">{cimIsRunning ? 'running' : cimReport ? 'completed' : 'not started'}</span>
                        </span>
                        <span className="text-muted-foreground">
                          ETA: <span className="text-foreground">{formatDuration(cimEtaSeconds)}</span>
                        </span>
                      </div>
                      <Progress value={Number(cimProgress)} className="h-2" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{cimIsRunning ? 'Generating CIM report' : '—'}</span>
                        <span>{Math.round(Number(cimProgress))}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gold/10 overflow-hidden flex-1 min-h-0">
                    <div className="px-3 py-2 border-b border-gold/10 bg-muted/5">
                      <p className="text-sm font-medium text-foreground">CIM Preview</p>
                      <p className="text-xs text-muted-foreground">Preview updates after generation.</p>
                    </div>
                    <ScrollArea className="h-[45vh] p-3 max-w-full overflow-hidden bg-white">
                      {cimReport ? (
                        <div
                          ref={cimPreviewRef}
                          id="cim-report-content"
                          className="max-w-none text-slate-800"
                          dangerouslySetInnerHTML={{ __html: cimHtml }}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">CIM not generated yet.</p>
                      )}
                    </ScrollArea>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isBuyerMappingOpen} onOpenChange={setIsBuyerMappingOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Buyer Mapping
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl">Buyer Mapping</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{buyerStatus}</p>
                  <Progress value={buyerProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground">{Math.round(buyerProgress)}%</p>
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

class VaultDetailErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('VaultDetail crash:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <DashboardLayout>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">VaultDetail failed to render.</p>
            <p className="mt-2 break-words">{this.state.error.message}</p>
          </div>
        </DashboardLayout>
      );
    }
    return this.props.children;
  }
}

export default function VaultDetail() {
  return (
    <VaultDetailErrorBoundary>
      <VaultDetailInner />
    </VaultDetailErrorBoundary>
  );
}
