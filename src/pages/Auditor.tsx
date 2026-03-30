import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Upload, File, Loader2, Download, ArrowLeft,
  FolderOpen, Folder, ChevronRight, Shield,
  Search, Zap, AlertTriangle, BarChart3, Lock, CheckCircle2,
  ArrowDown, Clock, Users, ChevronDown, Sparkles, X, LogOut,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from '@/hooks/use-toast';
import logo from '@/assets/samaveda-logo.jpeg';
import samavedaWatermark from '@/assets/samavedaWatermark.png';
import { formatFileSize } from '@/utils/format';
import { supabase } from '@/integrations/supabase/client';
import { signOut } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { runCIMGeneration, getFormattedCIM } from '@/services/CIM/cimGenerationController';
import { runTeaserGeneration, getFormattedTeaser } from '@/services/teaser/teaserGenerationController';
import { fetchDocumentsViaAuditor } from '@/services/fraud/documentFetcher';
import type { CIMReport } from '@/services/CIM/types';
import type { TeaserReport } from '@/services/teaser/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/* ───────────────────────── helpers ───────────────────────── */

function withWatermark(html: string, watermarkUrl: string): string {
  const fullUrl = watermarkUrl.startsWith('http') ? watermarkUrl : new URL(watermarkUrl, window.location.href).href;
  const style = `<style id="samaveda-watermark">body{position:relative!important}body::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background-image:url('${fullUrl}');background-repeat:repeat;background-position:center;background-size:350px 350px;opacity:0.12;pointer-events:none;z-index:0}body>*{position:relative;z-index:1}</style>`;
  if (html.includes('</head>')) return html.replace('</head>', style + '</head>');
  if (html.includes('<head>')) return html.replace('<head>', '<head>' + style);
  return html.replace('<html>', '<html><head>' + style + '</head>');
}

function capturePdfFromHtml(html: string, watermarkUrl: string, filename: string) {
  const withWm = withWatermark(html, watermarkUrl);
  const parser = new DOMParser();
  const doc = parser.parseFromString(withWm, 'text/html');
  const body = doc.body;
  const styles = Array.from(doc.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  const scopedStyles = styles.replace(/\bbody\b/g, '.samaveda-pdf-wrap');
  const temp = document.createElement('div');
  temp.id = 'samaveda-pdf-temp';
  temp.className = 'samaveda-pdf-wrap';
  temp.style.cssText = 'position:fixed;left:0;top:0;width:210mm;min-height:297mm;background:#fff;z-index:99999;overflow:visible;padding:20px;font-family:Georgia,serif;color:#1a1a1a';
  temp.innerHTML = `<style>${scopedStyles}</style>${body.innerHTML}`;
  document.body.appendChild(temp);
  return new Promise<void>((resolve, reject) => {
    import('html2pdf.js').then(({ default: html2pdf }) => {
      html2pdf().set({ margin: 10, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true }, jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' } }).from(temp).save().then(() => { temp.remove(); resolve(); }).catch((e: Error) => { temp.remove(); reject(e); });
    }).catch(reject);
  });
}

const USE_AUDITOR_BACKEND = import.meta.env.VITE_FRAUD_BACKEND_URL && import.meta.env.VITE_USE_FRAUD_BACKEND === 'true';
const AUDITOR_API = USE_AUDITOR_BACKEND ? `${String(import.meta.env.VITE_FRAUD_BACKEND_URL).replace(/\/$/, '')}/api/auditor` : null;

async function auditorInvoke(body: Record<string, unknown>) {
  if (AUDITOR_API) {
    const { data: { user } } = await supabase.auth.getUser();
    const authBody = { ...body, ...(user?.id && { userId: user.id }) };
    const res = await fetch(AUDITOR_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authBody) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
    return data as Record<string, unknown>;
  }
  const { data: { user } } = await supabase.auth.getUser();
  const authBody = { ...body, ...(user?.id && { userId: user.id }) };
  const { data, error } = await supabase.functions.invoke('auditor-public', { body: authBody });
  if (error) {
    let msg = error.message || 'Request failed';
    try { const err = error as { context?: { json?: () => Promise<{ error?: string }> } }; const errBody = err.context?.json ? await err.context.json() : null; if (errBody?.error) msg = errBody.error; } catch (_) {}
    throw new Error(msg);
  }
  return (data ?? {}) as Record<string, unknown>;
}

/* ───────────────────────── types ───────────────────────── */
type Step = 'form' | 'upload' | 'audit';
interface AuditorSession { sessionId: string; vaultId: string; folderId: string; name: string; company_name: string; created_at: string; }
interface DocInfo { id: string; name: string; file_path: string; file_size: number | null; file_type: string | null; folder_id?: string | null; }
interface FolderInfo { id: string; name: string; parent_id: string | null; }
interface AuditJob { id: string; status: string; progress: number; total_files: number; processed_files: number; current_step: string; report_markdown: string | null; report_json?: any; }

/* ───────────────────────── Premium UI Hooks & Components ───────────────────────── */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsVisible(true); obs.unobserve(el); } }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return { ref, isVisible };
}

function AnimatedSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, isVisible } = useScrollReveal();
  return (<div ref={ref} className={className} style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(32px)', transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`, willChange: 'opacity, transform' }}>{children}</div>);
}

