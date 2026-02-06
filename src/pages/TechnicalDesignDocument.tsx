import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function TechnicalDesignDocument() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadAsWord = async () => {
    setIsGenerating(true);
    try {
      // Dynamic import to reduce bundle size
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
      
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              // Title Page
              new Paragraph({
                text: "NIDHI VAULT",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "Technical Design Document",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "Version 1.0",
                alignment: AlignmentType.CENTER,
                spacing: { after: 800 },
              }),
              new Paragraph({
                text: "Prepared by: Senior Software Engineering Team",
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                alignment: AlignmentType.CENTER,
                spacing: { after: 1200 },
              }),

              // Table of Contents
              new Paragraph({
                text: "TABLE OF CONTENTS",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 400 },
              }),
              new Paragraph({
                text: "1. Executive Summary",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "2. System Overview",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "3. Architecture Design",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "4. Technology Stack",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "5. Database Design",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "6. Security Architecture",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "7. API Design",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "8. Frontend Architecture",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "9. File Management System",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "10. SDLC Processes",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "11. Software Development Process (SDP)",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "12. Testing Strategy",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "13. Deployment Architecture",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "14. Performance Considerations",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "15. Scalability & Future Enhancements",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "16. Risk Management",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "17. Maintenance & Operations",
                spacing: { after: 400 },
              }),

              // 1. Executive Summary
              new Paragraph({
                text: "1. EXECUTIVE SUMMARY",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "Nidhi Vault is a secure, cloud-based document management and virtual data room (VDR) platform designed for investment banking, M&A transactions, and sensitive business document sharing. The system provides enterprise-grade security, role-based access control, and comprehensive audit trails for document access and modifications.",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "The platform enables organizations to create secure datarooms (vaults), manage document hierarchies through folders, control granular permissions, and enforce Non-Disclosure Agreement (NDA) workflows before granting document access. The system is built on modern web technologies with a focus on security, scalability, and user experience.",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Key Features:",
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Secure document storage and management",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Role-based access control (Admin, Seller, Investor)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Granular vault-level permissions (View, Edit, Upload, Delete)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• NDA signature workflow enforcement",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Document watermarking for downloaded files",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Large file upload support with compression and chunking",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Real-time upload progress tracking",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Activity logging and audit trails",
                spacing: { after: 400 },
              }),

              // 2. System Overview
              new Paragraph({
                text: "2. SYSTEM OVERVIEW",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "2.1 Purpose",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Nidhi Vault serves as a secure document repository for sensitive business transactions, enabling controlled sharing of confidential documents with authorized parties while maintaining comprehensive access controls and compliance requirements.",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "2.2 System Scope",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "The system encompasses:",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• User authentication and authorization",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Vault (dataroom) creation and management",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Document upload, storage, and retrieval",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Folder-based document organization",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Permission management at vault and user levels",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• NDA template management and signature tracking",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Document viewing and downloading with watermarking",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Activity logging and audit capabilities",
                spacing: { after: 400 },
              }),

              // 3. Architecture Design
              new Paragraph({
                text: "3. ARCHITECTURE DESIGN",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "3.1 System Architecture",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Nidhi Vault follows a modern three-tier architecture:",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Presentation Layer (Frontend):",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• React 18 with TypeScript for type-safe component development",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Vite for build tooling and development server",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• React Router for client-side routing",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• TanStack Query for server state management and caching",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Tailwind CSS with shadcn/ui components for UI",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Application Layer (Backend):",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• Supabase as Backend-as-a-Service (BaaS)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• PostgreSQL database with Row Level Security (RLS)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Supabase Auth for authentication",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Supabase Storage for document file storage",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database functions (PL/pgSQL) for business logic",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Data Layer:",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• PostgreSQL relational database",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Supabase Storage (S3-compatible object storage)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Row Level Security policies for data access control",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "3.2 Data Flow",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "1. User authenticates via Supabase Auth",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "2. Frontend receives JWT token and stores in session",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "3. All API requests include JWT in Authorization header",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "4. Supabase validates token and applies RLS policies",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "5. Database functions execute with SECURITY DEFINER context",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "6. Results filtered by RLS policies before returning to client",
                spacing: { after: 400 },
              }),

              // 4. Technology Stack
              new Paragraph({
                text: "4. TECHNOLOGY STACK",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "4.1 Frontend Technologies",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• React 18.3.1 - UI framework with hooks and concurrent features",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• TypeScript 5.8.3 - Type safety and developer experience",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Vite 7.3.1 - Fast build tool and HMR development server",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• React Router 6.30.1 - Client-side routing",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• TanStack Query 5.83.0 - Server state management, caching, and synchronization",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Tailwind CSS 3.4.17 - Utility-first CSS framework",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• shadcn/ui - Accessible component library built on Radix UI",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• React Hook Form 7.61.1 + Zod 3.25.76 - Form validation",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• pdf-lib 1.17.1 - PDF manipulation for watermarking",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• jszip 3.10.1 - File compression for large uploads",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• mammoth 1.11.0 - Word document processing",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• exceljs 4.4.0 - Excel file processing",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "4.2 Backend Technologies",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Supabase - Open-source Firebase alternative",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• PostgreSQL 14.1+ - Relational database with advanced features",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• PL/pgSQL - Stored procedures and functions",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Supabase Auth - JWT-based authentication",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Supabase Storage - S3-compatible object storage",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "4.3 Development Tools",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• ESLint 9.32.0 - Code linting and quality",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• TypeScript ESLint - TypeScript-specific linting rules",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• PostCSS - CSS processing",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Cursor IDE with AI assistance - Development environment",
                spacing: { after: 400 },
              }),

              // 5. Database Design
              new Paragraph({
                text: "5. DATABASE DESIGN",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "5.1 Database Schema",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "The database uses PostgreSQL with the following core tables:",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "profiles - User profile information",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• id (UUID, PK, FK → auth.users)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• email (TEXT, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• full_name (TEXT)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• company_name (TEXT)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• phone (TEXT)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• created_at, updated_at (TIMESTAMPTZ)",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "user_roles - Role assignment table",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• id (UUID, PK)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• user_id (UUID, FK → auth.users, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• role (app_role ENUM: 'admin', 'seller', 'investor')",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• UNIQUE(user_id, role)",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "vaults - Business datarooms",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• id (UUID, PK)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• name (TEXT, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• description (TEXT)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• client_id (UUID, FK → auth.users)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• created_by (UUID, FK → auth.users, NOT NULL)",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "vault_permissions - Granular access control",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• id (UUID, PK)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• vault_id (UUID, FK → vaults, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• user_id (UUID, FK → auth.users, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• can_view (BOOLEAN, DEFAULT true)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• can_edit (BOOLEAN, DEFAULT false)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• can_upload (BOOLEAN, DEFAULT false)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• can_delete (BOOLEAN, DEFAULT false)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• UNIQUE(vault_id, user_id)",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "folders - Document folder hierarchy",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• id (UUID, PK)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• vault_id (UUID, FK → vaults, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• parent_id (UUID, FK → folders, self-referential)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• name (TEXT, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• created_by (UUID, FK → auth.users, NOT NULL)",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "documents - Document metadata",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• id (UUID, PK)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• vault_id (UUID, FK → vaults, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• folder_id (UUID, FK → folders)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• name (TEXT, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• file_path (TEXT, NOT NULL) - Storage path",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• file_size (BIGINT)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• file_type (TEXT)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• uploaded_by (UUID, FK → auth.users, NOT NULL)",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "nda_templates - NDA template documents",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• id (UUID, PK)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• vault_id (UUID, FK → vaults, NOT NULL, UNIQUE)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• file_path (TEXT, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• file_name, file_size, file_type",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• uploaded_by (UUID, FK → auth.users, NOT NULL)",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "nda_signatures - NDA signature tracking",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• id (UUID, PK)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• vault_id (UUID, FK → vaults, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• user_id (UUID, FK → auth.users, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• template_id (UUID, FK → nda_templates, NOT NULL)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• status (TEXT: 'signed', 'declined')",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• signature_name, signature_company",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• signed_document_path (TEXT)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• signed_at (TIMESTAMPTZ)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• UNIQUE(vault_id, user_id)",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "5.2 Database Functions",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "has_role(user_id UUID, role app_role) → BOOLEAN",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• SECURITY DEFINER function to check user roles",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Used in RLS policies for access control",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "has_vault_access(user_id UUID, vault_id UUID) → BOOLEAN",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• Checks if user has view access to vault",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Considers vault_permissions, client_id, created_by, and admin role",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "handle_new_user() → TRIGGER",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• Automatically creates profile when user signs up",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Triggered AFTER INSERT ON auth.users",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "update_updated_at_column() → TRIGGER",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• Updates updated_at timestamp on row modification",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Applied to profiles, vaults, folders, documents",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "5.3 Row Level Security (RLS)",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "All tables have RLS enabled with comprehensive policies:",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Users can only access data they're authorized for",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Admins have full access to all resources",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Vault owners (client_id, created_by) have full access to their vaults",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Permissions are checked at database level, not application level",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Storage policies mirror database RLS for file access",
                spacing: { after: 400 },
              }),

              // 6. Security Architecture
              new Paragraph({
                text: "6. SECURITY ARCHITECTURE",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "6.1 Authentication",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Supabase Auth handles user authentication",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• JWT tokens issued upon successful login",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Tokens include user ID and metadata",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Email/password authentication with secure password hashing",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Admin-created users are auto-confirmed via database function",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "6.2 Authorization",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "Role-Based Access Control (RBAC):",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• Admin: Full system access, user management, vault management",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Seller: Can access assigned vaults, sign NDAs, upload documents",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Investor: Can access assigned vaults, view documents (read-only typically)",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Permission-Based Access Control (PBAC):",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• Granular permissions per user per vault",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• can_view: View documents and folders",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• can_edit: Modify document metadata and folders",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• can_upload: Upload new documents",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• can_delete: Delete documents and folders",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "6.3 Data Security",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• All database queries filtered by RLS policies",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Storage bucket is private (public: false)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• File paths include user/vault identifiers for access control",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Documents downloaded with watermarking to prevent unauthorized sharing",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Activity logs track all document access and modifications",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "6.4 NDA Workflow Security",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• NDA templates stored securely in storage",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Users must sign NDA before accessing vault documents",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Signature status checked on every document access attempt",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Signed NDAs stored with user signature metadata",
                spacing: { after: 400 },
              }),

              // 7. API Design
              new Paragraph({
                text: "7. API DESIGN",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "7.1 Supabase Client API",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "The application uses Supabase JavaScript client library for all backend interactions:",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Authentication API:",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• supabase.auth.signUp() - User registration",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.auth.signInWithPassword() - User login",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.auth.signOut() - User logout",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.auth.getSession() - Get current session",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Database API (PostgREST):",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• supabase.from('table').select() - Query data",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.from('table').insert() - Create records",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.from('table').update() - Update records",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.from('table').delete() - Delete records",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Storage API:",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• supabase.storage.from('bucket').upload() - Upload files",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.storage.from('bucket').download() - Download files",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.storage.from('bucket').remove() - Delete files",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• supabase.storage.from('bucket').list() - List files",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "7.2 Database Functions (RPC)",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• supabase.rpc('function_name', { params }) - Call stored procedures",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Used for complex operations like role assignment, email confirmation",
                spacing: { after: 400 },
              }),

              // 8. Frontend Architecture
              new Paragraph({
                text: "8. FRONTEND ARCHITECTURE",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "8.1 Component Structure",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Pages:",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• / - Landing page (Index.tsx)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /auth - Authentication (sign in/sign up)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /dashboard - User dashboard",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /admin/users - User management (admin only)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /admin/vaults - Vault management (admin only)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /admin/vaults/:vaultId - Vault detail view",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /admin/vaults/:vaultId/permissions - Permission management",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /vault - Client vault view",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /vault/:vaultId - Specific vault view",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /document/:documentId - Document viewer",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• /settings - User settings",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Components:",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• DashboardLayout - Main application layout with sidebar",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Sidebar - Navigation sidebar",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• FileUploadProgress - Upload progress tracking UI",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• DocumentViewerModal - Document preview modal",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• NDAOverlay - NDA signature requirement overlay",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• NDASignatureComponent - NDA signing interface",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "8.2 State Management",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• React Context API (AuthContext) - Global authentication state",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• TanStack Query - Server state, caching, background updates",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Local component state - UI-specific state (dialogs, forms)",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "8.3 Routing",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• React Router for client-side routing",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Protected routes based on authentication and role",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Route guards check user permissions before rendering",
                spacing: { after: 400 },
              }),

              // 9. File Management System
              new Paragraph({
                text: "9. FILE MANAGEMENT SYSTEM",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "9.1 File Upload Process",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "1. User selects file(s) via file input",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "2. Frontend checks file size against 50MB limit (Supabase Free Plan)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "3. If file > 50MB, attempt compression using jszip or native CompressionStream",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "4. If compression insufficient, split file into 45MB chunks",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "5. Upload file(s) to Supabase Storage with progress tracking",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "6. Create document record in database with metadata",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "7. Log upload activity",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "9.2 File Storage Structure",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "Storage path format: {vault_id}/{folder_id}/{timestamp}_{index}_{filename}",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• vault_id - Identifies the dataroom",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• folder_id - Optional folder organization",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• timestamp - Upload timestamp for uniqueness",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• index - Chunk index for split files",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• filename - Original or compressed filename",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "9.3 File Download & Watermarking",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "1. User requests document download",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "2. Frontend fetches file from Supabase Storage",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "3. Apply watermark based on file type:",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "   • PDF: Use pdf-lib to embed circular Samaveda Capital logo watermark",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "   • Images: Use Canvas API to draw circular watermark",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "4. Watermark is centered, circular, semi-transparent (18% opacity)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "5. Trigger browser download of watermarked file",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "6. Log download activity",
                spacing: { after: 400 },
              }),

              // 10. SDLC Processes
              new Paragraph({
                text: "10. SOFTWARE DEVELOPMENT LIFECYCLE (SDLC) PROCESSES",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "10.1 Development Methodology",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "The project follows an Agile/Iterative development approach:",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Sprint-based development cycles",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Continuous integration and deployment",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Feature-driven development with incremental releases",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Regular code reviews and quality checks",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "10.2 Version Control",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Git for source code version control",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Branching strategy: feature branches, main/master for production",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Commit messages follow conventional commit format",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database migrations tracked in supabase/migrations/",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "10.3 Code Quality",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• TypeScript for type safety and compile-time error detection",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• ESLint for code linting and style enforcement",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Component-based architecture for reusability",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Consistent naming conventions and code organization",
                spacing: { after: 400 },
              }),

              // 11. Software Development Process (SDP)
              new Paragraph({
                text: "11. SOFTWARE DEVELOPMENT PROCESS (SDP)",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "11.1 Requirements Analysis",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Business requirements documented and reviewed",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Functional and non-functional requirements identified",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• User stories and acceptance criteria defined",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "11.2 Design Phase",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• System architecture designed and documented",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database schema designed with proper normalization",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• UI/UX mockups and wireframes created",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Security architecture and access control designed",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "11.3 Implementation",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Frontend components developed with React and TypeScript",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Backend logic implemented via database functions and RLS",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Integration with Supabase services (Auth, Storage, Database)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Utility functions for file processing, compression, watermarking",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "11.4 Testing",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Manual testing of all user flows",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Security testing of RLS policies and access controls",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• File upload/download testing with various file types and sizes",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Cross-browser compatibility testing",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "11.5 Deployment",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Frontend deployed to Vercel (or similar platform)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database migrations applied to production Supabase instance",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Environment variables configured for production",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Post-deployment verification and smoke testing",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "11.6 Maintenance",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Regular dependency updates and security patches",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Performance monitoring and optimization",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Bug fixes and feature enhancements",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database backup and recovery procedures",
                spacing: { after: 400 },
              }),

              // 12. Testing Strategy
              new Paragraph({
                text: "12. TESTING STRATEGY",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "12.1 Unit Testing",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Test individual React components in isolation",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Test utility functions (compression, watermarking, file splitting)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Test database functions with various inputs",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "12.2 Integration Testing",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Test API integrations with Supabase",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Test authentication and authorization flows",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Test file upload/download workflows",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "12.3 Security Testing",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Verify RLS policies prevent unauthorized access",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Test role-based access control",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Verify NDA enforcement before document access",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Test storage policies for file access control",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "12.4 User Acceptance Testing (UAT)",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Test all user workflows end-to-end",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Verify UI/UX meets requirements",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Test with real-world data and scenarios",
                spacing: { after: 400 },
              }),

              // 13. Deployment Architecture
              new Paragraph({
                text: "13. DEPLOYMENT ARCHITECTURE",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "13.1 Frontend Deployment",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Static site hosted on Vercel (or similar CDN)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Build process: Vite production build",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Environment variables for Supabase URL and keys",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Automatic deployments on git push to main branch",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "13.2 Backend Deployment",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Supabase cloud-hosted PostgreSQL database",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database migrations applied via Supabase CLI or dashboard",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Supabase Storage for file storage",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Supabase Auth for authentication service",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "13.3 Environment Configuration",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "Development:",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• Local Supabase instance or development project",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Vite dev server on localhost:8080",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Production:",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "• Production Supabase project",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Production domain with HTTPS",
                spacing: { after: 400 },
              }),

              // 14. Performance Considerations
              new Paragraph({
                text: "14. PERFORMANCE CONSIDERATIONS",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "14.1 Frontend Performance",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Code splitting and lazy loading of components",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Dynamic imports for heavy libraries (pdf-lib, jszip)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• TanStack Query caching reduces redundant API calls",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Optimized bundle size with Vite tree-shaking",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Image optimization and lazy loading",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "14.2 Database Performance",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Indexes on foreign keys and frequently queried columns",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Efficient RLS policies to minimize query overhead",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database functions use STABLE/SECURITY DEFINER appropriately",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Connection pooling via Supabase",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "14.3 File Upload Performance",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Client-side compression reduces upload time and storage",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• File chunking for large files enables resumable uploads (future)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Progress tracking provides user feedback",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Parallel uploads for multiple files",
                spacing: { after: 400 },
              }),

              // 15. Scalability & Future Enhancements
              new Paragraph({
                text: "15. SCALABILITY & FUTURE ENHANCEMENTS",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "15.1 Current Limitations",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Supabase Free Plan: 50MB file size limit",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Workaround: Client-side compression and file splitting",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Recommended: Upgrade to Supabase Pro Plan (500GB file limit)",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "15.2 Scalability Considerations",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Supabase scales automatically with usage",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database can handle thousands of concurrent users",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Storage scales to petabytes with Supabase Pro",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• CDN for static assets improves global performance",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "15.3 Future Enhancements",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Real-time document collaboration",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Advanced search and full-text indexing",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Document versioning and revision history",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Email notifications for document access and changes",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Advanced analytics and reporting",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Mobile applications (iOS/Android)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Two-factor authentication (2FA)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• SSO integration (SAML, OAuth)",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Custom branding per organization",
                spacing: { after: 400 },
              }),

              // 16. Risk Management
              new Paragraph({
                text: "16. RISK MANAGEMENT",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "16.1 Technical Risks",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Risk: Supabase service outage",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "Mitigation: Supabase provides 99.9% SLA, monitoring and alerts",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Risk: Large file upload failures",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "Mitigation: Compression and chunking, retry mechanisms, progress tracking",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Risk: Security vulnerabilities",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "Mitigation: Regular security audits, dependency updates, RLS policies",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "16.2 Business Risks",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "Risk: Data loss",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "Mitigation: Regular database backups, Supabase automated backups",
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "Risk: Compliance issues",
                spacing: { before: 200, after: 100 },
              }),
              new Paragraph({
                text: "Mitigation: Audit logs, access controls, NDA enforcement",
                spacing: { after: 400 },
              }),

              // 17. Maintenance & Operations
              new Paragraph({
                text: "17. MAINTENANCE & OPERATIONS",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "17.1 Monitoring",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• Supabase dashboard for database and storage metrics",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Application error logging via browser console and Supabase logs",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Activity logs in database for audit trail",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "17.2 Backup & Recovery",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Supabase automated daily backups",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Point-in-time recovery available with Supabase Pro",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Manual backup procedures for critical data",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "17.3 Updates & Patches",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Regular dependency updates via npm audit",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Security patches applied promptly",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Database migrations tested in development before production",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "17.4 Documentation",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Code comments and inline documentation",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• README files for setup and deployment",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Migration guides for database changes",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• This Technical Design Document",
                spacing: { after: 400 },
              }),

              // Appendix
              new Paragraph({
                text: "APPENDIX",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 300 },
              }),
              new Paragraph({
                text: "A. Glossary",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
              }),
              new Paragraph({
                text: "• VDR: Virtual Data Room",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• RLS: Row Level Security",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• RBAC: Role-Based Access Control",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• PBAC: Permission-Based Access Control",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• NDA: Non-Disclosure Agreement",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• JWT: JSON Web Token",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• BaaS: Backend-as-a-Service",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• HMR: Hot Module Replacement",
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: "B. References",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({
                text: "• Supabase Documentation: https://supabase.com/docs",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• React Documentation: https://react.dev",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• PostgreSQL Documentation: https://www.postgresql.org/docs/",
                spacing: { after: 100 },
              }),
              new Paragraph({
                text: "• Vite Documentation: https://vitejs.dev",
                spacing: { after: 400 },
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Nidhi_Vault_Technical_Design_Document_${new Date().toISOString().split('T')[0]}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Document Generated',
        description: 'Technical Design Document downloaded successfully',
      });
    } catch (error) {
      console.error('Error generating document:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate document. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-4xl mx-auto">
        <div className="surface-elevated border border-gold/10 rounded-xl p-8 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-gold" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl text-foreground">Technical Design Document</h1>
              <p className="text-sm text-muted-foreground mt-1">Nidhi Vault - Complete System Documentation</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="text-muted-foreground mb-6">
              This document provides a comprehensive technical overview of the Nidhi Vault application, 
              including architecture, technology stack, database design, security, SDLC processes, and more.
            </p>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
              <h3 className="text-foreground font-semibold mb-2">Document Contents</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Executive Summary</li>
                <li>System Overview & Architecture</li>
                <li>Technology Stack Details</li>
                <li>Database Design & Schema</li>
                <li>Security Architecture</li>
                <li>API Design</li>
                <li>Frontend Architecture</li>
                <li>File Management System</li>
                <li>SDLC Processes</li>
                <li>Software Development Process (SDP)</li>
                <li>Testing Strategy</li>
                <li>Deployment Architecture</li>
                <li>Performance Considerations</li>
                <li>Scalability & Future Enhancements</li>
                <li>Risk Management</li>
                <li>Maintenance & Operations</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                variant="gold"
                onClick={downloadAsWord}
                disabled={isGenerating}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                {isGenerating ? 'Generating Document...' : 'Download as Word Document'}
              </Button>
            </div>

            {isGenerating && (
              <p className="text-sm text-muted-foreground mt-4">
                Generating document... This may take a few moments.
              </p>
            )}
          </div>
        </div>

        <div className="surface-elevated border border-gold/10 rounded-xl p-6">
          <h2 className="font-display text-xl text-foreground mb-4">Quick Access</h2>
          <p className="text-sm text-muted-foreground mb-4">
            After downloading, you can delete this page from the codebase if desired.
          </p>
          <p className="text-xs text-muted-foreground">
            Route: <code className="bg-muted px-2 py-1 rounded">/technical-design-document</code>
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
