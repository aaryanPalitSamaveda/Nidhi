# Nidhi Dataroom - Complete Architecture & Flow Documentation

> **Purpose:** This document provides a comprehensive technical overview of the Nidhi Dataroom module. It is structured so that an AI can generate accurate flowcharts showing all modules, submodules, interconnections, and data flows.

---

## 1. HIGH-LEVEL OVERVIEW

**Nidhi** is a secure, cloud-based document management and virtual data room (VDR) platform for investment banking, M&A transactions, and sensitive business document sharing. The system provides:
- Enterprise-grade security with role-based access control
- NDA (Non-Disclosure Agreement) workflows before document access
- AI-powered document analysis (CIM, Teaser, Forensic Audit)
- RAG-based chat for document Q&A
- Comprehensive audit trails

**Architecture Pattern:** Three-tier (Frontend → Backend APIs → Supabase/Database)

---

## 2. APPLICATION ENTRY & ROUTING

### 2.1 Entry Point
- **File:** `src/main.tsx` → mounts React app
- **Root:** `src/App.tsx` wraps entire app with:
  - `QueryClientProvider` (TanStack React Query)
  - `AuthProvider` (auth context)
  - `TooltipProvider`
  - `BrowserRouter`
  - `Toaster` / `Sonner` (notifications)
  - `ChatWidget` (global, when authenticated)
  - `AuditBackgroundPoller` (global, polls active audit jobs)

### 2.2 Route Map (All Routes)
| Path | Component | Purpose |
|------|-----------|---------|
| `/` | Index | Landing page |
| `/auth` | Auth | Login/Signup |
| `/dashboard` | Dashboard | Admin/Client dashboard |
| `/admin/users` | AdminUsers | User management |
| `/admin/vaults` | AdminVaults | Dataroom list (admin) |
| `/admin/vaults/:vaultId` | VaultDetail | Single dataroom management |
| `/admin/vaults/:vaultId/permissions` | VaultPermissions | Vault access control |
| `/admin/auditor` | AuditorSessions | Public auditor sessions list |
| `/vault` | ClientVault | Client's dataroom list |
| `/vault/:vaultId` | ClientVault | Client dataroom view |
| `/document/:documentId` | DocumentViewer | Document preview/edit |
| `/auditor` | Auditor | Public audit flow (no login) |
| `/settings` | Settings | User settings |
| `/reset-password` | ResetPassword | Password reset |
| `*` | NotFound | 404 |

---

## 3. AUTHENTICATION & AUTHORIZATION

### 3.1 Auth Flow
```
User → Auth.tsx (signIn/signUp) → supabase.auth → AuthContext
                                              ↓
                                    getUserRole(userId)
                                    getUserProfile(userId)
                                              ↓
                                    user_roles, profiles tables
```

### 3.2 AuthContext (`src/contexts/AuthContext.tsx`)
- **Provides:** `user`, `session`, `role`, `profile`, `loading`, `isAdmin`
- **Role Types:** `admin` | `seller` | `investor`
- **Data Sources:** `auth.users`, `user_roles`, `profiles`

### 3.3 Auth Library (`src/lib/auth.ts`)
- `signIn`, `signUp`, `signOut`
- `getUserRole(userId)` → `user_roles` table
- `getUserProfile(userId)` → `profiles` table
- `has_vault_access(_user_id, _vault_id)` → RPC (checks admin, client_id, vault_permissions, domain inheritance)

### 3.4 Protected Routes
- `DashboardLayout` wraps admin/client pages; redirects to `/auth` if not logged in
- `Auditor` page is **public** (no auth required)

---

## 4. CORE DATA MODEL (Supabase)

### 4.1 Entity Relationship Summary
```
auth.users (Supabase Auth)
    ├── profiles (id, email, full_name, company_name, phone)
    ├── user_roles (user_id, role: admin|client|seller|investor)
    └── (referenced by many tables)

vaults (datarooms)
    ├── id, name, description, client_id, created_by
    ├── vault_permissions (user_id, vault_id, can_view, can_edit, can_upload, can_delete)
    ├── folders (vault_id, parent_id, name, created_by)
    ├── documents (vault_id, folder_id, name, file_path, file_size, file_type, uploaded_by)
    ├── nda_templates (vault_id, role_type: seller|investor, file_path, file_name)
    ├── nda_signatures (vault_id, user_id, template_id, status, signature_name, signature_company)
    ├── audit_jobs (vault_id, status, progress, report_markdown, report_json)
    └── auditor_sessions (name, company_name, vault_id) [public audit product]

audit_jobs
    └── audit_job_files (job_id, document_id, file_path, status, facts_json, evidence_json)

activity_logs (user_id, vault_id, document_id, folder_id, action, resource_type)
cim_reports (vault_id, vault_name, report_content, files_analyzed) [if exists]
```

