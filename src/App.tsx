import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ChatWidget from "@/components/ChatWidget/ChatWidget";
import { AuditBackgroundPoller } from "@/components/AuditBackgroundPoller";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminVaults = lazy(() => import("./pages/admin/Vaults"));
const VaultDetail = lazy(() => import("./pages/admin/VaultDetail"));
const VaultPermissions = lazy(() => import("./pages/admin/VaultPermissions"));
const AuditorSessions = lazy(() => import("./pages/admin/AuditorSessions"));
const ClientVault = lazy(() => import("./pages/client/Vault"));
const DocumentViewer = lazy(() => import("./pages/DocumentViewer"));
const Auditor = lazy(() => import("./pages/Auditor"));
const AuditorAuth = lazy(() => import("./pages/AuditorAuth"));
const Settings = lazy(() => import("./pages/Settings"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoader = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const queryClient = new QueryClient();

/* ── Protected Route: redirects to /auth if not logged in ── */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    const redirectParam = location.pathname !== "/"
      ? `?redirect=${encodeURIComponent(location.pathname)}`
      : "";
    return <Navigate to={`/auth${redirectParam}`} replace />;
  }

  return <>{children}</>;
};

/* ── Auditor Protected Route: redirects to /auditor/auth (separate auth page) ── */
const AuditorProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Navigate to="/auditor/auth" replace />;
  }

  return <>{children}</>;
};

/* ── Internal Route: for dashboard/admin/vault pages ── */
/* Auditor-only users (role=investor) get redirected back to /auditor */
const InternalRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    const redirectParam = location.pathname !== "/"
      ? `?redirect=${encodeURIComponent(location.pathname)}`
      : "";
    return <Navigate to={`/auth${redirectParam}`} replace />;
  }

  // Block investor-role users from internal pages — send them to /auditor
  if (role === "investor") {
    return <Navigate to="/auditor" replace />;
  }

  return <>{children}</>;
};

const AuthenticatedChatWidget = () => {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <ChatWidget />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_relativeSplatPath: true }}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Internal routes — blocked for investor/auditor-role users */}
              <Route path="/dashboard" element={<InternalRoute><Dashboard /></InternalRoute>} />
              <Route path="/admin/users" element={<InternalRoute><AdminUsers /></InternalRoute>} />
              <Route path="/admin/vaults" element={<InternalRoute><AdminVaults /></InternalRoute>} />
              <Route path="/admin/vaults/:vaultId" element={<InternalRoute><VaultDetail /></InternalRoute>} />
              <Route path="/admin/vaults/:vaultId/permissions" element={<InternalRoute><VaultPermissions /></InternalRoute>} />
              <Route path="/admin/auditor" element={<InternalRoute><AuditorSessions /></InternalRoute>} />
              <Route path="/vault" element={<InternalRoute><ClientVault /></InternalRoute>} />
              <Route path="/vault/:vaultId" element={<InternalRoute><ClientVault /></InternalRoute>} />
              <Route path="/document/:documentId" element={<InternalRoute><DocumentViewer /></InternalRoute>} />
              <Route path="/settings" element={<InternalRoute><Settings /></InternalRoute>} />

              {/* Auditor — separate auth flow */}
              <Route path="/auditor/auth" element={<AuditorAuth />} />
              <Route path="/auditor" element={<AuditorProtectedRoute><Auditor /></AuditorProtectedRoute>} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <AuthenticatedChatWidget />
        <AuditBackgroundPoller />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;