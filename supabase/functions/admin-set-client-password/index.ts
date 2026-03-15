// Edge Function: admin-set-client-password
// Admin-only: sets a client user's password to the default temp password.
// Called when assigning a client to a vault so they can log in immediately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CLIENT_TEMP_PASSWORD = "SamavedaCapital#Client1234";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify caller is admin
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return jsonResponse({ error: "Invalid or expired token" }, 401);

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) return jsonResponse({ error: "Forbidden: admin only" }, 403);

  let body: { userId?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const userId = body.userId;
  if (!userId || typeof userId !== "string") {
    return jsonResponse({ error: "userId required" }, 400);
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
    password: CLIENT_TEMP_PASSWORD,
  });

  if (updateErr) {
    console.error("admin-set-client-password:", updateErr.message);
    return jsonResponse({ error: updateErr.message }, 500);
  }

  return jsonResponse({ success: true });
});