### 4.2 Storage
- **Bucket:** `documents`
- **Paths:** `{vault_id}/{folder_id}/{timestamp}_{random}_{filename}` for regular docs
- **NDA Paths:** `nda_templates/{vault_id}/{role_type}/{timestamp}_{filename}`
- **RLS:** Storage policies check `documents`, `vaults`, `vault_permissions`, `nda_templates`

---

## 5. MODULE BREAKDOWN

### 5.1 ADMIN MODULE

#### 5.1.1 Vaults (`src/pages/admin/Vaults.tsx`)
- **Purpose:** List, create, rename, delete datarooms
- **Data:** `vaults` table, `auditor_sessions` (for session count), `nda_templates`, `nda_signatures` (for NDA status per user)
- **Actions:** Create vault → insert `vaults`; create root folder
- **Navigation:** → `/admin/vaults/:vaultId` (VaultDetail)

#### 5.1.2 VaultDetail (`src/pages/admin/VaultDetail.tsx`)
- **Purpose:** Full dataroom management
- **Tabs:** Documents, Settings, Audit, CIM, Teaser, Buyer Mapping, NDA Templates
- **Data Fetched:**
  - `vaults`, `folders`, `documents`, `nda_templates`, `nda_signatures`
  - `audit_jobs` (for audit status)
  - `cim_reports` (for CIM preview)
- **Sub-features:**
  - **Documents:** Folder tree, upload, move, rename, delete, view
  - **Audit:** Start/Resume/Cancel forensic audit via `auditVaultApi`
  - **CIM:** Generate CIM via `cimGenerationController` → nidhi-cim-backend
  - **Teaser:** Generate teaser via `teaserGenerationController` → nidhi-teaser-backend
  - **Buyer Mapping:** Downloads static `buyerMap.xlsx` from `/assets/buyerMap.xlsx`
  - **NDA Templates:** Upload Seller/Investor NDA templates → `nda_templates` + storage
- **Integrations:**
  - `auditVaultInvoke` (auditVaultApi)
  - `runCIMGeneration`, `getFormattedCIM` (CIM)
  - `runTeaserGeneration`, `getFormattedTeaser` (Teaser)
  - `setAuditBackgroundActive`, `clearAuditBackgroundActive` (AuditBackgroundPoller)

#### 5.1.3 VaultPermissions (`src/pages/admin/VaultPermissions.tsx`)
- **Purpose:** Manage who can access a vault
- **Data:** `vault_permissions`, `profiles`, `user_roles`
- **Actions:** Add/remove users, set can_view/can_edit/can_upload/can_delete

#### 5.1.4 AuditorSessions (`src/pages/admin/AuditorSessions.tsx`)
- **Purpose:** List and delete public auditor sessions
- **Data:** `auditor_sessions` (joined with vaults, audit_jobs)
- **Navigation:** Sessions created from `/auditor` (public flow)

#### 5.1.5 Users (`src/pages/admin/Users.tsx`)
- **Purpose:** User management (admin only)
- **Data:** `profiles`, `user_roles`, `auth.users` (via admin API if available)

---

### 5.2 CLIENT MODULE

#### 5.2.1 ClientVault (`src/pages/client/Vault.tsx`)
- **Purpose:** Investors/Sellers view their assigned datarooms
- **Flow:**
  1. Fetch vaults via `has_vault_access` / `vault_permissions` / `client_id` / domain
  2. **NDA Check:** If NDA template exists for role → check `nda_signatures`
  3. If unsigned → show `NDAOverlay` (must sign or decline)
  4. If signed/not required → show folder tree + documents
- **Components:** `NDAOverlay`, folder tree, document list, `DocumentViewerModal`
- **Data:** `vaults`, `folders`, `documents`, `nda_templates`, `nda_signatures`

---

### 5.3 NDA MODULE

#### 5.3.1 NDAOverlay (`src/components/NDAOverlay.tsx`)
- **Purpose:** Block dataroom access until NDA is signed
- **Props:** `vaultId`, `roleType` (seller|investor), `onAgree`, `onDecline`
- **Data:** `nda_templates` (fetch template), `supabase.storage` (signed URL for PDF)
- **Actions:** User signs → `onAgree(name, company)` → parent inserts `nda_signatures`

