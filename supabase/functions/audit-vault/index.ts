// Supabase Edge Function: audit-vault
// - Admin-only
// - Resumable job runner (processes N files per invocation to avoid timeouts)
//
// Expected env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - SUPABASE_ANON_KEY (for token validation)
// - OPENAI_API_KEY
// Optional:
// - OPENAI_BASE_URL (default https://api.openai.com)
// - OPENAI_MODEL_TEXT (default gpt-4o-mini)
// - OPENAI_MODEL_VISION (default gpt-4o-mini)
// - FRAUD_BACKEND_URL (for forensic analysis merge, e.g. https://your-backend.com)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

// Helper to decode base64url (JWT uses base64url, not base64)
function base64UrlDecode(str: string): string {
  try {
    // Replace URL-safe characters
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (str.length % 4) {
      str += '=';
    }
    // Decode base64 - try atob first (available in Deno), fallback to manual decode
    if (typeof atob !== 'undefined') {
      return atob(str);
    }
    // Fallback: manual base64 decode using TextDecoder
    const binaryString = str.replace(/[^A-Za-z0-9+/=]/g, '');
    const bytes = new Uint8Array(Math.ceil(binaryString.length * 3 / 4));
    let j = 0;
    for (let i = 0; i < binaryString.length; i += 4) {
      const enc1 = binaryString.charCodeAt(i);
      const enc2 = binaryString.charCodeAt(i + 1);
      const enc3 = binaryString.charCodeAt(i + 2);
      const enc4 = binaryString.charCodeAt(i + 3);
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      bytes[j++] = chr1;
      if (enc3 !== 64) bytes[j++] = chr2;
      if (enc4 !== 64) bytes[j++] = chr3;
    }
    return new TextDecoder().decode(bytes.slice(0, j));
  } catch (e) {
    throw new Error(`Base64URL decode failed: ${(e as any)?.message}`);
  }
}

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Action = "start" | "run" | "status";

type StartBody = {
  action: "start";
  vaultId: string;
};

type RunBody = {
  action: "run";
  jobId: string;
  maxFiles?: number;
};

type StatusBody = {
  action: "status";
  jobId: string;
};

type CancelBody = {
  action: "cancel";
  jobId: string;
};

type Body = StartBody | RunBody | StatusBody | CancelBody;

// CORS: required when calling Edge Functions from the browser via supabase-js
const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function safeJsonParse(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function asObjectJson(input: unknown): any {
  if (!input) return null;
  if (typeof input === "string") return safeJsonParse(input);
  if (typeof input === "object") return input;
  return null;
}

async function readRequestBody(req: Request): Promise<Body | null> {
  const text = await req.text();
  if (!text) return null;
  return safeJsonParse(text) as Body | null;
}

function inferExt(fileName: string, filePath: string): string {
  const name = (fileName || filePath || "").toLowerCase();
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1) : "";
}

async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

function concatU8(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

function clampText(text: string, maxChars: number): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[TRUNCATED]";
}

