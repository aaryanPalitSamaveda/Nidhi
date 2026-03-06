/**
 * Audit-vault API: uses fraud backend proxy when VITE_FRAUD_BACKEND_URL is set (avoids 401 from Edge Function).
 * Otherwise calls Supabase Edge Function directly.
 */
import { supabase } from '@/integrations/supabase/client';

const AUDIT_API = import.meta.env.VITE_FRAUD_BACKEND_URL
  ? (import.meta.env.DEV ? '/api/auditor' : `${String(import.meta.env.VITE_FRAUD_BACKEND_URL).replace(/\/$/, '')}/api/auditor`)
  : null;

type AuditAction = 'start' | 'run' | 'status' | 'cancel';
type AuditBody =
  | { action: 'start'; vaultId: string }
  | { action: 'run'; jobId: string; maxFiles?: number }
  | { action: 'status'; jobId: string }
  | { action: 'cancel'; jobId: string };

const ACTION_MAP: Record<AuditAction, string> = {
  start: 'audit-start',
  run: 'audit-run',
  status: 'audit-status',
  cancel: 'audit-cancel',
};

export async function auditVaultInvoke(body: AuditBody): Promise<Record<string, unknown>> {
  if (AUDIT_API) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error('Session error. Please log in again.');
    if (!session?.access_token) throw new Error('Please log in to run the audit.');
    let token = session.access_token;
    try {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession({ refresh_token: session.refresh_token ?? '' });
      if (refreshed?.access_token) token = refreshed.access_token;
    } catch {
      // Use existing token if refresh fails
    }
    const backendAction = ACTION_MAP[body.action];
    const backendBody =
      body.action === 'start'
        ? { action: backendAction, vaultId: body.vaultId }
        : { action: backendAction, jobId: body.jobId, maxFiles: body.maxFiles };
    const controller = new AbortController();
    const timeoutMs = body.action === 'run' ? 8 * 60 * 1000 : 30 * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(AUDIT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(backendBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    const data = await res!.json().catch(() => ({}));
    if (!res.ok) {
      const err = (data as { error?: string }).error;
      if (res.status === 546) {
        throw new Error('Audit hit a time limit. Progress was saved — click Resume to continue.');
      }
      throw new Error(err || `Request failed: ${res.status}`);
    }
    return data as Record<string, unknown>;
  }
  const { data, error } = await supabase.functions.invoke('audit-vault', { body });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}