#### 5.3.2 NDASignatureComponent
- **Purpose:** Form for name + company, triggers `onAgree`

#### 5.3.3 NDA Data Flow
```
Admin (VaultDetail) → Upload NDA template → nda_templates + storage
                                                    ↓
Client (Vault) → check nda_templates for role → check nda_signatures
                                                    ↓
         If unsigned → NDAOverlay → User signs → insert nda_signatures
                                                    ↓
         If signed → Allow access to documents
```

---

### 5.4 DOCUMENT MODULE

#### 5.4.1 Document Fetcher (`src/services/fraud/documentFetcher.ts`)
- **`fetchAllFilesFromVault(vaultId)`:** Used by CIM, Teaser, Fraud Analysis
  - Queries `documents` table for vault
  - Downloads each file from `supabase.storage.from('documents')`
  - Returns `DocumentFile[]` (name, path, size, type, content)
- **`fetchDocumentsViaAuditor(sessionId)`:** Used by public Auditor
  - Calls fraud-backend `/api/auditor` or `auditor-public` Edge Function
  - Backend uses service role to bypass RLS and fetch from storage
  - Returns documents with base64 content

#### 5.4.2 DocumentViewer (`src/pages/DocumentViewer.tsx`)
- **Purpose:** View/edit documents (PDF, DOCX, images, etc.)
- **Route:** `/document/:documentId`
- **Data:** `documents` table, storage download
- **Features:** View, edit (DOCX), save, download
- **Uses:** mammoth (DOCX→HTML), docx (edit), html2canvas, jspdf

#### 5.4.3 DocumentViewerModal
- **Purpose:** In-page modal to preview document without leaving vault
- **Used by:** VaultDetail, ClientVault

#### 5.4.4 File Upload
- **VaultDetail:** Upload to storage, insert `documents` row
- **FileUploadProgress:** Shows upload progress
- **Utils:** `fileCompression`, `fileSplitter` (for large files)

---

### 5.5 AUDIT MODULE (Forensic AI Audit)

#### 5.5.1 Audit API (`src/services/auditVaultApi.ts`)
- **Config:** Uses `VITE_FRAUD_BACKEND_URL` when set, else Supabase Edge Function `audit-vault`
- **Actions:** `start`, `run`, `status`, `cancel`
- **Backend Mapping:** `audit-start`, `audit-run`, `audit-status`, `audit-cancel`
- **Flow:** JWT from `supabase.auth.getSession()` → Bearer token to backend

#### 5.5.2 Auditor (Public) (`src/pages/Auditor.tsx`)
- **Purpose:** Public audit flow — no login required
- **Steps:** Form (name, company) → Upload documents → Run audit → View report; optional CIM generation
- **Flow:**
  1. `create-session` (auditor-public or fraud-backend) → creates vault, folder, `auditor_sessions`
  2. User uploads files → signed upload URL → storage + `documents`
  3. `audit-start` → creates `audit_jobs` row
  4. `audit-run` → processes documents, generates report (via audit-vault Edge Function or fraud-backend)
  5. Poll `audit-status` for progress
  6. Display `report_markdown`
  7. **CIM (optional):** Uses `fetchDocumentsViaAuditor(sessionId)` → `runCIMGeneration` with prefetched docs → displays CIM report
- **Session Storage:** `nidhi:auditor:session` (sessionId, vaultId, folderId)

#### 5.5.3 VaultDetail Audit Tab
- **Purpose:** Run audit on existing admin dataroom
- **Flow:** `audit-start` → `audit-run` (or resume) → poll status → display report
- **Background Polling:** `setAuditBackgroundActive(vaultId, jobId)` → `AuditBackgroundPoller` continues when user navigates away

#### 5.5.4 AuditBackgroundPoller (`src/components/AuditBackgroundPoller.tsx`)
- **Purpose:** Poll active audit jobs in background
- **Storage:** `localStorage` keys `nidhi:auditBackground:{vaultId}` = jobId
- **Poll:** Every 5s, calls `auditVaultInvoke({ action: 'run', jobId, maxFiles: 2 })`
- **Cleanup:** Removes key when job completed/failed/cancelled

