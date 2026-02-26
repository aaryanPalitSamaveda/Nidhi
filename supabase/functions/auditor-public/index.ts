// Edge Function: auditor-public
// Public audit product - no auth required.
// Creates session, vault, handles uploads, runs audit via service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const path = url.pathname;
  let body: any = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch (_) {}
  }

  try {
    // POST .../create-session or POST .../auditor-public with action
    if ((path.endsWith("/create-session") || body?.action === "create-session") && req.method === "POST") {
      const { name, company_name } = body;
      if (!name || !company_name) {
        return jsonResponse({ error: "name and company_name required" }, 400);
      }

      // Get first admin user for created_by
      const { data: adminRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1);
      const adminUserId = adminRows?.[0]?.user_id;
      if (!adminUserId) {
        return jsonResponse({ error: "No admin user found" }, 500);
      }

      // Create vault for this session
      const { data: vault, error: vaultErr } = await supabase
        .from("vaults")
        .insert({
          name: `Auditor: ${company_name} - ${new Date().toISOString().slice(0, 10)}`,
          description: `Public audit session - ${name} (${company_name})`,
          created_by: adminUserId,
        })
        .select("id")
        .single();

      if (vaultErr || !vault) {
        console.error("Vault create error:", vaultErr);
        return jsonResponse({ error: `Failed to create vault: ${vaultErr?.message}` }, 500);
      }

      // Create root folder
      const { data: folder, error: folderErr } = await supabase
        .from("folders")
        .insert({
          vault_id: vault.id,
          name: "Uploads",
          parent_id: null,
          created_by: adminUserId,
        })
        .select("id")
        .single();

      if (folderErr || !folder) {
        await supabase.from("vaults").delete().eq("id", vault.id);
        return jsonResponse({ error: `Failed to create folder: ${folderErr?.message}` }, 500);
      }

      // Create auditor session
      const { data: session, error: sessionErr } = await supabase
        .from("auditor_sessions")
        .insert({
          name: String(name).trim(),
          company_name: String(company_name).trim(),
          vault_id: vault.id,
        })
        .select("id, vault_id, name, company_name, created_at")
        .single();

      if (sessionErr || !session) {
        await supabase.from("folders").delete().eq("id", folder.id);
        await supabase.from("vaults").delete().eq("id", vault.id);
        return jsonResponse({ error: `Failed to create session: ${sessionErr?.message}` }, 500);
      }

      return jsonResponse({
        sessionId: session.id,
        vaultId: vault.id,
        folderId: folder.id,
        name: session.name,
        company_name: session.company_name,
        created_at: session.created_at,
      });
    }

    // POST .../create-folder
    if ((path.endsWith("/create-folder") || body?.action === "create-folder") && req.method === "POST") {
      const { sessionId, folderName, parentFolderId } = body;
      if (!sessionId || !folderName) {
        return jsonResponse({ error: "sessionId and folderName required" }, 400);
      }

      const { data: session } = await supabase
        .from("auditor_sessions")
        .select("vault_id")
        .eq("id", sessionId)
        .single();

      if (!session?.vault_id) {
        return jsonResponse({ error: "Session not found" }, 404);
      }

      const { data: adminRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1);
      const adminUserId = adminRows?.[0]?.user_id;
      if (!adminUserId) {
        return jsonResponse({ error: "No admin user" }, 500);
      }

      let parentId: string | null = parentFolderId ?? null;
      if (parentId === "root" || parentId === "") parentId = null;

      if (parentId === null) {
        const { data: rootFolder } = await supabase
          .from("folders")
          .select("id")
          .eq("vault_id", session.vault_id)
          .eq("parent_id", null)
          .limit(1)
          .single();
        parentId = rootFolder?.id ?? null;
      }

      const { data: folder, error: folderErr } = await supabase
        .from("folders")
        .insert({
          vault_id: session.vault_id,
          parent_id: parentId,
          name: String(folderName).trim(),
          created_by: adminUserId,
        })
        .select("id, name, parent_id")
        .single();

      if (folderErr || !folder) {
        return jsonResponse({ error: `Create folder failed: ${folderErr?.message}` }, 500);
      }
      return jsonResponse({ folderId: folder.id, name: folder.name, parent_id: folder.parent_id });
    }

    // POST .../upload-url or action upload-url
    if ((path.endsWith("/upload-url") || body?.action === "upload-url") && req.method === "POST") {
      const { sessionId, fileName, fileType, fileSize, folderId } = body;
      if (!sessionId || !fileName) {
        return jsonResponse({ error: "sessionId and fileName required" }, 400);
      }

      const { data: session } = await supabase
        .from("auditor_sessions")
        .select("vault_id")
        .eq("id", sessionId)
        .single();

      if (!session?.vault_id) {
        return jsonResponse({ error: "Session not found" }, 404);
      }

      let targetFolderId: string | null = folderId ?? null;
      if (targetFolderId === "root" || targetFolderId === "") targetFolderId = null;

      if (!targetFolderId) {
        const { data: rootFolder } = await supabase
          .from("folders")
          .select("id")
          .eq("vault_id", session.vault_id)
          .eq("parent_id", null)
          .limit(1)
          .single();
        targetFolderId = rootFolder?.id ?? null;
      }

      if (!targetFolderId) {
        return jsonResponse({ error: "Folder not found" }, 500);
      }

      const folder = { id: targetFolderId };

      const { data: adminRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1);
      const adminUserId = adminRows?.[0]?.user_id;
      if (!adminUserId) {
        return jsonResponse({ error: "No admin user" }, 500);
      }

      const fileExt = (fileName as string).split(".").pop() || "bin";
      const storagePath = `${session.vault_id}/${folder.id}/${Date.now()}_${Math.random().toString(36).slice(2)}_${fileName}`;

      const { data: signedUrl, error: signErr } = await supabase.storage
        .from("documents")
        .createSignedUploadUrl(storagePath, { upsert: false });

      if (signErr) {
        return jsonResponse({ error: `Upload URL failed: ${signErr.message}` }, 500);
      }

      // Create document record (will be updated after upload completes)
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          vault_id: session.vault_id,
          folder_id: folder.id,
          name: fileName,
          file_path: storagePath,
          file_size: fileSize || null,
          file_type: fileType || null,
          uploaded_by: adminUserId,
        })
        .select("id")
        .single();

      if (docErr) {
        return jsonResponse({ error: `Document create failed: ${docErr.message}` }, 500);
      }

      return jsonResponse({
        uploadUrl: signedUrl.signedUrl,
        token: signedUrl.token,
        path: storagePath,
        documentId: doc.id,
      });
    }

    // POST .../confirm-upload
    if (path.endsWith("/confirm-upload") && req.method === "POST") {
      const { documentId } = body;
      if (!documentId) return jsonResponse({ error: "documentId required" }, 400);
      return jsonResponse({ success: true });
    }

    // POST .../start-audit or action start-audit
    if ((path.endsWith("/start-audit") || body?.action === "start-audit") && req.method === "POST") {
      const { sessionId } = body;
      if (!sessionId) return jsonResponse({ error: "sessionId required" }, 400);

      const { data: session } = await supabase
        .from("auditor_sessions")
        .select("vault_id")
        .eq("id", sessionId)
        .single();

      if (!session?.vault_id) {
        return jsonResponse({ error: "Session not found" }, 404);
      }

      const { data: adminRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1);
      const adminUserId = adminRows?.[0]?.user_id;
      if (!adminUserId) {
        return jsonResponse({ error: "No admin user" }, 500);
      }

      // Create audit job
      const { data: job, error: jobErr } = await supabase
        .from("audit_jobs")
        .insert({
          vault_id: session.vault_id,
          created_by: adminUserId,
          status: "queued",
          progress: 0,
          total_files: 0,
          processed_files: 0,
          current_step: "Queued",
        })
        .select("*")
        .single();

      if (jobErr || !job) {
        return jsonResponse({ error: `Audit start failed: ${jobErr?.message}` }, 500);
      }

      // Snapshot documents
      const { data: docs } = await supabase
        .from("documents")
        .select("id, name, file_path, file_type, file_size, folder_id, vault_id")
        .eq("vault_id", session.vault_id);

      const files = (docs ?? []).map((d: any) => ({
        job_id: job.id,
        document_id: d.id,
        vault_id: d.vault_id,
        folder_id: d.folder_id,
        file_path: d.file_path,
        file_name: d.name,
        file_type: d.file_type,
        file_size: d.file_size,
        status: "pending",
      }));

      if (files.length > 0) {
        await supabase.from("audit_job_files").insert(files);
      }

      await supabase
        .from("audit_jobs")
        .update({
          total_files: files.length,
          current_step: files.length === 0 ? "No documents to audit" : "Ready to run",
        })
        .eq("id", job.id);

      return jsonResponse({ jobId: job.id, totalFiles: files.length });
    }

    // POST .../cancel-audit or action cancel-audit
    if ((path.endsWith("/cancel-audit") || body?.action === "cancel-audit") && req.method === "POST") {
      const { jobId } = body;
      if (!jobId) return jsonResponse({ error: "jobId required" }, 400);

      const fnUrl = `${supabaseUrl}/functions/v1/audit-vault`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ action: "cancel", jobId }),
      });

      const data = await res.json().catch(() => ({}));
      return jsonResponse(data, res.status);
    }

    // POST .../run-audit-batch or action run-audit-batch
    if ((path.endsWith("/run-audit-batch") || body?.action === "run-audit-batch") && req.method === "POST") {
      const { jobId } = body;
      if (!jobId) return jsonResponse({ error: "jobId required" }, 400);

      const fnUrl = `${supabaseUrl}/functions/v1/audit-vault`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ action: "run", jobId, maxFiles: 5 }),
      });

      const data = await res.json().catch(() => ({}));
      return jsonResponse(data, res.status);
    }

    // GET .../status?sessionId=xxx or POST with action status
    const statusSessionId = url.searchParams.get("sessionId") ?? body?.sessionId;
    if ((path.endsWith("/status") || url.searchParams.has("sessionId") || body?.action === "status") && (req.method === "GET" || req.method === "POST")) {
      const sessionId = statusSessionId;
      if (!sessionId) return jsonResponse({ error: "sessionId required" }, 400);

      const { data: session } = await supabase
        .from("auditor_sessions")
        .select("id, name, company_name, vault_id, created_at")
        .eq("id", sessionId)
        .single();

      if (!session) {
        return jsonResponse({ error: "Session not found" }, 404);
      }

      const { data: docs } = await supabase
        .from("documents")
        .select("id, name, file_path, file_size, file_type, folder_id")
        .eq("vault_id", session.vault_id);

      const { data: folders } = await supabase
        .from("folders")
        .select("id, name, parent_id")
        .eq("vault_id", session.vault_id);

      const { data: latestJob } = await supabase
        .from("audit_jobs")
        .select("*")
        .eq("vault_id", session.vault_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return jsonResponse({
        session: { id: session.id, name: session.name, company_name: session.company_name, created_at: session.created_at },
        documents: docs ?? [],
        folders: folders ?? [],
        auditJob: latestJob,
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (e: any) {
    console.error("auditor-public error:", e);
    return jsonResponse({ error: e?.message || "Internal error" }, 500);
  }
});