function use3DTilt(intensity = 6) {
  const cardRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(800px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) scale3d(1.01,1.01,1.01)`;
  }, [intensity]);
  const handleMouseLeave = useCallback(() => { const el = cardRef.current; if (el) el.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg) scale3d(1,1,1)'; }, []);
  return { cardRef, handleMouseMove, handleMouseLeave };
}

function AnimatedCounter({ target, suffix = '' }: { target: string; suffix?: string }) {
  const [display, setDisplay] = useState('0');
  const { ref, isVisible } = useScrollReveal();
  const num = parseInt(target.replace(/[^0-9]/g, ''), 10);
  const prefix = target.replace(/[0-9]+.*/, '');
  useEffect(() => {
    if (!isVisible || isNaN(num)) { setDisplay(target); return; }
    let frame = 0; const totalFrames = 45;
    const timer = setInterval(() => { frame++; const eased = 1 - Math.pow(1 - frame / totalFrames, 3); setDisplay(prefix + Math.round(num * eased).toLocaleString() + suffix); if (frame >= totalFrames) clearInterval(timer); }, 28);
    return () => clearInterval(timer);
  }, [isVisible, num, prefix, suffix, target]);
  return <span ref={ref as any}>{display}</span>;
}

/* ── Skeleton Loader ── */
function Skeleton({ w = '100%', h = 16, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'svShimmer 1.5s ease-in-out infinite' }} />;
}

function SkeletonCard() {
  return (
    <div style={{ padding: 20, borderRadius: 16, border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton w={120} h={12} /><Skeleton h={10} /><Skeleton w="70%" h={10} />
    </div>
  );
}

/* ── Drag & Drop Zone ── */
function DragDropZone({ onFiles, disabled }: { onFiles: (files: FileList) => void; disabled: boolean }) {
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); counter.current++; setDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); counter.current--; if (counter.current === 0) setDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); counter.current = 0; setDragging(false); if (!disabled && e.dataTransfer.files?.length) onFiles(e.dataTransfer.files); };

  return (
    <div onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
      style={{ position: 'relative', borderRadius: 16, border: `2px dashed ${dragging ? '#3b82f6' : '#e2e8f0'}`, borderTop: '1px solid #ede9e3', padding: '32px 20px', textAlign: 'center', transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)', transform: dragging ? 'scale(1.01)' : 'scale(1)', cursor: disabled ? 'not-allowed' : 'default' }}>
      {dragging && <div style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: '0 0 0 3px rgba(59,130,246,0.15)', pointerEvents: 'none', animation: 'svPulseRing 1.5s ease-in-out infinite' }} />}
      <div style={{ width: 48, height: 48, borderRadius: 14, background: dragging ? '#dbeafe' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', transition: 'all 0.3s', transform: dragging ? 'translateY(-4px) scale(1.1)' : 'translateY(0)' }}>
        <Upload style={{ width: 22, height: 22, color: dragging ? '#2563eb' : '#94a3b8', transition: 'color 0.3s' }} />
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: dragging ? '#1e3a8a' : '#475569', marginBottom: 4, transition: 'color 0.3s' }}>{dragging ? 'Drop files here' : 'Drag & drop files here'}</p>
      <p style={{ fontSize: 12, color: '#94a3b8' }}>or use the buttons above to browse</p>
    </div>
  );
}

/* ── File Type Badge ── */
const FILE_BADGE_MAP: Record<string, { color: string; bg: string; label: string }> = {
  gst: { color: '#1e40af', bg: '#dbeafe', label: 'GST' },
  itr: { color: '#7c3aed', bg: '#ede9fe', label: 'ITR' },
  bank: { color: '#0891b2', bg: '#cffafe', label: 'Bank' },
  tally: { color: '#059669', bg: '#d1fae5', label: 'Tally' },
  mca: { color: '#be185d', bg: '#fce7f3', label: 'MCA' },
  compliance: { color: '#0f766e', bg: '#ccfbf1', label: 'Compliance' },
  default: { color: '#64748b', bg: '#f1f5f9', label: 'Doc' },
};

function detectFileType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('gst') || lower.includes('gstr') || lower.includes('gstin')) return 'gst';
  if (lower.includes('itr') || lower.includes('income') || lower.includes('tax return') || lower.includes('form16') || lower.includes('26as')) return 'itr';
  if (lower.includes('bank') || lower.includes('statement') || lower.includes('passbook') || lower.includes('account')) return 'bank';
  if (lower.includes('tally') || lower.includes('ledger') || lower.includes('p&l') || lower.includes('balance sheet') || lower.includes('trial balance')) return 'tally';
  if (lower.includes('mca') || lower.includes('roc') || lower.includes('cin') || lower.includes('annual return') || lower.includes('mgt') || lower.includes('aoc')) return 'mca';
  if (lower.includes('license') || lower.includes('certificate') || lower.includes('registration') || lower.includes('compliance') || lower.includes('udyam')) return 'compliance';
  return 'default';
}

function FileTypeBadge({ name }: { name: string }) {
  const type = detectFileType(name);
  const badge = FILE_BADGE_MAP[type] || FILE_BADGE_MAP.default;
  return <span style={{ fontSize: 9, fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 7px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{badge.label}</span>;
}

/* ── Step Transition Wrapper ── */
function StepTransition({ children, stepKey }: { children: React.ReactNode; stepKey: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(false); const t = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(t); }, [stepKey]);
  return <div style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.45s ease-out, transform 0.45s ease-out' }}>{children}</div>;
}

/* ───────────────────────── FraudCatcherGame ───────────────────────── */

function FraudCatcherGame() {
  const [score, setScore] = useState(0); const [gameActive, setGameActive] = useState(false); const [combo, setCombo] = useState(0); const [misses, setMisses] = useState(0); const [difficulty, setDifficulty] = useState(1);
  const [feedback, setFeedback] = useState<{ text: string; color: string; id: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null); const itemsRef = useRef<{ id: number; type: 'fraud' | 'legit'; text: string; x: number; y: number; speed: number }[]>([]);
  const rafRef = useRef(0); const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null); const diffRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idRef = useRef(0); const scoreRef = useRef(0); const comboRef = useRef(0); const missRef = useRef(0); const activeRef = useRef(false); const diffLevelRef = useRef(1);
  const FRAUDS = ['Fake invoice ₹50L','Phantom vendor','Circular trade','Inflated expense','Duplicate GST','Round-tripping','Shell company','Backdated receipt','Ghost salary','Fictitious capital'];
  const LEGITS = ['Salary ₹85K','GST ₹12K','Vendor ₹2.3L','TDS deduction','Rent ₹45K','Insurance','Audit fee','Client payment','Utility ₹8K','EMI ₹35K'];
  const cleanup = useCallback(() => { activeRef.current = false; cancelAnimationFrame(rafRef.current); if (spawnRef.current) clearInterval(spawnRef.current); if (diffRef.current) clearInterval(diffRef.current); }, []);
  const handleItemClick = useCallback((id: number, type: 'fraud' | 'legit') => {
    if (!activeRef.current) return; itemsRef.current = itemsRef.current.filter((i) => i.id !== id); const el = canvasRef.current?.querySelector(`#fi-${id}`); if (el) el.remove();
    if (type === 'fraud') { const mult = 1 + Math.floor(comboRef.current / 3) * 0.5; const pts = Math.round(10 * mult); scoreRef.current += pts; comboRef.current++; setScore(scoreRef.current); setCombo(comboRef.current); setFeedback({ text: comboRef.current >= 3 ? `+${pts} COMBO!` : `+${pts}`, color: '#059669', id: Date.now() }); }
    else { scoreRef.current = Math.max(0, scoreRef.current - 5); comboRef.current = 0; setScore(scoreRef.current); setCombo(0); setFeedback({ text: '-5 Legit!', color: '#dc2626', id: Date.now() }); }
    setTimeout(() => setFeedback(null), 700);
  }, []);
  const renderItems = useCallback(() => {
    const container = canvasRef.current; if (!container) return; const existing = new Set<string>();
    itemsRef.current.forEach((item) => {
      const domId = `fi-${item.id}`; existing.add(domId); let btn = container.querySelector(`#${domId}`) as HTMLButtonElement;
      if (!btn) { btn = document.createElement('button'); btn.id = domId; btn.style.cssText = 'position:absolute;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;transform:translateX(-50%);border:1px solid;z-index:5;transition:transform 0.08s;font-family:Inter,system-ui,sans-serif;backdrop-filter:blur(8px)';
        if (item.type === 'fraud') { btn.style.background = 'rgba(254,242,242,0.9)'; btn.style.borderColor = '#fecaca'; btn.style.color = '#dc2626'; btn.textContent = '🚩 ' + item.text; }
        else { btn.style.background = 'rgba(240,253,244,0.9)'; btn.style.borderColor = '#bbf7d0'; btn.style.color = '#16a34a'; btn.textContent = '✓ ' + item.text; }
        const cId = item.id, cType = item.type; btn.onclick = () => handleItemClick(cId, cType); container.appendChild(btn);
      }
      btn.style.left = item.x + '%'; btn.style.top = item.y + '%';
    });
    container.querySelectorAll('[id^="fi-"]').forEach((n) => { if (!existing.has(n.id)) n.remove(); });
  }, [handleItemClick]);
  const startSpawning = useCallback(() => {
    if (spawnRef.current) clearInterval(spawnRef.current); const lvl = diffLevelRef.current; const interval = Math.max(400, 1100 - (lvl - 1) * 100);
    spawnRef.current = setInterval(() => { if (!activeRef.current) return; const dl = diffLevelRef.current; const fraudChance = Math.min(0.65, 0.4 + dl * 0.03); const isFraud = Math.random() < fraudChance; const pool = isFraud ? FRAUDS : LEGITS; const baseSpeed = 0.3 + dl * 0.08; const speedVariance = 0.2 + dl * 0.05; itemsRef.current.push({ id: ++idRef.current, type: isFraud ? 'fraud' : 'legit', text: pool[Math.floor(Math.random() * pool.length)], x: 6 + Math.random() * 78, y: -8, speed: baseSpeed + Math.random() * speedVariance }); }, interval);
  }, []);
  const startGame = useCallback(() => {
    cleanup(); scoreRef.current = 0; comboRef.current = 0; missRef.current = 0; diffLevelRef.current = 1; setScore(0); setCombo(0); setMisses(0); setDifficulty(1); setFeedback(null); itemsRef.current = []; activeRef.current = true; setGameActive(true); canvasRef.current?.querySelectorAll('[id^="fi-"]').forEach((n) => n.remove()); startSpawning();
    diffRef.current = setInterval(() => { if (!activeRef.current) return; diffLevelRef.current = Math.min(10, diffLevelRef.current + 1); setDifficulty(diffLevelRef.current); startSpawning(); }, 15000);
    const animate = () => { if (!activeRef.current) return; itemsRef.current = itemsRef.current.map((i) => ({ ...i, y: i.y + i.speed })); const escaped = itemsRef.current.filter((i) => i.y > 98 && i.type === 'fraud'); if (escaped.length) { missRef.current += escaped.length; comboRef.current = 0; setMisses(missRef.current); setCombo(0); } itemsRef.current = itemsRef.current.filter((i) => i.y <= 102); renderItems(); rafRef.current = requestAnimationFrame(animate); };
    rafRef.current = requestAnimationFrame(animate);
  }, [cleanup, renderItems, startSpawning]);
  useEffect(() => () => cleanup(), [cleanup]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="sv-badge-navy"><span style={{ fontSize: 11, fontWeight: 600 }}>SCORE</span><span style={{ fontSize: 15, fontWeight: 700 }}>{score}</span></div>
          {combo >= 3 && <div className="sv-badge-green" style={{ animation: 'svPop 0.3s ease-out' }}><span style={{ fontSize: 11, fontWeight: 700 }}>COMBO x{Math.floor(combo / 3) + 1}</span></div>}
        </div>
        {gameActive && <div className="sv-badge-red"><span style={{ fontSize: 11, fontWeight: 500 }}>💀 {misses}</span></div>}
      </div>
      <div ref={canvasRef} style={{ position: 'relative', borderRadius: 16, background: '#ffffff', border: '1px solid #e2e8f0', overflow: 'hidden', height: 280 }}>
        {!gameActive && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10 }}>
            <div className="sv-icon-circle-navy" style={{ width: 56, height: 56, fontSize: 24 }}>🚩</div>
            <h4 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Fraud Catcher</h4>
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 280 }}><span style={{ color: '#dc2626', fontWeight: 600 }}>Tap</span> to catch fraud! Avoid legit ones.</p>
            <button onClick={startGame} className="sv-btn-navy" style={{ marginTop: 4 }}>Play now</button>
          </div>
        )}
        {feedback && <div key={feedback.id} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 18, fontWeight: 700, pointerEvents: 'none', zIndex: 20, color: feedback.color, animation: 'svXpPop 0.8s ease-out both' }}>{feedback.text}</div>}
      </div>
    </div>
  );
}

/* ───────────────────────── CardFlipMemoryGame ───────────────────────── */
const CARD_TYPES = [
  { id: 'gst', icon: '📋', label: 'GST Return', color: '#1e3a8a' }, { id: 'itr', icon: '📊', label: 'ITR', color: '#1e40af' },
  { id: 'bank', icon: '🏦', label: 'Bank Stmt', color: '#1d4ed8' }, { id: 'tally', icon: '📒', label: 'Tally', color: '#2563eb' },
  { id: 'mca', icon: '🏛️', label: 'MCA Filing', color: '#3b82f6' }, { id: 'compliance', icon: '✅', label: 'Compliance', color: '#0f172a' },
  { id: 'pan', icon: '💳', label: 'PAN Card', color: '#1e3a8a' }, { id: 'audit', icon: '🔍', label: 'Audit Report', color: '#1e40af' },
];
interface MemoryCard { uid: string; typeId: string; icon: string; label: string; color: string; flipped: boolean; matched: boolean; }