#### 5.5.5 Audit Backend Chain
```
Frontend (auditVaultInvoke)
    ↓
Option A: VITE_FRAUD_BACKEND_URL → nidhi-fraud-backend /api/auditor
Option B: Supabase Edge Function audit-vault
    ↓
audit-vault: Fetches documents from storage (service role), runs Claude AI analysis,
             writes audit_jobs.report_markdown, audit_job_files
```

---

### 5.6 CIM MODULE (Confidential Information Memorandum)

#### 5.6.1 CIM Controller (`src/services/CIM/cimGenerationController.ts`)
- **`runCIMGeneration(vaultId, vaultName, userId, signal?, runId?, prefetchedDocuments?)`**
- **Flow:**
  1. `fetchAllFilesFromVault(vaultId)` (or use prefetched)
  2. Convert files to base64
  3. POST to `VITE_CIM_BACKEND_URL/api/cim-generation` (default localhost:3003)
  4. Returns `CIMReport` (cimReport HTML, filesAnalyzed)
- **`getFormattedCIM`:** Format report for display

#### 5.6.2 CIM Backend (nidhi-cim-backend)
- **Env:** `GOOGLE_API_KEY`
- **Endpoint:** `POST /api/cim-generation`
- **Input:** documents (base64), vaultId, vaultName, userId, runId
- **Output:** cimReport (HTML), filesAnalyzed

#### 5.6.3 CIM in VaultDetail
- **Tab:** CIM Generation
- **Stores:** May persist to `cim_reports` table (if exists)
- **Load:** `loadLatestCim` fetches from `cim_reports` for vault

---

### 5.7 TEASER MODULE

#### 5.7.1 Teaser Controller (`src/services/teaser/teaserGenerationController.ts`)
- **`runTeaserGeneration(vaultId, vaultName, userId, abortSignal?, prefetchedDocuments?)`**
- **Flow:** Same as CIM — fetch docs → base64 → POST to `VITE_TEASER_BACKEND_URL/api/teaser-generation` (default localhost:3004)
- **Output:** TeaserReport (2-page investment teaser)

#### 5.7.2 Teaser Backend (nidhi-teaser-backend)
- **Env:** `CLAUDE_API_KEY`
- **Endpoint:** `POST /api/teaser-generation`

---

### 5.8 FRAUD ANALYSIS MODULE (Legacy/Alternative)

#### 5.8.1 Fraud Controller (`src/services/fraud/fraudAnalysisController.ts`)
- **`runFraudAnalysis(vaultId, userId)`**
- **Flow:** fetchAllFilesFromVault → base64 → POST to `localhost:3001/api/fraud-analysis`
- **Output:** FraudAnalysisReport (risk score, analysis, findings)

