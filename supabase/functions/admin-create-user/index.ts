// Edge Function: admin-create-user
// Admin-only: creates users via Admin API with email_confirm: true.
// Bypasses Supabase email rate limit (no confirmation email sent).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CLIENT_TEMP_PASSWORD = "SamavedaCapital#Client1234";
const ADMIN_PASSWORD = "SamavedaCapital1!";

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
  const { data: { user: caller }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !caller) return jsonResponse({ error: "Invalid or expired token" }, 401);

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);
  const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) return jsonResponse({ error: "Forbidden: admin only" }, 403);

  let body: {
    email?: string;
    password?: string;
    fullName?: string;
    companyName?: string;
    phone?: string;
    role?: "admin" | "seller" | "investor";
  } = {};
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { email, password, fullName, companyName, phone, role = "investor" } = body;
  if (!email || typeof email !== "string" || !email.trim()) {
    return jsonResponse({ error: "email required" }, 400);
  }

  const isSamavedaAdmin = /@samavedacapital\.com$/i.test(email.trim());
  const passwordToUse =
    role === "admin" && isSamavedaAdmin
      ? ADMIN_PASSWORD
      : role === "investor"
        ? CLIENT_TEMP_PASSWORD
        : (password || CLIENT_TEMP_PASSWORD);
  if (role !== "investor" && !isSamavedaAdmin && (!password || password.length < 6)) {
    return jsonResponse({ error: "password required (min 6 chars) for admin/seller" }, 400);
  }

  // Create user via Admin API - email_confirm: true = NO email sent (bypasses rate limit)
  const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password: passwordToUse,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || null,
    },
  });

  if (createErr) {
    console.error("admin-create-user:", createErr.message);
    return jsonResponse({ error: createErr.message }, 400);
  }

  const userId = newUser.user?.id;
  if (!userId) return jsonResponse({ error: "User creation failed" }, 500);

  // Ensure profile exists and update with extra fields
  await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        email: email.trim(),
        full_name: fullName || null,
        company_name: companyName || null,
        phone: phone || null,
      },
      { onConflict: "id" }
    );

  // Assign role
  await supabase.from("user_roles").delete().eq("user_id", userId);
  await supabase.from("user_roles").insert({ user_id: userId, role });

  return jsonResponse({
    success: true,
    userId,
    email: email.trim(),
    password: passwordToUse,
    role,
  });
});
