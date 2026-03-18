# Auditor Agent Module — Technical Document

**Version:** 1.0  
**Last Updated:** March 2025  
**Status:** Production

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Module Components](#3-module-components)
4. [Data Flow & Processing Pipeline](#4-data-flow--processing-pipeline)
5. [What the Auditor Checks](#5-what-the-auditor-checks)
6. [Report Generation Process](#6-report-generation-process)
7. [Supported File Types & Extraction](#7-supported-file-types--extraction)
8. [Limitations](#8-limitations)
9. [Making It Professional](#9-making-it-professional)
10. [Technical Specifications](#10-technical-specifications)
11. [Deployment & Configuration](#11-deployment--configuration)
12. [Future Enhancements](#12-future-enhancements)

---

## 1. Executive Summary

The **Auditor Agent** is an AI-powered forensic audit module that analyzes documents in a dataroom to detect financial irregularities, fraud indicators, and cross-document inconsistencies. It produces evidence-cited reports with red flags, confidence scores, and recommended next steps.

**Key characteristics:**
- **Evidence-based:** Only reports findings backed by verifiable quoted citations from source documents
- **Resumable:** Processes documents in small batches to avoid timeouts; can resume if interrupted
- **Dual entry points:** Admin dataroom audit (authenticated) and public auditor (anonymous sessions)
- **Multi-provider AI:** Supports OpenAI (GPT-4o-mini) and Anthropic (Claude Sonnet) for extraction and synthesis

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AUDITOR AGENT ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────────┐ │
│  │  Admin Vault     │     │  Public Auditor  │     │  Fraud Backend (Optional) │ │
│  │  (VaultDetail)   │     │  (/auditor)      │     │  (Forensic Analysis)      │ │
│  └────────┬─────────┘     └────────┬─────────┘     └────────────┬───────────────┘ │
│           │                        │                           │                  │
│           ▼                        ▼                           │                  │
│  ┌────────────────────────────────────────────────────────────┴───────────────┐ │
│  │                    auditVaultApi / auditorInvoke                            │ │
│  │  (Proxy via fraud-backend OR direct Supabase Edge Function)                 │ │
│  └────────────────────────────────────────────────┬──────────────────────────┘ │
│                                                     │                            │
│           ┌────────────────────────────────────────┼────────────────────────┐   │
│           ▼                                        ▼                        ▼   │
│  ┌─────────────────┐                    ┌─────────────────┐    ┌────────────────┐
│  │ audit-vault     │                    │ auditor-public  │    │ fraud-backend   │
│  │ (Edge Function) │                    │ (Edge Function) │    │ (Node.js/Render)│
│  │ Admin-only     │                    │ Public sessions │    │ /api/forensic-  │
│  │ Resumable jobs  │                    │ Create vault    │    │ audit           │
│  └────────┬───────┘                    └────────┬───────┘    └────────┬───────┘ │
│           │                                      │                      │         │
│           └──────────────────────┬──────────────┘                      │         │
│                                  ▼                                       │         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         Supabase (PostgreSQL + Storage)                       ││
│  │  audit_jobs, audit_job_files, vaults, documents, folders, auditor_sessions   ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                  │                                                 │
│                                  ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  AI Providers: OpenAI (gpt-4o-mini) | Anthropic (claude-sonnet-4-6)          ││
│  │  Per-file extraction → Facts + internal_red_flags (with citations)           ││
│  │  Final synthesis → Executive summary + red_flags + evidence                   ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Components

### 3.1 Frontend

| Component | Path | Purpose |
|-----------|------|---------|
| **VaultDetail** | `src/pages/admin/VaultDetail.tsx` | Admin audit UI: Start/Resume/Stop audit, progress, report preview, download |
| **Auditor** | `src/pages/Auditor.tsx` | Public auditor: Create session, upload files, run Forensic Audit / CIM / Teaser |
| **AuditBackgroundPoller** | `src/components/AuditBackgroundPoller.tsx` | Polls active jobs in background so audit continues when user navigates away |
| **AuditorSessions** | `src/pages/admin/AuditorSessions.tsx` | Admin view of public auditor sessions |

### 3.2 API Layer

| Service | Path | Purpose |
|---------|------|---------|
| **auditVaultApi** | `src/services/auditVaultApi.ts` | Invokes audit-vault (direct Edge Function or via fraud-backend proxy) |
| **documentFetcher** | `src/services/fraud/documentFetcher.ts` | Fetches documents for CIM/Teaser in public auditor |

### 3.3 Backend

| Component | Path | Purpose |
|-----------|------|---------|
| **audit-vault** | `supabase/functions/audit-vault/index.ts` | Core audit logic: start job, run batches, extract facts, synthesize report |
| **auditor-public** | `supabase/functions/auditor-public/index.ts` | Public auditor: create session, upload, run audit via service role |
| **fraud-backend** | `nidhi-backends/fraud-backend/fraud-backend.js` | Optional forensic analysis (/api/forensic-audit), auditor proxy |

### 3.4 Database

| Table | Purpose |
|-------|---------|
| **audit_jobs** | Job metadata: status, progress, report_markdown, report_json, error |
| **audit_job_files** | Per-file status: pending → processing → done/failed/skipped, facts_json, evidence_json |
| **auditor_sessions** | Public auditor sessions: name, company_name, vault_id |

---

## 4. Data Flow & Processing Pipeline

### 4.1 Admin Audit (VaultDetail)

```
1. Admin clicks "Audit Documents" → auditVaultInvoke({ action: 'start', vaultId })
2. Edge Function creates audit_job, snapshots documents → audit_job_files (status: pending)
3. Frontend polls status; BackgroundPoller or dialog triggers run batches
4. auditVaultInvoke({ action: 'run', jobId, maxFiles: 2 }) — processes 2 files per call
5. For each file:
   a. Download from storage
   b. Extract text (PDF/DOCX/XLSX) or OCR (images)
   c. Call AI for per-file extraction → facts + internal_red_flags (with citations)
   d. Validate citations (drop facts without verifiable quotes)
   e. Store facts_json, evidence_json in audit_job_files
6. When all files done:
   a. (Optional) Call FRAUD_BACKEND_URL/api/forensic-audit for forensic risk score
   b. Call AI for final synthesis → executive_summary, red_flags, evidence
   c. Sanitize company names (replace with dataroom name)
   d. Save report_markdown, report_json to audit_jobs
7. Admin downloads report (Markdown → PDF via html2pdf)
```

### 4.2 Public Auditor (/auditor)

```
1. User enters name + company → create-session (auditor-public or fraud-backend)
2. Creates vault, root folder, auditor_session
3. User uploads files → upload-url returns signed URL; client uploads to storage
4. User clicks "Start Audit" → audit-start (creates job) → audit-run (batches)
5. Same extraction + synthesis pipeline as admin audit
6. Report displayed in UI; user can download PDF
```

---

## 5. What the Auditor Checks

### 5.1 Per-File Extraction (AI Prompt)

For each document, the AI extracts:

1. **Document type** — bank statement, GST return, ITR, CIBIL, balance sheet, P&L, invoice list, etc.
2. **Normalized facts** — dates, amounts, parties, identifiers (masked), tax details, balances, transaction types
3. **Internal red flags** — totals not matching, missing pages, suspicious edits, date sequences, duplicates, round-number transactions

**Output schema:**
```json
{
  "document_type": "bank_statement",
  "summary": "Brief summary",
  "facts": [
    { "key": "revenue_2023_q1", "value": "₹1.2 Cr", "citations": [{ "snippet_id": "A", "quote": "exact quote" }] }
  ],
  "internal_red_flags": [
    { "title": "Total mismatch", "detail": "...", "citations": [...] }
  ]
}
```

### 5.2 Cross-Document Synthesis (AI Prompt)

The final synthesis performs **comprehensive cross-verification** across:

| Category | Checks |
|----------|--------|
| **Bank Statements vs Others** | Revenue vs deposits, GST payments vs debits, ITR income vs credits, unexplained deposits, loan disbursements, vendor payments |
| **GST Filings vs Others** | Output tax vs sales, input tax credit vs purchases, filing dates vs transaction dates, missing filings |
| **Sales Reports vs Others** | Sales vs invoices, revenue vs bank, GST returns, ITR income, duplicate/missing invoices |
| **ITR vs Others** | Declared income vs bank/sales, expenses vs purchase invoices, tax payments, depreciation |
| **Stock/Inventory** | Inventory vs purchase invoices, stock movements vs sales, valuation consistency |
| **CIBIL (Directors)** | Director loans vs company books, credit history vs company health |
| **Financial Statements** | Balance sheet/P&L vs source documents, totals vs line items, missing periods |
| **Fraud Patterns** | Circular transactions, related-party non-arm's length, revenue manipulation, expense fraud, asset overvaluation, timing manipulation, duplicate invoices, round-number transactions, threshold gaming |
| **Missing Linkages** | Missing documents, date gaps, numbering sequences, inconsistent company names |

### 5.3 Red Flag Output Schema

```json
{
  "severity": "high" | "medium" | "low" | "needs_more_evidence",
  "title": "Specific title",
  "what_it_means": "Detailed explanation",
  "probable_reason": "Root cause analysis",
  "confidence_score": 0-100,
  "where_to_check": [{ "file_name": "...", "file_path": "..." }],
  "evidence": [{ "file_name": "...", "file_path": "...", "snippet_id": "...", "quote": "..." }],
  "recommended_next_steps": ["Actionable step 1", "Actionable step 2"]
}
```

---

## 6. Report Generation Process

### 6.1 Citation Validation

- **validateCitedJson()** — Drops any fact or red flag whose `citations[].quote` does not exactly appear in the evidence snippet
- Ensures no hallucination: only reported findings have verifiable source text

### 6.2 Company Name Sanitization

- AI returns `company_names_found` — all entity names found in documents
- Report text is post-processed to replace these with the dataroom name (confidentiality)
- Regex replacement with case-insensitive matching

### 6.3 Forensic Backend Merge (Optional)

If `FRAUD_BACKEND_URL` is set:

- Sends extracted text (clamped to 4000 chars per file) to `/api/forensic-audit`
- Receives: `analysis`, `riskScore`, `filesAnalyzed`
- Merged into report as "Forensic Risk Assessment" section above the AI synthesis

### 6.4 Report Markdown Structure

```markdown
## Forensic Audit Report

### Executive Summary
[AI-generated summary]

### Red Flags
#### 1. [severity] Title
[what_it_means]
**Probable Reason** [probable_reason]
**Confidence Score:** X%
**Where to check** [file list]
**Evidence (quoted)** [quotes with snippet IDs]
**Recommended next steps** [action items]

### Coverage Notes
[Document coverage, missing documents, limitations]
```

---

## 7. Supported File Types & Extraction

| Format | Extraction Method | Library/API | Notes |
|--------|-------------------|-------------|-------|
| **PDF** | Text extraction | pdf-parse | First 25,000 chars; no OCR for scanned PDFs |
| **DOCX** | Raw text | mammoth | extractRawText |
| **XLSX/XLS** | CSV per sheet | xlsx | All sheets concatenated |
| **Images** (PNG, JPG, JPEG, WebP) | Vision OCR | OpenAI Vision / Claude Vision | Requires API key; extracts key financial identifiers |
| **Other** | UTF-8 decode | TextDecoder | Best-effort |

**Edge Function:** Uses `pdf-parse`, `mammoth`, `xlsx` (npm imports in Deno).  
**Fraud Backend:** Uses `pdfjs-dist`, `mammoth`, `xlsx`, `ExcelJS`, `Tesseract` for images.

---

## 8. Limitations

### 8.1 Technical Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| **Edge Function timeout** | ~60s default; batch of 2–3 files may hit limit | Resumable jobs; process 2 files per invocation; BackgroundPoller continues when user navigates away |
| **Per-file timeout (90s)** | Large/complex files skipped | Files marked `skipped` with "processing timed out" |
| **Text truncation (25,000 chars)** | Long documents partially analyzed | Important sections may be missed |
| **No OCR for scanned PDFs** | Scanned PDFs yield little/no text | Use image-based extraction (split PDF to images) or external OCR |
| **Single evidence snippet per file** | All text in one snippet "A" | Works for citation validation but limits granularity |
| **AI rate limits (429)** | Extraction/synthesis fails | Retry up to 2 times; job continues with next file; synthesis may fall back to forensic-only |

### 8.2 Functional Limitations

| Limitation | Impact |
|------------|--------|
| **No PowerPoint analysis** | PPT/PPTX marked as "manual review needed" or skipped |
| **No handwriting recognition** | Handwritten documents not supported |
| **No table structure preservation** | Tables flattened to text; relationships may be lost |
| **No multi-language optimization** | Optimized for English; Indian language support limited |
| **Company name replacement** | May over-sanitize (e.g., bank names, vendor names) |
| **No audit trail of model versions** | Report does not record which AI model/version was used |

### 8.3 Accuracy Limitations

| Limitation | Impact |
|------------|--------|
| **Citation strictness** | Overly strict validation may drop valid findings if quote has minor whitespace/encoding differences |
| **Cross-document matching** | AI may miss subtle inconsistencies; relies on model capability |
| **Confidence scores** | Subjective; not calibrated |
| **False positives** | Legitimate timing differences (e.g., accrual vs cash) may be flagged |

---

## 9. Making It Professional

### 9.1 Report Quality

| Recommendation | Implementation |
|----------------|----------------|
| **Executive summary** | Ensure AI prompt emphasizes concise, actionable summary for C-suite |
| **Severity calibration** | Define clear thresholds: high = fraud/large discrepancy; medium = significant; low = minor |
| **Confidence calibration** | Add guidance: 80–100 = strong evidence; 50–79 = needs verification; &lt;50 = speculative |
| **Recommended next steps** | Make steps specific: "Request bank statement for March 2024" not "Verify bank records" |
| **Coverage notes** | Explicitly list missing document types (e.g., "No ITR for AY 2022-23") |

### 9.2 Operational Improvements

| Recommendation | Implementation |
|----------------|----------------|
| **Audit trail** | Log model name, prompt version, extraction timestamp in report_json |
| **Versioning** | Store report version; allow "Regenerate with new model" |
| **Export formats** | Add Word (.docx) and structured JSON for downstream tools |
| **Scheduling** | Allow scheduled audits (e.g., nightly) for large datarooms |
| **Notifications** | Email/Slack when audit completes or fails |

### 9.3 Compliance & Governance

| Recommendation | Implementation |
|----------------|----------------|
| **Non-hallucination policy** | Already enforced via citation validation; document in report footer |
| **Data retention** | Define retention for audit_jobs, audit_job_files, report_json |
| **Access control** | Admin-only for admin audit; public auditor sessions isolated by vault |
| **Audit of the auditor** | Log who ran which audit, when, and what was downloaded |

### 9.4 UX Improvements

| Recommendation | Implementation |
|----------------|----------------|
| **Progress granularity** | Show current file name, ETA in minutes |
| **Resume clarity** | "Audit paused. Click Resume to continue." when user navigates away |
| **Error recovery** | Retry failed files; allow "Skip failed and complete" |
| **Report comparison** | Compare two audit runs (e.g., before/after new documents) |

---

## 10. Technical Specifications

### 10.1 Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Injected by Supabase |
| `SUPABASE_ANON_KEY` | Yes | Injected by Supabase |
| `OPENAI_API_KEY` | One of | Preferred for extraction/synthesis |
| `OPENAI_BASE_URL` | No | Default: https://api.openai.com |
| `OPENAI_MODEL_TEXT` | No | Default: gpt-4o-mini |
| `OPENAI_MODEL_VISION` | No | Default: gpt-4o-mini |
| `CLAUDE_API_KEY` | One of | Fallback when OpenAI not set |
| `CLAUDE_MODEL_TEXT` | No | Default: claude-sonnet-4-6 |
| `CLAUDE_MODEL_VISION` | No | Default: claude-sonnet-4-6 |
| `FRAUD_BACKEND_URL` | No | Optional forensic analysis merge |

### 10.2 API Actions

| Action | Body | Response |
|--------|------|----------|
| `start` | `{ vaultId }` | `{ jobId, totalFiles }` |
| `run` | `{ jobId, maxFiles?: 2 }` | `{ job }` |
| `status` | `{ jobId }` | `{ job }` |
| `cancel` | `{ jobId }` | `{ job }` |

### 10.3 Batch Processing

- **maxFiles per run:** 1–3 (default 2)
- **Progress:** 0–90% during file processing; 100% after synthesis
- **ETA:** Calculated from elapsed time and files processed

### 10.4 Database Schema (Relevant Columns)

**audit_jobs:**
- `status`: queued | running | completed | failed | cancelled
- `progress`: 0–100
- `report_markdown`: Final Markdown report
- `report_json`: Full JSON (red_flags, forensic_analysis, synthesis_error)

**audit_job_files:**
- `status`: pending | processing | done | failed | skipped
- `facts_json`: Per-file extracted facts with citations
- `evidence_json`: Snippets used for extraction

---

## 11. Deployment & Configuration

### 11.1 Edge Functions

```bash
supabase functions deploy audit-vault
supabase functions deploy auditor-public
```

### 11.2 Secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-...
# or
supabase secrets set CLAUDE_API_KEY=sk-ant-...
# Optional
supabase secrets set FRAUD_BACKEND_URL=https://nidhi-fraud-backend.onrender.com
```

### 11.3 Fraud Backend (Optional)

- Deploy `nidhi-backends/fraud-backend` to Render (or similar)
- Set `FRAUD_BACKEND_URL` in Edge Function secrets
- Forensic analysis runs when all files are processed; result merged into report

### 11.4 Frontend Configuration

```env
VITE_FRAUD_BACKEND_URL=https://nidhi-fraud-backend.onrender.com
VITE_USE_FRAUD_BACKEND=false   # Use Edge Function directly (avoids CORS on localhost)
```

---

## 12. Future Enhancements

| Enhancement | Description | Effort |
|-------------|-------------|--------|
| **Scanned PDF OCR** | Use pdf-to-image + Vision API for scanned PDFs | Medium |
| **Multi-snippet extraction** | Chunk long documents; multiple snippet IDs for finer citations | Medium |
| **Structured export** | JSON/Excel export of red flags for compliance tools | Low |
| **Audit templates** | Predefined checklists (e.g., "GST compliance audit") | High |
| **Human-in-the-loop** | Flag uncertain findings for human review before report finalization | High |
| **Incremental audit** | Re-audit only new/changed documents | Medium |
| **Multi-model consensus** | Run extraction with 2 models; flag disagreements | High |
| **Confidence calibration** | Train on historical audits to calibrate confidence scores | High |

---

## Appendix A: File Locations Quick Reference

| Purpose | Path |
|---------|------|
| Audit Edge Function | `supabase/functions/audit-vault/index.ts` |
| Public Auditor Edge Function | `supabase/functions/auditor-public/index.ts` |
| Audit API Service | `src/services/auditVaultApi.ts` |
| Admin Audit UI | `src/pages/admin/VaultDetail.tsx` (Audit Documents dialog) |
| Public Auditor UI | `src/pages/Auditor.tsx` |
| Background Poller | `src/components/AuditBackgroundPoller.tsx` |
| Fraud Backend | `nidhi-backends/fraud-backend/fraud-backend.js` |
| Audit Migration | `supabase/migrations/ADD_AUDIT_MODULE.sql` |

---

## Appendix B: Prompt Engineering Notes

- **forensicSystemPrompt()** — 50-year Forensic CA persona; strict no-hallucination; citation requirement
- **perFileExtractionPrompt()** — Document type, facts, internal_red_flags; structured keys for cross-verification
- **finalSynthesisPrompt()** — Cross-verification categories; severity, confidence, evidence, next steps
- **Company name replacement** — Explicit instruction to use dataroom name; `company_names_found` for sanitization

---

*End of Document*
