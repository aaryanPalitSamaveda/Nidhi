import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FileText, Upload, File, Loader2, Download, ArrowLeft, FolderPlus, FolderOpen, Folder, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/samaveda-logo.jpeg';
import { formatFileSize } from '@/utils/format';
import { supabase } from '@/integrations/supabase/client';

// Use backend proxy when available (bypasses 401 for public). Else direct Supabase.
const AUDITOR_PROXY = import.meta.env.VITE_FRAUD_BACKEND_URL
  ? `${String(import.meta.env.VITE_FRAUD_BACKEND_URL).replace(/\/$/, '')}/api/auditor-proxy`
  : null;

async function auditorInvoke(body: Record<string, unknown>) {
  if (AUDITOR_PROXY) {
    const payload = {
      ...body,
      _supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      _anonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
    const res = await fetch(AUDITOR_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
    return data as Record<string, unknown>;
  }
  const { data, error } = await supabase.functions.invoke('auditor-public', { body });
  if (error) throw new Error(error.message || 'Request failed');
  return (data ?? {}) as Record<string, unknown>;
}

type Step = 'form' | 'upload' | 'audit';

interface AuditorSession {
  sessionId: string;
  vaultId: string;
  folderId: string;
  name: string;
  company_name: string;
  created_at: string;
}

interface DocInfo {
  id: string;
  name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  folder_id?: string | null;
}

interface FolderInfo {
  id: string;
  name: string;
  parent_id: string | null;
}

interface AuditJob {
  id: string;
  status: string;
  progress: number;
  total_files: number;
  processed_files: number;
  current_step: string;
  report_markdown: string | null;
}

export default function Auditor() {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [session, setSession] = useState<AuditorSession | null>(null);
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [auditJob, setAuditJob] = useState<AuditJob | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditIsRunning, setAuditIsRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFolders, setUploadingFolders] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ id: string; name: string; progress: number }[]>([]);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    if (!session?.sessionId) return;
    try {
      const data = await auditorInvoke({ action: 'status', sessionId: session.sessionId });
      if (data.documents) setDocuments(data.documents as DocInfo[]);
      if (data.folders) setFolders(data.folders as FolderInfo[]);
      if (data.auditJob) setAuditJob(data.auditJob as AuditJob);
    } catch (e) {
      console.warn('Status fetch failed:', e);
    }
  }, [session?.sessionId]);

  useEffect(() => {
    const stored = sessionStorage.getItem('nidhi:auditor:session');
    if (stored) {
      try {
        const s = JSON.parse(stored);
        setSession(s);
        setStep('upload');
        fetchStatus();
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (session && step === 'upload') fetchStatus();
  }, [session, step, fetchStatus]);

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !companyName.trim()) {
      toast({ title: 'Required', description: 'Please enter your name and company name.', variant: 'destructive' });
      return;
    }
    try {
      const data = await auditorInvoke({ action: 'create-session', name: name.trim(), company_name: companyName.trim() });
      if (data.error) throw new Error(String(data.error));
      setSession({
        sessionId: data.sessionId,
        vaultId: data.vaultId,
        folderId: data.folderId,
        name: data.name,
        company_name: data.company_name,
        created_at: data.created_at,
      });
      sessionStorage.setItem('nidhi:auditor:session', JSON.stringify({
        sessionId: data.sessionId,
        vaultId: data.vaultId,
        folderId: data.folderId,
        name: data.name,
        company_name: data.company_name,
        created_at: data.created_at,
      }));
      setStep('upload');
      toast({ title: 'Welcome', description: `Hi ${data.name}, please upload your documents.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to start', variant: 'destructive' });
    }
  };

  const targetFolderId = currentFolderId ?? session?.folderId ?? null;

  const handleCreateFolder = async () => {
    if (!session?.sessionId || !newFolderName.trim()) return;
    try {
      const data = await auditorInvoke({
        action: 'create-folder',
        sessionId: session.sessionId,
        folderName: newFolderName.trim(),
        parentFolderId: targetFolderId || undefined,
      });
      if (data.error) throw new Error(String(data.error));
      await fetchStatus();
      setNewFolderName('');
      setIsCreateFolderOpen(false);
      toast({ title: 'Folder created', description: `"${newFolderName.trim()}" created.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed', variant: 'destructive' });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !session) return;
    setUploading(true);
    const ids: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = `u-${Date.now()}-${i}`;
      ids.push(id);
      setUploadProgress((p) => [...p, { id, name: file.name, progress: 0 }]);
    }
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const id = ids[i];
        const data = await auditorInvoke({
          action: 'upload-url',
          sessionId: session.sessionId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          folderId: targetFolderId || undefined,
        });
        if (data.error) throw new Error(String(data.error));
        setUploadProgress((p) => p.map((u) => (u.id === id ? { ...u, progress: 30 } : u)));
        const uploadRes = await fetch(data.uploadUrl as string, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        setUploadProgress((p) => p.map((u) => (u.id === id ? { ...u, progress: 100 } : u)));
      }
      await fetchStatus();
      const msg = files.length === 1 ? `"${files[0].name}" is uploaded.` : `${files.length} files uploaded.`;
      toast({ title: 'Uploaded', description: msg });
      setTimeout(() => setUploadProgress([]), 1200);
    } catch (e: any) {
      toast({ title: 'Upload error', description: e?.message || 'Failed', variant: 'destructive' });
      setUploadProgress([]);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !session) return;
    setUploadingFolders(true);

    const filesWithPaths = Array.from(files).map((file) => ({
      file,
      relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    }));

    const folderPathsSet = new Set<string>();
    for (const { relativePath } of filesWithPaths) {
      const parts = relativePath.split('/');
      for (let i = 1; i < parts.length; i++) {
        folderPathsSet.add(parts.slice(0, i).join('/'));
      }
    }
    const folderPaths = Array.from(folderPathsSet).sort((a, b) => a.split('/').length - b.split('/').length);

    const pathToFolderId = new Map<string, string | null>();
    const rootId = targetFolderId ?? session.folderId;

    try {
      const rootFolderName = `Folder ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const dataRoot = await auditorInvoke({
        action: 'create-folder',
        sessionId: session.sessionId,
        folderName: rootFolderName,
        parentFolderId: rootId || undefined,
      });
      if (dataRoot.error) throw new Error(String(dataRoot.error));
      const createdRootId = dataRoot.folderId as string;
      if (!createdRootId) throw new Error('Failed to create root folder');
      pathToFolderId.set('', createdRootId);

      for (const folderPath of folderPaths) {
        const parts = folderPath.split('/');
        const folderName = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = pathToFolderId.get(parentPath) ?? pathToFolderId.get('') ?? rootId;

        const data = await auditorInvoke({
          action: 'create-folder',
          sessionId: session.sessionId,
          folderName,
          parentFolderId: parentId,
        });
        if (data.error) throw new Error(String(data.error));
        if (data.folderId) pathToFolderId.set(folderPath, data.folderId as string);
      }

      const ids: string[] = [];
      for (let i = 0; i < filesWithPaths.length; i++) {
        const id = `f-${Date.now()}-${i}`;
        ids.push(id);
        setUploadProgress((p) => [...p, { id, name: filesWithPaths[i].file.name, progress: 0 }]);
      }

      for (let i = 0; i < filesWithPaths.length; i++) {
        const { file, relativePath } = filesWithPaths[i];
        const id = ids[i];
        const parts = relativePath.split('/');
        const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        const folderId = pathToFolderId.get(folderPath) ?? pathToFolderId.get('') ?? rootId;

        const data = await auditorInvoke({
          action: 'upload-url',
          sessionId: session.sessionId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          folderId: folderId || undefined,
        });
        if (data.error) throw new Error(String(data.error));
        setUploadProgress((p) => p.map((u) => (u.id === id ? { ...u, progress: 30 } : u)));
        const uploadRes = await fetch(data.uploadUrl as string, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        setUploadProgress((p) => p.map((u) => (u.id === id ? { ...u, progress: 100 } : u)));
      }

      await fetchStatus();
      const folderName = filesWithPaths[0]?.relativePath?.split('/')[0] || 'Folder';
      toast({ title: 'Uploaded', description: `"${folderName}" is uploaded.` });
      setTimeout(() => setUploadProgress([]), 1200);
    } catch (err: any) {
      toast({ title: 'Upload error', description: err?.message || 'Failed', variant: 'destructive' });
      setUploadProgress([]);
    } finally {
      setUploadingFolders(false);
      e.target.value = '';
    }
  };

  const startAudit = useCallback(async () => {
    if (!session?.sessionId) return;
    setAuditError(null);
    setAuditIsRunning(true);
    if (auditJob?.report_markdown) setAuditJob(null);
    try {
      const data = await auditorInvoke({ action: 'start-audit', sessionId: session.sessionId });
      if (data.error) throw new Error(String(data.error));
      setAuditJob({
        id: data.jobId,
        status: 'queued',
        progress: 0,
        total_files: data.totalFiles || 0,
        processed_files: 0,
        current_step: 'Queued',
        report_markdown: null,
      });
      toast({ title: 'Audit started', description: 'Processing your documents...' });
    } catch (e: any) {
      setAuditError(e?.message || 'Failed');
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    } finally {
      setAuditIsRunning(false);
    }
  }, [session?.sessionId, toast]);

  useEffect(() => {
    if (!auditJob || auditJob.status === 'completed' || auditJob.status === 'failed' || auditJob.status === 'cancelled') return;
    const runBatch = async () => {
      try {
        const data = await auditorInvoke({ action: 'run-audit-batch', jobId: auditJob.id });
        if (data?.job) setAuditJob(data.job as AuditJob);
      } catch (_) {}
    };
    pollRef.current = setInterval(runBatch, 4000);
    runBatch();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [auditJob?.id, auditJob?.status]);

  useEffect(() => {
    if (auditJob?.status === 'running' || auditJob?.status === 'queued') fetchStatus();
  }, [auditJob?.status, fetchStatus]);

  const stopAudit = useCallback(async () => {
    if (!auditJob?.id || auditJob?.status === 'completed' || auditJob?.status === 'failed' || auditJob?.status === 'cancelled') return;
    setAuditJob((prev) => prev ? { ...prev, status: 'cancelled' } : null);
    setAuditError(null);
    toast({ title: 'Audit stopped', description: 'You can start a new one anytime.' });
    try {
      await auditorInvoke({ action: 'cancel-audit', jobId: auditJob.id });
    } catch (_) {
      // Optimistic: UI already updated, backend cancel is best-effort
    }
  }, [auditJob?.id, auditJob?.status]);

  const downloadReport = async () => {
    if (!auditJob?.report_markdown) return;
    const blob = new Blob([auditJob.report_markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_report_${session?.company_name || 'report'}_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded', description: 'Report saved.' });
  };

  const resetSession = () => {
    sessionStorage.removeItem('nidhi:auditor:session');
    setSession(null);
    setStep('form');
    setDocuments([]);
    setFolders([]);
    setCurrentFolderId(null);
    setAuditJob(null);
    setAuditError(null);
  };

  const rootFolderId = session?.folderId ?? null;
  const effectiveFolderId = currentFolderId ?? rootFolderId;
  const subfolders = folders.filter((f) => f.parent_id === effectiveFolderId);
  const docsInFolder = documents.filter((d) => (d.folder_id ?? rootFolderId) === effectiveFolderId);

  const breadcrumbs: { id: string | null; name: string }[] = [{ id: null, name: 'Uploads' }];
  if (currentFolderId) {
    let cid: string | null = currentFolderId;
    const path: { id: string; name: string }[] = [];
    while (cid && cid !== rootFolderId) {
      const f = folders.find((x) => x.id === cid);
      if (!f) break;
      path.unshift({ id: f.id, name: f.name });
      cid = f.parent_id;
    }
    breadcrumbs.push(...path);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-gradient-dark" />
      <div className="fixed inset-0 bg-gradient-radial opacity-40" />
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-gold/20">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Samaveda Capital" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="font-display text-xl text-gradient-gold">Audit Agent</h1>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">by Samaveda Capital</p>
          </div>
        </div>
        {session && (
          <Button variant="ghost" size="sm" onClick={resetSession}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            New session
          </Button>
        )}
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-6 py-12">
        {step === 'form' && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold text-foreground mb-2">Document Audit</h2>
              <p className="text-muted-foreground">Upload your documents for a forensic AI audit report.</p>
            </div>
            <form onSubmit={handleSubmitForm} className="space-y-6 rounded-xl border border-gold/20 p-8 bg-card/50">
              <div className="space-y-2">
                <label className="text-sm font-medium">Your name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="bg-background"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Company name</label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                  className="bg-background"
                  required
                />
              </div>
              <Button type="submit" variant="gold" className="w-full">
                Continue
              </Button>
            </form>
          </div>
        )}

        {step === 'upload' && session && (
          <div className="space-y-8">
            <div className="rounded-lg border border-gold/20 p-4 bg-card/50">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{session.name}</strong> · {session.company_name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(session.created_at).toLocaleString()}
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-display text-xl font-semibold">Upload documents</h3>

              <div className="flex flex-wrap gap-2">
                <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={uploading || uploadingFolders}>
                      <FolderPlus className="w-4 h-4 mr-2" />
                      New Folder
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
                  <Button variant="gold" disabled={uploading || uploadingFolders} asChild size="sm">
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? 'Uploading...' : 'Upload Files'}
                    </span>
                  </Button>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={uploading || uploadingFolders}
                  />
                </label>
                <label>
                  <Button variant="outline" disabled={uploadingFolders || uploading} asChild size="sm">
                    <span>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      {uploadingFolders ? 'Uploading...' : 'Upload Folders'}
                    </span>
                  </Button>
                  <input
                    type="file"
                    {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    multiple
                    className="hidden"
                    onChange={handleFolderUpload}
                    disabled={uploadingFolders || uploading}
                  />
                </label>
              </div>

              {breadcrumbs.length > 1 && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
                  {breadcrumbs.map((b, i) => (
                    <span key={b.id ?? 'root'} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="w-3 h-3" />}
                      <button
                        type="button"
                        onClick={() => setCurrentFolderId(b.id)}
                        className="hover:text-foreground transition-colors"
                      >
                        {b.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                {subfolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setCurrentFolderId(f.id)}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Folder className="w-4 h-4 text-gold" />
                    <span className="text-sm font-medium">{f.name}</span>
                    <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
                  </button>
                ))}
                {docsInFolder.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4 text-gold" />
                    {d.name} · {formatFileSize(d.file_size)}
                  </div>
                ))}
                {subfolders.length === 0 && docsInFolder.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No files or folders yet. Upload files or create a folder.</p>
                )}
              </div>

              {uploadProgress.length > 0 && (
                <div className="space-y-2">
                  {uploadProgress.map((u) => (
                    <div key={u.id} className="flex items-center gap-2">
                      <File className="w-4 h-4 text-gold" />
                      <span className="text-sm truncate flex-1">{u.name}</span>
                      <Progress value={u.progress} className="w-24 h-2" />
                    </div>
                  ))}
                </div>
              )}

              {documents.length > 0 && (
                <div className="space-y-2 mt-4 pt-4 border-t border-gold/20">
                  <p className="text-sm font-medium">All uploaded ({documents.length})</p>
                  {documents.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="w-4 h-4 text-gold" />
                      {d.name} · {formatFileSize(d.file_size)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gold/20 p-6 bg-card/50 space-y-4">
              <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-gold" />
                Audit Documents
              </h3>
              <p className="text-sm text-muted-foreground">
                Runs an evidence-cited forensic audit. Red flags are backed by extracted text.
              </p>
              {auditError && <p className="text-sm text-destructive">{auditError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="gold"
                  onClick={startAudit}
                  disabled={auditIsRunning || documents.length === 0 || (auditJob?.status === 'running' || auditJob?.status === 'queued')}
                >
                  {(auditJob?.status === 'running' || auditJob?.status === 'queued') ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Audit Running
                    </>
                  ) : auditJob?.report_markdown ? (
                    'Regenerate'
                  ) : (
                    'Start Audit'
                  )}
                </Button>
                {(auditJob?.status === 'running' || auditJob?.status === 'queued') && (
                  <Button variant="destructive" onClick={stopAudit}>
                    Stop
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={downloadReport}
                  disabled={!auditJob?.report_markdown}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Report
                </Button>
              </div>
              {(auditJob?.status === 'running' || auditJob?.status === 'queued') && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Files: {auditJob?.processed_files ?? 0}/{auditJob?.total_files ?? 0}</span>
                    <span>{Math.round(Number(auditJob?.progress ?? 0))}%</span>
                  </div>
                  <Progress value={Number(auditJob?.progress ?? 0)} className="h-2" />
                  <p className="text-xs text-muted-foreground">{auditJob?.current_step || '—'}</p>
                </div>
              )}
              {auditJob?.report_markdown && (
                <ScrollArea className="h-[40vh] rounded-lg border p-4 mt-4">
                  <div className="prose prose-sm max-w-none break-words prose-headings:font-display prose-h2:text-base prose-h3:text-sm prose-p:text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{auditJob.report_markdown}</ReactMarkdown>
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
