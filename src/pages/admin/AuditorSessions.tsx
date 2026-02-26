import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { FileText, User, Building2, Calendar, File, Download } from 'lucide-react';
import { formatFileSize } from '@/utils/format';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface AuditorSession {
  id: string;
  name: string;
  company_name: string;
  vault_id: string;
  created_at: string;
}

interface DocInfo {
  id: string;
  name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
}

interface AuditJob {
  id: string;
  status: string;
  report_markdown: string | null;
  processed_files: number;
  total_files: number;
  created_at: string;
}

export default function AuditorSessions() {
  const [sessions, setSessions] = useState<AuditorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<Record<string, { docs: DocInfo[]; job: AuditJob | null }>>({});

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('auditor_sessions')
        .select('id, name, company_name, vault_id, created_at')
        .order('created_at', { ascending: false });
      if (error) {
        console.error(error);
        return;
      }
      setSessions(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const loadDetails = async (session: AuditorSession) => {
    if (sessionDetails[session.id]) return;
    const [docsRes, jobRes] = await Promise.all([
      supabase.from('documents').select('id, name, file_path, file_size, file_type').eq('vault_id', session.vault_id),
      supabase
        .from('audit_jobs')
        .select('id, status, report_markdown, processed_files, total_files, created_at')
        .eq('vault_id', session.vault_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setSessionDetails((prev) => ({
      ...prev,
      [session.id]: {
        docs: docsRes.data || [],
        job: jobRes.data,
      },
    }));
  };

  const downloadReport = (session: AuditorSession, markdown: string) => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_${session.company_name}_${session.created_at.slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">Audit Agent Sessions</h1>
          <p className="text-muted-foreground">
            Users who accessed the public audit link at{' '}
            <a href="/auditor" className="text-gold hover:underline" target="_blank" rel="noopener noreferrer">
              /auditor
            </a>
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-gold/20 bg-card/50">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No audit sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1">Share the link to start receiving audits</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <Collapsible
                key={session.id}
                open={expandedId === session.id}
                onOpenChange={(open) => {
                  setExpandedId(open ? session.id : null);
                  if (open) loadDetails(session);
                }}
              >
                <div className="rounded-xl border border-gold/20 bg-card overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 hover:bg-muted/30 cursor-pointer transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-gold" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{session.name}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Building2 className="w-3 h-3" />
                            {session.company_name}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(session.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-xs text-gold">View details</span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-gold/10 p-4 space-y-6">
                      {sessionDetails[session.id] ? (
                        <>
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <File className="w-4 h-4 text-gold" />
                              Documents uploaded ({sessionDetails[session.id].docs.length})
                            </h4>
                            {sessionDetails[session.id].docs.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No documents</p>
                            ) : (
                              <ul className="space-y-1">
                                {sessionDetails[session.id].docs.map((d) => (
                                  <li key={d.id} className="text-sm text-muted-foreground flex items-center gap-2">
                                    <FileText className="w-3 h-3" />
                                    {d.name} · {formatFileSize(d.file_size)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gold" />
                              Audit Report
                            </h4>
                            {sessionDetails[session.id].job ? (
                              <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                  Status: {sessionDetails[session.id].job!.status} ·{' '}
                                  {sessionDetails[session.id].job!.processed_files}/
                                  {sessionDetails[session.id].job!.total_files} files
                                </p>
                                {sessionDetails[session.id].job!.report_markdown && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        downloadReport(session, sessionDetails[session.id].job!.report_markdown!)
                                      }
                                    >
                                      <Download className="w-4 h-4 mr-2" />
                                      Download Report
                                    </Button>
                                    <div className="mt-4 rounded-lg border p-4 max-h-64 overflow-y-auto bg-muted/10">
                                      <div className="prose prose-sm max-w-none prose-headings:text-base prose-p:text-sm">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                          {sessionDetails[session.id].job!.report_markdown!.slice(0, 3000)}
                                          {(sessionDetails[session.id].job!.report_markdown!.length || 0) > 3000
                                            ? '\n\n...'
                                            : ''}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No report generated</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
