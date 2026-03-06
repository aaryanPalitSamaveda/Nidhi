# Nidhi - Smart & Secure Dataroom

**Description (for NVIDIA dev credits form, 200–500 chars):**

Nidhi is an AI-powered smart dataroom for secure document sharing and forensic audit. It offers role-based access control, encrypted vaults, AI document extraction, and an automated forensic audit agent that analyzes uploaded documents for red flags with evidence-cited reports. Built for due diligence and compliance workflows.

---

**Technical Document (max 1000 chars):**

**Architecture:** React/Vite frontend, Node.js backends (fraud, CIM, teaser), Supabase (PostgreSQL, Auth, Storage, Edge Functions). Deployed on Vercel + Render.

**Stack:** TypeScript, Tailwind, Radix UI, Supabase JS, OpenAI/Claude APIs. Document processing: pdfjs-dist, mammoth, xlsx, tesseract.js, sharp.

**Features:** Vault-based document storage with folder hierarchy; RLS-backed RBAC (admin/client roles); signed upload URLs; public auditor flow (no login); forensic audit pipeline (extract → AI analysis → evidence-cited report).

**AI Pipeline:** Edge Function `audit-vault` extracts text (PDF, DOCX, XLSX, images via OCR), runs per-document analysis, merges forensic backend (Claude) output, synthesizes markdown report with citations. Fraud backend: Claude for fraud/forensic analysis.

**Security:** JWT auth, service-role server-side ops, RLS policies, domain-restricted access.
