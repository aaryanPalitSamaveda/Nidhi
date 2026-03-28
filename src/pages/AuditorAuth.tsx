import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { signIn, signUp, resetPasswordForEmail } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Lock, Mail, User, FileText, Search, Zap, Eye, EyeOff, ArrowLeft, CheckCircle2, BarChart3, ArrowRight } from 'lucide-react';
import logo from '@/assets/samaveda-logo.jpeg';

/* ── Schemas ── */
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ['confirmPassword'] });

type LoginData = z.infer<typeof loginSchema>;
type SignupData = z.infer<typeof signupSchema>;

/* ── Styles ── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
.aa-root{font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;margin:0;padding:0}
.aa-root *,.aa-root *::before,.aa-root *::after{box-sizing:border-box;margin:0;padding:0}

@keyframes aa-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes aa-fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes aa-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes aa-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes aa-orb1{0%{transform:translate(0,0)}33%{transform:translate(30px,-40px)}66%{transform:translate(-20px,20px)}100%{transform:translate(0,0)}}
@keyframes aa-orb2{0%{transform:translate(0,0)}33%{transform:translate(-40px,30px)}66%{transform:translate(20px,-20px)}100%{transform:translate(0,0)}}
@keyframes aa-gridPulse{0%,100%{opacity:0.03}50%{opacity:0.07}}
@keyframes aa-slideIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}

.aa-input{
  width:100%;height:48px;padding:0 16px 0 42px;border-radius:12px;
  border:1.5px solid #e2e8f0;background:#fafbfd;font-size:14px;font-weight:500;
  color:#0f172a;outline:none;transition:all 0.2s ease;
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;
}
.aa-input::placeholder{color:#b0b8c9;font-weight:400}
.aa-input:focus{border-color:#3b82f6;background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,0.08)}
.aa-input.err{border-color:#f87171}
.aa-input.err:focus{box-shadow:0 0 0 3px rgba(248,113,113,0.08)}
.aa-input-pw{padding-right:44px}

.aa-btn{
  width:100%;height:48px;border-radius:12px;border:none;cursor:pointer;
  font-size:14px;font-weight:600;color:#fff;position:relative;overflow:hidden;
  background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);
  box-shadow:0 4px 14px rgba(30,58,138,0.2),inset 0 1px 0 rgba(255,255,255,0.1);
  transition:all 0.25s ease;display:flex;align-items:center;justify-content:center;gap:8px;
  font-family:'Plus Jakarta Sans',system-ui,sans-serif;
}
.aa-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(30,58,138,0.28)}
.aa-btn:active:not(:disabled){transform:translateY(0)}
.aa-btn:disabled{opacity:0.55;cursor:not-allowed;transform:none}
.aa-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent 30%,rgba(255,255,255,0.06) 50%,transparent 70%);background-size:200% 100%;animation:aa-shimmer 3s ease-in-out infinite}

.aa-link{background:none;border:none;cursor:pointer;font-size:13px;font-weight:500;color:#64748b;transition:color 0.2s;font-family:inherit;padding:0}
.aa-link:hover{color:#1e3a8a}

/* Desktop: left panel visible, mobile stuff hidden */
.aa-left{display:none}
.aa-mob{display:flex}
@media(min-width:1024px){
  .aa-left{display:flex!important;flex-direction:column;justify-content:center;align-items:center}
  .aa-mob{display:none!important}
}
`;

const FEATURES = [
  { icon: Search, label: 'Cross-verification', desc: 'GST × ITR × Bank × Tally' },
  { icon: Shield, label: 'Forensic-grade AI', desc: '20+ years CA expertise' },
  { icon: Zap, label: 'Minutes, not months', desc: '10× faster than Big 4' },
  { icon: BarChart3, label: 'CIM & Teaser', desc: 'Deal-ready documents' },
];

const STATS = [
  { value: '6', label: 'Doc types' },
  { value: '5+', label: 'Cross-checks' },
  { value: '<15m', label: 'Audit time' },
];

/* ═══════════════════════════ COMPONENT ═══════════════════════════ */

export default function AuditorAuth() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading } = useAuth();

  const loginForm = useForm<LoginData>({ resolver: zodResolver(loginSchema) });
  const signupForm = useForm<SignupData>({ resolver: zodResolver(signupSchema) });
  const forgotForm = useForm<{ email: string }>({ resolver: zodResolver(loginSchema.pick({ email: true })) });

  useEffect(() => { const id = 'aa-css'; if (!document.getElementById(id)) { const s = document.createElement('style'); s.id = id; s.textContent = CSS; document.head.appendChild(s); } }, []);
  useEffect(() => { if (!loading && user) navigate('/auditor'); }, [user, loading, navigate]);

  const sw = (to: 'login' | 'signup' | 'forgot') => { setMode(to); loginForm.reset(); signupForm.reset(); forgotForm.reset(); };

  const handleLogin = async (data: LoginData) => {
    setIsLoading(true);
    try {
      const { error, data: ad } = await signIn(data.email, data.password);
      if (error) { setIsLoading(false); let m = error.message || 'Invalid credentials.'; if (m.includes('not confirmed')) m = 'Email not confirmed. Check your inbox.'; else if (m.includes('Invalid login') || m.includes('invalid_credentials')) m = 'Invalid email or password.'; toast({ title: 'Login failed', description: m, variant: 'destructive' }); return; }
      if (!ad?.user) { setIsLoading(false); toast({ title: 'Login failed', description: 'User data missing.', variant: 'destructive' }); return; }
      setTimeout(() => { setIsLoading(false); navigate('/auditor'); }, 500);
    } catch (e: any) { setIsLoading(false); toast({ title: 'Login failed', description: e?.message || 'An error occurred.', variant: 'destructive' }); }
  };

  const handleSignup = async (data: SignupData) => {
    setIsLoading(true);
    const { error, data: sd } = await signUp(data.email, data.password, data.fullName);
    if (error) { setIsLoading(false); toast({ title: 'Signup failed', description: error.message.includes('already registered') ? 'Account exists. Sign in instead.' : error.message, variant: 'destructive' }); return; }
    if (sd?.user) { setTimeout(async () => { const { error: e2 } = await signIn(data.email, data.password); setIsLoading(false); if (e2) { toast({ title: 'Account created', description: 'Please sign in.' }); sw('login'); } else { toast({ title: 'Welcome!' }); navigate('/auditor'); } }, 2000); }
    else { setIsLoading(false); toast({ title: 'Account created' }); sw('login'); }
  };

  const handleForgot = async (data: { email: string }) => {
    setIsLoading(true); const { error } = await resetPasswordForEmail(data.email); setIsLoading(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Check your email', description: 'Reset link sent if account exists.' }); sw('login');
  };

  if (loading) return <div className="aa-root" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb' }}><div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'aa-spin 0.7s linear infinite' }} /></div>;

  const ic = (e?: string) => `aa-input${e ? ' err' : ''}`;

  return (
    <div className="aa-root" style={{ height: '100vh', overflow: 'hidden', display: 'flex', background: '#f8f9fb' }}>

      {/* ═══ LEFT PANEL ═══ */}
      <div className="aa-left" style={{ width: '46%', position: 'relative', overflow: 'hidden', padding: '48px 40px', background: '#0a1628' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', animation: 'aa-gridPulse 6s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '15%', left: '20%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 70%)', filter: 'blur(60px)', animation: 'aa-orb1 12s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', filter: 'blur(50px)', animation: 'aa-orb2 10s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #2563eb, #818cf8, #2563eb, transparent)', backgroundSize: '200% 100%', animation: 'aa-shimmer 3s linear infinite' }} />

        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', maxWidth: 360, width: '100%', margin: '0 auto' }}>
          <div style={{ animation: 'aa-float 4s ease-in-out infinite', marginBottom: 32 }}>
            <div style={{ width: 88, height: 88, borderRadius: 22, overflow: 'hidden', margin: '0 auto', boxShadow: '0 16px 48px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <img src={logo} alt="Samaveda Capital" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 6 }}>Audit Agent</h1>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(148,163,184,0.5)', textTransform: 'uppercase', letterSpacing: '0.25em', marginBottom: 40 }}>by Samaveda Capital</p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginBottom: 40 }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ textAlign: 'center', animation: `aa-fadeUp 0.5s ease-out ${i * 80}ms both` }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(148,163,184,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FEATURES.map((f, i) => { const I = f.icon; return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', animation: `aa-fadeUp 0.5s ease-out ${200 + i * 80}ms both`, transition: 'background 0.3s, border-color 0.3s, transform 0.3s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.15)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'translateX(0)'; }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(99,102,241,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <I style={{ width: 16, height: 16, color: '#60a5fa' }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginTop: 1 }}>{f.desc}</div>
                </div>
              </div>
            ); })}
          </div>

          <div style={{ marginTop: 40, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Lock style={{ width: 11, height: 11, color: 'rgba(148,163,184,0.35)' }} />
            <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(148,163,184,0.35)' }}>End-to-end encrypted · SOC 2 compliant</span>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.015) 1px, transparent 0)', backgroundSize: '28px 28px' }} />

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
          {/* Mobile-only logo */}
          <div className="aa-mob" style={{ flexDirection: 'column', alignItems: 'center', marginBottom: 24, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, overflow: 'hidden', marginBottom: 12, boxShadow: '0 4px 16px rgba(30,58,138,0.1)' }}>
              <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>Audit Agent</h1>
            <p style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 2 }}>by Samaveda Capital</p>
          </div>

          {/* Card */}
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 32px rgba(30,58,138,0.05)', border: '1px solid #edf0f4', overflow: 'hidden', animation: 'aa-fadeUp 0.5s ease-out' }}>
            <div style={{ height: 2, background: 'linear-gradient(90deg, #1e3a8a, #3b82f6, #818cf8, #3b82f6, #1e3a8a)', backgroundSize: '200% 100%', animation: 'aa-shimmer 3s linear infinite' }} />

            <div style={{ padding: '28px 28px 24px' }}>
              {mode === 'forgot' && (
                <button onClick={() => sw('login')} className="aa-link" style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 16, fontSize: 12 }}>
                  <ArrowLeft style={{ width: 13, height: 13 }} />Back to sign in
                </button>
              )}

              <div key={mode} style={{ marginBottom: 24, animation: 'aa-slideIn 0.3s ease-out' }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', marginBottom: 4, lineHeight: 1.2 }}>
                  {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
                </h2>
                <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                  {mode === 'login' ? 'Sign in to your audit workspace' : mode === 'signup' ? 'Start auditing with AI' : "We'll send a reset link"}
                </p>
              </div>

              {/* LOGIN */}
              {mode === 'login' && (
                <form onSubmit={loginForm.handleSubmit(handleLogin)} style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'aa-slideIn 0.3s ease-out' }}>
                  <Field label="Email" icon={Mail} type="email" placeholder="you@company.com" error={loginForm.formState.errors.email?.message} register={loginForm.register('email')} ic={ic} />
                  <PwField label="Password" id="l-pw" error={loginForm.formState.errors.password?.message} register={loginForm.register('password')} ic={ic} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
                    <button type="button" onClick={() => sw('forgot')} className="aa-link" style={{ fontSize: 12 }}>Forgot password?</button>
                  </div>
                  <button type="submit" disabled={isLoading} className="aa-btn">
                    {isLoading ? <Spinner /> : <><span>Sign in</span><ArrowRight style={{ width: 15, height: 15 }} /></>}
                  </button>
                </form>
              )}

              {/* SIGNUP */}
              {mode === 'signup' && (
                <form onSubmit={signupForm.handleSubmit(handleSignup)} style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'aa-slideIn 0.3s ease-out' }}>
                  <Field label="Full name" icon={User} placeholder="John Doe" error={signupForm.formState.errors.fullName?.message} register={signupForm.register('fullName')} ic={ic} />
                  <Field label="Email" icon={Mail} type="email" placeholder="you@company.com" error={signupForm.formState.errors.email?.message} register={signupForm.register('email')} ic={ic} />
                  <PwField label="Password" id="s-pw" error={signupForm.formState.errors.password?.message} register={signupForm.register('password')} ic={ic} />
                  <PwField label="Confirm password" id="s-cpw" error={signupForm.formState.errors.confirmPassword?.message} register={signupForm.register('confirmPassword')} ic={ic} />
                  <button type="submit" disabled={isLoading} className="aa-btn" style={{ marginTop: 2 }}>
                    {isLoading ? <Spinner /> : <><span>Create account</span><ArrowRight style={{ width: 15, height: 15 }} /></>}
                  </button>
                </form>
              )}

              {/* FORGOT */}
              {mode === 'forgot' && (
                <form onSubmit={forgotForm.handleSubmit(handleForgot)} style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'aa-slideIn 0.3s ease-out' }}>
                  <Field label="Email" icon={Mail} type="email" placeholder="you@company.com" error={forgotForm.formState.errors.email?.message} register={forgotForm.register('email')} ic={ic} />
                  <button type="submit" disabled={isLoading} className="aa-btn">
                    {isLoading ? <Spinner /> : 'Send reset link'}
                  </button>
                </form>
              )}

              {mode !== 'forgot' && (
                <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#94a3b8' }}>
                  {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  <button type="button" onClick={() => sw(mode === 'login' ? 'signup' : 'login')} className="aa-link" style={{ color: '#2563eb', fontWeight: 600, fontSize: 13 }}>
                    {mode === 'login' ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              )}
            </div>

            <div style={{ padding: '12px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              {[{ i: Lock, t: 'Encrypted' }, { i: Shield, t: 'Private' }, { i: CheckCircle2, t: 'Secure' }].map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {i > 0 && <div style={{ width: 1, height: 10, background: '#e8ecf2', marginRight: 10 }} />}
                  <b.i style={{ width: 11, height: 11, color: '#cbd5e1' }} />
                  <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 500 }}>{b.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable sub-components ── */

function Field({ label, icon: Icon, type = 'text', placeholder, error, register, ic }: { label: string; icon: any; type?: string; placeholder: string; error?: string; register: any; ic: (e?: string) => string }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <Icon style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#b0b8c9', zIndex: 2 }} />
        <input className={ic(error)} type={type} placeholder={placeholder} {...register} />
      </div>
      {error && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: 500 }}>{error}</p>}
    </div>
  );
}

function PwField({ label, id, error, register, ic }: { label: string; id: string; error?: string; register: any; ic: (e?: string) => string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <Lock style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#b0b8c9', zIndex: 2 }} />
        <input id={id} className={`${ic(error)} aa-input-pw`} type={show ? 'text' : 'password'} placeholder="••••••••" {...register} />
        <button type="button" onClick={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#b0b8c9', zIndex: 2, display: 'flex', transition: 'color 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#64748b'} onMouseLeave={e => e.currentTarget.style.color = '#b0b8c9'}>
          {show ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
        </button>
      </div>
      {error && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: 500 }}>{error}</p>}
    </div>
  );
}

function Spinner() {
  return <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', borderRadius: '50%', animation: 'aa-spin 0.7s linear infinite' }} />;
}