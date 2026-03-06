/**
 * Polls active audit jobs in the background so audits continue when user navigates away.
 * Reads from localStorage (set when user starts/resumes audit in VaultDetail).
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auditVaultInvoke } from '@/services/auditVaultApi';

const POLL_INTERVAL_MS = 5000;
const STORAGE_PREFIX = 'nidhi:auditBackground:';

function getActiveJobs(): Array<{ vaultId: string; jobId: string }> {
  const jobs: Array<{ vaultId: string; jobId: string }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const vaultId = key.slice(STORAGE_PREFIX.length);
        const jobId = localStorage.getItem(key);
        if (vaultId && jobId) jobs.push({ vaultId, jobId });
      }
    }
  } catch {
    // ignore
  }
  return jobs;
}

function removeJob(vaultId: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${vaultId}`);
  } catch {
    // ignore
  }
}

export function AuditBackgroundPoller() {
  const { user } = useAuth();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      const jobs = getActiveJobs();
      if (jobs.length === 0) return;
      if (runningRef.current) return;

      for (const { vaultId, jobId } of jobs) {
        runningRef.current = true;
        try {
          const data = await auditVaultInvoke({ action: 'run', jobId, maxFiles: 2 });
          const job = data?.job as { status?: string } | undefined;
          const status = job?.status ?? '';
          if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            removeJob(vaultId);
          }
        } catch {
          // Continue polling on error (e.g. 546, timeout)
        } finally {
          runningRef.current = false;
        }
      }
    };

    const id = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => clearInterval(id);
  }, [user]);

  return null;
}

export function setAuditBackgroundActive(vaultId: string, jobId: string) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${vaultId}`, jobId);
  } catch {
    // ignore
  }
}

export function clearAuditBackgroundActive(vaultId: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${vaultId}`);
  } catch {
    // ignore
  }
}
