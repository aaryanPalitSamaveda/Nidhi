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
import { runCIMGeneration } from '@/services/CIM/cimGenerationController';
import { auditVaultInvoke } from '@/services/auditVaultApi';
import { setAuditBackgroundActive, clearAuditBackgroundActive } from '@/components/AuditBackgroundPoller';
import type { CIMReport } from '@/services/CIM/types';
import { runTeaserGeneration, getFormattedTeaser } from '@/services/teaser/teaserGenerationController';
import type { TeaserReport } from '@/services/teaser/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  FolderOpen,
  Eye,
  Edit2,
  FileSignature,
  X,
  CheckSquare,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { formatFileSize } from '@/utils/format';
import samavedaWatermark from '@/assets/samavedaWatermark.png';

function withWatermark(html: string, watermarkUrl: string): string {
  const fullUrl = watermarkUrl.startsWith('http') ? watermarkUrl : new URL(watermarkUrl, window.location.href).href;
  const style = `<style id="samaveda-watermark">
    body { position: relative !important; }
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: url('${fullUrl}');
      background-repeat: repeat;
      background-position: center;
      background-size: 350px 350px;
      opacity: 0.12;
      pointer-events: none;
      z-index: 0;
    }
    body > * { position: relative; z-index: 1; }
    @media print {
      body::before {
        position: fixed !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>`;
  if (html.includes('</head>')) return html.replace('</head>', style + '</head>');
  if (html.includes('<head>')) return html.replace('<head>', '<head>' + style);
  return '<head>' + style + '</head>' + html;
}