function CardFlipMemoryGame() {
  const [cards, setCards] = useState<MemoryCard[]>([]); const [flippedIds, setFlippedIds] = useState<string[]>([]); const [matchedCount, setMatchedCount] = useState(0);
  const [moves, setMoves] = useState(0); const [score, setScore] = useState(0); const [bestScore, setBestScore] = useState(0); const [combo, setCombo] = useState(0);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'preview' | 'won'>('start'); const [timer, setTimer] = useState(0); const [difficulty, setDifficulty] = useState<4 | 6 | 8>(6);
  const [feedback, setFeedback] = useState<{ text: string; color: string; id: number } | null>(null);
  const lockRef = useRef(false); const timerRef = useRef<ReturnType<typeof setInterval> | null>(null); const bestRef = useRef(0); const pairCount = difficulty; const gridCols = 4;
  const shuffle = useCallback((arr: MemoryCard[]) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }, []);
  const startGame = useCallback(() => {
    const selected = CARD_TYPES.slice(0, pairCount); const pairs: MemoryCard[] = [];
    selected.forEach((t) => { pairs.push({ uid: `${t.id}-a`, typeId: t.id, icon: t.icon, label: t.label, color: t.color, flipped: false, matched: false }); pairs.push({ uid: `${t.id}-b`, typeId: t.id, icon: t.icon, label: t.label, color: t.color, flipped: false, matched: false }); });
    setCards(shuffle(pairs)); setFlippedIds([]); setMatchedCount(0); setMoves(0); setScore(0); setCombo(0); setTimer(0); setFeedback(null); lockRef.current = true; setGameState('preview');
    setTimeout(() => { setGameState('playing'); lockRef.current = false; if (timerRef.current) clearInterval(timerRef.current); timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000); }, 1500);
  }, [pairCount, shuffle]);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  const showFeedback = useCallback((text: string, color: string) => { setFeedback({ text, color, id: Date.now() }); setTimeout(() => setFeedback(null), 800); }, []);
  const handleCardClick = useCallback((uid: string) => {
    if (lockRef.current || gameState !== 'playing') return; const card = cards.find((c) => c.uid === uid); if (!card || card.flipped || card.matched || flippedIds.includes(uid)) return;
    const newFlipped = [...flippedIds, uid]; setFlippedIds(newFlipped); setCards((prev) => prev.map((c) => (c.uid === uid ? { ...c, flipped: true } : c)));
    if (newFlipped.length === 2) {
      lockRef.current = true; setMoves((m) => m + 1); const first = cards.find((c) => c.uid === newFlipped[0])!; const second = cards.find((c) => c.uid === newFlipped[1])!;
      if (first.typeId === second.typeId) { const newCombo = combo + 1; const pts = Math.round(50 * (1 + Math.floor(newCombo / 2) * 0.5)); setCombo(newCombo); setScore((s) => s + pts); const newMatched = matchedCount + 1; setMatchedCount(newMatched); showFeedback(newCombo >= 2 ? `+${pts} COMBO!` : `+${pts}`, '#059669');
        setTimeout(() => { setCards((prev) => prev.map((c) => (c.typeId === first.typeId ? { ...c, matched: true, flipped: true } : c))); setFlippedIds([]); lockRef.current = false;
          if (newMatched >= pairCount) { if (timerRef.current) clearInterval(timerRef.current); setScore((s) => { const f = s + Math.max(0, 200 - timer * 2); if (f > bestRef.current) { bestRef.current = f; setBestScore(f); } return f; }); setGameState('won'); showFeedback('🎉 Perfect!', '#1e3a8a'); } }, 400);
      } else { setCombo(0); showFeedback('No match', '#dc2626'); setTimeout(() => { setCards((prev) => prev.map((c) => (newFlipped.includes(c.uid) ? { ...c, flipped: false } : c))); setFlippedIds([]); lockRef.current = false; }, 800); }
    }
  }, [cards, flippedIds, combo, matchedCount, pairCount, gameState, timer, showFeedback]);
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="sv-badge-navy"><span style={{ fontSize: 11, fontWeight: 600 }}>SCORE</span><span style={{ fontSize: 15, fontWeight: 700 }}>{score}</span></div>{bestScore > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>HI {bestScore}</span>}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{gameState === 'playing' && <>{formatTime(timer)} · {moves} moves</>}</div>
      </div>
      <div style={{ position: 'relative', borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0', overflow: 'hidden', minHeight: 300 }}>
        {gameState === 'start' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10 }}>
            <div className="sv-icon-circle-navy" style={{ width: 56, height: 56, fontSize: 24 }}>🃏</div>
            <h4 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Doc Match</h4>
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 280 }}>Match pairs of financial documents!</p>
            <div className="flex gap-2 mt-1">{([4, 6, 8] as const).map((d) => (<button key={d} onClick={() => setDifficulty(d)} className={d === difficulty ? 'sv-chip-active' : 'sv-chip'}>{d === 4 ? 'Easy' : d === 6 ? 'Medium' : 'Hard'}</button>))}</div>
            <button onClick={startGame} className="sv-btn-navy" style={{ marginTop: 8 }}>Start game</button>
          </div>
        )}
        {gameState === 'won' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', animation: 'svScaleIn 0.4s ease-out' }}>
            <div style={{ fontSize: 32, animation: 'svFloat 2s ease-in-out infinite' }}>🏆</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a8a' }}>All Matched!</div>
            <div className="flex items-center gap-6 text-center">
              <div><div style={{ fontSize: 24, fontWeight: 700, color: '#1e3a8a' }}>{score}</div><div style={{ fontSize: 11, color: '#64748b' }}>Score</div></div>
              <div style={{ width: 1, height: 32, background: '#e2e8f0' }} />
              <div><div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{moves}</div><div style={{ fontSize: 11, color: '#64748b' }}>Moves</div></div>
            </div>
            <button onClick={startGame} className="sv-btn-navy" style={{ marginTop: 4 }}>Play again</button>
          </div>
        )}
        {(gameState === 'playing' || gameState === 'preview' || gameState === 'won') && (
          <div style={{ position: 'relative', zIndex: 5, padding: 16, display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 8, maxWidth: 420, margin: '0 auto' }}>
            {cards.map((card) => {
              const isFlipped = card.flipped || card.matched || gameState === 'preview'; const isMatched = card.matched;
              return (
                <button key={card.uid} onClick={() => handleCardClick(card.uid)} disabled={isFlipped || lockRef.current || gameState !== 'playing'} style={{ position: 'relative', aspectRatio: '3/4', perspective: 600, cursor: isFlipped ? 'default' : 'pointer', background: 'none', border: 'none', padding: 0 }}>
                  <div style={{ position: 'absolute', inset: 0, transition: 'transform 0.5s', transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden', background: '#f1f5f9' }}><span style={{ color: '#cbd5e1', fontSize: 18, fontWeight: 700 }}>?</span></div>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 12, border: `1px solid ${isMatched ? card.color + '40' : '#e2e8f0'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: isMatched ? `${card.color}08` : '#fff', boxShadow: isMatched ? `0 0 12px ${card.color}12` : 'none' }}>
                      <span style={{ fontSize: 20 }}>{card.icon}</span><span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: card.color }}>{card.label}</span>
                      {isMatched && <CheckCircle2 style={{ width: 14, height: 14, color: '#059669', position: 'absolute', top: 6, right: 6 }} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {feedback && <div key={feedback.id} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 18, fontWeight: 700, pointerEvents: 'none', zIndex: 20, color: feedback.color, animation: 'svXpPop 0.8s ease-out both' }}>{feedback.text}</div>}
      </div>
    </div>
  );
}

/* ── MiniGamesPanel ── */
function MiniGamesPanel() {
  const [activeGame, setActiveGame] = useState<'fraud' | 'memory'>('fraud');
  return (
    <div className="sv-card" style={{ animation: 'svSlideUp 0.5s ease-out' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="flex items-center gap-2.5"><span style={{ fontSize: 14 }}>🎮</span><span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Play while you wait</span></div>
        <div className="sv-toggle-group">
          <button onClick={() => setActiveGame('fraud')} className={activeGame === 'fraud' ? 'sv-toggle-active' : 'sv-toggle'}>🚩 Fraud catcher</button>
          <button onClick={() => setActiveGame('memory')} className={activeGame === 'memory' ? 'sv-toggle-active' : 'sv-toggle'}>🃏 Doc match</button>
        </div>
      </div>
      <div style={{ padding: 20 }}>{activeGame === 'fraud' ? <FraudCatcherGame /> : <CardFlipMemoryGame />}</div>
    </div>
  );
}

/* ── Gamified Audit Progress ── */
const AUDIT_TIPS = ['Cross-referencing GST turnover with ITR revenue declarations...','Scanning for circular trading patterns across bank entries...','Matching Tally ledger entries with bank statement credits...','Checking for phantom vendor indicators in expense records...','Verifying MCA filing consistency with financial statements...','Analyzing working capital ratios for manipulation signals...','Detecting unusual cash flow timing patterns...','Comparing tax payments across GST, ITR, and Tally records...','Identifying related party transactions and cross-directorships...','Checking filing dates for regulatory compliance gaps...'];
const LEVEL_NAMES = ['Initiating', 'Scanning', 'Analyzing', 'Cross-referencing', 'Verifying', 'Finalizing'];
const FILE_TYPE_META: Record<string, { color: string; icon: string; label: string }> = { gst: { color: '#1e40af', icon: '📋', label: 'GST' }, itr: { color: '#7c3aed', icon: '📊', label: 'ITR' }, bank: { color: '#0891b2', icon: '🏦', label: 'Bank' }, tally: { color: '#059669', icon: '📒', label: 'Tally' }, mca: { color: '#be185d', icon: '🏛️', label: 'MCA' }, compliance: { color: '#0f766e', icon: '✅', label: 'Compliance' }, default: { color: '#64748b', icon: '📄', label: 'Doc' } };

interface FileAuditProgress { id: string; name: string; type: string; status: 'waiting' | 'scanning' | 'analyzing' | 'done'; progress: number; }

function GamifiedAuditProgress({ auditJob, documents: docs }: { auditJob: AuditJob; documents: DocInfo[] }) {
  const [fileStates, setFileStates] = useState<FileAuditProgress[]>([]); const [xpEvents, setXpEvents] = useState<{ id: string; amount: number; ts: number }[]>([]); const [totalXp, setTotalXp] = useState(0); const [tipIndex, setTipIndex] = useState(0); const [showConfetti, setShowConfetti] = useState(false); const prevProcessedRef = useRef(0);
  useEffect(() => { if (docs.length > 0 && fileStates.length === 0) setFileStates(docs.map((d) => ({ id: d.id, name: d.name, type: detectFileType(d.name), status: 'waiting', progress: 0 }))); }, [docs, fileStates.length]);
  useEffect(() => {
    if (!auditJob || fileStates.length === 0) return; const processed = auditJob.processed_files ?? 0; const total = auditJob.total_files ?? fileStates.length;
    setFileStates((prev) => prev.map((f, i) => { if (i < processed) return { ...f, status: 'done' as const, progress: 100 }; if (i === processed) { const fp = total > 0 ? Math.max(0, ((auditJob.progress - (processed / total) * 100) / (100 / total)) * 100) : 50; return { ...f, status: 'analyzing' as const, progress: Math.min(95, Math.max(10, fp)) }; } if (i === processed + 1) return { ...f, status: 'scanning' as const, progress: 5 }; return { ...f, status: 'waiting' as const, progress: 0 }; }));
    if (processed > prevProcessedRef.current) { const diff = processed - prevProcessedRef.current; for (let k = 0; k < diff; k++) { const xpAmount = 25 + Math.floor(Math.random() * 15); const id = `xp-${Date.now()}-${k}`; setXpEvents((prev) => [...prev, { id, amount: xpAmount, ts: Date.now() }]); setTotalXp((prev) => prev + xpAmount); setTimeout(() => setXpEvents((prev) => prev.filter((e) => e.id !== id)), 1500); } }
    prevProcessedRef.current = processed;
    if (auditJob.report_markdown && !showConfetti) { setShowConfetti(true); setTotalXp((prev) => prev + 100); setXpEvents((prev) => [...prev, { id: 'final', amount: 100, ts: Date.now() }]); setTimeout(() => setXpEvents((prev) => prev.filter((e) => e.id !== 'final')), 1500); }
  }, [auditJob?.progress, auditJob?.processed_files, auditJob?.report_markdown, fileStates.length, showConfetti]);
  useEffect(() => { const timer = setInterval(() => setTipIndex((i) => (i + 1) % AUDIT_TIPS.length), 4000); return () => clearInterval(timer); }, []);
  const overallProgress = auditJob?.progress ?? 0; const processed = auditJob?.processed_files ?? 0; const total = auditJob?.total_files ?? fileStates.length;
  const level = Math.min(LEVEL_NAMES.length - 1, Math.floor(overallProgress / (100 / LEVEL_NAMES.length))); const isComplete = !!auditJob?.report_markdown;
  return (
    <div className="sv-card space-y-4" style={{ padding: 20, animation: 'svScaleIn 0.4s ease-out' }}>
      <div className="flex items-center gap-4">
        <div style={{ position: 'relative' }}>
          <div className={isComplete ? 'sv-icon-circle-navy' : ''} style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, ...(!isComplete ? { background: '#eff6ff', color: '#1e3a8a' } : {}) }}>{isComplete ? '★' : level + 1}</div>
          {xpEvents.map((ev) => (<div key={ev.id} style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', animation: 'svXpPop 1.2s ease-out both', pointerEvents: 'none', zIndex: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>+{ev.amount} XP</span></div>))}
        </div>
        <div style={{ flex: 1 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 600, color: isComplete ? '#059669' : '#0f172a' }}>{isComplete ? 'Audit Complete!' : LEVEL_NAMES[level]}</span><span style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a' }}>{totalXp} XP</span></div>
          <div className="sv-progress-track"><div className={isComplete ? 'sv-progress-fill-green' : 'sv-progress-fill-navy'} style={{ width: `${isComplete ? 100 : overallProgress}%` }} /></div>
          <div className="flex items-center justify-between" style={{ marginTop: 6 }}><span style={{ fontSize: 11, color: '#94a3b8' }}>{processed}/{total} files</span><span style={{ fontSize: 11, fontWeight: 600, color: '#1e3a8a' }}>{Math.round(overallProgress)}%</span></div>
        </div>
      </div>
      <div className="space-y-1.5" style={{ maxHeight: 280, overflowY: 'auto' }}>
        {fileStates.map((f, idx) => {
          const meta = FILE_TYPE_META[f.type] || FILE_TYPE_META.default;
          const statusBg: Record<string, string> = { waiting: 'transparent', scanning: '#eff6ff', analyzing: '#fffbeb', done: '#f0fdf4' };
          const statusBorder: Record<string, string> = { waiting: 'transparent', scanning: '#bfdbfe', analyzing: '#fde68a', done: '#bbf7d0' };
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: statusBg[f.status], border: `1px solid ${statusBorder[f.status]}`, opacity: f.status === 'waiting' ? 0.4 : 1, transition: 'all 0.5s ease', animation: f.status !== 'waiting' ? `svSlideUp 0.4s ease-out ${idx * 50}ms both` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: `${meta.color}10`, flexShrink: 0 }}>
                {f.status === 'done' ? <CheckCircle2 style={{ width: 16, height: 16, color: '#059669' }} /> : f.status === 'analyzing' ? <Loader2 style={{ width: 16, height: 16, color: '#d97706', animation: 'spin 1s linear infinite' }} /> : f.status === 'scanning' ? <Search style={{ width: 16, height: 16, color: '#3b82f6', animation: 'pulse 2s infinite' }} /> : <span>{meta.icon}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}><span style={{ fontSize: 12, fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span><FileTypeBadge name={f.name} /></div>
                <div className="sv-progress-track-sm"><div style={{ height: '100%', borderRadius: 2, transition: 'width 1s ease-out', width: `${f.progress}%`, background: f.status === 'done' ? '#059669' : f.status === 'analyzing' ? '#d97706' : f.status === 'scanning' ? '#3b82f6' : '#e2e8f0' }} /></div>
              </div>
            </div>
          );
        })}
      </div>
      {!isComplete && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <Sparkles style={{ width: 16, height: 16, color: '#1e3a8a', flexShrink: 0, marginTop: 2, animation: 'svPulse 2s ease-in-out infinite' }} />
          <div><p style={{ fontSize: 10, fontWeight: 600, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>AI is thinking</p><p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, animation: 'svFadeIn 0.5s ease-out' }} key={tipIndex}>{AUDIT_TIPS[tipIndex]}</p></div>
        </div>
      )}
      {isComplete && <div style={{ textAlign: 'center', padding: 12 }}><div className="sv-badge-success-lg"><CheckCircle2 style={{ width: 16, height: 16 }} /><span>All files verified — Report ready!</span><span style={{ fontWeight: 700, color: '#1e3a8a', marginLeft: 4 }}>+100 XP</span></div></div>}
    </div>
  );
}

/* ── Landing page data ── */
const FEATURES = [
  { icon: Search, title: 'Cross-document verification', desc: 'GST returns vs ITR vs Tally vs Bank Statements — automatic reconciliation across all uploaded documents with variance detection.' },
  { icon: AlertTriangle, title: 'Red flag detection', desc: 'AI identifies revenue suppression, circular trading, phantom vendors, inflated expenses, and related-party anomalies — all cited with extracted evidence.' },
  { icon: Shield, title: 'Forensic-grade analysis', desc: 'Modeled on senior CA expertise with 20+ years in forensic accounting. Every finding is backed by specific document references.' },
  { icon: Zap, title: 'Minutes, not weeks', desc: 'Traditional forensic audits take 6–8 weeks and cost ₹25–50 lakh. Get equivalent intelligence in minutes at a fraction of the cost.' },
  { icon: BarChart3, title: 'CIM & teaser generation', desc: 'Automatically generate a Confidential Information Memorandum and Investment Teaser — ready for deal distribution.' },
  { icon: FileText, title: 'Multi-format support', desc: 'Upload GST returns, ITRs, bank statements, Tally exports, MCA filings — all parsed and cross-referenced automatically.' },
];
const DOC_TYPES = [ { label: 'GST Returns', points: 'GSTIN, turnover, ITC, output tax' }, { label: 'ITR (Income Tax)', points: 'PAN, total income, tax paid, revenue' }, { label: 'Bank Statements', points: 'Credits, debits, balance, patterns' }, { label: 'Tally Exports', points: 'Sales, purchases, P&L, ledgers' }, { label: 'MCA Filings', points: 'CIN, capital, shareholding, directors' }, { label: 'Compliance Docs', points: 'Licenses, certifications, registrations' } ];
const VERIFICATIONS = [ { check: 'Revenue reconciliation', logic: 'GST vs ITR vs Tally sales', flag: '>5% variance' }, { check: 'Bank credit matching', logic: 'Bank vs Sales vs GST', flag: '>10% unaccounted' }, { check: 'Tax compliance', logic: 'ITR vs GST vs Tally tax', flag: '>5% unpaid' }, { check: 'Filing consistency', logic: 'GST dates vs ITR submission', flag: '>3 months delay' }, { check: 'Working capital', logic: 'Current assets vs liabilities', flag: 'Ratio <1.0' } ];
const DETECTIONS = ['Revenue mismatches & suppression','Tax evasion indicators (GST, IT)','Circular trading & round-tripping','Inflated expenses & phantom vendors','Related party transaction red flags','Working capital manipulation','Unusual cash flow patterns','Filing inconsistencies'];

/* ── CSS ── */
const INJECTED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{font-family:Inter,system-ui,-apple-system,sans-serif;box-sizing:border-box}
@keyframes svShimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes svSlideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes svFadeIn{from{opacity:0}to{opacity:1}}
@keyframes svScaleIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
@keyframes svFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes svBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
@keyframes svXpPop{0%{transform:translateY(0) scale(0.5);opacity:0}30%{transform:translateY(-10px) scale(1.15);opacity:1}100%{transform:translateY(-30px) scale(0.9);opacity:0}}
@keyframes svPop{0%{transform:scale(0);opacity:0}50%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes svPulse{0%,100%{opacity:1}50%{opacity:0.5}}
@keyframes svPulseRing{0%{box-shadow:0 0 0 0 rgba(59,130,246,0.2)}70%{box-shadow:0 0 0 8px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}
@keyframes svBorderRotate{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.sv-shimmer{height:3px;background:linear-gradient(90deg,#1e3a8a,#3b82f6,#93c5fd,#3b82f6,#1e3a8a);background-size:200% 100%;animation:svShimmer 2.5s linear infinite}
.sv-card{background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.03);transition:all 0.35s cubic-bezier(0.16,1,0.3,1)}
.sv-card:hover{box-shadow:0 8px 30px rgba(30,58,138,0.06),0 1px 3px rgba(0,0,0,0.04);border-color:#c7d2fe;transform:translateY(-2px)}
.sv-card-static{background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.03)}
.sv-card-premium{position:relative;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(30,58,138,0.06)}
.sv-card-premium::before{content:'';position:absolute;inset:-2px;border-radius:20px;background:linear-gradient(135deg,#1e3a8a,#3b82f6,#93c5fd,#3b82f6,#1e3a8a);background-size:300% 300%;animation:svBorderRotate 4s ease infinite;z-index:0}
.sv-card-premium::after{content:'';position:absolute;inset:2px;border-radius:16px;background:#ffffff;z-index:1}
.sv-card-premium>*{position:relative;z-index:2}
.sv-btn-navy{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 24px;border-radius:10px;background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%);color:#fff;font-size:13px;font-weight:600;border:none;cursor:pointer;transition:all 0.25s ease;box-shadow:0 2px 8px rgba(30,58,138,0.18)}
.sv-btn-navy:hover{box-shadow:0 4px 16px rgba(30,58,138,0.25);transform:translateY(-1px)}
.sv-btn-navy:active{transform:translateY(0);box-shadow:0 1px 4px rgba(30,58,138,0.15)}
.sv-btn-navy:disabled{opacity:0.5;cursor:not-allowed;transform:none}
.sv-btn-outline{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:10px;background:#fff;color:#1e293b;font-size:13px;font-weight:500;border:1px solid #e2e8f0;cursor:pointer;transition:all 0.25s ease}
.sv-btn-outline:hover{border-color:#93c5fd;background:#f8faff;box-shadow:0 2px 8px rgba(30,58,138,0.05)}
.sv-btn-outline:disabled{opacity:0.5;cursor:not-allowed}
.sv-btn-danger{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border-radius:10px;background:#fff;color:#dc2626;font-size:13px;font-weight:500;border:1px solid #fecaca;cursor:pointer;transition:all 0.2s}
.sv-btn-danger:hover{background:#fef2f2;border-color:#fca5a5}
.sv-badge-navy{display:flex;align-items:center;gap:6px;padding:4px 12px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}
.sv-badge-green{display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:8px;background:#ecfdf5;border:1px solid #a7f3d0;color:#059669}
.sv-badge-red{display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626}
.sv-badge-success-lg{display:inline-flex;align-items:center;gap:10px;padding:10px 20px;border-radius:999px;background:#f0fdf4;border:1px solid #bbf7d0;font-size:13px;font-weight:600;color:#059669}
.sv-progress-track{height:10px;border-radius:5px;background:#f1f5f9;overflow:hidden}
.sv-progress-track-sm{height:4px;border-radius:2px;background:#f1f5f9;overflow:hidden}
.sv-progress-fill-navy{height:100%;border-radius:5px;transition:width 0.7s ease-out;background:linear-gradient(90deg,#1e3a8a,#3b82f6)}
.sv-progress-fill-green{height:100%;border-radius:5px;transition:width 0.7s ease-out;background:linear-gradient(90deg,#059669,#10b981)}
.sv-chip{padding:6px 14px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer;transition:all 0.2s}
.sv-chip:hover{border-color:#93c5fd;color:#1e3a8a}
.sv-chip-active{padding:6px 14px;border-radius:8px;font-size:11px;font-weight:600;border:1px solid #93c5fd;background:#eff6ff;color:#1e3a8a;cursor:pointer}
.sv-toggle-group{display:flex;gap:4px;padding:3px;border-radius:12px;background:#f1f5f9}
.sv-toggle{padding:6px 14px;border-radius:9px;font-size:11px;font-weight:500;border:none;background:transparent;color:#64748b;cursor:pointer;transition:all 0.2s}
.sv-toggle:hover{color:#1e293b}
.sv-toggle-active{padding:6px 14px;border-radius:9px;font-size:11px;font-weight:600;border:none;background:#fff;color:#1e3a8a;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
.sv-icon-circle-navy{border-radius:14px;background:linear-gradient(135deg,#1e3a8a,#1d4ed8);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 12px rgba(30,58,138,0.2)}
.sv-icon-circle-light{width:40px;height:40px;border-radius:12px;background:#eff6ff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sv-section-label{font-size:11px;font-weight:600;color:#1e3a8a;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px}
.sv-section-title{font-size:28px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.2}
.sv-file-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;transition:background 0.2s ease;cursor:default}
.sv-file-item:hover{background:#f8fafc}
.sv-folder-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border-radius:10px;border:none;background:transparent;cursor:pointer;transition:all 0.2s ease}
.sv-folder-item:hover{background:#eff6ff}
.sv-info-box{display:flex;align-items:flex-start;gap:14px;padding:16px 18px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0}
.sv-error-box{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca}
.sv-header{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:10px 24px;transition:all 0.35s ease}
.sv-header-scrolled{background:rgba(250,248,245,0.96)!important;backdrop-filter:blur(20px) saturate(1.2)!important;-webkit-backdrop-filter:blur(20px) saturate(1.2)!important;border-bottom:1px solid #e2e8f0!important;box-shadow:0 1px 12px rgba(0,0,0,0.04)!important}
.sv-table{border-radius:16px;overflow:hidden;border:1px solid #e2e8f0}
.sv-table table{width:100%;border-collapse:collapse}
.sv-table thead tr{background:#f8fafc}
.sv-table th{text-align:left;padding:12px 18px;font-size:11px;font-weight:700;color:#1e3a8a;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e2e8f0}
.sv-table td{padding:12px 18px}
.sv-table tbody tr{transition:background 0.2s}
.sv-table tbody tr:hover{background:#fafbff}
.sv-table tbody tr:not(:last-child){border-bottom:1px solid #f1f5f9}
`;

/* ═══════════════════════════ MAIN COMPONENT ═══════════════════════════ */
/* Auth is handled by ProtectedRoute wrapper in App.tsx */

export default function Auditor() {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState(''); const [companyName, setCompanyName] = useState('');
  const [session, setSession] = useState<AuditorSession | null>(null);
  const [documents, setDocuments] = useState<DocInfo[]>([]); const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); const [auditJob, setAuditJob] = useState<AuditJob | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null); const [auditIsRunning, setAuditIsRunning] = useState(false);
  const [uploading, setUploading] = useState(false); const [uploadingFolders, setUploadingFolders] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ id: string; name: string; progress: number }[]>([]);
  const [cimReport, setCimReport] = useState<CIMReport | null>(null); const [cimError, setCimError] = useState<string | null>(null); const [cimIsRunning, setCimIsRunning] = useState(false);
  const [teaserReport, setTeaserReport] = useState<TeaserReport | null>(null); const [teaserError, setTeaserError] = useState<string | null>(null); const [teaserIsRunning, setTeaserIsRunning] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false); const [statusLoading, setStatusLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null); const reportContentRef = useRef<HTMLDivElement>(null);
  const cimAbortRef = useRef<AbortController | null>(null); const teaserAbortRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLDivElement>(null); const { toast } = useToast(); const formTilt = use3DTilt(4);
  const { user, profile, loading: authLoading } = useAuth();

  const handleSignOut = useCallback(async () => {
    await signOut();
    window.location.href = '/auditor/auth';
  }, []);

  useEffect(() => { const id = 'audit-enhanced-css'; if (!document.getElementById(id)) { const s = document.createElement('style'); s.id = id; s.textContent = INJECTED_CSS; document.head.appendChild(s); } }, []);
  useEffect(() => { const h = () => setHeaderScrolled(window.scrollY > 50); window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h); }, []);

  const resetSession = useCallback(() => { localStorage.removeItem('nidhi:auditor:cimReport'); localStorage.removeItem('nidhi:auditor:teaserReport'); setSession(null); setStep('form'); setDocuments([]); setFolders([]); setCurrentFolderId(null); setAuditJob(null); setAuditError(null); setCimReport(null); setCimError(null); setTeaserReport(null); setTeaserError(null); }, []);

  const fetchStatus = useCallback(async () => {
    if (!session?.sessionId) return; setStatusLoading(true);
    try { const data = await auditorInvoke({ action: 'status', sessionId: session.sessionId }); if (data.documents) setDocuments(data.documents as DocInfo[]); if (data.folders) setFolders(data.folders as FolderInfo[]); if (data.auditJob) setAuditJob(data.auditJob as AuditJob); }
    catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); if (msg.includes('Session not found') || msg.includes('404')) resetSession(); }
    finally { setStatusLoading(false); }
  }, [session?.sessionId, resetSession]);

  // Restore CIM/Teaser report cache from localStorage (client-generated, device-local is fine)
  useEffect(() => { const storedCim = localStorage.getItem('nidhi:auditor:cimReport'); if (storedCim) { try { setCimReport(JSON.parse(storedCim)); } catch (_) {} } const storedTeaser = localStorage.getItem('nidhi:auditor:teaserReport'); if (storedTeaser) { try { setTeaserReport(JSON.parse(storedTeaser)); } catch (_) {} } }, []);
  // Look up the user's active session from DB after auth resolves
  useEffect(() => { if (authLoading || !user || session) return; (async () => { try { const data = await auditorInvoke({ action: 'lookup-session', userId: user.id }); if (data.session) { setSession(data.session as AuditorSession); setStep('upload'); } } catch (_) {} })(); }, [authLoading, user?.id]);
  useEffect(() => { if (session && step === 'upload') fetchStatus(); }, [session, step, fetchStatus]);

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim() || !companyName.trim()) { toast({ title: 'Required', description: 'Please enter your name and company name.', variant: 'destructive' }); return; }
    try { const { data: { user } } = await supabase.auth.getUser(); const data = await auditorInvoke({ action: 'create-session', name: name.trim(), company_name: companyName.trim(), userId: user?.id || undefined }); if (data.error) throw new Error(String(data.error)); const sess: AuditorSession = { sessionId: data.sessionId as string, vaultId: data.vaultId as string, folderId: data.folderId as string, name: data.name as string, company_name: data.company_name as string, created_at: data.created_at as string }; setSession(sess); setStep('upload'); toast({ title: 'Welcome', description: `Hi ${data.name}, please upload your documents.` }); }
    catch (e: any) { toast({ title: 'Error', description: e?.message || 'Failed to start', variant: 'destructive' }); }
  };

  const targetFolderId = currentFolderId ?? session?.folderId ?? null;

  const processFiles = async (files: FileList) => {
    if (!files?.length || !session) return; setUploading(true);
    const ids: string[] = [];
    for (let i = 0; i < files.length; i++) { const id = `u-${Date.now()}-${i}`; ids.push(id); setUploadProgress((p) => [...p, { id, name: files[i].name, progress: 0 }]); }
    try {
      for (let i = 0; i < files.length; i++) { const file = files[i]; const id = ids[i]; const data = await auditorInvoke({ action: 'upload-url', sessionId: session.sessionId, fileName: file.name, fileType: file.type, fileSize: file.size, folderId: targetFolderId || undefined }); if (data.error) throw new Error(String(data.error)); setUploadProgress((p) => p.map((u) => (u.id === id ? { ...u, progress: 30 } : u))); const uploadRes = await fetch(data.uploadUrl as string, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }); if (!uploadRes.ok) throw new Error('Upload failed'); setUploadProgress((p) => p.map((u) => (u.id === id ? { ...u, progress: 100 } : u))); }
      await fetchStatus(); toast({ title: '✓ Uploaded', description: `${files.length} file${files.length > 1 ? 's' : ''} uploaded successfully.` }); setTimeout(() => setUploadProgress([]), 1200);
    } catch (e: any) { toast({ title: 'Upload error', description: e?.message || 'Failed', variant: 'destructive' }); setUploadProgress([]); }
    finally { setUploading(false); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) await processFiles(e.target.files); e.target.value = ''; };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length || !session) return; setUploadingFolders(true);
    const filesWithPaths = Array.from(files).map((file) => ({ file, relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }));
    const folderPathsSet = new Set<string>(); for (const { relativePath } of filesWithPaths) { const parts = relativePath.split('/'); for (let i = 1; i < parts.length; i++) folderPathsSet.add(parts.slice(0, i).join('/')); }
    const folderPaths = Array.from(folderPathsSet).sort((a, b) => a.split('/').length - b.split('/').length); const pathToFolderId = new Map<string, string | null>(); const rootId = targetFolderId ?? session.folderId;
    try {
      const rootFolderName = `Folder ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const dataRoot = await auditorInvoke({ action: 'create-folder', sessionId: session.sessionId, folderName: rootFolderName, parentFolderId: rootId || undefined }); if (dataRoot.error) throw new Error(String(dataRoot.error));
      const createdRootId = dataRoot.folderId as string; if (!createdRootId) throw new Error('Failed'); pathToFolderId.set('', createdRootId);
      for (const folderPath of folderPaths) { const parts = folderPath.split('/'); const folderName = parts[parts.length - 1]; const parentPath = parts.slice(0, -1).join('/'); const parentId = pathToFolderId.get(parentPath) ?? pathToFolderId.get('') ?? rootId; const data = await auditorInvoke({ action: 'create-folder', sessionId: session.sessionId, folderName, parentFolderId: parentId }); if (data.error) throw new Error(String(data.error)); if (data.folderId) pathToFolderId.set(folderPath, data.folderId as string); }
      const ids: string[] = [];
      for (let i = 0; i < filesWithPaths.length; i++) { const id = `f-${Date.now()}-${i}`; ids.push(id); setUploadProgress((p) => [...p, { id, name: filesWithPaths[i].file.name, progress: 0 }]); }
      for (let i = 0; i < filesWithPaths.length; i++) { const { file, relativePath } = filesWithPaths[i]; const id = ids[i]; const parts = relativePath.split('/'); const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''; const folderId = pathToFolderId.get(folderPath) ?? pathToFolderId.get('') ?? rootId; const data = await auditorInvoke({ action: 'upload-url', sessionId: session.sessionId, fileName: file.name, fileType: file.type, fileSize: file.size, folderId: folderId || undefined }); if (data.error) throw new Error(String(data.error)); setUploadProgress((p) => p.map((u) => (u.id === id ? { ...u, progress: 30 } : u))); const uploadRes = await fetch(data.uploadUrl as string, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }); if (!uploadRes.ok) throw new Error(`Upload failed`); setUploadProgress((p) => p.map((u) => (u.id === id ? { ...u, progress: 100 } : u))); }
      await fetchStatus(); toast({ title: '✓ Uploaded' }); setTimeout(() => setUploadProgress([]), 1200);
    } catch (err: any) { toast({ title: 'Upload error', description: err?.message, variant: 'destructive' }); setUploadProgress([]); }
    finally { setUploadingFolders(false); e.target.value = ''; }
  };

  const startAudit = useCallback(async () => { if (!session?.sessionId) return; setAuditError(null); setAuditIsRunning(true); if (auditJob?.report_markdown) setAuditJob(null); try { const data = await auditorInvoke({ action: 'start-audit', sessionId: session.sessionId }); if (data.error) throw new Error(String(data.error)); setAuditJob({ id: data.jobId as string, status: 'queued', progress: 0, total_files: (data.totalFiles as number) || 0, processed_files: 0, current_step: 'Queued', report_markdown: null }); toast({ title: 'Audit started' }); } catch (e: any) { setAuditError(e?.message || 'Failed'); } finally { setAuditIsRunning(false); } }, [session?.sessionId, auditJob?.report_markdown, toast]);

  useEffect(() => { if (!auditJob || auditJob.status === 'completed' || auditJob.status === 'failed' || auditJob.status === 'cancelled' || auditJob.report_markdown) return; const runBatch = async () => { try { const data = await auditorInvoke({ action: 'run-audit-batch', jobId: auditJob.id }); if (data?.job) setAuditJob(data.job as AuditJob); } catch (e) { const msg = e instanceof Error ? e.message : String(e); if (!auditJob.report_markdown) { setAuditError(msg); try { await fetchStatus(); } catch (_) {} } } }; pollRef.current = setInterval(runBatch, 4000); runBatch(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, [auditJob?.id, auditJob?.status, auditJob?.report_markdown, fetchStatus]);
  useEffect(() => { if (auditJob?.report_markdown) setAuditError(null); }, [auditJob?.report_markdown]);
  useEffect(() => { if (auditJob?.status === 'running' || auditJob?.status === 'queued') fetchStatus(); }, [auditJob?.status, fetchStatus]);

  const stopAudit = useCallback(async () => { if (!auditJob?.id || ['completed','failed','cancelled'].includes(auditJob.status)) return; setAuditJob((prev) => prev ? { ...prev, status: 'cancelled' } : null); setAuditError(null); toast({ title: 'Audit stopped' }); try { await auditorInvoke({ action: 'cancel-audit', jobId: auditJob.id }); } catch (_) {} }, [auditJob?.id, auditJob?.status, toast]);
  
  const downloadReport = async () => {
    const md = auditJob?.report_markdown;
    if (!md) return;

    const dataroomName = session?.company_name ?? 'Audit Report';
    const reportDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const rj: any = auditJob?.report_json ?? null;

    const esc = (s: string) =>
      String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

    const watermarkSvg = `<div style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden;"><svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="96" font-family="Georgia,serif" fill="rgba(180,140,100,0.08)" transform="rotate(-35 420 420)" font-weight="bold" letter-spacing="4">SAMAVEDA CAPITAL</text></svg></div>`;
    const pageWatermark = `<div style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden;"><svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="80" font-family="Georgia,serif" fill="rgba(180,140,100,0.055)" transform="rotate(-35 420 420)" font-weight="bold" letter-spacing="4">SAMAVEDA CAPITAL</text></svg></div>`;

    const renderTable = (headers: string[], rows: string[][]): string => {
      if (!rows.length) return '';
      return `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:10pt;"><thead><tr>${headers.map(h => `<th style="border:1px solid #e2e8f0;padding:8px 10px;background:#f8fafc;font-weight:700;color:#334155;text-align:left;">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, i) => `<tr style="${i % 2 === 1 ? 'background:#f8fafc;' : ''}">${row.map(c => `<td style="border:1px solid #e2e8f0;padding:7px 10px;color:#0f172a;">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    };

    const renderRedFlagBox = (title: string, severity: string, detail: string, extra = ''): string =>
      `<div style="border-left:4px solid ${severityColor(severity)};background:${severityBg(severity)};padding:14px 16px;margin:14px 0;border-radius:0 6px 6px 0;page-break-inside:avoid;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="background:${severityColor(severity)};color:#fff;font-size:8pt;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.05em;">${severityLabel(severity)}</span><strong style="color:#0f172a;font-size:11pt;">${esc(title)}</strong></div><p style="color:#374151;margin:0 0 8px;font-size:10.5pt;">${esc(detail)}</p>${extra}</div>`;
    
    toast({ title: 'Generating report...' });
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      toast({ title: 'Please allow popups', description: 'The report opens in a new tab.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Report opened for printing', description: 'In the print dialog, set destination to "Save as PDF".' });
  };

  const previewHtml = useMemo(() => {
    const md = auditJob?.report_markdown;
    if (!md) return '';
    return '';
  }, [auditJob?.report_markdown, auditJob?.report_json, auditJob?.processed_files, session?.company_name]);

  const startCimGeneration = useCallback(async () => { if (!session?.vaultId || !session?.company_name || !session?.sessionId) return; const { data: { user } } = await supabase.auth.getUser(); if (!user) return; setCimError(null); setCimIsRunning(true); try { cimAbortRef.current = new AbortController(); const prefetched = await fetchDocumentsViaAuditor(session.sessionId); const report = await runCIMGeneration(session.vaultId, session.company_name, user.id, cimAbortRef.current.signal, undefined, prefetched ?? undefined); setCimReport(report); try { localStorage.setItem('nidhi:auditor:cimReport', JSON.stringify(report)); } catch (_) {} toast({ title: 'CIM generated' }); } catch (e: any) { setCimError(e?.message || 'Failed'); } finally { setCimIsRunning(false); cimAbortRef.current = null; } }, [session?.vaultId, session?.company_name, session?.sessionId, toast]);
  const downloadCimPdf = useCallback(async () => { if (!cimReport) return; const safeName = (session?.company_name || 'CIM').replace(/\s+/g, '_'); try { await capturePdfFromHtml(getFormattedCIM(cimReport), samavedaWatermark, `CIM_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`); toast({ title: 'Downloaded' }); } catch (e: any) { toast({ title: 'Error', description: e?.message, variant: 'destructive' }); } }, [cimReport, session?.company_name, toast]);

  const startTeaserGeneration = useCallback(async () => { if (!session?.vaultId || !session?.company_name || !session?.sessionId) return; const { data: { user } } = await supabase.auth.getUser(); if (!user) return; setTeaserError(null); setTeaserIsRunning(true); try { teaserAbortRef.current = new AbortController(); const prefetched = await fetchDocumentsViaAuditor(session.sessionId); const report = await runTeaserGeneration(session.vaultId, session.company_name, user.id, teaserAbortRef.current.signal, prefetched ?? undefined); setTeaserReport(report); try { localStorage.setItem('nidhi:auditor:teaserReport', JSON.stringify(report)); } catch (_) {} toast({ title: 'Teaser generated' }); } catch (e: any) { if (e?.name !== 'AbortError') setTeaserError(e?.message || 'Failed'); } finally { setTeaserIsRunning(false); teaserAbortRef.current = null; } }, [session?.vaultId, session?.company_name, session?.sessionId, toast]);
  const downloadTeaserPdf = useCallback(async () => { if (!teaserReport) return; const safeName = (session?.company_name || 'Teaser').replace(/\s+/g, '_'); try { await capturePdfFromHtml(getFormattedTeaser(teaserReport), samavedaWatermark, `Teaser_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`); toast({ title: 'Downloaded' }); } catch (e: any) { toast({ title: 'Error', description: e?.message, variant: 'destructive' }); } }, [teaserReport, session?.company_name, toast]);

  const rootFolderId = session?.folderId ?? null; const effectiveFolderId = currentFolderId ?? rootFolderId;
  const subfolders = folders.filter((f) => f.parent_id === effectiveFolderId);
  const docsInFolder = documents.filter((d) => (d.folder_id ?? rootFolderId) === effectiveFolderId);
  const breadcrumbs: { id: string | null; name: string }[] = [{ id: null, name: 'Uploads' }];
  if (currentFolderId) { let cid: string | null = currentFolderId; const path: { id: string; name: string }[] = []; while (cid && cid !== rootFolderId) { const f = folders.find((x) => x.id === cid); if (!f) break; path.unshift({ id: f.id, name: f.name }); cid = f.parent_id; } breadcrumbs.push(...path); }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F5', color: '#0f172a' }}>
      {/* Header */}
      <header className={`sv-header ${headerScrolled ? 'sv-header-scrolled' : ''}`} style={{ background: headerScrolled ? undefined : 'transparent', borderBottom: headerScrolled ? undefined : '1px solid transparent' }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="Samaveda Capital" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 10 }} />
          <div><h1 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>Audit Agent</h1><p style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.18em' }}>by Samaveda Capital</p></div>
        </div>
        <div className="flex items-center gap-2">
          {session && (() => { const auditInProgress = auditJob && !['completed','failed','cancelled'].includes(auditJob.status); const busy = auditInProgress || cimIsRunning || teaserIsRunning; return (<button onClick={busy ? undefined : resetSession} className="sv-btn-outline" disabled={!!busy} title={busy ? 'Finish the current audit before starting a new session' : 'Start a new session'} style={{ fontSize: 12, padding: '6px 14px', opacity: busy ? 0.45 : 1, cursor: busy ? 'not-allowed' : undefined }}><ArrowLeft style={{ width: 14, height: 14 }} />New session</button>); })()}
          {step === 'form' && <button onClick={scrollToForm} className="sv-btn-navy">Start audit</button>}
          {user && (
            <>
              <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
              <span style={{ fontSize: 11, color: '#64748b', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.fullName || user.email}</span>
              <button onClick={handleSignOut} className="sv-btn-outline" style={{ fontSize: 12, padding: '6px 12px', color: '#dc2626', borderColor: '#fecaca' }}><LogOut style={{ width: 14, height: 14 }} />Sign out</button>
            </>
          )}
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 10 }}>
        {/* ═══════════ LANDING PAGE ═══════════ */}
        {step === 'form' && (
          <StepTransition stepKey="form">
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
            <section style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 64 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#1e3a8a', background: '#eff6ff', padding: '6px 16px', borderRadius: 999, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 24, border: '1px solid #bfdbfe' }}><Sparkles style={{ width: 14, height: 14 }} />AI-powered forensic intelligence</div>
              <h2 style={{ fontSize: 'clamp(32px,5vw,50px)', fontWeight: 800, color: '#0f172a', lineHeight: 1.08, letterSpacing: '-0.03em', marginBottom: 20 }}>Forensic document audit<br />in minutes, not months</h2>
              <p style={{ color: '#64748b', fontSize: 17, maxWidth: 540, margin: '0 auto', lineHeight: 1.6, marginBottom: 36 }}>Upload GST returns, ITRs, bank statements, and Tally exports. Our AI cross-verifies every document and surfaces red flags with cited evidence — the same diligence Big 4 firms deliver, at 10× the speed.</p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={scrollToForm} className="sv-btn-navy" style={{ padding: '14px 32px', fontSize: 15 }}>Upload documents</button>
                <button onClick={() => document.getElementById('audit-why')?.scrollIntoView({ behavior: 'smooth' })} className="sv-btn-outline" style={{ padding: '14px 24px', fontSize: 15 }}>Learn more<ChevronDown style={{ width: 16, height: 16, animation: 'svBounce 2s ease-in-out infinite' }} /></button>
              </div>
            </section>
            <AnimatedSection className="grid grid-cols-4 gap-4" style={{ marginBottom: 120 }}>{[{ num: '6', label: 'Document types' }, { num: '5', label: 'Cross-verifications', suffix: '+' }, { num: '900', label: 'Integrations', suffix: '+' }, { num: '<5 min', label: 'Average audit time' }].map((s, i) => (<div key={i} className="sv-card" style={{ textAlign: 'center', padding: '20px 12px' }}><div style={{ fontSize: 26, fontWeight: 700, color: '#1e3a8a' }}><AnimatedCounter target={s.num} suffix={s.suffix} /></div><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{s.label}</div></div>))}</AnimatedSection>

            <AnimatedSection><section id="audit-why" style={{ marginBottom: 80, paddingTop: 40 }}><div style={{ textAlign: 'center', marginBottom: 48 }}><p className="sv-section-label">Why this matters</p><h3 className="sv-section-title">The due diligence gap is costing deals</h3><p style={{ color: '#64748b', fontSize: 15, maxWidth: 600, margin: '12px auto 0', lineHeight: 1.6 }}>India's mid-market M&A is a ₹3,000–8,000 Cr annual advisory fee pool — chronically underserved.</p></div><div className="grid grid-cols-3 gap-4">{[{ num: '₹25–50L', sub: 'Big 4 forensic audit cost', detail: 'Per engagement, 6–8 week turnaround' }, { num: '40%', sub: 'CARO 2020 non-compliance', detail: 'Companies flagged for discrepancies' }, { num: '60%+', sub: 'Mid-market by deal count', detail: '2,186 deals, $116B — GT 2024' }].map((item, i) => (<AnimatedSection key={i} delay={i * 100}><div className="sv-card" style={{ textAlign: 'center', padding: 24 }}><div style={{ fontSize: 26, fontWeight: 700, color: '#1e3a8a' }}>{item.num}</div><div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 6 }}>{item.sub}</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{item.detail}</div></div></AnimatedSection>))}</div></section></AnimatedSection>

            <AnimatedSection><section style={{ marginBottom: 80 }}><div style={{ textAlign: 'center', marginBottom: 48 }}><p className="sv-section-label">Capabilities</p><h3 className="sv-section-title">Everything a forensic auditor checks — automated</h3></div><div className="grid grid-cols-2 gap-4">{FEATURES.map((f, i) => { const Icon = f.icon; return (<AnimatedSection key={i} delay={i * 80}><div className="sv-card" style={{ display: 'flex', gap: 16, padding: 20, height: '100%' }}><div className="sv-icon-circle-light"><Icon style={{ width: 20, height: 20, color: '#1e3a8a' }} /></div><div><div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{f.title}</div><div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{f.desc}</div></div></div></AnimatedSection>); })}</div></section></AnimatedSection>

            <AnimatedSection><section style={{ marginBottom: 80 }}><div style={{ textAlign: 'center', marginBottom: 48 }}><p className="sv-section-label">Supported documents</p><h3 className="sv-section-title">Upload any combination of these</h3></div><div className="grid grid-cols-3 gap-3">{DOC_TYPES.map((d, i) => (<AnimatedSection key={i} delay={i * 60}><div className="sv-card" style={{ padding: 20, height: '100%' }}><div className="flex items-center gap-2" style={{ marginBottom: 8 }}><FileText style={{ width: 16, height: 16, color: '#1e3a8a' }} /><span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{d.label}</span></div><div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{d.points}</div></div></AnimatedSection>))}</div></section></AnimatedSection>

            <AnimatedSection><section style={{ marginBottom: 80 }}><div style={{ textAlign: 'center', marginBottom: 48 }}><p className="sv-section-label">Verification matrix</p><h3 className="sv-section-title">Cross-document reconciliation</h3></div><div className="sv-table"><table><thead><tr>{['Verification','Logic','Red flag'].map((h) => (<th key={h}>{h}</th>))}</tr></thead><tbody>{VERIFICATIONS.map((v, i) => (<tr key={i}><td style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{v.check}</td><td style={{ fontSize: 13, color: '#64748b' }}>{v.logic}</td><td><span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: 6 }}>{v.flag}</span></td></tr>))}</tbody></table></div></section></AnimatedSection>

            <AnimatedSection><section style={{ marginBottom: 80 }}><div style={{ textAlign: 'center', marginBottom: 48 }}><p className="sv-section-label">Process</p><h3 className="sv-section-title">Three steps to a forensic audit</h3></div><div className="grid grid-cols-3 gap-4">{[{ step: '01', icon: Users, title: 'Enter details', desc: 'Provide your name and company name.' }, { step: '02', icon: Upload, title: 'Upload documents', desc: 'Drop GST, ITR, bank statements, Tally exports.' }, { step: '03', icon: FileText, title: 'Get your report', desc: 'AI generates forensic audit, CIM, and teaser.' }].map((s, i) => { const Icon = s.icon; return (<AnimatedSection key={i} delay={i * 120}><div className="sv-card" style={{ position: 'relative', textAlign: 'center', padding: 24, height: '100%' }}><div style={{ position: 'absolute', top: 12, right: 16, fontSize: 32, fontWeight: 800, color: '#f1f5f9' }}>{s.step}</div><div className="sv-icon-circle-navy" style={{ width: 44, height: 44, margin: '0 auto 16px' }}><Icon style={{ width: 20, height: 20 }} /></div><div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>{s.title}</div><div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{s.desc}</div></div></AnimatedSection>); })}</div></section></AnimatedSection>

            <AnimatedSection><section style={{ marginBottom: 80 }}><div style={{ textAlign: 'center', marginBottom: 40 }}><p className="sv-section-label">AI detection</p><h3 className="sv-section-title">What the AI catches</h3></div><div className="grid grid-cols-2 gap-2.5" style={{ maxWidth: 680, margin: '0 auto' }}>{DETECTIONS.map((item, i) => (<AnimatedSection key={i} delay={i * 50}><div className="sv-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}><CheckCircle2 style={{ width: 16, height: 16, color: '#1e3a8a', flexShrink: 0 }} /><span style={{ fontSize: 13, color: '#475569' }}>{item}</span></div></AnimatedSection>))}</div></section></AnimatedSection>

            <AnimatedSection><section ref={formRef} style={{ marginBottom: 80 }}><div style={{ textAlign: 'center', marginBottom: 32 }}><div className="sv-icon-circle-navy" style={{ width: 56, height: 56, display: 'inline-flex', marginBottom: 16, animation: 'svFloat 3s ease-in-out infinite' }}><FileText style={{ width: 28, height: 28 }} /></div><h3 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Start your audit</h3><p style={{ fontSize: 14, color: '#64748b' }}>Enter your details to begin.</p></div><div ref={formTilt.cardRef} onMouseMove={formTilt.handleMouseMove} onMouseLeave={formTilt.handleMouseLeave} style={{ maxWidth: 440, margin: '0 auto', transition: 'transform 0.3s ease' }}><div className="sv-card-premium"><form onSubmit={handleSubmitForm} style={{ padding: 32 }}><div className="sv-shimmer" style={{ marginBottom: 16 }} /><div className="space-y-5"><div><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', display: 'block', marginBottom: 6 }}>Your name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, height: 44 }} required /></div><div><label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', display: 'block', marginBottom: 6 }}>Company name</label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, height: 44 }} required /></div><button type="submit" className="sv-btn-navy" style={{ width: '100%', padding: '14px 0', fontSize: 15 }}>Continue</button></div><div className="flex items-center justify-center gap-2" style={{ marginTop: 20, color: '#94a3b8' }}><Lock style={{ width: 14, height: 14 }} /><span style={{ fontSize: 11 }}>End-to-end encrypted · Your data stays private</span></div></form></div></div></section></AnimatedSection>

            <footer style={{ textAlign: 'center', padding: '32px 0', borderTop: '1px solid #f1f5f9' }}><div className="flex items-center justify-center gap-2" style={{ marginBottom: 8 }}><img src={logo} alt="" style={{ width: 24, height: 24, borderRadius: 8, objectFit: 'contain' }} /><span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Audit Agent</span><span style={{ fontSize: 11, color: '#94a3b8' }}>by Samaveda Capital</span></div><p style={{ fontSize: 11, color: '#cbd5e1' }}>Forensic AI intelligence for mid-market M&A due diligence</p></footer>
          </div>
          </StepTransition>
        )}

        {/* ═══════════ UPLOAD + AUDIT VIEW ═══════════ */}
        {step === 'upload' && session && (
          <StepTransition stepKey="upload">
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
            <div className="sv-card-static" style={{ marginBottom: 24 }}><div className="sv-shimmer" /><div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div className="flex items-center gap-4"><div className="sv-icon-circle-navy" style={{ width: 44, height: 44 }}><Users style={{ width: 20, height: 20 }} /></div><div><p style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{session.name}</p><p style={{ fontSize: 13, color: '#64748b' }}>{session.company_name}</p></div></div><div className="flex items-center gap-5" style={{ fontSize: 12, color: '#94a3b8' }}><div className="flex items-center gap-1.5"><FileText style={{ width: 14, height: 14 }} /><span>{documents.length} file{documents.length !== 1 ? 's' : ''}</span></div><div style={{ width: 1, height: 14, background: '#e2e8f0' }} /><div className="flex items-center gap-1.5"><Clock style={{ width: 14, height: 14 }} /><span>{new Date(session.created_at).toLocaleString()}</span></div></div></div></div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <div className="sv-card-static" style={{ position: 'sticky', top: 72 }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div className="flex items-center gap-2.5"><div className="sv-icon-circle-light" style={{ width: 32, height: 32 }}><Upload style={{ width: 16, height: 16, color: '#1e3a8a' }} /></div><h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Documents</h3></div>{documents.length > 0 && <div className="sv-badge-navy" style={{ padding: '2px 10px' }}><span style={{ fontSize: 11, fontWeight: 600 }}>{documents.length}</span></div>}</div>
                  <div style={{ padding: 16 }} className="space-y-3">
                    <div className="flex gap-1.5">
                      <label style={{ flex: 1 }}><button disabled={uploading || uploadingFolders} className="sv-btn-navy" style={{ width: '100%', fontSize: 12, padding: '8px 0' }} onClick={() => (document.querySelector('#sv-file-input') as HTMLInputElement)?.click()}><Upload style={{ width: 14, height: 14 }} />{uploading ? 'Uploading...' : 'Files'}</button><input id="sv-file-input" type="file" multiple style={{ display: 'none' }} onChange={handleFileSelect} disabled={uploading || uploadingFolders} /></label>
                      <label style={{ flex: 1 }}><button disabled={uploadingFolders || uploading} className="sv-btn-outline" style={{ width: '100%', fontSize: 12, padding: '8px 0' }} onClick={() => (document.querySelector('#sv-folder-input') as HTMLInputElement)?.click()}><FolderOpen style={{ width: 14, height: 14, color: '#1e3a8a' }} />{uploadingFolders ? '...' : 'Folders'}</button><input id="sv-folder-input" type="file" {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} multiple style={{ display: 'none' }} onChange={handleFolderUpload} disabled={uploadingFolders || uploading} /></label>
                    </div>
                    {breadcrumbs.length > 1 && <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 12, color: '#64748b' }}>{breadcrumbs.map((b, i) => (<span key={b.id ?? 'root'} className="flex items-center gap-1">{i > 0 && <ChevronRight style={{ width: 12, height: 12, color: '#cbd5e1' }} />}<button type="button" onClick={() => setCurrentFolderId(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 12 }}>{b.name}</button></span>))}</div>}
                    {subfolders.length === 0 && docsInFolder.length === 0 && <DragDropZone onFiles={processFiles} disabled={uploading || uploadingFolders} />}
                    {(subfolders.length > 0 || docsInFolder.length > 0) && (<div className="space-y-0.5" style={{ maxHeight: 300, overflowY: 'auto' }}>{subfolders.map((f) => (<button key={f.id} type="button" onClick={() => setCurrentFolderId(f.id)} className="sv-folder-item"><Folder style={{ width: 16, height: 16, color: '#1e3a8a', flexShrink: 0 }} /><span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span><ChevronRight style={{ width: 14, height: 14, color: '#cbd5e1' }} /></button>))}{docsInFolder.map((d, idx) => (<div key={d.id} className="sv-file-item" style={{ animation: `svSlideUp 0.3s ease-out ${idx * 30}ms both` }}><FileText style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} /><div style={{ flex: 1, minWidth: 0 }}><div className="flex items-center gap-2"><p style={{ fontSize: 13, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</p><FileTypeBadge name={d.name} /></div><p style={{ fontSize: 10, color: '#cbd5e1' }}>{formatFileSize(d.file_size)}</p></div></div>))}</div>)}
                    {uploadProgress.length > 0 && <div className="space-y-1.5" style={{ paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>{uploadProgress.map((u) => (<div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', animation: 'svSlideUp 0.3s ease-out' }}><Loader2 style={{ width: 14, height: 14, color: '#1e3a8a', animation: u.progress < 100 ? 'spin 1s linear infinite' : 'none', flexShrink: 0 }} /><span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: '#1e293b' }}>{u.name}</span><div style={{ width: 40, height: 4, borderRadius: 2, background: '#dbeafe', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 2, background: '#1e3a8a', transition: 'width 0.3s', width: `${u.progress}%` }} /></div>{u.progress >= 100 && <CheckCircle2 style={{ width: 14, height: 14, color: '#059669', flexShrink: 0, animation: 'svPop 0.3s ease-out' }} />}</div>))}</div>}
                    {(subfolders.length > 0 || docsInFolder.length > 0) && <DragDropZone onFiles={processFiles} disabled={uploading || uploadingFolders} />}
                    <div style={{ paddingTop: 8, borderTop: '1px solid #f1f5f9' }}><p style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center' }}>GST · ITR · Bank Statements · Tally · MCA · Compliance</p></div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3">
                <div className="sv-card-static">
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div className="flex items-center gap-2.5"><div className="sv-icon-circle-light" style={{ width: 32, height: 32 }}><BarChart3 style={{ width: 16, height: 16, color: '#1e3a8a' }} /></div><h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Analysis & reports</h3></div><span style={{ fontSize: 11, color: '#94a3b8' }}>Forensic · CIM · Teaser</span></div>
                  <div style={{ padding: 20 }}>
                    <Tabs defaultValue="audit" className="space-y-4">
                      <TabsList style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 3 }}><TabsTrigger value="audit" style={{ borderRadius: 10, fontSize: 12, fontWeight: 600 }}><Shield className="w-3.5 h-3.5 mr-1.5" />Audit</TabsTrigger><TabsTrigger value="cim" style={{ borderRadius: 10, fontSize: 12, fontWeight: 600 }}><FileText className="w-3.5 h-3.5 mr-1.5" />CIM</TabsTrigger><TabsTrigger value="teaser" style={{ borderRadius: 10, fontSize: 12, fontWeight: 600 }}><Zap className="w-3.5 h-3.5 mr-1.5" />Teaser</TabsTrigger></TabsList>

                      <TabsContent value="audit" className="space-y-4 mt-0"><div className="space-y-5">
                        <div className="sv-info-box"><div className="sv-icon-circle-light"><Shield style={{ width: 20, height: 20, color: '#1e3a8a' }} /></div><div><h4 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Forensic document audit</h4><p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>Evidence-cited forensic audit across all documents. Red flags backed by extracted text.</p></div></div>
                        {auditError && <div className="sv-error-box"><AlertTriangle style={{ width: 16, height: 16, color: '#dc2626', flexShrink: 0 }} /><p style={{ fontSize: 13, color: '#dc2626' }}>{auditError}</p></div>}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={startAudit} disabled={auditIsRunning || documents.length === 0 || auditJob?.status === 'running' || auditJob?.status === 'queued'} className="sv-btn-navy">{(auditJob?.status === 'running' || auditJob?.status === 'queued') ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />Running...</> : auditJob?.report_markdown ? 'Regenerate' : 'Start audit'}</button>
                          {(auditJob?.status === 'running' || auditJob?.status === 'queued') && <button onClick={stopAudit} className="sv-btn-danger">Stop</button>}
                          <button onClick={downloadReport} disabled={!auditJob?.report_markdown} className="sv-btn-outline"><Download style={{ width: 16, height: 16, color: '#1e3a8a' }} />Download PDF</button>
                        </div>
                        {(auditJob?.status === 'running' || auditJob?.status === 'queued') && <><GamifiedAuditProgress auditJob={auditJob} documents={documents} /><MiniGamesPanel /></>}
                        {auditJob?.report_markdown && <>
                          <GamifiedAuditProgress auditJob={auditJob} documents={documents} />
                          <div ref={reportContentRef} style={{ borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', height: '50vh' }}>
                            <iframe
                              srcDoc={previewHtml}
                              style={{ width: '100%', height: '100%', border: 'none' }}
                              title="Forensic Audit Report Preview"
                            />
                          </div>
                        </>}
                      </div></TabsContent>

                      <TabsContent value="cim" className="space-y-4 mt-0"><div className="space-y-5">
                        <div className="sv-info-box"><div className="sv-icon-circle-light"><FileText style={{ width: 20, height: 20, color: '#1e3a8a' }} /></div><div><h4 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Confidential Information Memorandum</h4><p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>Comprehensive CIM from all documents — ready for deal distribution.</p></div></div>
                        {cimError && <div className="sv-error-box"><AlertTriangle style={{ width: 16, height: 16, color: '#dc2626' }} /><p style={{ fontSize: 13, color: '#dc2626' }}>{cimError}</p></div>}
                        <div className="flex flex-wrap gap-2"><button onClick={startCimGeneration} disabled={cimIsRunning || documents.length === 0} className="sv-btn-navy">{cimIsRunning && <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />}{cimIsRunning ? 'Generating...' : cimReport ? 'Regenerate CIM' : 'Generate CIM'}</button>{cimIsRunning && <button onClick={() => cimAbortRef.current?.abort()} className="sv-btn-danger">Stop</button>}<button onClick={() => cimReport && downloadCimPdf()} disabled={!cimReport} className="sv-btn-outline"><Download style={{ width: 16, height: 16, color: '#1e3a8a' }} />Download CIM</button></div>
                        {cimReport && <ScrollArea className="h-[50vh]" style={{ borderRadius: 16, border: '1px solid #e2e8f0' }}><iframe title="CIM" srcDoc={withWatermark(getFormattedCIM(cimReport), samavedaWatermark)} style={{ width: '100%', minHeight: '50vh', border: 0, background: '#fff', borderRadius: 12 }} sandbox="allow-same-origin" /></ScrollArea>}
                      </div></TabsContent>

                      <TabsContent value="teaser" className="space-y-4 mt-0"><div className="space-y-5">
                        <div className="sv-info-box"><div className="sv-icon-circle-light"><Zap style={{ width: 20, height: 20, color: '#1e3a8a' }} /></div><div><h4 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Investment Teaser</h4><p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>2-page teaser summary — the pre-NDA document for potential buyers.</p></div></div>
                        {teaserError && <div className="sv-error-box"><AlertTriangle style={{ width: 16, height: 16, color: '#dc2626' }} /><p style={{ fontSize: 13, color: '#dc2626' }}>{teaserError}</p></div>}
                        <div className="flex flex-wrap gap-2"><button onClick={startTeaserGeneration} disabled={teaserIsRunning || documents.length === 0} className="sv-btn-navy">{teaserIsRunning && <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />}{teaserIsRunning ? 'Generating...' : teaserReport ? 'Regenerate' : 'Generate Teaser'}</button>{teaserIsRunning && <button onClick={() => teaserAbortRef.current?.abort()} className="sv-btn-danger">Stop</button>}<button onClick={() => teaserReport && downloadTeaserPdf()} disabled={!teaserReport} className="sv-btn-outline"><Download style={{ width: 16, height: 16, color: '#1e3a8a' }} />Download Teaser</button></div>
                        {teaserReport && <ScrollArea className="h-[50vh]" style={{ borderRadius: 16, border: '1px solid #e2e8f0' }}><iframe title="Teaser" srcDoc={withWatermark(getFormattedTeaser(teaserReport), samavedaWatermark)} style={{ width: '100%', minHeight: '50vh', border: 0, background: '#fff', borderRadius: 12 }} sandbox="allow-same-origin" /></ScrollArea>}
                      </div></TabsContent>
                    </Tabs>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-5" style={{ padding: '20px 0', fontSize: 11, color: '#94a3b8' }}><div className="flex items-center gap-1.5"><Lock style={{ width: 12, height: 12 }} />Encrypted</div><div style={{ width: 1, height: 12, background: '#e2e8f0' }} /><div className="flex items-center gap-1.5"><Shield style={{ width: 12, height: 12 }} />Forensic AI</div><div style={{ width: 1, height: 12, background: '#e2e8f0' }} /><div className="flex items-center gap-1.5"><Clock style={{ width: 12, height: 12 }} />Results in minutes</div></div>
          </div>
          </StepTransition>
        )}
      </main>
    </div>
  );
}