#### 5.8.2 Fraud Backend (nidhi-fraud-backend)
- **Env:** `CLAUDE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Endpoints:**
  - `POST /api/fraud-analysis` — fraud analysis
  - `POST /api/auditor` — auditor actions (create-session, fetch-documents, audit-start, audit-run, audit-status, audit-cancel)

---

### 5.9 RAG / CHAT MODULE

#### 5.9.1 RAG API (`src/services/ragApi.ts`)
- **Base URL:** `VITE_API_URL` (default localhost:5000)
- **Endpoints:**
  - `POST /rag/index` — index document
  - `POST /rag/sessions` — create chat session
  - `GET /rag/sessions/:vaultId` — list sessions
  - `GET /rag/messages/:sessionId` — get messages
  - (implied) POST for chat message
- **Auth:** Bearer token from Supabase session

#### 5.9.2 ChatWidget (`src/components/ChatWidget/ChatWidget.tsx`)
- **Purpose:** Global chat widget (bottom-right) when authenticated
- **Gets vaultId from URL:** `/admin/vaults/:vaultId` or `/vault/:vaultId`
- **Subcomponents:** ChatWindow, ChatMessage, ChatInput, FinancialTerms, FeedbackForm

#### 5.9.3 Hooks
- `useRagChat` — RAG chat logic
- `useChat` — generic chat logic

---

### 5.10 BUYER MAPPING

- **Location:** VaultDetail → Buyer Mapping dialog
- **Behavior:** Simulated progress bar, then downloads static file `/assets/buyerMap.xlsx`
- **No backend:** Uses pre-built Excel from public assets

---

## 6. BACKEND SERVICES (nidhi-backends)

| Service | Port/URL | Purpose |
|---------|----------|---------|
| nidhi-fraud-backend | VITE_FRAUD_BACKEND_URL | Fraud analysis, Auditor API proxy (create-session, fetch-documents, audit-*) |
| nidhi-cim-backend | VITE_CIM_BACKEND_URL (3003) | CIM generation |
| nidhi-teaser-backend | VITE_TEASER_BACKEND_URL (3004) | Teaser generation |

**Render deploy:** `render.yaml` defines all three services.

---

## 7. SUPABASE EDGE FUNCTIONS

| Function | Purpose |
|----------|---------|
| auditor-public | Public auditor: create-session, upload, fetch-documents, audit-* (when fraud backend not used) |
| audit-vault | Forensic audit: processes documents, runs Claude, writes audit_jobs |

---

## 8. INTERCONNECTION MATRIX

| From | To | Connection Type |
|------|-----|-----------------|
| App | AuthContext | Provider |
| App | AuditBackgroundPoller | Global component |
| App | ChatWidget | Global component |
| VaultDetail | auditVaultApi | API call |
| VaultDetail | cimGenerationController | API call |
| VaultDetail | teaserGenerationController | API call |
| VaultDetail | documentFetcher (via CIM/Teaser) | Indirect |
| VaultDetail | AuditBackgroundPoller (set/clear) | Function export |
| Auditor | auditor-public / fraud-backend | API call |
| Auditor | documentFetcher.fetchDocumentsViaAuditor | Fetches docs for CIM generation |
| Auditor | cimGenerationController.runCIMGeneration | CIM report in auditor flow |
| CIM/Teaser | documentFetcher.fetchAllFilesFromVault | Service |
| ClientVault | NDAOverlay | Component |
| ClientVault | nda_templates, nda_signatures | Supabase |
| NDAOverlay | nda_templates, storage | Supabase |
| DocumentViewer | documents, storage | Supabase |
| Fraud controller | documentFetcher | Service |
| RAG/ChatWidget | ragApi | API call |
| All authenticated pages | supabase.auth, has_vault_access | Auth/RLS |

---

## 9. ENVIRONMENT VARIABLES

| Variable | Purpose |
|----------|---------|
| VITE_SUPABASE_URL | Supabase project URL |
| VITE_SUPABASE_PUBLISHABLE_KEY | Supabase anon key |
| VITE_FRAUD_BACKEND_URL | Fraud/auditor backend URL |
| VITE_USE_FRAUD_BACKEND | "false" to use Edge Functions instead |
| VITE_CIM_BACKEND_URL | CIM backend (default localhost:3003) |
| VITE_TEASER_BACKEND_URL | Teaser backend (default localhost:3004) |
| VITE_API_URL | RAG API (default localhost:5000) |

---

## 10. FLOWCHART GENERATION INSTRUCTIONS FOR AI

When generating flowcharts from this document, create:

1. **System Context Diagram:** Nidhi Dataroom as center, with: Frontend (React), Supabase (DB + Auth + Storage + Edge Functions), nidhi-fraud-backend, nidhi-cim-backend, nidhi-teaser-backend, RAG API.

2. **User Flow Diagrams:**
   - Admin: Login → Dashboard → Vaults → VaultDetail → (Documents | Audit | CIM | Teaser | NDA | Permissions)
   - Client: Login → Vault → NDA check → Documents
   - Public Auditor: Auditor page → Form → Upload → Audit → Report

3. **Data Flow Diagrams:**
   - Document flow: Upload → storage + documents table → fetchAllFilesFromVault / fetchDocumentsViaAuditor → CIM/Teaser/Audit backends
   - NDA flow: Admin uploads template → nda_templates + storage → Client checks → nda_signatures
   - Audit flow: audit-start → audit_jobs → audit-run → audit-vault/fraud-backend → report_markdown

4. **Module Dependency Graph:** Show which modules import/call which (e.g., VaultDetail → auditVaultApi, cimGenerationController, documentFetcher).

5. **Database ER Diagram:** vaults, folders, documents, vault_permissions, nda_templates, nda_signatures, audit_jobs, audit_job_files, auditor_sessions, profiles, user_roles, activity_logs.

---

---

## 11. NOTE ON PROJECT STRUCTURE

- **Main app:** `src/` — This document describes the main application.
- **nidhiDataroom/:** Alternate or legacy version of the dataroom module; may have slight variations. Use `src/` as the canonical reference.
- **nidhi-backends/:** Contains fraud-backend, cim-backend, teaser-backend (Node.js services).

---

*End of Nidhi Dataroom Architecture Document*
