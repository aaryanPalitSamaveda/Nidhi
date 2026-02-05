# Nidhi Vault - Technical Design Flowcharts

This document contains all flowcharts and diagrams referenced in the Technical Design Document.

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [User Authentication Flow](#2-user-authentication-flow)
3. [User Registration Flow](#3-user-registration-flow)
4. [Admin User Creation Flow](#4-admin-user-creation-flow)
5. [Document Upload Flow](#5-document-upload-flow)
6. [Document Download & Watermarking Flow](#6-document-download--watermarking-flow)
7. [Document Access Control Flow](#7-document-access-control-flow)
8. [NDA Signature Workflow](#8-nda-signature-workflow)
9. [Vault Permission Check Flow](#9-vault-permission-check-flow)
10. [File Compression & Chunking Flow](#10-file-compression--chunking-flow)
11. [Database Query with RLS Flow](#11-database-query-with-rls-flow)
12. [Activity Logging Flow](#12-activity-logging-flow)
13. [Role-Based Access Control Decision Tree](#13-role-based-access-control-decision-tree)

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        A[React Frontend<br/>TypeScript + Vite]
        B[Browser]
    end
    
    subgraph "Application Layer"
        C[Supabase Client SDK]
        D[Supabase Auth]
        E[Supabase Storage]
        F[PostgreSQL Database]
        G[RLS Policies]
        H[Database Functions]
    end
    
    subgraph "Data Layer"
        I[(PostgreSQL<br/>Tables & Data)]
        J[(Supabase Storage<br/>Document Files)]
    end
    
    B --> A
    A --> C
    C --> D
    C --> E
    C --> F
    F --> G
    F --> H
    F --> I
    E --> J
    
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style F fill:#bbf,stroke:#333,stroke-width:2px
    style I fill:#bfb,stroke:#333,stroke-width:2px
    style J fill:#bfb,stroke:#333,stroke-width:2px
```

---

## 2. User Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant SupabaseAuth
    participant Database
    participant AuthContext
    
    User->>Frontend: Enter email/password
    Frontend->>SupabaseAuth: signInWithPassword(email, password)
    SupabaseAuth->>Database: Validate credentials
    Database-->>SupabaseAuth: User data + JWT token
    SupabaseAuth-->>Frontend: Session + JWT token
    Frontend->>AuthContext: Update auth state
    Frontend->>Database: getUserRole(userId)
    Database-->>Frontend: User role (admin/seller/investor)
    Frontend->>Database: getUserProfile(userId)
    Database-->>Frontend: User profile data
    AuthContext-->>User: Authenticated + Redirect to Dashboard
```

---

## 3. User Registration Flow

```mermaid
flowchart TD
    A[User Fills Registration Form] --> B{Validate Form Data}
    B -->|Invalid| C[Show Validation Errors]
    C --> A
    B -->|Valid| D[Call supabase.auth.signUp]
    D --> E{Sign Up Successful?}
    E -->|No| F[Show Error Message]
    F --> A
    E -->|Yes| G[Trigger: handle_new_user]
    G --> H[Create Profile Record]
    H --> I[Wait for Profile Creation]
    I --> J{Profile Created?}
    J -->|No| K[Retry Check]
    K --> J
    J -->|Yes| L[Auto-Confirm Email via RPC]
    L --> M[Assign Default Role: investor]
    M --> N[Show Success Message]
    N --> O[Redirect to Dashboard]
```

---

## 4. Admin User Creation Flow

```mermaid
flowchart TD
    A[Admin Opens Add User Dialog] --> B[Fill User Details<br/>Email, Password, Role, etc.]
    B --> C[Click Create User]
    C --> D[Call supabase.auth.signUp]
    D --> E{User Created?}
    E -->|No| F[Show Error]
    F --> B
    E -->|Yes| G[Wait for Profile Creation<br/>Retry Loop]
    G --> H{Profile Exists?}
    H -->|No| I[Wait 300ms]
    I --> G
    H -->|Yes| J[Update Profile with<br/>Company, Phone, etc.]
    J --> K[Wait 2 seconds for<br/>User Commitment]
    K --> L[Call confirm_user_email RPC]
    L --> M{Email Confirmed?}
    M -->|No| N[Retry up to 3 times]
    N --> L
    M -->|Yes| O[Call assign_user_role RPC]
    O --> P{Role Assigned?}
    P -->|No| Q[Fallback: Direct Insert]
    Q --> P
    P -->|Yes| R[Show Password Dialog]
    R --> S[Admin Copies Credentials]
    S --> T[Close Dialog]
    T --> U[Refresh Users List]
```

---

## 5. Document Upload Flow

```mermaid
flowchart TD
    A[User Selects File(s)] --> B[Initialize Upload Progress]
    B --> C{File Size > 50MB?}
    C -->|No| D[Upload to Supabase Storage]
    C -->|Yes| E[Attempt Compression]
    E --> F{Compression Successful<br/>& Size < 50MB?}
    F -->|Yes| D
    F -->|No| G[Split File into Chunks<br/>45MB each]
    G --> H[Upload Each Chunk]
    H --> I{All Chunks Uploaded?}
    I -->|No| H
    I -->|Yes| J[Create Document Record]
    D --> J
    J --> K[Log Upload Activity]
    K --> L[Update Progress: Success]
    L --> M[Show Success Message]
    
    style E fill:#ffeb3b
    style G fill:#ff9800
    style D fill:#4caf50
    style J fill:#2196f3
```

---

## 6. Document Download & Watermarking Flow

```mermaid
flowchart TD
    A[User Clicks Download] --> B[Check User Permissions]
    B --> C{Has View Permission?}
    C -->|No| D[Show Access Denied]
    C -->|Yes| E[Fetch File from Storage]
    E --> F{File Retrieved?}
    F -->|No| G[Show Error]
    F -->|Yes| H{File Type?}
    H -->|PDF| I[Load pdf-lib]
    I --> J[Load Watermark Logo]
    J --> K[Convert Logo to Circular]
    K --> L[Embed Watermark on Each Page]
    L --> M[Save Watermarked PDF]
    H -->|Image| N[Load Logo Image]
    N --> O[Create Canvas]
    O --> P[Draw Circular Watermark]
    P --> Q[Export Watermarked Image]
    H -->|Other| R[Skip Watermarking]
    M --> S[Create Download Blob]
    Q --> S
    R --> S
    S --> T[Trigger Browser Download]
    T --> U[Log Download Activity]
    
    style I fill:#2196f3
    style N fill:#2196f3
    style L fill:#4caf50
    style P fill:#4caf50
```

---

## 7. Document Access Control Flow

```mermaid
flowchart TD
    A[User Requests Document] --> B[Extract JWT Token]
    B --> C[Supabase Validates Token]
    C --> D{Token Valid?}
    D -->|No| E[Return 401 Unauthorized]
    D -->|Yes| F[Extract User ID from Token]
    F --> G[Query Document Metadata]
    G --> H[RLS Policy Applied]
    H --> I{User is Admin?}
    I -->|Yes| J[Grant Access]
    I -->|No| K{User is Vault Owner?}
    K -->|Yes| J
    K -->|No| L{Has Vault Permission?}
    L -->|No| M[Deny Access]
    L -->|Yes| N{NDA Required?}
    N -->|No| J
    N -->|Yes| O{NDA Signed?}
    O -->|No| P[Show NDA Overlay]
    P --> Q[User Signs NDA]
    Q --> O
    O -->|Yes| R[Check Storage Policy]
    R --> S{Storage Policy Allows?}
    S -->|Yes| J
    S -->|No| M
    J --> T[Return Document]
    M --> U[Return 403 Forbidden]
    
    style J fill:#4caf50
    style M fill:#f44336
    style P fill:#ff9800
```

---

## 8. NDA Signature Workflow

```mermaid
sequenceDiagram
    participant Admin
    participant System
    participant Storage
    participant User
    participant Database
    
    Admin->>System: Upload NDA Template
    System->>Storage: Store NDA Template
    Storage-->>System: Template Path
    System->>Database: Create nda_templates Record
    Database-->>System: Template ID
    
    Note over User,Database: User Attempts to Access Vault
    
    User->>System: Request Document Access
    System->>Database: Check NDA Template Exists
    Database-->>System: Template Found
    System->>Database: Check User Signature Status
    Database-->>System: No Signature Found
    System->>User: Show NDA Overlay
    
    User->>System: View NDA Template
    System->>Storage: Fetch NDA Template
    Storage-->>System: NDA Document
    System->>User: Display NDA
    
    User->>System: Enter Signature Details<br/>(Name, Company)
    User->>System: Click Sign NDA
    System->>Database: Create nda_signatures Record
    Database-->>System: Signature Saved
    System->>User: Grant Document Access
```

---

## 9. Vault Permission Check Flow

```mermaid
flowchart TD
    A[Check Vault Access] --> B[Call has_vault_access Function]
    B --> C{User is Admin?}
    C -->|Yes| D[Return TRUE]
    C -->|No| E{User is Vault Owner?<br/>client_id OR created_by}
    E -->|Yes| D
    E -->|No| F[Check vault_permissions Table]
    F --> G{Has can_view = true?}
    G -->|Yes| D
    G -->|No| H[Return FALSE]
    
    D --> I[Grant Access]
    H --> J[Deny Access]
    
    style D fill:#4caf50
    style H fill:#f44336
    style I fill:#4caf50
    style J fill:#f44336
```

---

## 10. File Compression & Chunking Flow

```mermaid
flowchart TD
    A[File Selected<br/>Size > 50MB] --> B{File Type?}
    B -->|Text/JSON/XML| C[Use CompressionStream API]
    B -->|Image| D[Canvas Compression]
    B -->|PDF/Office| E[ZIP Compression]
    B -->|Other| E
    
    C --> F{Compressed Size<br/>< 50MB?}
    D --> F
    E --> F
    
    F -->|Yes| G[Upload Compressed File]
    F -->|No| H[Split into 45MB Chunks]
    
    H --> I[Create Chunk 1]
    I --> J[Upload Chunk 1]
    J --> K{More Chunks?}
    K -->|Yes| L[Create Next Chunk]
    L --> J
    K -->|No| M[All Chunks Uploaded]
    
    G --> N[Create Document Record]
    M --> N
    N --> O[Complete]
    
    style H fill:#ff9800
    style G fill:#4caf50
    style M fill:#4caf50
```

---

## 11. Database Query with RLS Flow

```mermaid
sequenceDiagram
    participant Client
    participant SupabaseClient
    participant PostgREST
    participant RLS
    participant Database
    
    Client->>SupabaseClient: Query Request<br/>(e.g., SELECT * FROM documents)
    SupabaseClient->>PostgREST: HTTP Request with JWT
    PostgREST->>RLS: Extract User ID from JWT
    RLS->>RLS: Evaluate RLS Policies
    RLS->>Database: Execute Query with<br/>Policy Filters Applied
    Database-->>RLS: Filtered Results
    RLS->>RLS: Apply Additional Security Checks
    RLS-->>PostgREST: Authorized Data Only
    PostgREST-->>SupabaseClient: JSON Response
    SupabaseClient-->>Client: Data or Error
    
    Note over RLS,Database: RLS policies check:<br/>- User role (admin/seller/investor)<br/>- Vault permissions<br/>- Ownership (client_id, created_by)
```

---

## 12. Activity Logging Flow

```mermaid
flowchart TD
    A[User Action Occurs] --> B{Action Type?}
    B -->|Document Upload| C[Log: document_uploaded]
    B -->|Document Download| D[Log: document_downloaded]
    B -->|Document View| E[Log: document_viewed]
    B -->|Document Delete| F[Log: document_deleted]
    B -->|Folder Create| G[Log: folder_created]
    B -->|NDA Signed| H[Log: nda_signed]
    
    C --> I[Create Activity Log Record]
    D --> I
    E --> I
    F --> I
    G --> I
    H --> I
    
    I --> J[Store: user_id, action,<br/>document_id, timestamp]
    J --> K[Save to activity_logs Table]
    K --> L[Available for Audit Trail]
    
    style I fill:#2196f3
    style K fill:#4caf50
```

---

## 13. Role-Based Access Control Decision Tree

```mermaid
flowchart TD
    A[User Makes Request] --> B[Extract User Role]
    B --> C{Role?}
    
    C -->|Admin| D[Full System Access]
    D --> E[Can Manage Users]
    D --> F[Can Manage Vaults]
    D --> G[Can Access All Documents]
    D --> H[Can Manage Permissions]
    
    C -->|Seller| I[Check Vault Permissions]
    I --> J{Has Vault Access?}
    J -->|No| K[Access Denied]
    J -->|Yes| L{NDA Signed?}
    L -->|No| M[Show NDA Overlay]
    L -->|Yes| N[Check Granular Permissions]
    
    C -->|Investor| I
    
    N --> O{can_view?}
    O -->|Yes| P[Can View Documents]
    O -->|No| K
    
    N --> Q{can_upload?}
    Q -->|Yes| R[Can Upload Documents]
    Q -->|No| S[Upload Denied]
    
    N --> T{can_edit?}
    T -->|Yes| U[Can Edit Documents]
    T -->|No| V[Edit Denied]
    
    N --> W{can_delete?}
    W -->|Yes| X[Can Delete Documents]
    W -->|No| Y[Delete Denied]
    
    style D fill:#4caf50
    style K fill:#f44336
    style M fill:#ff9800
```

---

## 14. Storage Policy Evaluation Flow

```mermaid
flowchart TD
    A[Storage Request] --> B{Request Type?}
    B -->|SELECT/Download| C[Check SELECT Policy]
    B -->|INSERT/Upload| D[Check INSERT Policy]
    B -->|DELETE| E[Check DELETE Policy]
    
    C --> F{User is Admin?}
    F -->|Yes| G[Allow Access]
    F -->|No| H{User is Vault Owner?}
    H -->|Yes| G
    H -->|No| I{Has can_view Permission?}
    I -->|Yes| J[Match file_path with<br/>document.file_path]
    I -->|No| K[Deny Access]
    J --> L{Path Matches?}
    L -->|Yes| G
    L -->|No| K
    
    D --> M{User is Admin?}
    M -->|Yes| G
    M -->|No| N{Path starts with<br/>user_id?}
    N -->|Yes| G
    N -->|No| K
    
    E --> O{User is Admin?}
    O -->|Yes| G
    O -->|No| P{Has can_delete Permission?}
    P -->|Yes| Q[Match file_path]
    P -->|No| K
    Q --> R{Path Matches?}
    R -->|Yes| G
    R -->|No| K
    
    style G fill:#4caf50
    style K fill:#f44336
```

---

## 15. Complete User Journey Flow

```mermaid
stateDiagram-v2
    [*] --> LandingPage
    LandingPage --> AuthPage: Click Access
    AuthPage --> SignIn: Existing User
    AuthPage --> SignUp: New User
    
    SignIn --> Dashboard: Success
    SignUp --> Dashboard: Success
    
    Dashboard --> AdminPanel: Admin Role
    Dashboard --> VaultList: Seller/Investor Role
    
    AdminPanel --> UserManagement: Manage Users
    AdminPanel --> VaultManagement: Manage Vaults
    AdminPanel --> PermissionManagement: Set Permissions
    
    VaultList --> VaultDetail: Select Vault
    VaultDetail --> CheckNDA: Access Documents
    
    CheckNDA --> NDASignature: NDA Required
    CheckNDA --> DocumentList: NDA Not Required
    
    NDASignature --> DocumentList: Signed
    NDASignature --> CheckNDA: Declined
    
    DocumentList --> DocumentView: View Document
    DocumentList --> DocumentDownload: Download Document
    DocumentList --> DocumentUpload: Upload Document (if permitted)
    
    DocumentView --> DocumentViewer: Open Viewer
    DocumentDownload --> WatermarkProcess: Apply Watermark
    WatermarkProcess --> DownloadComplete: File Downloaded
    
    DocumentUpload --> CompressionCheck: File > 50MB?
    CompressionCheck --> UploadToStorage: Upload
    CompressionCheck --> CompressFile: Compress First
    CompressFile --> UploadToStorage
    UploadToStorage --> UploadComplete: Success
    
    [*] --> Logout: User Logs Out
    Logout --> LandingPage
```

---

## 16. Database Schema Relationships

```mermaid
erDiagram
    auth_users ||--o| profiles : "has"
    auth_users ||--o{ user_roles : "has"
    auth_users ||--o{ vaults : "creates"
    auth_users ||--o{ vaults : "owns"
    auth_users ||--o{ vault_permissions : "has"
    auth_users ||--o{ folders : "creates"
    auth_users ||--o{ documents : "uploads"
    auth_users ||--o{ nda_signatures : "signs"
    
    vaults ||--o{ vault_permissions : "has"
    vaults ||--o{ folders : "contains"
    vaults ||--o{ documents : "contains"
    vaults ||--o| nda_templates : "has"
    vaults ||--o{ nda_signatures : "requires"
    
    folders ||--o{ folders : "parent"
    folders ||--o{ documents : "contains"
    
    nda_templates ||--o{ nda_signatures : "used_in"
    
    profiles {
        uuid id PK
        text email
        text full_name
        text company_name
        text phone
    }
    
    user_roles {
        uuid id PK
        uuid user_id FK
        app_role role
    }
    
    vaults {
        uuid id PK
        text name
        text description
        uuid client_id FK
        uuid created_by FK
    }
    
    vault_permissions {
        uuid id PK
        uuid vault_id FK
        uuid user_id FK
        boolean can_view
        boolean can_edit
        boolean can_upload
        boolean can_delete
    }
    
    folders {
        uuid id PK
        uuid vault_id FK
        uuid parent_id FK
        text name
        uuid created_by FK
    }
    
    documents {
        uuid id PK
        uuid vault_id FK
        uuid folder_id FK
        text name
        text file_path
        bigint file_size
        text file_type
        uuid uploaded_by FK
    }
    
    nda_templates {
        uuid id PK
        uuid vault_id FK
        text file_path
        text file_name
    }
    
    nda_signatures {
        uuid id PK
        uuid vault_id FK
        uuid user_id FK
        uuid template_id FK
        text status
        text signature_name
    }
```

---

## Notes on Flowchart Usage

### Mermaid Support
These flowcharts use Mermaid syntax, which is supported by:
- GitHub/GitLab markdown viewers
- VS Code with Mermaid extensions
- Many documentation platforms
- Online Mermaid editors (mermaid.live)

### Rendering
To view these flowcharts:
1. **GitHub/GitLab**: They render automatically in markdown files
2. **VS Code**: Install "Markdown Preview Mermaid Support" extension
3. **Online**: Copy code blocks to https://mermaid.live
4. **Documentation Tools**: Most modern tools support Mermaid

### Integration
These flowcharts can be:
- Referenced in the Technical Design Document
- Included in developer documentation
- Used in presentations and training materials
- Embedded in project wikis

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Maintained By**: Senior Software Engineering Team