function capturePdfFromHtml(html: string, watermarkUrl: string, filename: string): Promise<void> {
  const withWm = withWatermark(html, watermarkUrl);
  const parser = new DOMParser();
  const doc = parser.parseFromString(withWm, 'text/html');
  const body = doc.body;
  const styles = Array.from(doc.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  const scopedStyles = styles.replace(/\bbody\b/g, '.samaveda-pdf-wrap');
  const temp = document.createElement('div');
  temp.id = 'samaveda-pdf-temp';
  temp.className = 'samaveda-pdf-wrap';
  temp.style.cssText = 'position:fixed;left:0;top:0;width:210mm;min-height:297mm;background:#fff;z-index:99999;overflow:visible;padding:0;font-family:Georgia,serif;color:#1a1a1a';
  temp.innerHTML = `<style>${scopedStyles}</style>${body.innerHTML}`;
  document.body.appendChild(temp);
  return new Promise<void>((resolve, reject) => {
    import('html2pdf.js').then(({ default: html2pdf }) => {
      html2pdf().set({ margin: 10, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true }, jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' } }).from(temp).save().then(() => { temp.remove(); resolve(); }).catch((e: Error) => { temp.remove(); reject(e); });
    }).catch(reject);
  });
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
  const [isUploadingFolders, setIsUploadingFolders] = useState(false);
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
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null);
  const [moveDestinationVaultId, setMoveDestinationVaultId] = useState<string | null>(null);
  const [allVaultFolders, setAllVaultFolders] = useState<{ id: string; name: string; parent_id: string | null; path: string }[]>([]);
  const [allVaults, setAllVaults] = useState<{ id: string; name: string }[]>([]);
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);
  const [isAuditExpanded, setIsAuditExpanded] = useState(true);
  const [auditJobId, setAuditJobId] = useState<string | null>(null);
  const [auditJob, setAuditJob] = useState<any>(null);
  const [auditIsRunning, setAuditIsRunning] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [userHasStartedAudit, setUserHasStartedAudit] = useState(false);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const isRestartingRef = useRef(false);
  const userStartedAuditRef = useRef(false);
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

  // Build structured preview HTML from report_json (cover + TOC + 10 sections)
  const previewHtml = useMemo(() => {
    const md = auditJob?.report_markdown;
    if (!md) return '';
    const rj: any = auditJob?.report_json ?? null;
    const dataroomName = vault?.name ?? 'Dataroom';
    const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sc = (s: string) => { const v=(s||'').toLowerCase(); if(v==='critical'||v==='high') return '#dc2626'; if(v==='medium') return '#d97706'; return '#16a34a'; };
    const sb = (s: string) => { const v=(s||'').toLowerCase(); if(v==='critical'||v==='high') return '#fef2f2'; if(v==='medium') return '#fffbeb'; return '#f0fdf4'; };
    const rt = (headers: string[], rows: string[][]) => !rows.length?'': `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:10pt;"><thead><tr>${headers.map(h=>`<th style="border:1px solid #e2e8f0;padding:7px 9px;background:#f8fafc;font-weight:700;color:#334155;text-align:left;">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr style="${i%2===1?'background:#f8fafc;':''}">${r.map(c=>`<td style="border:1px solid #e2e8f0;padding:6px 9px;color:#0f172a;">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const rfb = (title: string, sev: string, detail: string, extra='') => `<div style="border-left:4px solid ${sc(sev)};background:${sb(sev)};padding:12px 14px;margin:10px 0;border-radius:0 6px 6px 0;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="background:${sc(sev)};color:#fff;font-size:8pt;font-weight:700;padding:2px 8px;border-radius:4px;">${(sev||'unknown').toUpperCase()}</span><strong style="color:#0f172a;font-size:10.5pt;">${esc(title)}</strong></div><p style="color:#374151;margin:0 0 6px;font-size:10pt;">${esc(detail)}</p>${extra}</div>`;
    const allRedFlags: any[] = Array.isArray(rj?.red_flags)?rj.red_flags:[];
    const riskBreakdown: any[] = Array.isArray(rj?.risk_breakdown)?rj.risk_breakdown:[];
    const riskScore = rj?.forensic_risk_score??null;
    const execSummary = rj?.executive_summary??md.split('\n').slice(0,6).join(' ').replace(/#+/g,'').trim();
    const sec = (num: number, title: string, body: string) =>
      `<div style="padding:28px 36px;border-bottom:1px solid #e2e8f0;"><div style="font-size:8pt;letter-spacing:.15em;color:#94a3b8;margin-bottom:2px;">${num}</div><h2 style="font-size:16pt;font-weight:700;color:#0f172a;margin:0 0 12px;font-family:Georgia,serif;">${title}</h2>${body}</div>`;
    const cover = `<div style="min-height:92vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#fff;padding:48px 64px;border-bottom:1px solid #e2e8f0;"><div style="border:1px solid #e2e8f0;border-radius:30px;display:inline-block;padding:6px 20px;margin-bottom:48px;"><span style="font-size:9pt;letter-spacing:.2em;color:#64748b;font-family:Georgia,serif;">C O N F I D E N T I A L &nbsp;— &nbsp;F O R E N S I C &nbsp;A U D I T &nbsp;R E P O R T</span></div><h1 style="font-size:26pt;font-weight:300;color:#0f172a;font-family:Georgia,serif;margin:0 0 14px;">Forensic Audit Analysis</h1><p style="font-size:13pt;color:#64748b;font-family:Georgia,serif;font-style:italic;margin:0 0 48px;">Independent Due Diligence &amp; Risk Assessment</p><p style="font-size:10pt;color:#94a3b8;letter-spacing:.15em;font-family:Georgia,serif;">SAMAVEDA CAPITAL</p></div>`;
    const toc = `<div style="min-height:50vh;padding:36px 48px;border-bottom:1px solid #e2e8f0;"><h2 style="font-size:16pt;font-weight:700;color:#0f172a;margin:0 0 24px;font-family:Georgia,serif;">📋 Table of Contents</h2><table style="width:100%;border-collapse:collapse;">${[['1.','Executive Summary & Risk Score Breakdown','Section 1'],['2.','Revenue Reconciliation Analysis','Section 2'],['3.','Financial Red Flags — Detailed Findings','Section 3'],['4.','Cash Flow & Fund Siphoning Analysis','Section 4'],['5.','Document Authenticity & Integrity Review','Section 5'],['6.','Temporal & Timeline Inconsistencies','Section 6'],['7.','Critical Documentation Gaps','Section 7'],['8.','MNC Client Verification','Section 8'],['9.','Risk Matrix & Beneish M-Score Indicators','Section 9'],['10.','Recommendations & Final Verdict','Section 10']].map(([n,t,s])=>`<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 6px;color:#64748b;font-size:10pt;width:28px;">${n}</td><td style="padding:8px 6px;font-size:10.5pt;color:#0f172a;">${t}</td><td style="padding:8px 6px;font-size:10pt;color:#94a3b8;text-align:right;">${s}</td></tr>`).join('')}</table></div>`;
    const metricCards = [rj?.claimed_revenue,rj?.actual_revenue,rj?.claimed_valuation,allRedFlags.length>0?`${allRedFlags.length} Red Flags`:null].filter(Boolean);
    const metricLabels = ['CLAIMED REVENUE','ACTUAL REVENUE','CLAIMED VALUATION','RED FLAGS'];
    const s1body = `<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:16px;background:#fafafa;"><p style="font-size:10.5pt;color:#374151;line-height:1.7;margin:0;">${esc(execSummary)}</p></div>${metricCards.length?`<div style="display:grid;grid-template-columns:repeat(${Math.min(metricCards.length,4)},1fr);gap:10px;margin-bottom:16px;">${metricCards.map((v,i)=>`<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#fff;"><div style="font-size:7pt;letter-spacing:.1em;color:#94a3b8;margin-bottom:3px;">${metricLabels[i]}</div><div style="font-size:12pt;font-weight:700;color:#0f172a;">${esc(String(v))}</div></div>`).join('')}</div>`:''} ${riskBreakdown.length?`<h3 style="font-size:10.5pt;font-weight:700;margin:12px 0 8px;">Forensic Risk Score Breakdown</h3><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${riskBreakdown.map((rb:any)=>`<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 10px;"><div style="font-size:7pt;color:#64748b;text-transform:uppercase;">${esc(rb.category)}</div><div style="font-size:15pt;font-weight:700;color:#0f172a;">${rb.score??'—'}<span style="font-size:8pt;color:#94a3b8;">/10</span></div><div style="font-size:8pt;color:#64748b;">${esc(rb.note??'')}</div></div>`).join('')}</div>`:''}`;
    const s2=rj?.section2_revenue_reconciliation; const s3=rj?.section3_financial_red_flags; const s4=rj?.section4_cash_flow_analysis; const s5=rj?.section5_document_authenticity; const s6=rj?.section6_temporal_inconsistencies; const s7=rj?.section7_documentation_gaps; const s8=rj?.section8_mnc_client_verification; const s9=rj?.section9_risk_matrix; const s10=rj?.section10_recommendations;
    const sections = [
      sec(1,'Executive Summary',s1body),
      s2?sec(2,'Revenue Reconciliation Analysis',`${s2.intro?`<p style="color:#374151;margin-bottom:12px;">${esc(s2.intro)}</p>`:''} ${Array.isArray(s2.data_table)&&s2.data_table.length?rt(['Source Document','FY23','FY24','FY25','Observations'],s2.data_table.map((r:any)=>[r.source_document??'',r.fy23??'—',r.fy24??'—',r.fy25??'—',r.observations??''])):''} ${(Array.isArray(s2.red_flags)?s2.red_flags:[]).map((rf:any)=>rfb(rf.title??'',rf.severity??'medium',rf.detail??rf.evidence??'')).join('')}`):'',
      s3?sec(3,'Financial Red Flags — Detailed Findings',(Array.isArray(s3.subsections)?s3.subsections:[]).map((sub:any)=>{const mt=Array.isArray(sub.metrics_table)?sub.metrics_table:[];const cols=mt.length?Object.keys(mt[0]):[];return `<h3 style="font-size:11pt;font-weight:700;margin:14px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">${esc(sub.title??'')}</h3>${mt.length?rt(cols.map((c:string)=>c.replace(/_/g,' ').toUpperCase()),mt.map((r:any)=>cols.map((c:string)=>r[c]??'—'))):''} ${(Array.isArray(sub.red_flags)?sub.red_flags:[]).map((rf:any)=>rfb(rf.title??'',rf.severity??'medium',rf.detail??'')).join('')}`;}).join('')):'',
      s4?sec(4,'Cash Flow & Fund Siphoning Analysis',(Array.isArray(s4.subsections)?s4.subsections:[]).map((sub:any)=>{const tt=Array.isArray(sub.transactions_table)?sub.transactions_table:[];const cols=tt.length?Object.keys(tt[0]):[];return `<h3 style="font-size:11pt;font-weight:700;margin:14px 0 8px;">${esc(sub.title??'')}</h3>${tt.length?rt(cols.map((c:string)=>c.replace(/_/g,' ').toUpperCase()),tt.map((r:any)=>cols.map((c:string)=>r[c]??'—'))):''} ${(Array.isArray(sub.red_flags)?sub.red_flags:[]).map((rf:any)=>rfb(rf.title??'',rf.severity??'medium',rf.detail??'')).join('')}`;}).join('')):'',
      s5?sec(5,'Document Authenticity & Integrity Review',`${Array.isArray(s5.completeness_matrix)&&s5.completeness_matrix.length?rt(['Document','Status','Issue','Risk Impact'],s5.completeness_matrix.map((r:any)=>[r.document??'',r.status??'',r.issue??'',r.risk_impact??''])):''} ${(Array.isArray(s5.red_flags)?s5.red_flags:[]).map((rf:any)=>rfb(rf.title??'',rf.severity??'medium',rf.detail??'')).join('')}`):'',
      s6?sec(6,'Temporal & Timeline Inconsistencies',`${Array.isArray(s6.timeline_table)&&s6.timeline_table.length?rt(['Document','Date Referenced','Issue','Severity'],s6.timeline_table.map((r:any)=>[r.document??'',r.date_referenced??'',r.issue??'',r.severity??''])):''} ${(Array.isArray(s6.red_flags)?s6.red_flags:[]).map((rf:any)=>rfb(rf.title??'',rf.severity??'medium',rf.detail??'')).join('')}`):'',
      s7?sec(7,'Critical Documentation Gaps',`<p style="color:#374151;margin-bottom:12px;">The following documents are entirely absent from the dataroom.</p>${Array.isArray(s7.gaps_table)&&s7.gaps_table.length?rt(['Missing Document','Criticality','Why It Matters'],s7.gaps_table.map((r:any)=>[r.missing_document??'',r.criticality??'',r.why_it_matters??''])):''}`):'',
      s8?sec(8,'MNC Client Claim Verification',`${Array.isArray(s8.verifiable_receipts_table)&&s8.verifiable_receipts_table.length?`<h3 style="font-size:10.5pt;font-weight:600;margin:0 0 6px;">Verifiable Client Receipts</h3>${rt(['Client','Amount','Date','Matches Teaser?'],s8.verifiable_receipts_table.map((r:any)=>[r.client??'',r.amount??'',r.date??'',r.matches_teaser??'']))}`:''} ${Array.isArray(s8.findings)&&s8.findings.length?`<ul style="margin:8px 0 0 18px;">${(s8.findings as string[]).map(f=>`<li style="font-size:10pt;color:#374151;margin-bottom:5px;">${esc(f)}</li>`).join('')}</ul>`:''}`):'',
      s9?sec(9,'Risk Matrix & Beneish M-Score Indicators',`${Array.isArray(s9.beneish_indicators)&&s9.beneish_indicators.length?rt(['Forensic Indicator','Present?','Evidence'],s9.beneish_indicators.map((r:any)=>[r.indicator??'',r.present??'',r.evidence??''])):''} ${s9.assessment_summary?`<div style="border-left:4px solid #dc2626;background:#fef2f2;padding:12px 14px;margin:12px 0;border-radius:0 6px 6px 0;"><strong style="color:#dc2626;">Assessment: ${s9.indicators_present_count??'?'} of ${s9.total_indicators??7} Indicators Present</strong><p style="margin:4px 0 0;color:#374151;">${esc(s9.assessment_summary)}</p></div>`:''}`):'',
      s10?sec(10,'Recommendations & Final Verdict',`${Array.isArray(s10.immediate_critical)&&s10.immediate_critical.length?`<h3 style="font-size:11pt;font-weight:700;margin:0 0 8px;">Immediate Actions (Critical)</h3><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;">${(s10.immediate_critical as string[]).map(a=>`<div style="border:1px solid #fee2e2;background:#fef2f2;border-radius:6px;padding:8px 12px;"><span style="font-size:7pt;font-weight:700;color:#dc2626;">IMMEDIATE — CRITICAL</span><p style="margin:3px 0 0;font-size:10pt;color:#374151;">${esc(a)}</p></div>`).join('')}</div>`:''} ${Array.isArray(s10.short_term_high)&&s10.short_term_high.length?`<h3 style="font-size:11pt;font-weight:700;margin:0 0 8px;">Short-Term (High Priority)</h3><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;">${(s10.short_term_high as string[]).map(a=>`<div style="border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:8px 12px;"><span style="font-size:7pt;font-weight:700;color:#d97706;">SHORT-TERM — HIGH</span><p style="margin:3px 0 0;font-size:10pt;color:#374151;">${esc(a)}</p></div>`).join('')}</div>`:''} ${s10.deal_structure_notes?`<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:14px;"><h3 style="font-size:10.5pt;font-weight:700;margin:0 0 6px;">💰 Valuation & Deal Structure</h3><p style="font-size:10pt;color:#374151;margin:0;">${esc(s10.deal_structure_notes)}</p></div>`:''} ${s10.final_verdict?`<div style="border:2px solid ${s10.final_verdict.includes('DO NOT')?'#dc2626':s10.final_verdict.includes('CAUTION')?'#d97706':'#16a34a'};border-radius:8px;padding:16px 20px;text-align:center;margin-top:14px;"><div style="font-size:10pt;font-weight:700;color:${s10.final_verdict.includes('DO NOT')?'#dc2626':s10.final_verdict.includes('CAUTION')?'#d97706':'#16a34a'};letter-spacing:.1em;margin-bottom:6px;">FINAL RECOMMENDATION</div><div style="font-size:16pt;font-weight:800;color:${s10.final_verdict.includes('DO NOT')?'#dc2626':s10.final_verdict.includes('CAUTION')?'#d97706':'#16a34a'};margin-bottom:10px;">${esc(s10.final_verdict)}</div><p style="font-size:10pt;color:#374151;margin:0;">${esc(s10.final_verdict_detail??'')}</p></div>`:''}`):'',
    ].filter(Boolean).join('');
    const fallback = (!s2&&!s3&&!s4&&allRedFlags.length>0)?`<div style="padding:28px 36px;">${allRedFlags.map((rf:any,i:number)=>rfb(`${i+1}. ${rf.title??''}`,rf.severity??'medium',rf.what_it_means??rf.detail??'')).join('')}</div>`:'';
    const raw = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11pt;color:#0f172a;background:#fff;line-height:1.6;}</style></head><body>${cover}${toc}${sections}${fallback}<div style="padding:16px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9pt;color:#94a3b8;"><span>SAMAVEDA CAPITAL</span><span>Risk Score: ${riskScore??'—'}/100 · Red Flags: ${allRedFlags.length} · Files: ${auditJob?.processed_files??0}</span><span>S T R I C T L Y &nbsp; C O N F I D E N T I A L</span></div></body></html>`;
    return withWatermark(raw, samavedaWatermark);
  }, [auditJob?.report_markdown, auditJob?.report_json, auditJob?.processed_files, vault?.name]);
  const [isCimDialogOpen, setIsCimDialogOpen] = useState(false);
  const [teaserReport, setTeaserReport] = useState<TeaserReport | null>(null);
  const [teaserError, setTeaserError] = useState<string | null>(null);
  const [teaserIsRunning, setTeaserIsRunning] = useState(false);
  const teaserAbortControllerRef = useRef<AbortController | null>(null);
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
  const cimPreviewRef = useRef<HTMLIFrameElement | null>(null);
  const cimProgressTimerRef = useRef<number | null>(null);
  const cimStartedAtRef = useRef<number | null>(null);
  const cimAbortControllerRef = useRef<AbortController | null>(null);
  const cimRunIdRef = useRef<string | null>(null);
  const cimHtml = useMemo(() => {
    const raw = cimReport?.cimReport;
    if (typeof raw !== 'string') return '';
    // Scope CIM styles to prevent leaking (body { background: white } was turning page white)
    return raw.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_, attrs, content) => {
      const scoped = content.replace(/\bbody\b/g, '#cim-report-content');
      return `<style${attrs}>${scoped}</style>`;
    });
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
      if (error) {
        setCimReport(null);
        return;
      }
      if (!data) {
        setCimReport(null);
        return;
      }
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

  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !vaultId || !user) return;

    setIsUploadingFolders(true);

    // Build list of files with their relative paths (FolderName/SubFolder/file.txt)
    const filesWithPaths = Array.from(files).map((file) => ({
      file,
      relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    }));

    // Collect unique folder paths and sort so parents come first
    const folderPathsSet = new Set<string>();
    for (const { relativePath } of filesWithPaths) {
      const parts = relativePath.split('/');
      for (let i = 1; i < parts.length; i++) {
        folderPathsSet.add(parts.slice(0, i).join('/'));
      }
    }
    const folderPaths = Array.from(folderPathsSet).sort((a, b) => a.split('/').length - b.split('/').length);

    // Map: folder path -> folder id ('' = root of selected folder)
    const pathToFolderId = new Map<string, string | null>();

    try {
      // Create root folder for the selected directory (browser doesn't give us the folder name)
      const rootFolderName = filesWithPaths[0].relativePath.split('/')[0];
      const { data: rootFolder, error: rootError } = await supabase
        .from('folders')
        .insert({
          vault_id: vaultId,
          parent_id: currentFolderId,
          name: rootFolderName,
          created_by: user.id,
        })
        .select()
        .single();

      if (rootError) throw rootError;
      pathToFolderId.set('', rootFolder?.id ?? currentFolderId);

      if (rootFolder) {
        try {
          await supabase.rpc('log_activity', {
            p_vault_id: vaultId,
            p_action: 'create_folder',
            p_resource_type: 'folder',
            p_document_id: null,
            p_folder_id: rootFolder.id,
            p_resource_name: rootFolderName,
            p_metadata: null,
          });
        } catch (logError) {
          console.error('Error logging folder creation:', logError);
        }
      }

      // Create all subfolders
      for (const folderPath of folderPaths) {
        const parts = folderPath.split('/');
        const folderName = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = pathToFolderId.get(parentPath) ?? pathToFolderId.get('') ?? currentFolderId;

        const { data: folder, error: folderError } = await supabase
          .from('folders')
          .insert({
            vault_id: vaultId,
            parent_id: parentId,
            name: folderName,
            created_by: user.id,
          })
          .select()
          .single();

        if (folderError) throw folderError;
        if (folder) {
          pathToFolderId.set(folderPath, folder.id);
          try {
            await supabase.rpc('log_activity', {
              p_vault_id: vaultId,
              p_action: 'create_folder',
              p_resource_type: 'folder',
              p_document_id: null,
              p_folder_id: folder.id,
              p_resource_name: folderName,
              p_metadata: null,
            });
          } catch (logError) {
            console.error('Error logging folder creation:', logError);
          }
        }
      }

      // Initialize upload progress for all files
      const initialUploads: FileUploadProgressType[] = filesWithPaths.map(({ file }, index) => ({
        id: `folder_${Date.now()}_${index}_${file.name}`,
        file,
        progress: 0,
        status: 'uploading' as const,
      }));
      setUploadProgress(initialUploads);

      // Upload each file
      const baseTs = Date.now();
      let successCount = 0;
      let errorCount = 0;
      for (let i = 0; i < filesWithPaths.length; i++) {
        const { file, relativePath } = filesWithPaths[i];
        const uploadId = initialUploads[i].id;
        const parts = relativePath.split('/');
        const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        const folderId = pathToFolderId.get(folderPath) ?? pathToFolderId.get('') ?? currentFolderId;

        const storagePath = `${user.id}/${vaultId}/folder_${baseTs}_${i}_${relativePath.replace(/\//g, '_')}`;

        const result = await uploadFileWithProgress(file, storagePath, uploadId, vaultId, folderId);
        if (result.success) successCount++;
        else errorCount++;
      }

      if (successCount > 0) {
        toast({
          title: 'Folder upload complete',
          description: `${successCount} file(s) uploaded from ${folderPaths.length} folder(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
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
      console.error('Error uploading folders:', error);
      toast({
        title: 'Upload failed',
        description: error?.message || 'Failed to upload folders. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingFolders(false);
      event.target.value = '';
      setTimeout(() => {
        setUploadProgress((prev) => {
          const allSuccess = prev.every((u) => u.status === 'success');
          return allSuccess ? [] : prev;
        });
      }, 5000);
    }
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

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const totalCount = folders.length + documents.length;
    const selectedCount = selectedFolderIds.size + selectedDocumentIds.size;
    if (selectedCount === totalCount) {
      setSelectedFolderIds(new Set());
      setSelectedDocumentIds(new Set());
    } else {
      setSelectedFolderIds(new Set(folders.map((f) => f.id)));
      setSelectedDocumentIds(new Set(documents.map((d) => d.id)));
    }
  };

  const clearSelection = () => {
    setSelectedFolderIds(new Set());
    setSelectedDocumentIds(new Set());
  };

  const selectedCount = selectedFolderIds.size + selectedDocumentIds.size;

  const buildFolderTree = (items: { id: string; name: string; parent_id: string | null }[]) => {
    const result: { id: string; name: string; parent_id: string | null; path: string }[] = [];
    const add = (f: { id: string; name: string; parent_id: string | null }, prefix: string) => {
      const path = prefix ? `${prefix} / ${f.name}` : f.name;
      result.push({ ...f, path });
      items.filter((c) => c.parent_id === f.id).forEach((c) => add(c, path));
    };
    items.filter((f) => !f.parent_id).forEach((r) => add(r, ''));
    return result;
  };

  const fetchAllVaultFolders = useCallback(async (targetVaultId?: string) => {
    const vid = targetVaultId ?? vaultId;
    if (!vid) return;
    const { data, error } = await supabase
      .from('folders')
      .select('id, name, parent_id')
      .eq('vault_id', vid)
      .order('name');
    if (error) return;
    setAllVaultFolders(buildFolderTree(data || []));
  }, [vaultId]);

  const fetchAllVaultsForMove = useCallback(async () => {
    const { data, error } = await supabase.from('vaults').select('id, name').order('name');
    if (error) return;
    setAllVaults(data || []);
  }, []);

  const handleBulkDelete = async () => {
    if (!vaultId || !user) return;
    const folderCount = selectedFolderIds.size;
    const docCount = selectedDocumentIds.size;
    if (!confirm(`Delete ${folderCount + docCount} item(s)?${folderCount > 0 ? ' Folders and their contents will be removed.' : ''}`)) return;

    try {
      for (const docId of selectedDocumentIds) {
        const doc = documents.find((d) => d.id === docId);
        if (doc) await handleDeleteDocument(doc.id, doc.name, doc.file_path, true);
      }
      for (const folderId of selectedFolderIds) {
        const folder = folders.find((f) => f.id === folderId);
        if (folder) await handleDeleteFolder(folder.id, folder.name, true);
      }
      clearSelection();
      fetchVaultData();
    } catch (error) {
      console.error('Bulk delete error:', error);
    }
  };

  const handleBulkMove = async () => {
    if (!vaultId || !user) return;
    const destVaultId = moveDestinationVaultId ?? vaultId;
    const destFolderId = moveDestinationId === 'root' || moveDestinationId === null ? null : moveDestinationId;

    if (destVaultId === vaultId && destFolderId && selectedFolderIds.has(destFolderId)) {
      toast({ title: 'Invalid destination', description: 'Cannot move a folder into itself.', variant: 'destructive' });
      return;
    }

    const isCrossVault = destVaultId !== vaultId;

    try {
      if (isCrossVault) {
        // Cross-vault move: copy files to new vault, create records, delete originals
        const folderIdsToMove = new Set(selectedFolderIds);
        const allFoldersInSource = await supabase.from('folders').select('id, name, parent_id').eq('vault_id', vaultId);
        if (allFoldersInSource.error) throw allFoldersInSource.error;

        const addDescendants = (ids: Set<string>) => {
          const items = allFoldersInSource.data || [];
          for (const f of items) {
            if (f.parent_id && ids.has(f.parent_id)) ids.add(f.id);
          }
        };
        let prevSize = 0;
        while (folderIdsToMove.size !== prevSize) {
          prevSize = folderIdsToMove.size;
          addDescendants(folderIdsToMove);
        }

        const foldersToMove = (allFoldersInSource.data || []).filter((f) => folderIdsToMove.has(f.id));
        const sortedFolders = foldersToMove.sort((a, b) => {
          if (!a.parent_id) return -1;
          if (!b.parent_id) return 1;
          const aDepth = foldersToMove.filter((x) => x.parent_id === a.id).length ? 1 : 0;
          const bDepth = foldersToMove.filter((x) => x.parent_id === b.id).length ? 1 : 0;
          return aDepth - bDepth;
        });
        const parentFirst = (): typeof foldersToMove => {
          const result: typeof foldersToMove = [];
          const add = (f: (typeof foldersToMove)[0]) => {
            if (result.some((r) => r.id === f.id)) return;
            if (f.parent_id) {
              const parent = foldersToMove.find((x) => x.id === f.parent_id);
              if (parent) add(parent);
            }
            result.push(f);
          };
          sortedFolders.forEach(add);
          return result;
        };
        const orderedFolders = parentFirst();

        const oldToNewFolder = new Map<string, string>();
        for (const f of orderedFolders) {
          const newParentId = f.parent_id ? oldToNewFolder.get(f.parent_id) ?? destFolderId : destFolderId;
          const { data: newFolder, error: folderErr } = await supabase
            .from('folders')
            .insert({ vault_id: destVaultId, name: f.name, parent_id: newParentId || null, created_by: user.id })
            .select('id')
            .single();
          if (folderErr) throw folderErr;
          if (newFolder) oldToNewFolder.set(f.id, newFolder.id);
        }

        const docsToMoveMap = new Map<string, { id: string; name: string; file_path: string; file_size: number | null; file_type: string | null; folder_id: string | null }>();
        if (selectedDocumentIds.size > 0) {
          const { data: selDocs } = await supabase
            .from('documents')
            .select('id, name, file_path, file_size, file_type, folder_id')
            .in('id', [...selectedDocumentIds])
            .eq('vault_id', vaultId);
          selDocs?.forEach((d) => docsToMoveMap.set(d.id, d));
        }
        for (const folderId of folderIdsToMove) {
          const { data: folderDocs } = await supabase
            .from('documents')
            .select('id, name, file_path, file_size, file_type, folder_id')
            .eq('vault_id', vaultId)
            .eq('folder_id', folderId);
          folderDocs?.forEach((d) => docsToMoveMap.set(d.id, d));
        }
        const docsToMove = [...docsToMoveMap.values()];

        for (const doc of docsToMove) {
          const { data: fileData } = await supabase.storage.from('documents').download(doc.file_path);
          if (!fileData) throw new Error(`Could not download ${doc.name}`);
          const newPath = `${user.id}/${destVaultId}/${Date.now()}_${doc.name}`;
          const { error: uploadErr } = await supabase.storage.from('documents').upload(newPath, fileData, {
            contentType: doc.file_type || 'application/octet-stream',
            upsert: false,
          });
          if (uploadErr) throw uploadErr;

          const newFolderId = doc.folder_id ? oldToNewFolder.get(doc.folder_id) ?? destFolderId : destFolderId;
          const { error: insertErr } = await supabase.from('documents').insert({
            vault_id: destVaultId,
            folder_id: newFolderId || null,
            name: doc.name,
            file_path: newPath,
            file_size: doc.file_size,
            file_type: doc.file_type,
            uploaded_by: user.id,
          });
          if (insertErr) throw insertErr;

          await supabase.storage.from('documents').remove([doc.file_path]);
          await supabase.from('documents').delete().eq('id', doc.id);
        }

        for (const f of orderedFolders.reverse()) {
          await supabase.from('folders').delete().eq('id', f.id);
        }
      } else {
        // Same-vault move
        for (const docId of selectedDocumentIds) {
          const { error } = await supabase.from('documents').update({ folder_id: destFolderId }).eq('id', docId);
          if (error) throw error;
        }
        for (const folderId of selectedFolderIds) {
          if (destFolderId === folderId) continue;
          const { error } = await supabase.from('folders').update({ parent_id: destFolderId }).eq('id', folderId);
          if (error) throw error;
        }
      }

      toast({ title: 'Moved', description: `${selectedCount} item(s) moved successfully` });
      clearSelection();
      setIsMoveDialogOpen(false);
      setMoveDestinationId(null);
      setMoveDestinationVaultId(null);
      fetchVaultData();
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to move', variant: 'destructive' });
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string, skipConfirm?: boolean) => {
    if (!skipConfirm && !confirm(`Delete "${folderName}" and all its contents?`)) return;
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

  const handleDeleteDocument = async (docId: string, docName: string, filePath: string, skipConfirm?: boolean) => {
    if (!skipConfirm && !confirm(`Delete "${docName}"?`)) return;
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
    const MAX_ETA_SECONDS = 4 * 60 * 60; // Cap at 4 hours to avoid "48hr" glitches
    try {
      if (typeof job?.estimated_remaining_seconds === 'number' && job.estimated_remaining_seconds >= 0) {
        return Math.min(MAX_ETA_SECONDS, job.estimated_remaining_seconds);
      }
      if (!job?.started_at) return null;
      const total = Number(job?.total_files ?? 0);
      const processed = Number(job?.processed_files ?? 0);
      if (!total || processed <= 0) return null;
      const startedAt = new Date(job.started_at).getTime();
      const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
      const avgPerFile = elapsedSec / processed;
      const remaining = Math.max(0, Math.round((total - processed) * avgPerFile));
      return Math.min(MAX_ETA_SECONDS, remaining);
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
    userStartedAuditRef.current = true;
    setUserHasStartedAudit(true);
    setAuditError(null);
    setAuditIsRunning(true);
    setAuditJob(null);
    setAuditJobId(null);

    try {
      const data = await auditVaultInvoke({ action: 'start', vaultId });
      if (!data?.jobId) {
        throw new Error('Audit start failed (no jobId returned)');
      }

      setAuditJobId(data.jobId);
      localStorage.setItem(`nidhi:auditJobId:${vaultId}`, data.jobId);
      setAuditBackgroundActive(vaultId, data.jobId);

      const runRes = await auditVaultInvoke({ action: 'run', jobId: data.jobId, maxFiles: 2 });
      const runJob = runRes?.job as { status?: string } | undefined;
      setAuditJob(runJob ?? null);
      if (runJob?.status === 'completed' || runJob?.status === 'failed' || runJob?.status === 'cancelled') {
        clearAuditBackgroundActive(vaultId);
      }
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuditError('Please log in again to run the audit.');
        return;
      }
      const data = await auditVaultInvoke({ action: 'run', jobId: auditJobId, maxFiles: 2 });
      const job = data?.job as { status?: string } | undefined;
      setAuditJob(job ?? null);
      setAuditError(null);
      if (job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled') {
        clearAuditBackgroundActive(vaultId!);
      }
    } catch (e: any) {
      const msg = e?.message || e?.error || 'Audit batch failed';
      const status = e?.context?.response?.status ?? e?.context?.status;
      const is401 = status === 401 || String(msg).toLowerCase().includes('401') || String(msg).toLowerCase().includes('unauthorized');
      setAuditError(is401
        ? 'Session expired or admin access required. Please log out and log in again.'
        : msg);
    } finally {
      setAuditIsRunning(false);
    }
  }, [auditJobId, auditIsRunning, vaultId]);

  const loadAuditState = useCallback(async () => {
    if (!vaultId || isRestartingRef.current) return;
    setAuditError(null);
    userStartedAuditRef.current = false;
    setUserHasStartedAudit(false);

    const persistedJobId = localStorage.getItem(`nidhi:auditJobId:${vaultId}`);
    if (persistedJobId) {
      setAuditJobId(persistedJobId);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const data = await auditVaultInvoke({ action: 'status', jobId: persistedJobId });
        if (data?.job) {
          if (data.job.status === 'cancelled') {
            setAuditJobId(null);
            setAuditJob(null);
            clearAuditBackgroundActive(vaultId);
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

  const stopAudit = useCallback(async () => {
    if (!auditJobId || auditJob?.status === 'completed' || auditJob?.status === 'failed' || auditJob?.status === 'cancelled') return;
    const jobToCancel = auditJobId;
    // Clear UI immediately so user sees stop right away
    setAuditIsRunning(false);
    setAuditJobId(null);
    setAuditJob(null);
    setAuditError(null);
    setUserHasStartedAudit(false);
    userStartedAuditRef.current = false;
    clearAuditBackgroundActive(vaultId);
    localStorage.removeItem(`nidhi:auditJobId:${vaultId}`);
    toast({
      title: 'Audit Stopped',
      description: 'The audit has been cancelled. You can start a new one anytime.',
    });
    try {
      await auditVaultInvoke({ action: 'cancel', jobId: jobToCancel });
    } catch (e: any) {
      toast({
        title: 'Note',
        description: 'Audit cancelled locally. Server may take a moment to stop.',
        variant: 'default',
      });
    }
  }, [vaultId, auditJobId, auditJob?.status, toast]);

  const startOrRegenerateAudit = useCallback(async () => {
    if (!vaultId) return;
    userStartedAuditRef.current = true;
    setUserHasStartedAudit(true);
    const hadReport = !!auditJob?.report_markdown;
    setAuditError(null);
    setAuditIsRunning(true);
    setAuditJob(null);
    setAuditJobId(null);

    try {
      const data = await auditVaultInvoke({ action: 'start', vaultId });
      if (!data?.jobId) {
        throw new Error('Audit start failed (no jobId returned)');
      }

      setAuditJobId(data.jobId);
      localStorage.setItem(`nidhi:auditJobId:${vaultId}`, data.jobId);
      setAuditBackgroundActive(vaultId, data.jobId);

      const runRes = await auditVaultInvoke({ action: 'run', jobId: data.jobId, maxFiles: 2 });
      const runJob = runRes?.job as { status?: string } | undefined;
      setAuditJob(runJob ?? null);
      if (runJob?.status === 'completed' || runJob?.status === 'failed' || runJob?.status === 'cancelled') {
        clearAuditBackgroundActive(vaultId);
      }
      toast({
        title: hadReport ? 'Audit Regenerated' : 'Audit Started',
        description: hadReport ? 'A new audit has been started. Report will be saved when complete.' : 'A new audit has been started.',
      });
    } catch (e: any) {
      const msg = e?.message || e?.error || 'Failed to start audit';
      setAuditError(msg);
    } finally {
      setAuditIsRunning(false);
    }
  }, [vaultId, auditJob?.report_markdown]);


  const downloadAuditReport = useCallback(async () => {
    const md = auditJob?.report_markdown;
    if (!md) return;

    const dataroomName = vault?.name ?? 'Dataroom';
    const reportDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    // Try to use the rich report_json if available
    const rj: any = auditJob?.report_json ?? null;

    const esc = (s: string) =>
      String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // --- helpers ---
    const severityColor = (s: string) => {
      const sev = (s || '').toLowerCase();
      if (sev === 'critical' || sev === 'high') return '#dc2626';
      if (sev === 'medium') return '#d97706';
      return '#16a34a';
    };
    const severityBg = (s: string) => {
      const sev = (s || '').toLowerCase();
      if (sev === 'critical' || sev === 'high') return '#fef2f2';
      if (sev === 'medium') return '#fffbeb';
      return '#f0fdf4';
    };
    const severityLabel = (s: string) => (s || 'UNKNOWN').toUpperCase();

    // watermarkSvg/pageWatermark empty — withWatermark() injects PNG via body::before
    const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="48" font-family="Georgia,serif" fill="rgba(180,140,100,0.13)" font-weight="bold" letter-spacing="6" transform="rotate(-35, 420, 420)">SAMAVEDA CAPITAL</text></svg>`;
    const pageWatermark = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="48" font-family="Georgia,serif" fill="rgba(180,140,100,0.13)" font-weight="bold" letter-spacing="6" transform="rotate(-35, 420, 420)">SAMAVEDA CAPITAL</text></svg>`;

    const renderTable = (headers: string[], rows: string[][]): string => {
      if (!rows.length) return '';
      return `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:10pt;">
        <thead><tr>${headers.map(h => `<th style="border:1px solid #e2e8f0;padding:8px 10px;background:#f8fafc;font-weight:700;color:#334155;text-align:left;">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((row, i) => `<tr style="${i % 2 === 1 ? 'background:#f8fafc;' : ''}">${row.map(c => `<td style="border:1px solid #e2e8f0;padding:7px 10px;color:#0f172a;">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    };

    const renderRedFlagBox = (title: string, severity: string, detail: string, extra = ''): string =>
      `<div style="border-left:4px solid ${severityColor(severity)};background:${severityBg(severity)};padding:14px 16px;margin:14px 0;border-radius:0 6px 6px 0;page-break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="background:${severityColor(severity)};color:#fff;font-size:8pt;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.05em;">${severityLabel(severity)}</span>
          <strong style="color:#0f172a;font-size:11pt;">${esc(title)}</strong>
        </div>
        <p style="color:#374151;margin:0 0 8px;font-size:10.5pt;">${esc(detail)}</p>
        ${extra}
      </div>`;

    // ---- COVER PAGE ----
    const coverPage = `<div style="position:relative;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#ffffff;padding:60px 80px;page-break-after:always;">
      ${watermarkSvg}
      <div style="position:relative;z-index:1;text-align:center;width:100%;">
        <div style="border:1px solid #e2e8f0;border-radius:30px;display:inline-block;padding:8px 24px;margin-bottom:60px;">
          <span style="font-size:9pt;letter-spacing:.2em;color:#64748b;font-family:Georgia,serif;">C O N F I D E N T I A L &nbsp;— &nbsp;F O R E N S I C &nbsp;A U D I T &nbsp;R E P O R T</span>
        </div>
        <h1 style="font-size:28pt;font-weight:300;color:#0f172a;font-family:Georgia,serif;margin:0 0 16px;letter-spacing:-.01em;">Forensic Audit Analysis</h1>
        <p style="font-size:14pt;color:#64748b;font-family:Georgia,serif;font-style:italic;margin:0 0 60px;">Independent Due Diligence &amp; Risk Assessment</p>
        <p style="font-size:11pt;color:#94a3b8;letter-spacing:.15em;font-family:Georgia,serif;">SAMAVEDA CAPITAL</p>
      </div>
    </div>`;

    // ---- TABLE OF CONTENTS ----
    const tocPage = `<div style="position:relative;min-height:60vh;padding:48px 64px;page-break-after:always;">
      ${pageWatermark}
      <div style="position:relative;z-index:1;">
        <h2 style="font-size:18pt;font-weight:700;color:#0f172a;margin:0 0 32px;font-family:Georgia,serif;">&#128203; Table of Contents</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${[
            ['1.', 'Executive Summary & Risk Score Breakdown', 'Section 1'],
            ['2.', 'Revenue Reconciliation Analysis', 'Section 2'],
            ['3.', 'Financial Red Flags — Detailed Findings', 'Section 3'],
            ['4.', 'Cash Flow & Fund Siphoning Analysis', 'Section 4'],
            ['5.', 'Document Authenticity & Integrity Review', 'Section 5'],
            ['6.', 'Temporal & Timeline Inconsistencies', 'Section 6'],
            ['7.', 'Critical Documentation Gaps', 'Section 7'],
            ['8.', 'MNC Client Verification', 'Section 8'],
            ['9.', 'Risk Matrix & Beneish M-Score Indicators', 'Section 9'],
            ['10.', 'Recommendations & Final Verdict', 'Section 10'],
          ].map(([num, title, section]) =>
            `<tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 8px;color:#64748b;font-size:10pt;width:32px;">${num}</td>
              <td style="padding:10px 8px;font-size:11pt;color:#0f172a;">${title}</td>
              <td style="padding:10px 8px;font-size:10pt;color:#94a3b8;text-align:right;">${section}</td>
            </tr>`
          ).join('')}
        </table>
        <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
      </div>
    </div>`;

    // ---- SECTION 1: Executive Summary ----
    const riskScore = rj?.forensic_risk_score ?? null;
    const riskBreakdown: any[] = Array.isArray(rj?.risk_breakdown) ? rj.risk_breakdown : [];
    const claimedRev = rj?.claimed_revenue ?? null;
    const actualRev = rj?.actual_revenue ?? null;
    const claimedVal = rj?.claimed_valuation ?? null;
    const allRedFlags: any[] = Array.isArray(rj?.red_flags) ? rj.red_flags : [];
    const critCount = allRedFlags.filter(f => ['critical','high'].includes((f.severity||'').toLowerCase())).length;
    const medCount  = allRedFlags.filter(f => (f.severity||'').toLowerCase() === 'medium').length;
    const execSummary = rj?.executive_summary ?? md.split('\n').slice(0, 12).join(' ').replace(/#+/g, '').trim();

    const metricCards = [claimedRev, actualRev, claimedVal, allRedFlags.length > 0 ? `${allRedFlags.length} (${critCount} Critical, ${medCount} Medium)` : null]
      .filter(Boolean);
    const metricLabels = ['CLAIMED REVENUE', 'ACTUAL REVENUE', 'CLAIMED VALUATION', 'RED FLAGS IDENTIFIED'];

    const section1 = `<div style="position:relative;padding:48px 64px;page-break-after:always;">
      ${pageWatermark}
      <div style="position:relative;z-index:1;">
        <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">1</h2>
        <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 24px;font-family:Georgia,serif;">Executive Summary</h2>
        <div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin-bottom:24px;background:#fafafa;">
          <p style="font-size:11pt;color:#374151;line-height:1.7;margin:0;">${esc(execSummary)}</p>
        </div>
        ${metricCards.length > 0 ? `<div style="display:grid;grid-template-columns:repeat(${Math.min(metricCards.length,4)},1fr);gap:12px;margin-bottom:24px;">
          ${metricCards.map((val, i) => `<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:14px 16px;background:#fff;">
            <div style="font-size:8pt;letter-spacing:.1em;color:#94a3b8;margin-bottom:4px;">${metricLabels[i]}</div>
            <div style="font-size:14pt;font-weight:700;color:#0f172a;">${esc(String(val))}</div>
          </div>`).join('')}
        </div>` : ''}
        ${riskBreakdown.length > 0 ? `<h3 style="font-size:12pt;font-weight:700;color:#0f172a;margin:20px 0 12px;">Forensic Risk Score Breakdown</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          ${riskBreakdown.map(rb => `<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:12px 14px;">
            <div style="font-size:8pt;letter-spacing:.08em;color:#64748b;margin-bottom:4px;text-transform:uppercase;">${esc(rb.category)}</div>
            <div style="font-size:18pt;font-weight:700;color:#0f172a;">${rb.score ?? '—'}<span style="font-size:10pt;color:#94a3b8;">/10</span></div>
            <div style="font-size:9pt;color:#64748b;margin-top:4px;">${esc(rb.note ?? '')}</div>
          </div>`).join('')}
        </div>` : ''}
        <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
      </div>
    </div>`;

    // ---- SECTION 2: Revenue Reconciliation ----
    const s2 = rj?.section2_revenue_reconciliation;
    const section2 = s2 ? (() => {
      const dt: any[] = Array.isArray(s2.data_table) ? s2.data_table : [];
      const rfs: any[] = Array.isArray(s2.red_flags) ? s2.red_flags : [];
      const tableHtml = dt.length ? renderTable(
        ['Source Document','FY23','FY24','FY25','Observations'],
        dt.map((r:any) => [r.source_document??'', r.fy23??'—', r.fy24??'—', r.fy25??'—', r.observations??''])
      ) : '';
      return `<div style="position:relative;padding:48px 64px;page-break-after:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">2</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">Revenue Reconciliation Analysis</h2>
          ${s2.intro ? `<p style="color:#374151;margin-bottom:16px;">${esc(s2.intro)}</p>` : ''}
          ${tableHtml ? `<h3 style="font-size:11pt;font-weight:600;color:#0f172a;margin:16px 0 8px;">Revenue Data Across Documents</h3>${tableHtml}` : ''}
          ${rfs.map(rf => renderRedFlagBox(rf.title??'', rf.severity??'medium', rf.detail??rf.evidence??'')).join('')}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- SECTION 3: Financial Red Flags ----
    const s3 = rj?.section3_financial_red_flags;
    const section3 = s3 ? (() => {
      const subs: any[] = Array.isArray(s3.subsections) ? s3.subsections : [];
      const subHtml = subs.map((sub:any) => {
        const mt: any[] = Array.isArray(sub.metrics_table) ? sub.metrics_table : [];
        const cols = mt.length ? Object.keys(mt[0]) : [];
        const tbl = mt.length ? renderTable(
          cols.map(c => c.replace(/_/g,' ').toUpperCase()),
          mt.map((r:any) => cols.map(c => r[c]??'—'))
        ) : '';
        const rfHtml = (Array.isArray(sub.red_flags) ? sub.red_flags : []).map((rf:any) => {
          const impl = Array.isArray(rf.implications) ? rf.implications : [];
          const implHtml = impl.length ? `<ul style="margin:8px 0 0 16px;">${impl.map((i:string) => `<li style="font-size:10pt;color:#374151;margin-bottom:4px;">${esc(i)}</li>`).join('')}</ul>` : '';
          return renderRedFlagBox(rf.title??'', rf.severity??'medium', rf.detail??'', implHtml);
        }).join('');
        return `<h3 style="font-size:12pt;font-weight:700;color:#0f172a;margin:20px 0 10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">${esc(sub.title??'')}</h3>${tbl}${rfHtml}`;
      }).join('');
      return `<div style="position:relative;padding:48px 64px;page-break-after:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">3</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">Financial Red Flags — Detailed Findings</h2>
          ${subHtml}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- SECTION 4: Cash Flow ----
    const s4 = rj?.section4_cash_flow_analysis;
    const section4 = s4 ? (() => {
      const subs: any[] = Array.isArray(s4.subsections) ? s4.subsections : [];
      const subHtml = subs.map((sub:any) => {
        const tt: any[] = Array.isArray(sub.transactions_table) ? sub.transactions_table : [];
        const cols = tt.length ? Object.keys(tt[0]) : [];
        const tbl = tt.length ? renderTable(
          cols.map(c => c.replace(/_/g,' ').toUpperCase()),
          tt.map((r:any) => cols.map(c => r[c]??'—'))
        ) : '';
        const rfHtml = (Array.isArray(sub.red_flags) ? sub.red_flags : []).map((rf:any) => {
          const fi = Array.isArray(rf.forensic_indicators) ? rf.forensic_indicators : [];
          const fiHtml = fi.length ? `<div style="margin-top:8px;padding:10px 14px;background:rgba(0,0,0,.03);border-radius:6px;"><strong style="font-size:9pt;color:#0f172a;">Forensic indicators present:</strong><ul style="margin:6px 0 0 16px;">${fi.map((i:string) => `<li style="font-size:10pt;color:#374151;">${esc(i)}</li>`).join('')}</ul></div>` : '';
          return renderRedFlagBox(rf.title??'', rf.severity??'medium', rf.detail??'', fiHtml);
        }).join('');
        return `<h3 style="font-size:12pt;font-weight:700;color:#0f172a;margin:20px 0 10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">${esc(sub.title??'')}</h3>${tbl}${rfHtml}`;
      }).join('');
      return `<div style="position:relative;padding:48px 64px;page-break-after:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">4</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">Cash Flow &amp; Fund Siphoning Analysis</h2>
          ${subHtml}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- SECTION 5: Document Authenticity ----
    const s5 = rj?.section5_document_authenticity;
    const section5 = s5 ? (() => {
      const cm: any[] = Array.isArray(s5.completeness_matrix) ? s5.completeness_matrix : [];
      const rfs: any[] = Array.isArray(s5.red_flags) ? s5.red_flags : [];
      return `<div style="position:relative;padding:48px 64px;page-break-after:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">5</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">Document Authenticity &amp; Integrity Review</h2>
          ${cm.length ? renderTable(['Document','Status','Issue','Risk Impact'], cm.map((r:any)=>[r.document??'',r.status??'',r.issue??'',r.risk_impact??''])) : ''}
          ${rfs.map(rf => renderRedFlagBox(rf.title??'', rf.severity??'medium', rf.detail??'')).join('')}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- SECTION 6: Temporal ----
    const s6 = rj?.section6_temporal_inconsistencies;
    const section6 = s6 ? (() => {
      const tt: any[] = Array.isArray(s6.timeline_table) ? s6.timeline_table : [];
      const rfs: any[] = Array.isArray(s6.red_flags) ? s6.red_flags : [];
      return `<div style="position:relative;padding:48px 64px;page-break-after:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">6</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">Temporal &amp; Timeline Inconsistencies</h2>
          ${tt.length ? renderTable(['Document','Date Referenced','Issue','Severity'], tt.map((r:any)=>[r.document??'',r.date_referenced??'',r.issue??'',r.severity??''])) : ''}
          ${rfs.map(rf => renderRedFlagBox(rf.title??'', rf.severity??'medium', rf.detail??'')).join('')}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- SECTION 7: Documentation Gaps ----
    const s7 = rj?.section7_documentation_gaps;
    const section7 = s7 ? (() => {
      const gt: any[] = Array.isArray(s7.gaps_table) ? s7.gaps_table : [];
      return `<div style="position:relative;padding:48px 64px;page-break-after:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">7</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">Critical Documentation Gaps</h2>
          <p style="color:#374151;margin-bottom:16px;">The following documents — essential for credible due diligence — are entirely absent from the dataroom.</p>
          ${gt.length ? renderTable(['Missing Document','Criticality','Why It Matters'], gt.map((r:any)=>[r.missing_document??'',r.criticality??'',r.why_it_matters??''])) : ''}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- SECTION 8: MNC ----
    const s8 = rj?.section8_mnc_client_verification;
    const section8 = s8 ? (() => {
      const vt: any[] = Array.isArray(s8.verifiable_receipts_table) ? s8.verifiable_receipts_table : [];
      const findings: string[] = Array.isArray(s8.findings) ? s8.findings : [];
      return `<div style="position:relative;padding:48px 64px;page-break-after:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">8</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">MNC Client Claim Verification</h2>
          ${vt.length ? `<h3 style="font-size:11pt;font-weight:600;margin:0 0 8px;">Verifiable Client Receipts</h3>${renderTable(['Client','Amount','Date','Matches Teaser?'],vt.map((r:any)=>[r.client??'',r.amount??'',r.date??'',r.matches_teaser??'']))}` : ''}
          ${findings.length ? `<div style="margin-top:16px;"><h3 style="font-size:11pt;font-weight:600;margin:0 0 8px;">Critical Client Verification Failures</h3><ul style="margin:0 0 0 18px;">${findings.map((f:string)=>`<li style="font-size:10.5pt;color:#374151;margin-bottom:6px;">${esc(f)}</li>`).join('')}</ul></div>` : ''}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- SECTION 9: Risk Matrix ----
    const s9 = rj?.section9_risk_matrix;
    const section9 = s9 ? (() => {
      const bi: any[] = Array.isArray(s9.beneish_indicators) ? s9.beneish_indicators : [];
      const count = s9.indicators_present_count ?? bi.filter((b:any) => (b.present||'').toUpperCase().includes('YES')).length;
      const total = s9.total_indicators ?? bi.length;
      return `<div style="position:relative;padding:48px 64px;page-break-after:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">9</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">Risk Matrix &amp; Beneish M-Score Indicators</h2>
          ${bi.length ? `<h3 style="font-size:11pt;font-weight:600;margin:0 0 8px;">Beneish M-Score — Qualitative Forensic Indicators</h3>${renderTable(['Forensic Indicator','Present?','Evidence'],bi.map((r:any)=>[r.indicator??'',r.present??'',r.evidence??'']))}` : ''}
          ${s9.assessment_summary ? `<div style="border-left:4px solid #dc2626;background:#fef2f2;padding:14px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
            <strong style="color:#dc2626;">Assessment: ${count} of ${total} Forensic Indicators Present</strong>
            <p style="margin:6px 0 0;color:#374151;">${esc(s9.assessment_summary)}</p>
          </div>` : ''}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- SECTION 10: Recommendations ----
    const s10 = rj?.section10_recommendations;
    const section10 = (() => {
      // Always render section 10, fallback to basic coverage notes if no s10
      const imm: string[] = s10 ? (Array.isArray(s10.immediate_critical) ? s10.immediate_critical : []) : [];
      const st_: string[] = s10 ? (Array.isArray(s10.short_term_high) ? s10.short_term_high : []) : [];
      const verdict = s10?.final_verdict ?? '';
      const verdictDetail = s10?.final_verdict_detail ?? '';
      const dealNotes = s10?.deal_structure_notes ?? '';
      const coverageNotes: string[] = Array.isArray(rj?.coverage_notes) ? rj.coverage_notes : [];
      const verdictColor = verdict.includes('DO NOT') ? '#dc2626' : verdict.includes('CAUTION') ? '#d97706' : '#16a34a';
      return `<div style="position:relative;padding:48px 64px;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:9pt;letter-spacing:.15em;color:#94a3b8;font-weight:400;margin:0 0 4px;">10</h2>
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 16px;font-family:Georgia,serif;">Recommendations &amp; Final Verdict</h2>
          ${imm.length ? `<h3 style="font-size:12pt;font-weight:700;color:#0f172a;margin:0 0 8px;">Immediate Actions Required (Pre-LOI)</h3>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px;">
            ${imm.map((a:string) => `<div style="border:1px solid #fee2e2;background:#fef2f2;border-radius:6px;padding:10px 14px;">
              <span style="font-size:8pt;font-weight:700;color:#dc2626;letter-spacing:.05em;">IMMEDIATE — CRITICAL</span>
              <p style="margin:4px 0 0;font-size:10pt;color:#374151;">${esc(a)}</p>
            </div>`).join('')}
          </div>` : ''}
          ${st_.length ? `<h3 style="font-size:12pt;font-weight:700;color:#0f172a;margin:0 0 8px;">Short-Term Actions (High Priority)</h3>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px;">
            ${st_.map((a:string) => `<div style="border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:10px 14px;">
              <span style="font-size:8pt;font-weight:700;color:#d97706;letter-spacing:.05em;">SHORT-TERM — HIGH</span>
              <p style="margin:4px 0 0;font-size:10pt;color:#374151;">${esc(a)}</p>
            </div>`).join('')}
          </div>` : ''}
          ${dealNotes ? `<div style="border:1.5px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;background:#fafafa;">
            <h3 style="font-size:11pt;font-weight:700;margin:0 0 8px;">&#128176; Valuation &amp; Deal Structure</h3>
            <p style="font-size:10.5pt;color:#374151;margin:0;">${esc(dealNotes)}</p>
          </div>` : ''}
          ${verdict ? `<div style="border:2px solid ${verdictColor};border-radius:8px;padding:20px 24px;text-align:center;margin-top:24px;">
            <div style="font-size:11pt;font-weight:700;color:${verdictColor};letter-spacing:.1em;margin-bottom:8px;">FINAL RECOMMENDATION</div>
            <div style="font-size:18pt;font-weight:800;color:${verdictColor};margin-bottom:12px;">${esc(verdict)}</div>
            <p style="font-size:10.5pt;color:#374151;margin:0;">${esc(verdictDetail)}</p>
          </div>` : ''}
          ${coverageNotes.length ? `<div style="margin-top:24px;padding:12px 16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <strong style="font-size:10pt;color:#64748b;">Coverage Notes</strong>
            <ul style="margin:6px 0 0 18px;">${coverageNotes.map((n:string) => `<li style="font-size:10pt;color:#64748b;margin-bottom:4px;">${esc(n)}</li>`).join('')}</ul>
          </div>` : ''}
          <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</span>
            <span style="font-size:8pt;color:#94a3b8;">Forensic Risk Score: ${riskScore ?? '—'}/100 · Red Flags: ${allRedFlags.length} · Files: ${auditJob?.processed_files ?? 0}</span>
            <span style="font-size:8pt;color:#94a3b8;">S T R I C T L Y &nbsp; C O N F I D E N T I A L</span>
          </div>
        </div>
      </div>`;
    })();

    // ---- FALLBACK SECTIONS: render when rj exists but lacks 10-section structure (old format) ----
    // This handles cases where index.ts hasn't been redeployed yet
    const hasRichSections = !!(s2 || s3 || s4 || s5 || s6 || s7 || s8 || s9 || s10);
    const oldFormatFallback = (rj && !hasRichSections && allRedFlags.length > 0) ? (() => {
      const redFlagHtml = allRedFlags.map((rf: any, idx: number) => {
        const sev = (rf?.severity ?? 'medium');
        const stepsList = Array.isArray(rf?.recommended_next_steps) ? rf.recommended_next_steps : [];
        const whereList = Array.isArray(rf?.where_to_check) ? rf.where_to_check : [];
        const evidList = Array.isArray(rf?.evidence) ? rf.evidence : [];
        return `<div style="border-left:4px solid ${severityColor(sev)};background:${severityBg(sev)};padding:14px 16px;margin:14px 0;border-radius:0 6px 6px 0;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="background:${severityColor(sev)};color:#fff;font-size:8pt;font-weight:700;padding:2px 8px;border-radius:4px;">${severityLabel(sev)}</span>
            <strong style="color:#0f172a;font-size:11pt;">${idx + 1}. ${esc(rf?.title ?? 'Untitled')}</strong>
            ${typeof rf?.confidence_score === 'number' ? `<span style="margin-left:auto;font-size:8pt;color:#64748b;">Confidence: ${Math.round(rf.confidence_score)}%</span>` : ''}
          </div>
          <p style="color:#374151;margin:0 0 8px;">${esc(rf?.what_it_means ?? rf?.detail ?? '')}</p>
          ${rf?.probable_reason ? `<div style="background:rgba(0,0,0,0.03);padding:10px 12px;border-radius:6px;margin-bottom:8px;">
            <strong style="font-size:9pt;color:#374151;">Probable Reason:</strong>
            <p style="margin:4px 0 0;font-size:10pt;color:#374151;">${esc(rf.probable_reason)}</p>
          </div>` : ''}
          ${whereList.length ? `<p style="font-size:9pt;color:#64748b;margin:6px 0 2px;"><strong>Where to check:</strong> ${whereList.map((w:any) => esc(w?.file_name ?? '')).filter(Boolean).join(', ')}</p>` : ''}
          ${evidList.length ? `<p style="font-size:9pt;color:#64748b;margin:2px 0 6px;"><em>"${esc(String(evidList[0]?.quote ?? '').slice(0, 200))}"</em></p>` : ''}
          ${stepsList.length ? `<ul style="margin:6px 0 0 18px;">${stepsList.map((s:string) => `<li style="font-size:10pt;color:#374151;margin-bottom:3px;">${esc(s)}</li>`).join('')}</ul>` : ''}
        </div>`;
      }).join('');

      const coverageNotes: string[] = Array.isArray(rj?.coverage_notes) ? rj.coverage_notes : [];
      return `<div style="position:relative;padding:48px 64px;page-break-before:always;">
        ${pageWatermark}
        <div style="position:relative;z-index:1;">
          <h2 style="font-size:20pt;font-weight:700;color:#0f172a;margin:0 0 8px;font-family:Georgia,serif;">Detailed Red Flag Analysis</h2>
          <p style="color:#64748b;margin-bottom:24px;">${allRedFlags.length} red flag${allRedFlags.length !== 1 ? 's' : ''} identified across ${auditJob?.processed_files ?? 0} files</p>
          ${redFlagHtml}
          ${coverageNotes.length ? `<div style="margin-top:24px;padding:12px 16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <strong style="font-size:10pt;color:#64748b;">Coverage Notes</strong>
            <ul style="margin:6px 0 0 18px;">${coverageNotes.map((n:string) => `<li style="font-size:10pt;color:#64748b;margin-bottom:4px;">${esc(n)}</li>`).join('')}</ul>
          </div>` : ''}
          <p style="margin-top:40px;font-size:9pt;color:#94a3b8;letter-spacing:.1em;">SAMAVEDA CAPITAL</p>
        </div>
      </div>`;
    })() : '';

    // ---- FALLBACK: if no rj at all, render markdown ----
    const esc2 = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>');
    const mdFallback = !rj ? (() => {
      const lines2 = md.split('\n');
      const out: string[] = [];
      let inList = false, listTag = '', inTable = false;
      const flushList = () => { if (inList) { out.push(`</${listTag}>`); inList = false; listTag = ''; } };
      const flushTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; } };
      for (const rawLine of lines2) {
        const line = rawLine.trimEnd();
        if (/^\|.+\|/.test(line)) {
          const cells = line.split('|').filter((_,i,a) => i>0 && i<a.length-1);
          if (!inTable) { flushList(); out.push('<table style="width:100%;border-collapse:collapse;margin:14px 0;"><thead><tr>'+cells.map(c=>`<th style="border:1px solid #e2e8f0;padding:8px;background:#f8fafc;font-weight:600;">${inline(esc2(c.trim()))}</th>`).join('')+'</tr></thead><tbody>'); inTable = true; }
          else if (!/^[\s|:-]+$/.test(line.replace(/[|:\-\s]/g,''))) out.push('<tr>'+cells.map(c=>`<td style="border:1px solid #e2e8f0;padding:7px 10px;">${inline(esc2(c.trim()))}</td>`).join('')+'</tr>');
          continue;
        } else { flushTable(); }
        if (/^####\s/.test(line)) { flushList(); out.push(`<h4 style="font-weight:700;color:#b45309;background:#fff7ed;border-left:4px solid #f59e0b;padding:7px 12px;border-radius:5px;margin:14px 0 8px;">${inline(esc2(line.slice(5)))}</h4>`); continue; }
        if (/^###\s/.test(line))  { flushList(); out.push(`<h3 style="font-size:13pt;font-weight:700;color:#0f766e;border-bottom:1.5px solid #ccfbf1;padding-bottom:6px;margin:18px 0 8px;">${inline(esc2(line.slice(4)))}</h3>`); continue; }
        if (/^##\s/.test(line))   { flushList(); out.push(`<h2 style="font-size:15pt;font-weight:700;color:#1d4ed8;border-bottom:1.5px solid #dbeafe;padding-bottom:6px;margin:22px 0 10px;">${inline(esc2(line.slice(3)))}</h2>`); continue; }
        if (/^#\s/.test(line))    { flushList(); out.push(`<h1 style="font-size:17pt;font-weight:800;color:#0f172a;margin:24px 0 10px;">${inline(esc2(line.slice(2)))}</h1>`); continue; }
        if (/^---+$/.test(line.trim())) { flushList(); out.push('<hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0;">'); continue; }
        if (/^[-*+]\s/.test(line)) { if (!inList||listTag!=='ul') { flushList(); out.push('<ul style="margin:8px 0 10px 22px;">'); inList=true; listTag='ul'; } out.push(`<li style="margin-bottom:5px;">${inline(esc2(line.replace(/^[-*+]\s/,'')))}</li>`); continue; }
        if (/^\d+\.\s/.test(line)) { if (!inList||listTag!=='ol') { flushList(); out.push('<ol style="margin:8px 0 10px 22px;">'); inList=true; listTag='ol'; } out.push(`<li style="margin-bottom:5px;">${inline(esc2(line.replace(/^\d+\.\s/,'')))}</li>`); continue; }
        if (line.trim()==='') { flushList(); out.push('<p style="margin:4px 0;"></p>'); continue; }
        flushList(); out.push(`<p style="margin:0 0 10px;">${inline(esc2(line))}</p>`);
      }
      flushList(); flushTable();
      return `<div style="position:relative;padding:48px 64px;">${pageWatermark}<div style="position:relative;z-index:1;">${out.join('\n')}</div></div>`;
    })() : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Forensic Audit Report — ${esc(dataroomName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #0f172a; background: #ffffff; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print {
      @page { size: A4; margin: 14mm 16mm 14mm 16mm; }
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .page-break { page-break-after: always; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 9.5pt; }
  </style>
</head>
<body>
  ${coverPage}
  ${tocPage}
  ${section1}
  ${section2}
  ${section3}
  ${section4}
  ${section5}
  ${section6}
  ${section7}
  ${section8}
  ${section9}
  ${section10}
  ${oldFormatFallback}
  ${mdFallback}
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };<\/script>
</body>
</html>`;

    // Open in new window for printing — withWatermark injects same PNG logo as preview
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      toast({ title: 'Please allow popups', description: 'The report opens in a new tab.', variant: 'destructive' });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    toast({ title: 'Report opened', description: 'In the print dialog, choose "Save as PDF" as destination.' });
  }, [auditJob, vault?.name, toast]);


  const stopCimProgressTimer = useCallback(() => {
    if (cimProgressTimerRef.current) {
      window.clearInterval(cimProgressTimerRef.current);
      cimProgressTimerRef.current = null;
    }
  }, []);

  const pollCimStatus = useCallback(async () => {
    const currentRunId = cimRunIdRef.current;
    if (!vaultId || !currentRunId) return;
    try {
      const res = await fetch(`${cimBackendUrl}/api/cim-status?vaultId=${encodeURIComponent(vaultId)}&runId=${encodeURIComponent(currentRunId)}`);
      if (!res.ok) return;
      const status = await res.json();
      // Only accept status for our current run - ignore stale/cached status from previous runs
      if (status?.runId && status.runId !== currentRunId) return;
      if (!status?.runId) return; // Backend didn't return runId - reject to avoid stale 100%
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
      // ignore polling failures (e.g. 404 if backend has no status endpoint)
    }
  }, [vaultId, cimBackendUrl, stopCimProgressTimer]);

  const startTeaserGeneration = useCallback(async () => {
    if (!vaultId || !vault || !user) return;
    setTeaserError(null);
    setTeaserIsRunning(true);
    try {
      teaserAbortControllerRef.current = new AbortController();
      const report = await runTeaserGeneration(vaultId, vault.name, user.id, teaserAbortControllerRef.current.signal);
      setTeaserReport(report);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setTeaserError(e?.message || 'Failed to generate teaser');
      }
    } finally {
      setTeaserIsRunning(false);
      teaserAbortControllerRef.current = null;
    }
  }, [vaultId, vault, user]);

  const handleStopTeaser = useCallback(() => {
    if (teaserAbortControllerRef.current) {
      teaserAbortControllerRef.current.abort();
      setTeaserIsRunning(false);
      setTeaserError('Teaser generation was cancelled');
      teaserAbortControllerRef.current = null;
    }
  }, []);

  const downloadTeaserPdf = useCallback(async (report: TeaserReport) => {
    const el = document.getElementById('teaser-report-content');
    if (!el) return;
    const element = el instanceof HTMLIFrameElement && el.contentDocument?.body
      ? el.contentDocument.body
      : el;
    const html2pdf = (await import('html2pdf.js')).default;
    const safeName = (report.vaultName || 'Teaser').replace(/\s+/g, '_');
    const options = {
      margin: 10,
      filename: `Teaser_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff' },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
    };
    html2pdf().set(options).from(element).save();
  }, []);

  const downloadCimPdf = useCallback(async (report: CIMReport) => {
    if (!cimPreviewRef.current) return;
    const el = cimPreviewRef.current;
    const element = el.contentDocument?.body ?? el;
    const html2pdf = (await import('html2pdf.js')).default;
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
    cimRunIdRef.current = runId;
    setCimRunId(runId);
    setCimProgress(10);
    setCimEtaSeconds(null);
    cimStartedAtRef.current = Date.now();
    stopCimProgressTimer();
    cimProgressTimerRef.current = window.setInterval(pollCimStatus, 2000);
    pollCimStatus();

    try {
      cimAbortControllerRef.current = new AbortController();
      const report = await runCIMGeneration(vaultId, vault.name, user.id, cimAbortControllerRef.current.signal, runId);
      setCimReport(report);
      setCimProgress(100);
      setCimEtaSeconds(null);
      cimRunIdRef.current = null;
      stopCimProgressTimer();
      setTimeout(() => {
        downloadCimPdf(report);
      }, 300);
    } catch (e: any) {
      setCimError(e?.message || 'Failed to generate CIM');
      cimRunIdRef.current = null;
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
      cimRunIdRef.current = null;
      setCimIsRunning(false);
      setCimError('CIM generation was cancelled');
      setCimProgress(0);
      setCimEtaSeconds(null);
      stopCimProgressTimer();
    }
  }, [stopCimProgressTimer]);
  useEffect(() => {
    return () => {
      stopCimProgressTimer();
    };
  }, [stopCimProgressTimer]);

  useEffect(() => {
    if (!isCimDialogOpen) return;
    loadLatestCim();
  }, [isCimDialogOpen, loadLatestCim]);

  // Prevent CIM dialog styles from turning page background white
  useEffect(() => {
    if (!isCimDialogOpen) return;
    const prev = document.body.style.background;
    document.body.style.background = 'hsl(var(--background))';
    return () => {
      document.body.style.background = prev;
    };
  }, [isCimDialogOpen]);

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
    if (!userStartedAuditRef.current) return;

    const t = setInterval(() => {
      if (!auditIsRunning && !isRestartingRef.current && userStartedAuditRef.current) {
        runAuditBatch();
      }
    }, 4000);

    return () => clearInterval(t);
  }, [auditJobId, auditJob?.status, auditIsRunning, runAuditBatch]);

  useEffect(() => {
    if (!isAuditDialogOpen) return;
    loadAuditState();
  }, [isAuditDialogOpen, loadAuditState]);

  useEffect(() => {
    if (!isAuditDialogOpen) {
      userStartedAuditRef.current = false;
      setUserHasStartedAudit(false);
    }
  }, [isAuditDialogOpen]);

  const resumeAudit = useCallback(() => {
    userStartedAuditRef.current = true;
    setUserHasStartedAudit(true);
    if (vaultId && auditJobId) setAuditBackgroundActive(vaultId, auditJobId);
  }, [vaultId, auditJobId]);

  // Poll status when dialog is open and job is running - recovers from silent crashes (e.g. Edge Function timeout)
  useEffect(() => {
    if (!isAuditDialogOpen || !auditJobId) return;
    if (auditJob?.status === 'completed' || auditJob?.status === 'failed' || auditJob?.status === 'cancelled') return;
    const poll = setInterval(async () => {
      try {
        const data = await auditVaultInvoke({ action: 'status', jobId: auditJobId });
        if (data?.job) setAuditJob(data.job);
      } catch {
        // Fallback: fetch from DB
        const { data } = await supabase.from('audit_jobs').select('*').eq('id', auditJobId).single();
        if (data) setAuditJob(data);
      }
    }, 6000);
    return () => clearInterval(poll);
  }, [isAuditDialogOpen, auditJobId, auditJob?.status]);

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
                          onClick={auditJob?.status === 'running' || auditJob?.status === 'queued' ? resumeAudit : startOrRegenerateAudit}
                          disabled={auditIsRunning || ((auditJob?.status === 'running' || auditJob?.status === 'queued') && userHasStartedAudit)}
                        >
                          {(auditJob?.status === 'running' || auditJob?.status === 'queued') && userHasStartedAudit ? 'Audit Running' : auditJob?.status === 'running' || auditJob?.status === 'queued' ? 'Resume' : auditJob?.report_markdown ? 'Regenerate' : 'Start Audit'}
                        </Button>
                        {(auditJob?.status === 'running' || auditJob?.status === 'queued') && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={stopAudit}
                          >
                            Stop
                          </Button>
                        )}
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
                        <div ref={reportContentRef} style={{ borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', height: '40vh' }}>
                          {auditJob?.report_markdown ? (
                            <iframe
                              srcDoc={previewHtml}
                              style={{ width: '100%', height: '100%', border: 'none' }}
                              title="Forensic Audit Report Preview"
                            />
                          ) : (
                            <div style={{ padding: 16 }}>
                              <p className="text-sm text-muted-foreground">Report not generated yet.</p>
                            </div>
                          )}
                        </div>
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
                  Generate CIM & Teaser
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden bg-card border-gold/20">
                <DialogHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <DialogTitle className="font-display text-xl">Generate CIM & Teaser</DialogTitle>
                    </div>
                  </div>
                </DialogHeader>

                <Tabs defaultValue="cim" className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="cim">CIM</TabsTrigger>
                    <TabsTrigger value="teaser">Teaser</TabsTrigger>
                  </TabsList>
                  <TabsContent value="cim" className="space-y-4 py-2 flex-1 min-h-0 min-w-0 overflow-hidden mt-2">
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
                            variant="outline"
                            size="sm"
                            onClick={startCimGeneration}
                            disabled={cimIsRunning}
                          >
                            {cimIsRunning ? 'Generating...' : cimReport ? 'Generate new' : 'Start'}
                          </Button>
                          {cimIsRunning && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleStopCim}
                              title="Stop and terminate CIM generation"
                            >
                              Stop
                            </Button>
                          )}
                          <Button
                            variant="gold"
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

                    <div className="rounded-lg border border-gold/10 overflow-hidden flex-1 min-h-0 min-w-0">
                      <div className="px-3 py-2 border-b border-gold/10 bg-muted/5">
                        <p className="text-sm font-medium text-foreground">CIM Preview</p>
                        <p className="text-xs text-muted-foreground">Preview updates after generation.</p>
                      </div>
                      <ScrollArea className="h-[45vh] p-3 max-w-full overflow-hidden rounded-b-lg">
                        {cimReport ? (
                          <iframe
                            ref={cimPreviewRef}
                            id="cim-report-content"
                            title="CIM Report"
                            srcDoc={cimHtml}
                            className="w-full min-h-[45vh] border-0 bg-white rounded"
                            sandbox="allow-same-origin"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">CIM not generated yet.</p>
                        )}
                      </ScrollArea>
                    </div>
                  </TabsContent>
                  <TabsContent value="teaser" className="space-y-4 py-2 flex-1 min-h-0 min-w-0 overflow-hidden mt-2">
                    <div className="rounded-lg border border-gold/10 p-3 bg-muted/10">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-muted-foreground">
                            Generates a Teaser document using all documents in this dataroom.
                          </p>
                          {teaserError && (
                            <p className="text-sm text-destructive mt-2">{teaserError}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={startTeaserGeneration}
                            disabled={teaserIsRunning}
                          >
                            {teaserIsRunning ? 'Generating...' : teaserReport ? 'Generate new' : 'Start'}
                          </Button>
                          {teaserIsRunning && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleStopTeaser}
                              title="Stop and terminate Teaser generation"
                            >
                              Stop
                            </Button>
                          )}
                          <Button
                            variant="gold"
                            size="sm"
                            onClick={() => teaserReport && downloadTeaserPdf(teaserReport)}
                            disabled={!teaserReport}
                          >
                            Download Teaser
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Status: <span className="text-foreground">{teaserIsRunning ? 'running' : teaserReport ? 'completed' : 'not started'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gold/10 overflow-hidden flex-1 min-h-0 min-w-0">
                      <div className="px-3 py-2 border-b border-gold/10 bg-muted/5">
                        <p className="text-sm font-medium text-foreground">Teaser Preview</p>
                        <p className="text-xs text-muted-foreground">Preview updates after generation.</p>
                      </div>
                      <ScrollArea className="h-[45vh] p-3 max-w-full overflow-hidden rounded-b-lg">
                        {teaserReport ? (
                          <iframe
                            id="teaser-report-content"
                            title="Teaser Report"
                            srcDoc={getFormattedTeaser(teaserReport)}
                            className="w-full min-h-[45vh] border-0 bg-white rounded"
                            sandbox="allow-same-origin"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">Teaser not generated yet.</p>
                        )}
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </Tabs>
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
            <label>
              <Button variant="outline" disabled={isUploadingFolders || isUploading} asChild size="sm" className="text-xs sm:text-sm">
                <span>
                  <FolderOpen className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{isUploadingFolders ? 'Uploading...' : 'Upload Folders'}</span>
                  <span className="sm:hidden">{isUploadingFolders ? '...' : 'Folders'}</span>
                </span>
              </Button>
              <input
                type="file"
                {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                multiple
                className="hidden"
                onChange={handleFolderUpload}
                disabled={isUploadingFolders || isUploading}
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
                Upload files, upload folders, or create folders to get started
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Bulk actions bar - only when in selection mode (selectedCount > 0) */}
              {selectedCount > 0 && (
                <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-gold/10">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedCount === folders.length + documents.length}
                      onCheckedChange={toggleSelectAll}
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedCount} selected
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await fetchAllVaultsForMove();
                        setMoveDestinationVaultId(vaultId || null);
                        await fetchAllVaultFolders(vaultId);
                        setMoveDestinationId(currentFolderId || 'root');
                        setIsMoveDialogOpen(true);
                      }}
                    >
                      <FolderOpen className="w-4 h-4 mr-1" />
                      Move
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearSelection}
                    title="Exit selection mode"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {/* Folders */}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`flex items-center justify-between p-3 sm:p-4 rounded-lg hover:bg-muted/30 transition-colors group ${selectedFolderIds.has(folder.id) ? 'bg-gold/10 border border-gold/30' : ''}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {selectedCount > 0 && (
                      <Checkbox
                        checked={selectedFolderIds.has(folder.id)}
                        onCheckedChange={() => toggleFolderSelection(folder.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <button
                      onClick={() => setCurrentFolderId(folder.id)}
                      className="flex items-center gap-4 flex-1 text-left min-w-0"
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
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toggleFolderSelection(folder.id)}>
                        <CheckSquare className="w-4 h-4 mr-2" />
                        {selectedFolderIds.has(folder.id) ? 'Deselect' : 'Select'}
                      </DropdownMenuItem>
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
                  className={`flex items-center justify-between p-3 sm:p-4 rounded-lg hover:bg-muted/30 transition-colors group ${selectedDocumentIds.has(doc.id) ? 'bg-gold/10 border border-gold/30' : ''}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {selectedCount > 0 && (
                      <Checkbox
                        checked={selectedDocumentIds.has(doc.id)}
                        onCheckedChange={() => toggleDocumentSelection(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <button
                      onClick={() => {
                        setSelectedDocumentId(doc.id);
                        setIsDocumentModalOpen(true);
                      }}
                      className="flex items-center gap-4 flex-1 text-left min-w-0"
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
                  </div>
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
                        <DropdownMenuItem onClick={() => toggleDocumentSelection(doc.id)}>
                          <CheckSquare className="w-4 h-4 mr-2" />
                          {selectedDocumentIds.has(doc.id) ? 'Deselect' : 'Select'}
                        </DropdownMenuItem>
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

      {/* Move Dialog */}
      <Dialog open={isMoveDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsMoveDialogOpen(false);
          setMoveDestinationId(null);
          setMoveDestinationVaultId(null);
        }
      }}>
        <DialogContent className="bg-card border-gold/20 sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="font-display text-xl">Move to</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden space-y-4 mt-2">
            <p className="text-sm text-muted-foreground flex-shrink-0">Move {selectedCount} item(s) to:</p>

            {/* Vault selector */}
            <div className="space-y-2 flex-shrink-0">
              <label className="text-sm font-medium">Dataroom</label>
              <select
                value={moveDestinationVaultId ?? vaultId ?? ''}
                onChange={async (e) => {
                  const vid = e.target.value || vaultId || null;
                  setMoveDestinationVaultId(vid);
                  setMoveDestinationId('root');
                  if (vid) await fetchAllVaultFolders(vid);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {allVaults.length === 0 && vaultId && vault ? (
                  <option value={vaultId}>{vault.name} (current)</option>
                ) : (
                  allVaults.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.id === vaultId ? '(current)' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Folder destination - scrollable, buttons stay visible */}
            <div className="flex flex-col flex-1 min-h-0 space-y-2">
              <label className="text-sm font-medium flex-shrink-0">Destination folder</label>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1 border rounded-md p-1 overscroll-contain">
                <label className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 cursor-pointer">
                  <input
                    type="radio"
                    name="moveDest"
                    checked={moveDestinationId === 'root'}
                    onChange={() => setMoveDestinationId('root')}
                    className="rounded-full"
                  />
                  <Folder className="w-4 h-4 text-gold" />
                  <span className="font-medium">Root</span>
                </label>
                {allVaultFolders
                  .filter((f) => {
                    if (moveDestinationVaultId === vaultId && selectedFolderIds.has(f.id)) return false;
                    if (moveDestinationVaultId === vaultId) {
                      const isDescendantOfSelected = (folderId: string): boolean => {
                        const folder = allVaultFolders.find((x) => x.id === folderId);
                        if (!folder?.parent_id) return false;
                        if (selectedFolderIds.has(folder.parent_id)) return true;
                        return isDescendantOfSelected(folder.parent_id);
                      };
                      return !isDescendantOfSelected(f.id);
                    }
                    return true;
                  })
                  .map((folder) => (
                    <label key={folder.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 cursor-pointer">
                      <input
                        type="radio"
                        name="moveDest"
                        checked={moveDestinationId === folder.id}
                        onChange={() => setMoveDestinationId(folder.id)}
                        className="rounded-full"
                      />
                      <Folder className="w-4 h-4 text-gold flex-shrink-0" />
                      <span className="truncate">{folder.path}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 flex-shrink-0 border-t pt-4 mt-2">
              <Button variant="outline" onClick={() => { setIsMoveDialogOpen(false); setMoveDestinationId(null); setMoveDestinationVaultId(null); }}>
                Cancel
              </Button>
              <Button variant="gold" onClick={handleBulkMove}>
                Move
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