function sanitizeForensicText(text: string): string {
  return (text || "")
    .replace(/FRAUD_RISK_SCORE/gi, "FORENSIC_RISK_SCORE")
    .replace(/fraud/gi, "forensic")
    .replace(/^[=]{5,}\s*$/gm, "")
    .replace(/non-hallucination policy.*$/gmi, "")
    // Remove emojis/unicode symbols for a clean, professional report
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    // Remove bold wrappers around all-caps headings (keeps normal text bold)
    .replace(/^\*\*\s*([A-Z0-9][A-Z0-9\s:#\-]{6,})\s*\*\*$/gm, "$1")
    .replace(/^\*\*\s*(RED FLAG[^*]+)\s*\*\*$/gmi, "$1");
}

function formatForensicAnalysisMarkdown(args: {
  vaultName: string;
  analysis: string;
  riskScore?: number;
  filesAnalyzed?: number;
}): string {
  const { vaultName, analysis, riskScore, filesAnalyzed } = args;
  const safeAnalysis = sanitizeForensicText(analysis);
  const scoreLine = typeof riskScore === "number" ? `${riskScore}/100` : "N/A";
  const fileLine = typeof filesAnalyzed === "number" ? String(filesAnalyzed) : "N/A";

  return [
    "## Forensic Audit Report",
    "",
    `**Dataroom:** ${vaultName}`,
    `**Files Analyzed:** ${fileLine}`,
    "",
    "### Forensic Risk Assessment",
    "",
    `**Forensic Risk Score:** ${scoreLine}`,
    "",
    "### Detailed Forensic Analysis",
    "",
    safeAnalysis.trim() || "No forensic analysis returned.",
  ].join("\n");
}

async function runForensicBackendAnalysis(args: {
  url: string;
  extractedData: Array<{ fileName: string; fileType: string; extracted: string }>;
}): Promise<{ analysis?: string; riskScore?: number; filesAnalyzed?: number } | null> {
  const { url, extractedData } = args;
  if (!url || extractedData.length === 0) return null;

  const res = await fetch(`${url.replace(/\/$/, "")}/api/forensic-audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ extractedData }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Forensic backend error: ${res.status} ${res.statusText} ${txt}`.slice(0, 600));
  }

  const json = await res.json();
  return {
    analysis: typeof json?.analysis === "string" ? json.analysis : "",
    riskScore: typeof json?.riskScore === "number" ? json.riskScore : undefined,
    filesAnalyzed: typeof json?.filesAnalyzed === "number" ? json.filesAnalyzed : undefined,
  };
}

function normalizeQuote(q: string): string {
  return (q ?? "").replaceAll("\r\n", "\n").trim();
}

function validateCitedJson(input: any, snippets: Array<{ id: string; text: string }>) {
  const snippetMap = new Map(snippets.map((s) => [s.id, s.text ?? ""]));

  const isQuoteInSnippet = (snippetId: string, quote: string) => {
    const hay = snippetMap.get(snippetId) ?? "";
    const needle = normalizeQuote(quote);
    if (!needle) return false;
    return hay.includes(needle);
  };

  const sanitizeCitations = (citations: any[]) => {
    const arr = Array.isArray(citations) ? citations : [];
    const cleaned = arr
      .map((c) => ({
        snippet_id: String(c?.snippet_id ?? ""),
        quote: String(c?.quote ?? ""),
      }))
      .filter((c) => c.snippet_id && c.quote && isQuoteInSnippet(c.snippet_id, c.quote));
    return cleaned;
  };

  const facts = Array.isArray(input?.facts) ? input.facts : [];
  const internal = Array.isArray(input?.internal_red_flags) ? input.internal_red_flags : [];

  const cleanedFacts = facts
    .map((f: any) => {
      const citations = sanitizeCitations(f?.citations);
      if (citations.length === 0) return null;
      return {
        key: String(f?.key ?? ""),
        value: String(f?.value ?? ""),
        citations,
      };
    })
    .filter(Boolean);

  const cleanedInternal = internal
    .map((rf: any) => {
      const citations = sanitizeCitations(rf?.citations);
      if (citations.length === 0) return null;
      return {
        title: String(rf?.title ?? ""),
        detail: String(rf?.detail ?? ""),
        citations,
      };
    })
    .filter(Boolean);

  return {
    document_type: String(input?.document_type ?? "unknown"),
    summary: String(input?.summary ?? ""),
    facts: cleanedFacts,
    internal_red_flags: cleanedInternal,
    validation_notes: [
      "Citations were validated against provided evidence snippets; any fact/red-flag without a verifiable quote was dropped.",
    ],
  };
}

async function openaiChatJson(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<any> {
  const { apiKey, baseUrl, model, system, user, temperature = 0, maxTokens = 1200 } = args;
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const errorMsg = `OpenAI error: ${res.status} ${res.statusText} ${txt}`.slice(0, 800);
    console.error("OpenAI API error:", errorMsg);
    
    // Handle rate limiting specifically
    if (res.status === 429) {
      throw new Error("OpenAI rate limit exceeded. Please wait a moment and the audit will retry automatically.");
    }
    
    throw new Error(errorMsg);
  }

  let json;
  try {
    json = await res.json();
  } catch (e: any) {
    const text = await res.text().catch(() => "");
    console.error("Failed to parse OpenAI response as JSON:", text.substring(0, 500));
    throw new Error(`OpenAI returned invalid JSON: ${e?.message || String(e)}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    console.error("OpenAI response structure:", JSON.stringify(json, null, 2).substring(0, 500));
    throw new Error("OpenAI returned empty response");
  }
  
  const parsed = safeJsonParse(content);
  if (!parsed) {
    console.error("Failed to parse OpenAI content as JSON. Content:", content.substring(0, 500));
    // Try to extract error message if it's an error response
    if (content.toLowerCase().includes("error") || content.toLowerCase().includes("rate limit")) {
      throw new Error(`OpenAI API issue: ${content.substring(0, 200)}`);
    }
    throw new Error(`OpenAI returned non-JSON response. Content preview: ${content.substring(0, 200)}`);
  }
  return parsed;
}

async function openaiVisionOcrJson(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  prompt: string;
  imageBytes: Uint8Array;
  mimeType: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<any> {
  const { apiKey, baseUrl, model, system, prompt, imageBytes, mimeType, temperature = 0, maxTokens = 1200 } = args;
  // Avoid call stack limits on large images; use stdlib base64.
  const b64 = encodeBase64(imageBytes);
  const dataUrl = `data:${mimeType};base64,${b64}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI vision error: ${res.status} ${res.statusText} ${txt}`.slice(0, 800));
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI vision returned empty response");
  const parsed = safeJsonParse(content);
  if (!parsed) throw new Error("OpenAI vision returned non-JSON response");
  return parsed;
}

async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  // pdf-parse works in many runtimes via npm + pdfjs; keep text-only extraction.
  const pdfParse = (await import("npm:pdf-parse@1.1.1")).default as any;
  const data = await pdfParse(bytes);
  return data?.text ?? "";
}

async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("npm:mammoth@1.6.0");
  const res = await mammoth.extractRawText({ buffer: bytes });
  return res?.value ?? "";
}

async function extractTextFromXlsx(bytes: Uint8Array): Promise<string> {
  const XLSX = await import("npm:xlsx@0.18.5");
  const wb = XLSX.read(bytes, { type: "array" });
  const out: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    out.push(`=== SHEET: ${sheetName} ===\n${csv}`);
  }
  return out.join("\n\n");
}

async function extractTextGeneric(bytes: Uint8Array): Promise<string> {
  // best-effort UTF-8 decode
  const dec = new TextDecoder("utf-8", { fatal: false });
  return dec.decode(bytes);
}

function forensicSystemPrompt() {
  return [
    "You are a Professional Forensic Chartered Accountant with 50 years of experience in detecting financial fraud, accounting irregularities, and conducting due diligence audits.",
    "",
    "Your expertise includes:",
    "- Detecting revenue manipulation, expense fraud, and asset misstatements",
    "- Identifying circular transactions, related-party manipulations, and timing fraud",
    "- Cross-verifying financial documents across multiple sources",
    "- Understanding accounting standards, tax regulations, and compliance requirements",
    "- Recognizing patterns of financial misconduct and red flags",
    "",
    "CRITICAL RULES:",
    "- DO NOT hallucinate. Only use facts explicitly present in the provided evidence snippets.",
    "- If evidence is insufficient, say so explicitly and do not invent missing data.",
    "- Every extracted fact MUST include at least one citation that quotes the exact supporting text.",
    "- Be conservative: prefer 'unknown' or 'needs_more_evidence' over guesses.",
    "- Question everything that seems unusual, inconsistent, or questionable.",
    "- Be precise: include specific amounts, dates, account numbers, document references.",
    "- Output MUST be valid JSON (no markdown formatting, no code blocks).",
    "- When identifying fraud indicators, be specific about the type of fraud pattern detected.",
  ].join("\n");
}

function perFileExtractionPrompt(input: {
  fileName: string;
  filePath: string;
  fileType: string | null;
  evidenceSnippets: Array<{ id: string; location: string; text: string }>;
}) {
  const { fileName, filePath, fileType, evidenceSnippets } = input;
  return [
    `File: ${fileName}`,
    `Path: ${filePath}`,
    `MIME: ${fileType ?? "unknown"}`,
    "",
    "Evidence snippets (you may ONLY use these):",
    ...evidenceSnippets.map((s) => `--- SNIPPET ${s.id} (${s.location}) ---\n${s.text}`),
    "",
    "Task:",
    "1) Identify what this document appears to be (bank statement, GST return, invoice list, ITR, CIBIL, cap table, balance sheet, P&L, purchase orders, etc.).",
    "",
    "2) Extract COMPREHENSIVE normalized facts useful for cross-document auditing. For each fact, include:",
    "   - Dates (transaction dates, period dates, filing dates, document dates)",
    "   - Financial amounts (revenue, expenses, taxes, balances, transactions)",
    "   - Parties (company names, vendor names, customer names, bank names)",
    "   - Identifiers (account numbers masked as 'ACC-XXXX', GSTIN/PAN masked as 'GSTIN-XXXX'/'PAN-XXXX', invoice numbers, reference numbers)",
    "   - Tax details (GST output tax, input tax credit, TDS, income tax)",
    "   - Account balances (opening, closing, running balances)",
    "   - Transaction types (debits, credits, transfers, payments, receipts)",
    "   - Document metadata (period covered, filing status, document numbers)",
    "   - Key ratios or calculations if present",
    "",
    "3) List any INTERNAL inconsistencies within the same file:",
    "   - Totals not matching individual line items",
    "   - Missing pages indicated by 'Page x of y'",
    "   - Suspicious edits, alterations, or inconsistencies",
    "   - Date sequences that don't make sense",
    "   - Duplicate entries",
    "   - Round-number transactions that seem unusual",
    "   - Missing required fields or incomplete information",
    "",
    "4) Extract facts in a STRUCTURED format that enables cross-verification:",
    "   - Use consistent key names (e.g., 'revenue_2023_q1', 'gst_output_tax_2023', 'bank_balance_as_on_2023_12_31')",
    "   - Include period/date information in fact keys when relevant",
    "   - Extract both summary totals AND individual transaction details",
    "   - Capture all amounts, dates, and identifiers even if they seem redundant",
    "",
    "Output JSON with this shape:",
    "{",
    '  "document_type": string,  // e.g., "bank_statement", "gst_return", "sales_report", "itr", "cibil_report", "balance_sheet", "profit_loss"',
    '  "summary": string,  // Brief summary of document contents and key findings',
    '  "facts": [ {',
    '    "key": string,  // Structured key like "revenue_2023_q1", "gst_output_tax_2023_04", "bank_balance_2023_12_31"',
    '    "value": string,  // The actual value (amount, date, name, etc.)',
    '    "citations": [ { "snippet_id": string, "quote": string } ]  // Exact quotes supporting this fact',
    '  } ],',
    '  "internal_red_flags": [ {',
    '    "title": string,  // Brief title of the inconsistency',
    '    "detail": string,  // Detailed explanation',
    '    "citations": [ { "snippet_id": string, "quote": string } ]  // Exact quotes',
    '  } ]',
    "}",
  ].join("\n");
}

function finalSynthesisPrompt(input: {
  vaultId: string;
  vaultName: string;
  jobId: string;
  fileFacts: Array<{
    file_name: string;
    file_path: string;
    facts_json: any;
  }>;
}) {
  const { vaultId, vaultName, jobId, fileFacts } = input;
  return [
    `Dataroom: ${vaultName}`,
    `Vault ID: ${vaultId}`,
    `Audit Job: ${jobId}`,
    "",
    `You are a Forensic Chartered Accountant with 50 years of experience preparing a comprehensive forensic audit RED-FLAG report for the dataroom "${vaultName}".`,
    "",
    "IMPORTANT: When referring to the company or entity being audited, always use the dataroom name provided above. Do NOT mention any company names, mandate names, or entity names found in the documents. Replace all such references with the dataroom name.",
    "",
    "CRITICAL PRINCIPLES:",
    "1. DO NOT HALLUCINATE. Use ONLY the provided extracted facts and citations. If evidence is insufficient, explicitly state 'Needs more evidence'.",
    "2. QUESTION EVERYTHING that is questionable, unusual, or inconsistent.",
    "3. Be EXACT and PRECISE. Pinpoint specific amounts, dates, account numbers, document references.",
    "4. Draw from your 50 years of experience in detecting fraud, financial irregularities, and accounting manipulations.",
    "",
    "Data (per-file extracted facts, with citations):",
    JSON.stringify(fileFacts, null, 2),
    "",
    "COMPREHENSIVE CROSS-VERIFICATION TASK:",
    "",
    "Perform detailed cross-verification across ALL document types. Check for consistency, mismatches, and fraud indicators:",
    "",
    "1. BANK STATEMENTS vs OTHER DOCUMENTS:",
    "   - Cross-check revenue figures in sales reports/invoices against bank deposits",
    "   - Verify GST payments match bank debits",
    "   - Check if declared income in ITR matches bank account credits",
    "   - Identify unexplained large deposits or withdrawals",
    "   - Verify loan disbursements match declared liabilities",
    "   - Check for round-number transactions (potential red flags)",
    "   - Verify vendor payments match purchase invoices",
    "",
    "2. GST FILINGS vs OTHER DOCUMENTS:",
    "   - Cross-check GST output tax with sales invoices/revenue",
    "   - Verify GST input tax credit claims against purchase invoices",
    "   - Check GST returns match sales reports for the same period",
    "   - Verify GST registration details match incorporation documents",
    "   - Identify discrepancies in GST filing dates vs transaction dates",
    "   - Check for missing GST filings for periods with sales activity",
    "",
    "3. SALES REPORTS vs OTHER DOCUMENTS:",
    "   - Cross-check sales figures with invoices",
    "   - Verify sales revenue matches bank deposits",
    "   - Check sales reported in GST returns match sales reports",
    "   - Verify sales figures match ITR income declarations",
    "   - Identify gaps between sales reports and actual invoices",
    "   - Check for duplicate or missing invoice numbers",
    "",
    "4. ITR (INCOME TAX RETURNS) vs OTHER DOCUMENTS:",
    "   - Cross-check declared income with bank statements",
    "   - Verify ITR income matches sales reports/revenue",
    "   - Check if expenses claimed match purchase invoices",
    "   - Verify tax payments match bank debits",
    "   - Identify discrepancies between ITR and financial statements",
    "   - Check for under-reporting or over-reporting of income",
    "   - Verify depreciation claims match asset records",
    "",
    "5. STOCK/INVENTORY REPORTS vs OTHER DOCUMENTS:",
    "   - Cross-check inventory values with purchase invoices",
    "   - Verify stock movements match sales invoices",
    "   - Check inventory valuation methods are consistent",
    "   - Identify discrepancies in stock levels vs sales",
    "   - Verify stock write-offs match accounting records",
    "",
    "6. CIBIL REPORTS (DIRECTORS) vs OTHER DOCUMENTS:",
    "   - Cross-check director loan amounts with company books",
    "   - Verify director credit history vs company financial health",
    "   - Check for personal guarantees matching company liabilities",
    "   - Identify conflicts between director CIBIL and company performance",
    "",
    "7. FINANCIAL STATEMENTS (Balance Sheet, P&L) vs OTHER DOCUMENTS:",
    "   - Cross-check all figures with source documents",
    "   - Verify totals match individual line items",
    "   - Check for missing or incomplete periods",
    "   - Identify unexplained adjustments or reclassifications",
    "",
    "8. FRAUD DETECTION PATTERNS:",
    "   - Look for circular transactions (money moving in circles)",
    "   - Identify related-party transactions at non-arm's length",
    "   - Check for revenue recognition manipulation",
    "   - Detect expense manipulation or fictitious expenses",
    "   - Identify asset overvaluation or understatement of liabilities",
    "   - Check for timing manipulation (revenue/expense shifting)",
    "   - Detect duplicate invoices or missing invoices",
    "   - Identify suspicious round-number transactions",
    "   - Check for transactions just below reporting thresholds",
    "   - Verify authenticity of supporting documents",
    "",
    "9. MISSING LINKAGES & INCONSISTENCIES:",
    "   - Identify documents that should exist but are missing",
    "   - Check for gaps in date sequences",
    "   - Verify document numbering sequences",
    "   - Identify missing supporting documents for transactions",
    "   - Check for inconsistencies in company names, addresses, registration numbers",
    "",
    "DETAILED REPORTING REQUIREMENTS:",
    "",
    "For EACH red flag identified, provide:",
    "",
    "1. TITLE: Clear, specific title describing the issue",
    "2. SEVERITY: 'high' (fraud/large discrepancy), 'medium' (significant issue), 'low' (minor inconsistency), 'needs_more_evidence' (requires additional documents)",
    "3. WHAT_IT_MEANS: Detailed explanation of what this red flag indicates and its implications",
    "4. PROBABLE_REASON: As a Forensic CA with 50 years of experience, pinpoint the EXACT root cause. Be specific and technical:",
    "   - What specific accounting principle or regulation is violated?",
    "   - What type of fraud or error pattern does this match?",
    "   - What are the possible explanations (fraud, error, timing difference, etc.)?",
    "   - What does your experience tell you about similar cases?",
    "   - Be precise: mention specific amounts, dates, account types, document types",
    "5. CONFIDENCE_SCORE (0-100): Assess confidence based on:",
    "   - Quality and clarity of evidence",
    "   - Completeness of cross-verification",
    "   - Consistency of pattern across documents",
    "   - Higher scores (80-100) = Strong evidence, clear pattern",
    "   - Medium scores (50-79) = Some evidence but needs verification",
    "   - Lower scores (20-49) = Weak evidence, requires more documents",
    "   - Very low (0-19) = Speculative, insufficient evidence",
    "6. WHERE_TO_CHECK: List all relevant files and their paths",
    "7. EVIDENCE: Provide exact quotes from documents with snippet IDs",
    "8. RECOMMENDED_NEXT_STEPS: Specific, actionable steps to investigate or resolve",
    "",
    "OUTPUT FORMAT:",
    "Output JSON with this exact shape:",
    "{",
    '  "executive_summary": string,  // Comprehensive summary of all findings, fraud indicators, and overall assessment',
    '  "red_flags": [ {',
    '     "severity": "high"|"medium"|"low"|"needs_more_evidence",',
    '     "title": string,  // Specific, descriptive title',
    '     "what_it_means": string,  // Detailed explanation of implications',
    '     "probable_reason": string,  // EXACT root cause analysis with technical details, specific amounts/dates, fraud patterns identified',
    '     "confidence_score": number,  // 0-100 percentage',
    '     "where_to_check": [ { "file_name": string, "file_path": string } ],',
    '     "evidence": [ { "file_name": string, "file_path": string, "snippet_id": string, "quote": string } ],',
    '     "recommended_next_steps": string[]  // Specific, actionable steps',
    "  } ],",
    '  "coverage_notes": string[]  // Notes about document coverage, missing documents, limitations',
    "}",
    "",
    "Remember: Be thorough, question everything questionable, pinpoint exact issues, and provide expert-level analysis based on your 50 years of forensic accounting experience.",
    "",
    "CRITICAL: In the executive summary, red flags, and all report sections, replace any company names, mandate names, or entity names found in the documents with the dataroom name provided above. Never reveal the actual company name - always use the dataroom name instead.",
  ].join("\n");
}

function reportMarkdownFromJson(report: any): string {
  const lines: string[] = [];
  lines.push(`## Forensic AI Audit Report`);
  lines.push("");
  lines.push(`### Executive Summary`);
  lines.push(report?.executive_summary ?? "");
  lines.push("");
  lines.push(`### Red Flags`);
  const redFlags = Array.isArray(report?.red_flags) ? report.red_flags : [];
  if (redFlags.length === 0) {
    lines.push("- No red flags produced (or insufficient evidence).");
  } else {
    redFlags.forEach((rf: any, idx: number) => {
      lines.push(`#### ${idx + 1}. [${rf?.severity ?? "unknown"}] ${rf?.title ?? "Untitled"}`);
      lines.push("");
      lines.push(rf?.what_it_means ?? "");
      lines.push("");
      lines.push("**Probable Reason**");
      lines.push(rf?.probable_reason ?? "Not specified");
      lines.push("");
      const confidenceScore = typeof rf?.confidence_score === 'number' ? rf.confidence_score : null;
      if (confidenceScore !== null) {
        lines.push(`**Confidence Score:** ${Math.round(confidenceScore)}%`);
        lines.push("");
      }
      lines.push("**Where to check**");
      const whereToCheck = Array.isArray(rf?.where_to_check) ? rf.where_to_check : [];
      whereToCheck.forEach((w: any) => {
        lines.push(`- ${w?.file_name ?? ""} \`${w?.file_path ?? ""}\``);
      });
      lines.push("");
      lines.push("**Evidence (quoted)**");
      const evidence = Array.isArray(rf?.evidence) ? rf.evidence : [];
      evidence.forEach((e: any) => {
        lines.push(`- ${e?.file_name ?? ""} \`${e?.file_path ?? ""}\` (snippet ${e?.snippet_id ?? "?"}): "${(e?.quote ?? "").replaceAll("\n", " ").slice(0, 400)}"`);
      });
      lines.push("");
      lines.push("**Recommended next steps**");
      const nextSteps = Array.isArray(rf?.recommended_next_steps) ? rf.recommended_next_steps : [];
      nextSteps.forEach((s: any) => lines.push(`- ${s}`));
      lines.push("");
    });
  }
  lines.push("");
  lines.push("### Coverage Notes");
  const coverageNotes = Array.isArray(report?.coverage_notes) ? report.coverage_notes : [];
  coverageNotes.forEach((n: any) => lines.push(`- ${n}`));
  lines.push("");
  return lines.join("\n");
}

// Top-level error handler to catch ANY errors
try {
  Deno.serve(async (req) => {
    // Immediate logging - this should always execute
    let method: string;
    let url: string;
    
    try {
      method = req.method;
      url = req.url;
    } catch (e) {
      console.error("Failed to read request properties:", e);
      return jsonResponse({ error: "Failed to read request" }, 500);
    }
    
    console.log("=== FUNCTION START ===");
    console.log("Method:", method);
    console.log("URL:", url);
  
  // Wrap everything in try-catch to catch any errors
  try {
    // Handle CORS preflight
    if (method === "OPTIONS") {
      console.log("Handling OPTIONS request");
      return new Response("ok", { headers: corsHeaders });
    }

    // Log POST request immediately - this MUST execute for POST requests
    console.log("=== POST REQUEST RECEIVED ===");
    console.log("Processing", method, "request...");
    console.log("Request URL:", url);
    console.log("Request method:", method);
    
    // Test endpoint - if we see this log, the function IS being called
    if (url.includes("?test=true")) {
      console.log("=== TEST ENDPOINT HIT ===");
      return jsonResponse({ success: true, message: "Function is reachable", method, url }, 200);
    }
    
    // Log headers for debugging
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    console.log("Auth header (first 50 chars):", authHeader ? authHeader.substring(0, 50) + "..." : "none");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // SUPABASE_ANON_KEY is automatically injected by Supabase into Edge Functions
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    console.log("Env check - URL:", supabaseUrl ? "present" : "missing");
    console.log("Env check - Service Role Key:", serviceRoleKey ? "present" : "missing");
    console.log("Env check - Anon Key:", anonKey ? "present" : "missing");
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing required env vars");
      return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    if (!anonKey) {
      console.error("Missing SUPABASE_ANON_KEY");
      return jsonResponse({ 
        error: "Missing SUPABASE_ANON_KEY. This should be automatically available in Edge Functions. Check your Supabase project settings." 
      }, 500);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    const openaiBaseUrl = Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com";
    const openaiModelText = Deno.env.get("OPENAI_MODEL_TEXT") ?? "gpt-4o-mini";
    const openaiModelVision = Deno.env.get("OPENAI_MODEL_VISION") ?? openaiModelText;

    console.log("=== EXTRACTING TOKEN ===");
    const token = getBearerToken(req);
    console.log("Token extracted:", token ? `present (${token.length} chars)` : "missing");
    
    if (!token) {
      console.error("=== TOKEN MISSING - RETURNING 401 ===");
      return jsonResponse({ error: "Missing Authorization Bearer token" }, 401);
    }

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Decode JWT to extract user ID (JWT payload is base64url encoded)
    console.log("=== DECODING JWT ===");
    let userId: string | null = null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format - expected 3 parts");
      }
      const payloadJson = base64UrlDecode(parts[1]);
      const payload = JSON.parse(payloadJson);
      userId = payload.sub || payload.user_id || null;
      console.log("Decoded user ID:", userId);
    } catch (e: any) {
      console.error("=== JWT DECODE ERROR ===");
      console.error("Error:", e?.message);
      return jsonResponse({ error: `Invalid JWT: Failed to decode - ${e?.message || String(e)}` }, 401);
    }

    if (!userId) {
      console.error("No user ID in JWT payload");
      return jsonResponse({ error: "Invalid JWT: No user ID in token" }, 401);
    }

    // Verify user exists using admin client
    console.log("Verifying user:", userId);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (userErr || !userData?.user) {
      console.error("User verification failed:", userErr?.message || "No user data");
      return jsonResponse({ error: `Invalid JWT: User not found - ${userErr?.message || "Unknown"}` }, 401);
    }
    
    const user = userData.user;
    console.log("User verified:", user.email, "ID:", user.id);

    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .limit(10);
    if (roleErr) return jsonResponse({ error: `Role check failed: ${roleErr.message}` }, 403);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);

    const body = await readRequestBody(req);
    if (!body?.action) return jsonResponse({ error: "Missing body.action" }, 400);

    if (body.action === "start") {
      const { vaultId } = body as StartBody;
      if (!vaultId) return jsonResponse({ error: "Missing vaultId" }, 400);

      // Create job
      const { data: job, error: jobErr } = await supabaseAdmin
        .from("audit_jobs")
        .insert({
          vault_id: vaultId,
          created_by: user.id,
          status: "queued",
          progress: 0,
          total_files: 0,
          processed_files: 0,
          current_step: "Queued",
        })
        .select("*")
        .single();

      if (jobErr || !job) return jsonResponse({ error: `Failed to create audit job: ${jobErr?.message}` }, 500);

      // Snapshot documents for this vault
      const { data: docs, error: docsErr } = await supabaseAdmin
        .from("documents")
        .select("id, name, file_path, file_type, file_size, folder_id, vault_id")
        .eq("vault_id", vaultId);
      if (docsErr) return jsonResponse({ error: `Failed to load documents: ${docsErr.message}` }, 500);

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
        const { error: insErr } = await supabaseAdmin.from("audit_job_files").insert(files);
        if (insErr) return jsonResponse({ error: `Failed to create audit job file rows: ${insErr.message}` }, 500);
      }

      await supabaseAdmin
        .from("audit_jobs")
        .update({
          total_files: files.length,
          current_step: files.length === 0 ? "No documents to audit" : "Ready to run",
        })
        .eq("id", job.id);

      return jsonResponse({ success: true, jobId: job.id, totalFiles: files.length });
    }

    if (body.action === "status") {
      const { jobId } = body as StatusBody;
      const { data: job, error } = await supabaseAdmin
        .from("audit_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, job });
    }

    if (body.action === "cancel") {
      const { jobId } = body as CancelBody;
      if (!jobId) return jsonResponse({ error: "Missing jobId" }, 400);
      
      const { data: job, error: jobErr } = await supabaseAdmin
        .from("audit_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (jobErr || !job) return jsonResponse({ error: `Job not found: ${jobErr?.message}` }, 404);

      // Only allow cancelling if job is still running or queued
      if (job.status !== "running" && job.status !== "queued") {
        return jsonResponse({ error: `Cannot cancel job with status: ${job.status}` }, 400);
      }

      // Mark job as cancelled
      const { data: updatedJob, error: updateErr } = await supabaseAdmin
        .from("audit_jobs")
        .update({
          status: "cancelled",
          current_step: "Cancelled",
          error: "Cancelled by user",
        })
        .eq("id", jobId)
        .select("*")
        .single();

      if (updateErr) return jsonResponse({ error: `Failed to cancel job: ${updateErr.message}` }, 500);
      return jsonResponse({ success: true, job: updatedJob });
    }

    if (body.action === "run") {
      const { jobId, maxFiles = 5 } = body as RunBody;
      if (!jobId) return jsonResponse({ error: "Missing jobId" }, 400);
      const batchSize = Math.max(1, Math.min(5, maxFiles));

      const { data: job, error: jobErr } = await supabaseAdmin
        .from("audit_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (jobErr || !job) return jsonResponse({ error: `Job not found: ${jobErr?.message}` }, 404);

      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        return jsonResponse({ success: true, job });
      }

      // Mark running + started_at
      if (!job.started_at) {
        await supabaseAdmin.from("audit_jobs").update({ status: "running", started_at: new Date().toISOString(), current_step: "Processing documents" }).eq("id", jobId);
      } else {
        await supabaseAdmin.from("audit_jobs").update({ status: "running" }).eq("id", jobId);
      }

      // Pull next pending files
      const { data: pending, error: pendErr } = await supabaseAdmin
        .from("audit_job_files")
        .select("*")
        .eq("job_id", jobId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(batchSize);
      if (pendErr) return jsonResponse({ error: `Failed to load pending files: ${pendErr.message}` }, 500);

      const openaiReady = !!openaiKey;

      // Helper function to update progress after each file
      const updateProgress = async (currentFileName?: string) => {
        const { count: totalCount } = await supabaseAdmin
          .from("audit_job_files")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId);
        const { count: doneCount } = await supabaseAdmin
          .from("audit_job_files")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId)
          .in("status", ["done", "failed", "skipped"]);
        
        const total = totalCount ?? job.total_files ?? 0;
        const processed = doneCount ?? 0;
        const baseProgress = total > 0 ? Math.floor((processed / total) * 90) : 100;
        
        // Calculate estimated remaining time; cap at 4 hours to avoid wild ETA glitches
        const MAX_ETA_SECONDS = 4 * 60 * 60; // 4 hours
        let estimatedRemainingSeconds: number | null = null;
        if (job.started_at && processed > 0) {
          const elapsedSeconds = Math.max(1, (new Date().getTime() - new Date(job.started_at).getTime()) / 1000);
          const filesPerSecond = processed / elapsedSeconds;
          if (filesPerSecond > 0.001) {
            const raw = Math.round((total - processed) / filesPerSecond);
            estimatedRemainingSeconds = Math.min(MAX_ETA_SECONDS, Math.max(0, raw));
          }
        }
        
        const currentStep = currentFileName 
          ? `Processing: ${currentFileName.substring(0, 50)}${currentFileName.length > 50 ? '...' : ''} (${processed}/${total})`
          : `Processing documents (${processed}/${total})`;
        
        await supabaseAdmin
          .from("audit_jobs")
          .update({
            processed_files: processed,
            progress: baseProgress,
            current_step: currentStep,
            estimated_remaining_seconds: estimatedRemainingSeconds,
          })
          .eq("id", jobId);
      };

      const PER_FILE_TIMEOUT_MS = 90 * 1000; // 90 seconds - skip if a file takes longer

      for (const f of pending ?? []) {
        const fileId = (f as any).id as string;
        const filePath = (f as any).file_path as string;
        const fileName = (f as any).file_name as string;
        const fileType = (f as any).file_type as string | null;

        await supabaseAdmin
          .from("audit_job_files")
          .update({ status: "processing", started_at: new Date().toISOString(), error: null })
          .eq("id", fileId);
        
        // Update progress to show current file being processed
        await updateProgress(fileName);

        const processOneFile = async () => {
          // Download file bytes (handle split metadata placeholders)
          let bytes: Uint8Array | null = null;
          let effectiveFileName = fileName;
          let effectiveMime = fileType ?? null;

          if (filePath.endsWith(".metadata")) {
            // Reassemble split file from chunk paths stored in activity_logs.metadata
            const docId = (f as any).document_id as string | null;
            if (!docId) throw new Error("Split file metadata has no document_id");
            const { data: act, error: actErr } = await supabaseAdmin
              .from("activity_logs")
              .select("metadata, created_at")
              .eq("document_id", docId)
              .eq("action", "upload")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (actErr) throw actErr;
            const meta = asObjectJson(act?.metadata) ?? {};
            const chunkPaths: string[] = meta?.chunkPaths ?? [];
            if (!Array.isArray(chunkPaths) || chunkPaths.length === 0) {
              throw new Error("Split file chunkPaths not found in activity_logs metadata");
            }

            const parts: Uint8Array[] = [];
            for (const cp of chunkPaths) {
              const { data: cblob, error: cErr } = await supabaseAdmin.storage.from("documents").download(cp);
              if (cErr || !cblob) throw new Error(`Chunk download failed: ${cErr?.message ?? cp}`);
              parts.push(await blobToUint8(cblob));
            }
            bytes = concatU8(parts);
            // try to infer original name from chunk file name
            effectiveFileName = effectiveFileName.replace(/\s*\(split.*\)\s*$/i, "");
          } else {
            const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("documents").download(filePath);
            if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message ?? "unknown"}`);
            bytes = await blobToUint8(blob);
            effectiveMime = blob.type || effectiveMime;
          }

          const ext = inferExt(effectiveFileName, filePath);

          // Build evidence snippets (best-effort extraction + truncation)
          let extractedText = "";
          let evidenceSnippets: Array<{ id: string; location: string; text: string }> = [];

          if (effectiveMime === "application/pdf" || ext === "pdf") {
            extractedText = await extractTextFromPdf(bytes);
            const text = clampText(extractedText, 25000);
            evidenceSnippets = [{ id: "A", location: "pdf:text", text }];
          } else if (ext === "docx") {
            extractedText = await extractTextFromDocx(bytes);
            const text = clampText(extractedText, 25000);
            evidenceSnippets = [{ id: "A", location: "docx:text", text }];
          } else if (ext === "xlsx" || ext === "xls" || effectiveMime?.includes("spreadsheet")) {
            extractedText = await extractTextFromXlsx(bytes);
            const text = clampText(extractedText, 25000);
            evidenceSnippets = [{ id: "A", location: "xlsx:csv", text }];
          } else if (effectiveMime?.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(ext)) {
            if (!openaiReady) {
              evidenceSnippets = [{
                id: "A",
                location: "image",
                text: "[OCR not available: OPENAI_API_KEY not configured]",
              }];
            } else {
              const ocr = await openaiVisionOcrJson({
                apiKey: openaiKey,
                baseUrl: openaiBaseUrl,
                model: openaiModelVision,
                system: forensicSystemPrompt(),
                prompt: [
                  `Perform OCR for this image and extract key financial identifiers.`,
                  `Return JSON: { "ocr_text": string, "key_fields": [ { "key": string, "value": string, "quote": string } ] }`,
                  `Do not hallucinate; only what you can read.`,
                ].join("\n"),
                imageBytes: bytes,
                mimeType: effectiveMime ?? "image/png",
                maxTokens: 1200,
              });
              const ocrText = typeof ocr?.ocr_text === "string" ? ocr.ocr_text : "";
              evidenceSnippets = [{ id: "A", location: "image:ocr", text: clampText(ocrText, 25000) }];
            }
          } else {
            extractedText = await extractTextGeneric(bytes);
            const text = clampText(extractedText, 25000);
            evidenceSnippets = [{ id: "A", location: "text", text }];
          }

          // If we have no usable evidence, mark skipped
          const hasEvidence = evidenceSnippets.some((s) => (s.text ?? "").trim().length > 0);
          if (!hasEvidence) {
            await supabaseAdmin
              .from("audit_job_files")
              .update({
                status: "skipped",
                completed_at: new Date().toISOString(),
                facts_json: { document_type: "unknown", summary: "No extractable text", facts: [], internal_red_flags: [] },
                evidence_json: { snippets: [] },
              })
              .eq("id", fileId);
            
            // Update progress after skipping
            await updateProgress();
            return;
          }

          let factsJson: any = null;
          if (openaiReady) {
            // Retry logic for OpenAI API calls (handle rate limits and transient errors)
            let lastError: Error | null = null;
            const maxRetries = 2;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
              try {
                if (attempt > 0) {
                  // Wait before retry (exponential backoff: 2s, 4s)
                  const waitMs = 2000 * attempt;
                  console.log(`Retrying OpenAI call (attempt ${attempt + 1}/${maxRetries + 1}) after ${waitMs}ms...`);
                  await new Promise(resolve => setTimeout(resolve, waitMs));
                }
                
                factsJson = await openaiChatJson({
                  apiKey: openaiKey,
                  baseUrl: openaiBaseUrl,
                  model: openaiModelText,
                  system: forensicSystemPrompt(),
                  user: perFileExtractionPrompt({
                    fileName: effectiveFileName,
                    filePath,
                    fileType: effectiveMime,
                    evidenceSnippets,
                  }),
                  temperature: 0,
                  maxTokens: 1400,
                });
                
                // Success - break out of retry loop
                break;
              } catch (e: any) {
                lastError = e;
                const errorMsg = e?.message || String(e);
                
                // Don't retry on certain errors (invalid API key, etc.)
                if (errorMsg.includes("401") || errorMsg.includes("Invalid API key")) {
                  console.error("Fatal OpenAI error (no retry):", errorMsg);
                  throw e; // This will be caught by outer try-catch
                }
                
                // Rate limit or other transient errors - retry
                console.warn(`OpenAI error (attempt ${attempt + 1}/${maxRetries + 1}):`, errorMsg);
                
                if (attempt === maxRetries) {
                  // Final attempt failed - mark file as failed but continue with others
                  const finalErrorMsg = errorMsg.includes("rate limit") || errorMsg.includes("429")
                    ? `OpenAI rate limit exceeded after ${maxRetries + 1} attempts. Will retry on next batch.`
                    : `OpenAI API error after ${maxRetries + 1} attempts: ${errorMsg.substring(0, 500)}`;
                  
                  await supabaseAdmin
                    .from("audit_job_files")
                    .update({
                      status: "failed",
                      completed_at: new Date().toISOString(),
                      error: finalErrorMsg,
                    })
                    .eq("id", fileId);
                  
                  // Break out of retry loop and continue to next file
                  factsJson = null;
                  break;
                }
                // Otherwise, continue retry loop
              }
            }
            
            // If we still don't have factsJson after retries, skip this file
            if (!factsJson) {
              console.error("Failed to get factsJson after all retries, skipping file");
              await updateProgress();
              return;
            }
            
            factsJson = validateCitedJson(
              factsJson,
              evidenceSnippets.map((s) => ({ id: s.id, text: s.text })),
            );
          } else {
            factsJson = {
              document_type: "unknown",
              summary: "OPENAI_API_KEY not configured; extraction skipped",
              facts: [],
              internal_red_flags: [],
            };
          }

          await supabaseAdmin
            .from("audit_job_files")
            .update({
              status: "done",
              completed_at: new Date().toISOString(),
              facts_json: factsJson as Json,
              evidence_json: { snippets: evidenceSnippets } as Json,
              error: null,
            })
            .eq("id", fileId);
          
          // Update progress after each file completes
          await updateProgress();
        };

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Processing timed out (90s)")), PER_FILE_TIMEOUT_MS)
        );

        try {
          await Promise.race([processOneFile(), timeoutPromise]);
        } catch (err) {
          const msg = (err as any)?.message ?? String(err);
          const isTimeout = msg.includes("timed out");
          const updatePayload: Record<string, unknown> = {
            status: isTimeout ? "skipped" : "failed",
            completed_at: new Date().toISOString(),
            error: msg.slice(0, 1000),
          };
          if (isTimeout) {
            updatePayload.facts_json = { document_type: "unknown", summary: "Skipped: processing timed out", facts: [], internal_red_flags: [] };
            updatePayload.evidence_json = { snippets: [] };
          }
          await supabaseAdmin
            .from("audit_job_files")
            .update(updatePayload)
            .eq("id", fileId);
          
          await updateProgress();
          if (isTimeout) console.warn(`Skipped ${fileName}: processing timed out`);
        }
      }

      // Final progress update after batch completes
      await updateProgress();

      // Get final counts for synthesis check
      const { count: finalTotalCount } = await supabaseAdmin
        .from("audit_job_files")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId);
      const { count: finalProcessedCount } = await supabaseAdmin
        .from("audit_job_files")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .in("status", ["done", "failed", "skipped"]);
      
      const finalTotal = finalTotalCount ?? job.total_files ?? 0;
      const finalProcessed = finalProcessedCount ?? 0;

      // If finished processing all files, synthesize report
      if (finalTotal === 0) {
        await supabaseAdmin
          .from("audit_jobs")
          .update({
            status: "completed",
            progress: 100,
            completed_at: new Date().toISOString(),
            report_markdown: "## Forensic AI Audit Report\n\nNo documents found in this dataroom.\n",
            report_json: { executive_summary: "No documents found", red_flags: [], coverage_notes: ["No files to audit."] },
            current_step: "Completed",
          })
          .eq("id", jobId);
      } else if (finalProcessed >= finalTotal) {
        if (!openaiReady) {
          await supabaseAdmin
            .from("audit_jobs")
            .update({
              status: "completed",
              progress: 100,
              completed_at: new Date().toISOString(),
              report_markdown: "## Forensic AI Audit Report\n\nOPENAI_API_KEY not configured; no AI synthesis was performed.\n",
              report_json: { executive_summary: "OPENAI_API_KEY not configured", red_flags: [], coverage_notes: ["Configure OPENAI_API_KEY to run forensic audit."] },
              current_step: "Completed",
            })
            .eq("id", jobId);
        } else {
          // Synthesis step: wrap in its own try/catch so a bad OpenAI response
          // doesn't crash the whole batch with a 500. Instead, we mark the job
          // as failed with a helpful error message.
          try {
            // Fetch vault name
            const { data: vaultData, error: vaultErr } = await supabaseAdmin
              .from("vaults")
              .select("name")
              .eq("id", job.vault_id)
              .single();
            if (vaultErr) throw vaultErr;
            const vaultName = vaultData?.name || `Dataroom ${job.vault_id.substring(0, 8)}`;

            const { data: allFacts, error: factsErr } = await supabaseAdmin
              .from("audit_job_files")
              .select("file_name, file_path, facts_json")
              .eq("job_id", jobId);
            if (factsErr) throw factsErr;

            const payload = (allFacts ?? []).map((r: any) => ({
              file_name: r.file_name,
              file_path: r.file_path,
              facts_json: r.facts_json,
            }));

            let forensicAnalysis: { analysis?: string; riskScore?: number; filesAnalyzed?: number } | null = null;
            const forensicBackendUrl = Deno.env.get("FRAUD_BACKEND_URL") || "";
            if (forensicBackendUrl) {
              await supabaseAdmin
                .from("audit_jobs")
                .update({ current_step: "Running forensic analysis" })
                .eq("id", jobId);

              const { data: evidenceRows, error: evidenceErr } = await supabaseAdmin
                .from("audit_job_files")
                .select("file_name, file_type, evidence_json")
                .eq("job_id", jobId);
              if (evidenceErr) throw evidenceErr;

              const extractedData = (evidenceRows ?? [])
                .map((row: any) => {
                  const evidence = asObjectJson(row?.evidence_json);
                  const snippets = Array.isArray(evidence?.snippets) ? evidence.snippets : [];
                  const extracted = clampText(
                    snippets.map((s: any) => String(s?.text ?? "")).join("\n\n"),
                    4000,
                  );
                  return {
                    fileName: String(row?.file_name ?? ""),
                    fileType: String(row?.file_type ?? ""),
                    extracted,
                  };
                })
                .filter((d: any) => d.fileName && d.extracted);

              try {
                forensicAnalysis = await runForensicBackendAnalysis({
                  url: forensicBackendUrl,
                  extractedData,
                });
              } catch (backendErr: any) {
                console.warn("Forensic backend analysis failed:", backendErr?.message || backendErr);
              }
            }

            let reportJson: any = null;
            let synthesisError: string | null = null;
            try {
              reportJson = await openaiChatJson({
                apiKey: openaiKey,
                baseUrl: openaiBaseUrl,
                model: openaiModelText,
                system: forensicSystemPrompt(),
                user: finalSynthesisPrompt({ vaultId: job.vault_id, vaultName, jobId, fileFacts: payload }),
                temperature: 0,
                maxTokens: 1800,
              });
            } catch (err: any) {
              synthesisError = err?.message || String(err);
              console.warn("OpenAI synthesis failed; falling back to forensic-only report:", synthesisError);
            }

            const reportMd = reportJson ? reportMarkdownFromJson(reportJson) : "";
            const auditMd = reportMd
              ? reportMd.replace(/^##\s+Forensic AI Audit Report\s*/i, "## Forensic Audit Report\n\n")
              : "";

            let combinedReportMd = "";
            if (forensicAnalysis?.analysis && auditMd) {
              const forensicMd = formatForensicAnalysisMarkdown({
                vaultName,
                analysis: forensicAnalysis.analysis,
                riskScore: forensicAnalysis.riskScore,
                filesAnalyzed: forensicAnalysis.filesAnalyzed,
              });
              combinedReportMd = `${forensicMd}\n\n---\n\n${auditMd}`;
            } else if (forensicAnalysis?.analysis) {
              combinedReportMd = formatForensicAnalysisMarkdown({
                vaultName,
                analysis: forensicAnalysis.analysis,
                riskScore: forensicAnalysis.riskScore,
                filesAnalyzed: forensicAnalysis.filesAnalyzed,
              });
            } else if (auditMd) {
              combinedReportMd = auditMd;
            } else {
              combinedReportMd = "## Forensic Audit Report\n\nReport synthesis failed. Please retry the audit.";
            }

            combinedReportMd = sanitizeForensicText(combinedReportMd);
            const reportJsonObject: Record<string, Json> =
              reportJson && typeof reportJson === "object"
                ? (reportJson as Record<string, Json>)
                : {};
            const mergedReportJson: Json = {
              ...reportJsonObject,
              forensic_analysis: forensicAnalysis as Json,
              synthesis_error: synthesisError as Json,
            };
            await supabaseAdmin
              .from("audit_jobs")
              .update({
                status: "completed",
                progress: 100,
                completed_at: new Date().toISOString(),
                report_markdown: combinedReportMd,
                report_json: mergedReportJson,
                current_step: "Completed",
                error: null,
              })
              .eq("id", jobId);
          } catch (synthErr: any) {
            const msg = synthErr?.message || String(synthErr);
            console.error("Report synthesis failed:", msg);
            await supabaseAdmin
              .from("audit_jobs")
              .update({
                status: "failed",
                progress: 95,
                completed_at: new Date().toISOString(),
                current_step: "Report synthesis failed",
                error: `Report synthesis error: ${msg.slice(0, 500)}`,
              })
              .eq("id", jobId);
          }
        }
      }

      const { data: jobNow } = await supabaseAdmin.from("audit_jobs").select("*").eq("id", jobId).single();
      return jsonResponse({ success: true, job: jobNow });
    }

    return jsonResponse({ error: `Unknown action` }, 400);
  } catch (e) {
    const errorMsg = (e as any)?.message ?? String(e);
    const errorStack = (e as any)?.stack ?? "No stack trace";
    console.error("=== UNHANDLED ERROR ===");
    console.error("Error message:", errorMsg);
    console.error("Error stack:", errorStack);
    console.error("Error object:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
    return jsonResponse({ 
      error: errorMsg,
      details: process.env.DENO_ENV === "development" ? errorStack : undefined
    }, 500);
  }
  });
} catch (topLevelError: any) {
  console.error("=== TOP-LEVEL ERROR ===");
  console.error("Error:", topLevelError?.message);
  console.error("Stack:", topLevelError?.stack);
  Deno.serve(async () => {
    return jsonResponse({ error: `Function initialization failed: ${topLevelError?.message}` }, 500);
  });
}

